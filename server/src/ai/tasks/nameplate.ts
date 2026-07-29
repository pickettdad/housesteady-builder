/**
 * Reading nameplates: classify, then extract.
 *
 * Two tasks rather than one, and the split is the cost control. §1: room photos
 * never get extraction — 200+ per visit and almost none are plates. Pin-attached
 * photos are the small subset (5 of 37 in the reference export), and
 * classification is what keeps the extraction bill small within even that.
 *
 * THE GATE IS A ROW, NOT AN ABSENCE. §11 requires the non-nameplate to be "not
 * extracted at all". Classification therefore creates exactly one extraction job
 * either way — queued when it saw a plate, `skipped` with its reason when it did
 * not. A missing job and a job that correctly declined look identical from
 * outside, and only one of them is the feature working.
 *
 * ON PROMPT CACHING. §5 asks that the stable part be the prefix so it caches.
 * The instruction here is the stable part, but the cacheable-prefix minimum on
 * the fast tier is several thousand tokens and these prompts are well under it,
 * so no cache entry is created and none is read. That is not a reason to pad the
 * prompt — a longer instruction to win a discount would cost more than it saved
 * and make the wording worse. The images dominate the bill regardless. Recorded
 * here so nobody re-derives it from a confusing zero in the usage figures.
 */

import type { Db } from '../../db/index.js'
import { imageNote, prepareImage } from '../image.js'
import { requireModel, type ModelConfig } from '../models.js'
import { currentPrompt, type Prompt } from '../prompts.js'
import { runVisionTask, type RunArgs } from '../client.js'
import { completeJob, enqueue, recordGeneration, skipJob, type AiJob } from '../queue.js'

export const CLASSIFY_TASK = 'nameplate_classify'
export const EXTRACT_TASK = 'nameplate_extract'

/** The fields §1 asks for, each independently unknown. */
export const NAMEPLATE_FIELDS = ['make', 'model', 'serial', 'capacity', 'installDate'] as const
export type NameplateField = (typeof NAMEPLATE_FIELDS)[number]

const unknownable = { type: 'string', description: 'The value as printed, or the literal "unknown".' }

export const CLASSIFY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['isNameplate', 'orientation', 'reason'],
  properties: {
    isNameplate: { type: 'string', enum: ['yes', 'no', 'unsure'] },
    // Feeds the retry decision: a rotated plate that abstained is worth one
    // targeted re-read, where an upright one that abstained is not.
    orientation: { type: 'string', enum: ['upright', 'rotated', 'unknown'] },
    reason: { type: 'string' },
  },
}

/**
 * What the model could see on a field it declined to read.
 *
 * CLAUDE.md §9: never summon a human to a blank space. The record abstains; the
 * prompt does not. Nothing in here is ever stored as a value — it exists so the
 * person opening the photograph is told *"the third and seventh characters are
 * under glare; what I can make out is Q1373_5_9, and the barcode line below may
 * repeat it"* rather than being handed an empty box and a picture.
 */
const uncertainty = {
  type: 'object',
  additionalProperties: false,
  required: ['partial', 'obscured', 'lookElsewhere', 'alternatives'],
  properties: {
    /** Underscore per unreadable character. Empty when no characters resolved. */
    partial: { type: 'string' },
    /** What stopped the read, in one clause a person can act on. */
    obscured: { type: 'string' },
    /** Where else on the plate the same value might be readable. */
    lookElsewhere: { type: 'string' },
    /**
     * Only where the variance is real and narrow — a 5-or-S ambiguity.
     * A list of plausible strings is worse than no list: it makes a wrong
     * answer look considered.
     */
    alternatives: { type: 'array', items: { type: 'string' } },
  },
}

export const EXTRACT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['fields', 'uncertain', 'legible', 'notes'],
  properties: {
    fields: {
      type: 'object',
      additionalProperties: false,
      required: [...NAMEPLATE_FIELDS],
      properties: Object.fromEntries(NAMEPLATE_FIELDS.map((f) => [f, unknownable])),
    },
    uncertain: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(NAMEPLATE_FIELDS.map((f) => [f, uncertainty])),
    },
    legible: { type: 'boolean' },
    notes: { type: 'string' },
  },
}

