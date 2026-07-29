/**
 * Pin-type suggestion — what is this untyped pin of?
 *
 * Spec §1: typeless pins in, a candidate component type out, "from the config's
 * own list, never invents a type. An unrecognized component type is a vocabulary
 * problem, not a suggestion."
 *
 * A typeless pin is a real and ordinary thing, not a mistake. At hour three of a
 * baseline the concierge drops a marker on something and moves on; the pass
 * exists partly to decide those later. In the reference export two of eleven
 * pins were never typed.
 *
 * THE LIST IS STRUCTURAL, NOT A FILTER. The schema handed to the model is built
 * from THIS import's own config snapshot, so a type outside the list cannot be
 * returned rather than being returned and then rejected. That is the difference
 * the generality note asked for: routing's cardinal error is a wrong suggestion
 * and has to be counted, but a component type nobody declared is a vocabulary
 * problem and should never exist to count. The field master went from 48 types
 * to 73 without a line changing here, which is the whole point of reading it per
 * import.
 *
 * NO CONFIDENCE BAR HERE, AND THAT IS THE REAL DIFFERENCE FROM ROUTING. Routing
 * interrupts somebody: a suggestion on a room photo puts work in front of a
 * person who was not going to look at that tile. A typeless pin is already a
 * decision on the pass screen — the concierge is standing there either way — so
 * the cost of a weak suggestion is a sentence they read and discard, not an
 * interruption. Every candidate is shown, ranked, with its own confidence.
 *
 * WHAT IT MAY NOT DO. It may not propose a freeform label. Picking from a closed
 * list is choosing; writing a label is inventing vocabulary, and the concierge
 * types those themselves. Where nothing on the list fits, the answer is no
 * candidates plus a plain description of what is in the photograph — the record
 * abstains, the prompt does not.
 */

import type { Db } from '../../db/index.js'
import { configLookup } from '../../pass/read.js'
import type { PinTypeValue } from '../../overlay/fields.js'
import { CONFIDENCE, type Confidence } from '../confidence.js'
import { imageNote, prepareImage } from '../image.js'
import { requireModel, type ModelConfig } from '../models.js'
import { currentPrompt, type Prompt } from '../prompts.js'
import { runVisionTask, type RunArgs } from '../client.js'
import { completeJob, enqueue, recordGeneration, skipJob, type AiJob } from '../queue.js'
import { onlyIfUncertain, saidSomething } from '../uncertainty.js'

export const PIN_TYPE_TASK = 'pin_type'

/** Enough to see the thing from more than one side without paying for a gallery. */
const MAX_PHOTOS = 4
const MAX_CANDIDATES = 3

export interface TypeCandidate {
  /** Always one of the config's own component types — see the schema. */
  type: string
  confidence: Confidence
  why: string
}

export interface TypeSuggestion {
  candidates: TypeCandidate[]
  /** What is in the photographs, in plain words. Evidence, never a value. */
  shows: string
  /** Only where nothing is certain: what would settle it. */
  unsure?: string
}

export interface StoredTypeSuggestion {
  candidates: TypeCandidate[]
  shows: string
  unsure?: string
  /**
   * The lead candidate as the pin's `type` value.
   *
   * Under `fields` because that is where `overlay/store.ts` looks for what a
   * proposal proposed — the same path a nameplate serial takes. It is what an
   * acceptance records as its prior value, so "the model led with a water heater
   * and the concierge picked a water softener" is a query rather than a metric
   * somebody maintains.
   */
  fields: { type: PinTypeValue | null }
  /** Anything returned that this import's config does not declare. */
  offList?: string[]
}

export interface PinTypeDeps {
  prompts: Map<string, Prompt[]>
  model?: ModelConfig
  run?: <T>(args: RunArgs) => Promise<{ output: T; inputTokens: number; outputTokens: number }>
  resolvePath: (db: Db, visitId: string, mediaId: string) => string
}

export const TYPE_SCHEMA = (types: string[]): Record<string, unknown> => ({
  type: 'object',
  additionalProperties: false,
  required: ['candidates', 'shows', 'unsure'],
  properties: {
    candidates: {
      type: 'array',
      maxItems: MAX_CANDIDATES,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'confidence', 'why'],
        properties: {
          // The config's own vocabulary, per import. This enum is the whole
          // mechanism — invention is impossible rather than caught.
          type: { type: 'string', enum: types },
          confidence: { type: 'string', enum: [...CONFIDENCE] },
          why: { type: 'string' },
        },
      },
    },
    shows: { type: 'string' },
    unsure: { type: 'string' },
  },
})

export interface TypelessPin {
  pinId: string
  number: number | null
  zoneId: string | null
  zoneLabel: string | null
  /** Photographs whose bytes are on this machine. These are what can be sent. */
  mediaIds: string[]
  /**
   * Photographs the manifest lists but this machine does not have.
   *
   * Its own count rather than a subtraction, because "nothing was photographed"
   * and "it was photographed and the media never arrived" are different facts
   * about the visit and lead to different work. On a manifest-only import every
   * photograph is here, which is why it cannot be an edge case.
   */
  missingMedia: number
  notes: string[]
}