export interface Classification {
  isNameplate: 'yes' | 'no' | 'unsure'
  orientation: 'upright' | 'rotated' | 'unknown'
  reason: string
}

export interface Uncertainty {
  partial: string
  obscured: string
  lookElsewhere: string
  alternatives: string[]
}

export interface Extraction {
  fields: Record<NameplateField, string>
  /**
   * Per field, what the model could see where it declined to read.
   *
   * Never a value and never stored as one. The screen shows it beside the
   * photograph so the concierge starts from what is known rather than nothing.
   */
  uncertain?: Partial<Record<NameplateField, Uncertainty>>
  legible: boolean
  notes: string
}

/** Everything the task needs from outside, so a test can supply all of it. */
export interface TaskDeps {
  prompts: Map<string, Prompt[]>
  model?: ModelConfig
  run?: <T>(args: RunArgs) => Promise<{ output: T; inputTokens: number; outputTokens: number }>
  /** Where the media file is. Injected so fixtures can stand in for a visit. */
  resolvePath: (db: Db, visitId: string, mediaId: string) => string
}

const isUnknown = (v: string | undefined): boolean =>
  v === undefined || v.trim() === '' || v.trim().toLowerCase() === 'unknown'

/**
 * Did the extraction decline to read anything?
 *
 * Abstention is `legible: false`, or every field unknown, which are the same
 * outcome by two routes: the model saw a plate and got nothing off it. §7 gives
 * this its own presentation and never treats it as an error, so it has to be
 * recognisable rather than inferred at render time from a bag of empty strings.
 */
export const isAbstention = (e: Extraction): boolean =>
  e.legible === false || NAMEPLATE_FIELDS.every((f) => isUnknown(e.fields?.[f]))

/**
 * Classify one pin-attached photo, and decide whether extraction runs on it.
 */
export async function runClassify(db: Db, job: AiJob, deps: TaskDeps): Promise<Classification> {
  const model = deps.model ?? requireModel('fast')
  const prompt = currentPrompt(deps.prompts, CLASSIFY_TASK)
  const image = await prepareImage(deps.resolvePath(db, job.visit_id, job.target_id), model.maxImageEdge)
  const run = deps.run ?? runVisionTask

  const { output, inputTokens, outputTokens } = await run<Classification>({
    model, prompt, schema: CLASSIFY_SCHEMA,
    images: [{ data: image.data, mediaType: image.mediaType }],
  })

  const generationId = recordGeneration({
    db, propertyId: job.property_id, visitId: job.visit_id,
    // Whoever triggered the run owns the generation. The model is recorded
    // separately; conflating them would make a proposal read as a human act.
    actorId: job.actor_id, task: CLASSIFY_TASK,
    targetKind: job.target_kind, targetId: job.target_id, model: model.id,
    promptId: prompt.id, promptVersion: prompt.version, promptHash: prompt.hash,
    inputRefs: { mediaId: job.target_id, image: imageNote(image) },
    output,
    // A classification always answers. `unsure` is an answer, not an abstention
    // — it says the photograph is on the line, which is a fact about the
    // photograph and something a person can act on.
    abstained: false,
    inputTokens, outputTokens,
  })
  completeJob(db, job.id, generationId)

  // ------------------------------------------------------------------ the gate
  const extraction = enqueue({
    db, propertyId: job.property_id, visitId: job.visit_id,
    task: EXTRACT_TASK, targetKind: job.target_kind, targetId: job.target_id,
    actorId: job.actor_id,
  })
  if (output.isNameplate === 'no') {
    skipJob(db, extraction.id, `classified as not a nameplate — ${output.reason}`)
  }
  // `unsure` still extracts. The cost of reading a photo that turns out not to
  // be a plate is one cheap call and an extraction that abstains; the cost of
  // skipping a real plate is a serial nobody ever captures.

  return output
}

/**
 * Read the fields off one plate.
 */