/**
 * Pins the field marked and never typed.
 *
 * All three columns null is the real shape of a never-typed pin — `type` is
 * absent rather than null in the export, and the pass already treats that as a
 * decision rather than as missing data. Retired pins are excluded for the same
 * reason the pass excludes them: asking someone to type a pin they deliberately
 * retired is busywork.
 */
export function typelessPins(db: Db, visitId: string): TypelessPin[] {
  const rows = db
    .prepare(
      `SELECT p.pin_id, p.number, p.zone_id, z.label AS zone_label
         FROM pins p
         JOIN imports i ON i.id = p.import_id
    LEFT JOIN zones z ON z.import_id = p.import_id AND z.zone_id = p.zone_id
        WHERE p.visit_id = ? AND p.retired_at IS NULL
          AND p.type_kind IS NULL AND p.component_type IS NULL AND p.freeform_label IS NULL
          AND i.id = (SELECT id FROM imports WHERE visit_id = ? ORDER BY imported_at DESC LIMIT 1)
        ORDER BY p.number`,
    )
    .all(visitId, visitId) as {
    pin_id: string; number: number | null; zone_id: string | null; zone_label: string | null
  }[]

  return rows.map((r) => {
    const photos = pinPhotos(db, visitId, r.pin_id)
    return {
      pinId: r.pin_id,
      number: r.number,
      zoneId: r.zone_id,
      zoneLabel: r.zone_label,
      mediaIds: photos.filter((p) => p.present).map((p) => p.mediaId),
      missingMedia: photos.filter((p) => !p.present).length,
      notes: pinNotes(db, visitId, r.pin_id),
    }
  })
}

const pinPhotos = (db: Db, visitId: string, pinId: string): { mediaId: string; present: boolean }[] =>
  (
    db
      .prepare(
        `SELECT m.media_id, m.file_status FROM media m
          WHERE m.import_id = (SELECT id FROM imports WHERE visit_id = ? ORDER BY imported_at DESC LIMIT 1)
            AND m.owner_pin_id = ? AND m.kind = 'photo'
          ORDER BY m.captured_at, m.media_id`,
      )
      .all(visitId, pinId) as { media_id: string; file_status: string }[]
  ).map((r) => ({ mediaId: r.media_id, present: r.file_status === 'present' }))

const pinNotes = (db: Db, visitId: string, pinId: string): string[] =>
  (
    db
      .prepare(
        `SELECT n.text FROM notes n
          WHERE n.import_id = (SELECT id FROM imports WHERE visit_id = ? ORDER BY imported_at DESC LIMIT 1)
            AND n.target_id = ? AND n.text IS NOT NULL ORDER BY n.at`,
      )
      .all(visitId, pinId) as { text: string }[]
  ).map((r) => r.text)

/** What the model is told about this pin, beyond the photographs. Data, not wording. */
export function pinFacts(pin: TypelessPin, photosSent: number): string {
  const lines: string[] = []
  lines.push(`This pin is in: ${pin.zoneLabel ?? 'a room with no name recorded'}.`)
  if (photosSent === 0) {
    lines.push(
      pin.missingMedia > 0
        ? `${pin.missingMedia} photograph${pin.missingMedia === 1 ? ' was' : 's were'} taken of it, but none of ` +
          'them is available here. Judge only from what is written below.'
        : 'No photographs were taken of it.',
    )
  } else {
    const extra: string[] = []
    if (pin.mediaIds.length > photosSent) extra.push(`${pin.mediaIds.length} were taken; the rest are not shown`)
    if (pin.missingMedia > 0) extra.push(`${pin.missingMedia} more are not available here`)
    lines.push(
      `${photosSent} photograph${photosSent === 1 ? '' : 's'} of it ${photosSent === 1 ? 'is' : 'are'} above` +
        (extra.length > 0 ? ` (${extra.join('; ')}).` : '.'),
    )
  }
  if (pin.notes.length > 0) {
    lines.push('What the concierge wrote about it:')
    for (const n of pin.notes) lines.push(`  - ${n}`)
  } else {
    lines.push('Nothing was written about it.')
  }
  return lines.join('\n')
}

/** Queue one suggestion job per typeless pin. */
export function queuePinTypes(db: Db, propertyId: string, visitId: string, actorId: string): number {
  const pins = typelessPins(db, visitId)
  for (const p of pins) {
    enqueue({ db, propertyId, visitId, task: PIN_TYPE_TASK, targetKind: 'pin', targetId: p.pinId, actorId })
  }
  return pins.length
}

/**
 * Suggest a type for one pin, or decline to run.
 *
 * Returns null when the job was correctly skipped. Two reasons, both recorded:
 * a pin with no photographs and no notes, and a config declaring no component
 * types. The first is CLAUDE.md §9 pointed at the model rather than at a person
 * — summoning a model to a blank space produces a plausible guess about a house
 * from nothing, which is the worst output this codebase can produce.
 */
export async function runPinType(db: Db, job: AiJob, deps: PinTypeDeps): Promise<StoredTypeSuggestion | null> {
  const pin = typelessPins(db, job.visit_id).find((p) => p.pinId === job.target_id)
  if (!pin) {
    skipJob(db, job.id, 'this pin has since been typed, or retired')
    return null
  }
  if (pin.mediaIds.length === 0 && pin.notes.length === 0) {
    // Two different facts, and the reason says which. "Nothing was captured" is
    // a field task for the next visit; "the media never arrived" is an import
    // problem, and telling a concierge to go back and photograph something they
    // already photographed is the kind of error that costs an afternoon.
    skipJob(
      db,
      job.id,
      pin.missingMedia > 0
        ? `${pin.missingMedia} photograph${pin.missingMedia === 1 ? '' : 's'} of this pin ` +
          `${pin.missingMedia === 1 ? 'is' : 'are'} not on this machine, and there is no note to read instead`
        : 'nothing was captured for this pin — no photograph and no note to read',
    )
    return null
  }

  const importId = latestImportId(db, job.visit_id)
  const types = importId ? configLookup(db, importId).componentTypes : []
  if (types.length === 0) {
    skipJob(db, job.id, "this import's config declares no component types to choose from")
    return null
  }

  const model = deps.model ?? requireModel('fast')
  const prompt = currentPrompt(deps.prompts, PIN_TYPE_TASK)
  const chosen = pin.mediaIds.slice(0, MAX_PHOTOS)
  const images: { data: Buffer; mediaType: 'image/jpeg' }[] = []
  const notes: string[] = []
  for (const mediaId of chosen) {
    const image = await prepareImage(deps.resolvePath(db, job.visit_id, mediaId), model.maxImageEdge)
    images.push({ data: image.data, mediaType: image.mediaType })
    notes.push(`${mediaId}: ${imageNote(image)}`)
  }

  const facts = `${pinFacts(pin, chosen.length)}\n\nThe types you may choose from:\n${types
    .map((t) => `  - ${t}`)
    .join('\n')}`
  const run = deps.run ?? runVisionTask

  const { output, inputTokens, outputTokens } = await run<TypeSuggestion>({
    model, prompt, facts, schema: TYPE_SCHEMA(types), images,
  })

  const stored = normaliseType(output, types)

  const generationId = recordGeneration({
    db, propertyId: job.property_id, visitId: job.visit_id,
    // Whoever triggered the run owns the generation. The model is recorded
    // separately; conflating them would make a proposal read as a human act.
    actorId: job.actor_id, task: PIN_TYPE_TASK,
    targetKind: job.target_kind, targetId: job.target_id, model: model.id,
    promptId: prompt.id, promptVersion: prompt.version, promptHash: prompt.hash,
    inputRefs: {
      pinId: pin.pinId,
      // Named individually, and both counts kept: a suggestion made from two of
      // seven photographs is a weaker thing than one made from all seven, and
      // that has to be visible rather than inferred from a cap in the source.
      mediaIds: chosen,
      photosAvailable: pin.mediaIds.length,
      photosMissing: pin.missingMedia,
      images: notes,
      notes: pin.notes,
      componentTypes: types.length,
    },
    output: stored,
    // Nothing on the list fits. A complete answer — plenty of pins are of things
    // the component vocabulary has no word for — and nothing to accept.
    abstained: stored.candidates.length === 0,
    inputTokens, outputTokens,
  })
  completeJob(db, job.id, generationId)
  return stored
}

/** Belt and braces behind the enum, and the uncertainty rule. Exported for tests. */
export function normaliseType(output: TypeSuggestion, types: string[]): StoredTypeSuggestion {
  const allowed = new Set(types)
  const candidates: TypeCandidate[] = []
  const offList: string[] = []

  for (const c of output.candidates ?? []) {
    if (!allowed.has(c.type)) {
      // Unreachable through the schema. Recorded rather than dropped anyway,
      // because §1 calls an undeclared component type a vocabulary problem — and
      // a vocabulary problem that disappears silently is one nobody ever fixes.
      offList.push(c.type)
      continue
    }
    candidates.push({ type: c.type, confidence: c.confidence, why: (c.why ?? '').trim() })
  }

  const lead = candidates[0]
  return {
    candidates,
    shows: (output.shows ?? '').trim(),
    unsure: onlyIfUncertain(output.unsure, !lead || lead.confidence !== 'certain', saidSomething)?.trim(),
    fields: {
      type: lead ? { kind: 'component', componentType: lead.type, freeformLabel: null } : null,
    },
    ...(offList.length > 0 ? { offList } : {}),
  }
}

const latestImportId = (db: Db, visitId: string): string | undefined =>
  (
    db.prepare('SELECT id FROM imports WHERE visit_id = ? ORDER BY imported_at DESC LIMIT 1').get(visitId) as
      | { id: string }
      | undefined
  )?.id