export async function runExtract(db: Db, job: AiJob, deps: TaskDeps): Promise<Extraction> {
  const model = deps.model ?? requireModel('fast')
  const prompt = currentPrompt(deps.prompts, EXTRACT_TASK)
  const image = await prepareImage(deps.resolvePath(db, job.visit_id, job.target_id), model.maxImageEdge)
  const run = deps.run ?? runVisionTask

  const { output, inputTokens, outputTokens } = await run<Extraction>({
    model, prompt, schema: EXTRACT_SCHEMA,
    images: [{ data: image.data, mediaType: image.mediaType }],
  })

  // Normalise the sentinel once, here, so nothing downstream has to know that
  // an empty string and the word "unknown" mean the same thing.
  const fields = Object.fromEntries(
    NAMEPLATE_FIELDS.map((f) => [f, isUnknown(output.fields?.[f]) ? 'unknown' : output.fields[f]!.trim()]),
  ) as Record<NameplateField, string>
  // The uncertainty travels; it never becomes a value. Kept only for fields that
  // actually came back unknown — an uncertainty note beside a value that WAS read
  // is noise, and worse, it invites a reader to prefer the note over the reading.
  const uncertain: Partial<Record<NameplateField, Uncertainty>> = {}
  for (const f of NAMEPLATE_FIELDS) {
    const u = output.uncertain?.[f]
    if (!u || fields[f] !== 'unknown') continue
    const cleaned: Uncertainty = {
      partial: (u.partial ?? '').trim(),
      obscured: (u.obscured ?? '').trim(),
      lookElsewhere: (u.lookElsewhere ?? '').trim(),
      alternatives: (u.alternatives ?? []).map((a) => a.trim()).filter(Boolean),
    }
    if (cleaned.partial || cleaned.obscured || cleaned.lookElsewhere || cleaned.alternatives.length > 0) {
      uncertain[f] = cleaned
    }
  }

  const normalised: Extraction = {
    fields,
    uncertain: Object.keys(uncertain).length > 0 ? uncertain : undefined,
    legible: output.legible !== false,
    notes: output.notes ?? '',
  }

  const generationId = recordGeneration({
    db, propertyId: job.property_id, visitId: job.visit_id,
    // Whoever triggered the run owns the generation. The model is recorded
    // separately; conflating them would make a proposal read as a human act.
    actorId: job.actor_id, task: EXTRACT_TASK,
    targetKind: job.target_kind, targetId: job.target_id, model: model.id,
    promptId: prompt.id, promptVersion: prompt.version, promptHash: prompt.hash,
    inputRefs: { mediaId: job.target_id, image: imageNote(image) },
    output: normalised,
    abstained: isAbstention(normalised),
    inputTokens, outputTokens,
  })
  completeJob(db, job.id, generationId)
  return normalised
}

/**
 * Every pin-attached photo in a visit — the input set for classification.
 *
 * Zone-owned photos are excluded here rather than filtered later, because "room
 * photos never get nameplate extraction" is a cost decision and a cost decision
 * that depends on a filter somewhere downstream is one bad refactor from a
 * two-hundred-photo bill.
 */
export function pinAttachedPhotos(db: Db, visitId: string): { mediaId: string; pinId: string }[] {
  return db
    .prepare(
      `SELECT m.media_id AS mediaId, m.owner_pin_id AS pinId
         FROM media m JOIN imports i ON i.id = m.import_id
        WHERE i.visit_id = ? AND m.owner_pin_id IS NOT NULL AND m.kind = 'photo'
        ORDER BY m.media_id`,
    )
    .all(visitId) as { mediaId: string; pinId: string }[]
}

/** Queue classification for every pin-attached photo. Extraction follows from it. */
export function queueNameplateReading(db: Db, propertyId: string, visitId: string, actorId: string): number {
  const photos = pinAttachedPhotos(db, visitId)
  for (const p of photos) {
    enqueue({ db, propertyId, visitId, task: CLASSIFY_TASK, targetKind: 'media', targetId: p.mediaId, actorId })
  }
  return photos.length
}

/** The pin a proposal is about, so an acceptance knows where to land. */
export function pinForMedia(db: Db, visitId: string, mediaId: string): string | undefined {
  const row = db
    .prepare(
      `SELECT m.owner_pin_id AS pinId FROM media m JOIN imports i ON i.id = m.import_id
        WHERE i.visit_id = ? AND m.media_id = ? ORDER BY i.imported_at DESC LIMIT 1`,
    )
    .get(visitId, mediaId) as { pinId: string | null } | undefined
  return row?.pinId ?? undefined
}
