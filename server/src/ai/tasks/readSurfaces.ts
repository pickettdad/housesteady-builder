/**
 * Pass 1 · Read — what text is on these things, and on which surface.
 *
 * Amendment 11 §C, the first of four passes. **It names nothing.** It reads
 * letters off surfaces and records which surface each was on, and every act that
 * decides what a thing *is* happens later, in a pass with sources.
 *
 * ---
 *
 * ## The forbidding is structural, not polite
 *
 * The prompt says *do not name the object*. **The schema below has nowhere to
 * put a name** — no `label`, no `classId`, no `whatItIs`. An instruction is a
 * request; a missing field is a wall. This is the same move `identify_objects`
 * makes with `classId: null`, in the opposite direction.
 *
 * ## Not the canvas, and this is the one input difference from identification
 *
 * Amendment 10 §B2 puts a zone's canvas frames on **every** identification batch
 * outside the ceiling, because a call full of nameplates and no room shot
 * produces a good parts list with no system in it. **Pass 1 wants exactly that
 * parts list.** A canvas carries no legible text and its tokens are wasted here,
 * so `batch.context` is dropped and only `batch.media` is sent.
 *
 * ## A smaller batch than identification, and the reason is not cost
 *
 * **Identification MUST batch by room** — the argument is accuracy, that the
 * model sees a room rather than disconnected frames. **Pass 1 has no such
 * argument.** Reading a plate needs the plate and nothing else; there is no
 * cross-photograph reasoning to preserve. So the batch here is free to be sized
 * against the one thing that actually constrains it: **the output ceiling.**
 *
 * A plate can carry a dozen named cells and every one of them is emitted,
 * including the empty ones. Twenty-four photographs of plates can therefore
 * outrun 4,096 output tokens — **and truncation is not retryable**, so an
 * overrun is a call paid for and thrown away.
 *
 * See `MAX_MEDIA_PER_READ_CALL` for the arithmetic and for what would measure
 * it. It is a guess, like `MAX_MEDIA_PER_CALL` is a guess, and it is written
 * down so the first real run can correct it.
 */

import { randomUUID } from 'node:crypto'
import { now, type Db } from '../../db/index.js'
import { planIdentificationCalls } from '../../engine/identify.js'
import { fieldKey, normaliseSurface, type FieldClaim } from '../../engine/surfaces.js'
import { edgeForCall, imageNote, prepareImage, type PreparedImage } from '../image.js'
import { requireModel, type ModelConfig } from '../models.js'
import { currentPrompt } from '../prompts.js'
import { runVisionTask } from '../client.js'
import { completeJob, enqueue, recordGeneration, requeueBatch, skipJob, type AiJob } from '../queue.js'
import type { AssistDeps } from './index.js'
import { batchTargetId, latestImport, mediaForImport, zoneRoutes } from './identify.js'

/** Matches the prompt directory. Identity comes from the path, in both places. */
export const READ_TASK = 'read_surfaces'

/** Same shape as identification's, so one zone's two passes are comparable. */
export const READ_TARGET_KIND = 'zone-batch'

/**
 * Photographs per pass-1 call.
 *
 * **Half of `MAX_MEDIA_PER_CALL`, and the arithmetic is the whole reason.**
 * A dense nameplate runs to a dozen named cells; at roughly 25 output tokens a
 * cell that is ~300 tokens for one plate, so twenty-four plate photographs can
 * ask for ~7,000 where the fast tier's ceiling is 4,096. **A truncated JSON
 * object is not a partial answer, it is a broken one, and it is not retried.**
 *
 * **What it costs:** the fixed 3,701 tokens per call are paid twice as often.
 * On 157 detail photographs that is 14 calls instead of 7 — about 26,000 extra
 * fixed tokens against roughly 250,000 for the images, so **near 10% more
 * overhead to remove the overrun.**
 *
 * **This is a guess and it is stated as one.** What measures it is one real run:
 * the output token count per call is on every `ai_generations` row, so the first
 * pass over a real room says whether 12 is cautious or optimistic.
 */
export const MAX_MEDIA_PER_READ_CALL = 12

/**
 * The answer shape. **Note what it does not contain.**
 *
 * `surface` is a plain string rather than an enum: a surface is a fact about a
 * photograph, not a choice from this repo's taxonomy, and the adjudication in
 * `engine/surfaces.ts` is safe against words it has not met because an
 * unrecognised surface is not a nameplate.
 */
export const READ_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['labels', 'noText'],
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['mediaId', 'surface', 'whereItIs', 'fields'],
        properties: {
          mediaId: { type: 'string' },
          surface: { type: 'string' },
          whereItIs: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['field', 'value', 'unreadable'],
              properties: {
                field: { type: 'string' },
                // Never omitted. `N/A` is a value; an illegible cell carries its
                // partial read here with `unreadable` set.
                value: { type: 'string' },
                unreadable: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    noText: { type: 'array', items: { type: 'string' } },
  },
}

export interface ReadField {
  field: string
  value: string
  unreadable: boolean
}

export interface ReadLabel {
  mediaId: string
  surface: string
  whereItIs: string
  fields: ReadField[]
}

export interface SurfaceRead {
  labels: ReadLabel[]
  noText: string[]
}

export interface StoredRead extends SurfaceRead {
  /** Surfaces this build has not met. Preserved and counted, never nulled. */
  unknownSurfaces: { mediaId: string; surface: string }[]
  /** Labels naming a photograph this call did not carry. Kept as a report. */
  strayLabels: { mediaId: string; surface: string }[]
  /** Photographs in neither `labels` nor `noText` — the model simply skipped them. */
  unaccounted: string[]
}

// ---------------------------------------------------------------- the queueing

export interface QueuedRead {
  jobs: number
  zones: number
  photographs: number
  note: string
}

/**
 * Plan pass-1 calls for one visit and queue them.
 *
 * **A zone with only canvas frames plans no call.** Identification still runs
 * there — *present, not identified* is a real answer from a wide shot — but a
 * canvas has no legible text, so a pass-1 call on one would pay for a certain
 * empty result.
 */
export function queueSurfaceReading(
  db: Db,
  propertyId: string,
  visitId: string,
  actorId: string,
  only?: (zoneId: string) => boolean,
  again = false,
): QueuedRead {
  const importId = latestImport(db, visitId)
  if (!importId) {
    return { jobs: 0, zones: 0, photographs: 0, note: `No import for visit ${visitId}. Nothing to read.` }
  }

  const plan = planSurfaceReads(db, importId)
  const batches = only ? plan.batches.filter((b) => only(b.zoneId)) : plan.batches
  for (const b of batches) {
    if (again) requeueBatch(db, visitId, batchTargetId(b.zoneId, b.index))
    enqueue({
      db, propertyId, visitId,
      task: READ_TASK,
      targetKind: READ_TARGET_KIND,
      targetId: batchTargetId(b.zoneId, b.index),
      actorId,
    })
  }

  return {
    jobs: batches.length,
    zones: new Set(batches.map((b) => b.zoneId)).size,
    photographs: batches.reduce((n, b) => n + b.media.length, 0),
    note: plan.note,
  }
}

export interface ReadBatch {
  zoneId: string
  index: number
  of: number
  media: { mediaId: string; captureNote: string | null }[]
}

/**
 * Which photographs go in which pass-1 call.
 *
 * Reuses identification's resolver — the *which zone does this photograph belong
 * to* question is the same question and having two answers to it is how a plan
 * and a run come to disagree — then drops the canvas and re-splits at this
 * pass's own ceiling.
 */
export function planSurfaceReads(
  db: Db,
  importId: string,
  maxPerCall = MAX_MEDIA_PER_READ_CALL,
): { batches: ReadBatch[]; canvasDropped: number; note: string } {
  const media = mediaForImport(db, importId)
  const noteOf = new Map(media.map((m) => [m.mediaId, m.captureNote]))
  const plan = planIdentificationCalls(media, zoneRoutes(db, importId), { maxPerCall: 1_000_000 })

  const batches: ReadBatch[] = []
  let canvasDropped = 0
  for (const b of plan.batches) {
    canvasDropped += b.context.length
    if (b.media.length === 0) continue
    const of = Math.ceil(b.media.length / maxPerCall)
    for (let i = 0; i < of; i++) {
      batches.push({
        zoneId: b.zoneId,
        index: i + 1,
        of,
        media: b.media
          .slice(i * maxPerCall, (i + 1) * maxPerCall)
          .map((m) => ({ mediaId: m.mediaId, captureNote: noteOf.get(m.mediaId) ?? null })),
      })
    }
  }
  batches.sort((a, b) => a.zoneId.localeCompare(b.zoneId) || a.index - b.index)

  const photographs = batches.reduce((n, b) => n + b.media.length, 0)
  return {
    batches,
    canvasDropped,
    note:
      batches.length === 0
        ? `No pass-1 calls. Nothing in this import is a detail photograph reaching a zone.`
        : `${batches.length} calls over ${new Set(batches.map((b) => b.zoneId)).size} zones, ` +
          `${photographs} detail photographs at up to ${maxPerCall} a call. ` +
          `${canvasDropped} canvas frame(s) deliberately not sent — a canvas carries no legible text.`,
  }
}

// ------------------------------------------------------------- the facts block

/**
 * The per-call data. **Wording lives in the prompt file; this does not.**
 *
 * Every photograph is named, because the answer keys on media ids — and its
 * capture note rides along, since a note written at the moment of capture is
 * often the only thing saying which of two labels in a frame was the point of
 * it. Amendment 10 §D.
 */
export function readingFacts(args: {
  zoneLabel: string | null
  batchIndex: number
  batchOf: number
  media: { mediaId: string; captureNote: string | null }[]
}): string {
  const { zoneLabel, batchIndex, batchOf, media } = args
  const lines: string[] = []

  lines.push(
    zoneLabel
      ? `These photographs were taken in: ${zoneLabel}.`
      : `These photographs have no recorded room label. That does not matter here — you are reading text, not placing anything.`,
  )
  if (batchOf > 1) {
    lines.push(
      `Part ${batchIndex} of ${batchOf} for this room. You are seeing some of its photographs, not all of them.`,
    )
  }

  lines.push('')
  lines.push(`PHOTOGRAPHS — ${media.length}, in the order they appear. Use these ids exactly:`)
  for (const m of media) {
    lines.push(
      m.captureNote && m.captureNote.trim() !== ''
        ? `  ${m.mediaId} — note written at capture: "${m.captureNote.trim()}"`
        : `  ${m.mediaId}`,
    )
  }
  lines.push('')
  lines.push(
    `Every one of these ids must appear exactly once, either on a label or in noText. ` +
      `A photograph with no readable text belongs in noText.`,
  )
  return lines.join('\n')
}

// ------------------------------------------------------------------ normalising

/**
 * Turn one answer into something storable. **Nothing is discarded.**
 *
 * A surface word this build has not met, a label pointing at a photograph the
 * call never sent, a photograph the model never mentioned — each is kept and
 * reported. Doctrine 6, and each of the three is a thing a reviewer needs to see
 * rather than a thing a parser should tidy away.
 */
export function normaliseRead(output: SurfaceRead, sent: ReadonlySet<string>): StoredRead {
  const labels: ReadLabel[] = []
  const unknownSurfaces: StoredRead['unknownSurfaces'] = []
  const strayLabels: StoredRead['strayLabels'] = []
  const mentioned = new Set<string>()

  for (const raw of output.labels ?? []) {
    const mediaId = typeof raw.mediaId === 'string' ? raw.mediaId.trim() : ''
    const { surface, recognised } = normaliseSurface(raw.surface)
    if (!recognised) unknownSurfaces.push({ mediaId, surface })

    if (!sent.has(mediaId)) {
      strayLabels.push({ mediaId, surface })
      continue
    }
    mentioned.add(mediaId)

    const fields: ReadField[] = []
    for (const f of raw.fields ?? []) {
      const field = typeof f.field === 'string' ? f.field.trim() : ''
      // A cell whose NAME could not be read is not a field — there is nothing to
      // key it on. The prompt sends that to `whereItIs`, which is prose.
      if (field === '') continue
      fields.push({
        field,
        // **Never trimmed away to nothing and never dropped for being empty.**
        // `N/A` is a fact and an illegible cell carries its partial read here.
        value: typeof f.value === 'string' ? f.value.trim() : '',
        unreadable: f.unreadable === true,
      })
    }

    labels.push({
      mediaId,
      surface,
      whereItIs: typeof raw.whereItIs === 'string' ? raw.whereItIs.trim() : '',
      fields,
    })
  }

  const noText = (output.noText ?? []).filter((m): m is string => typeof m === 'string' && sent.has(m))
  for (const m of noText) mentioned.add(m)

  return {
    labels,
    noText,
    unknownSurfaces,
    strayLabels,
    // A photograph the model neither read nor declared empty. **Not the same as
    // "no text" and it must not be counted as one** — nobody said anything about
    // it, which is a hole rather than a result.
    unaccounted: [...sent].filter((m) => !mentioned.has(m)),
  }
}

// ------------------------------------------------------------------ the storing

/** Write one call's labels and their fields. */
export function writeReadings(
  db: Db,
  args: {
    propertyId: string
    importId: string | null
    zoneId: string
    actorId: string
    labels: readonly ReadLabel[]
    generationId?: string | null
  },
): string[] {
  const at = now()
  const insertReading = db.prepare(
    `INSERT INTO readings (id, property_id, import_id, media_id, zone_id, surface, surface_note, position, generation_id, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertField = db.prepare(
    `INSERT INTO reading_fields (id, reading_id, field, field_key, value, unreadable, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  const ids: string[] = []
  const write = db.transaction(() => {
    args.labels.forEach((l, position) => {
      const id = randomUUID()
      insertReading.run(
        id, args.propertyId, args.importId, l.mediaId, args.zoneId, l.surface,
        l.whereItIs === '' ? null : l.whereItIs, position, args.generationId ?? null, args.actorId, at,
      )
      l.fields.forEach((f, i) => {
        insertField.run(randomUUID(), id, f.field, fieldKey(f.field), f.value, f.unreadable ? 1 : 0, i, at)
      })
      ids.push(id)
    })
  })
  write()
  return ids
}

/** Every field read in one import, in the shape the adjudication wants. */
export function claimsForImport(db: Db, importId: string, mediaIds?: readonly string[]): FieldClaim[] {
  const rows = db
    .prepare(
      `SELECT r.id AS readingId, r.media_id AS mediaId, r.surface AS surface,
              f.field AS field, f.field_key AS fieldKey, f.value AS value, f.unreadable AS unreadable
         FROM readings r JOIN reading_fields f ON f.reading_id = r.id
        WHERE r.import_id = ?
        -- position and NOT r.id: the id is a uuid, so ordering by it read two
        -- plates in one photograph in a different order every time.
        ORDER BY r.created_at, r.position, f.position`,
    )
    .all(importId) as (Omit<FieldClaim, 'unreadable'> & { unreadable: number })[]

  const wanted = mediaIds ? new Set(mediaIds) : undefined
  return rows
    .filter((r) => !wanted || wanted.has(r.mediaId))
    .map((r) => ({ ...r, unreadable: r.unreadable === 1 }))
}

// ---------------------------------------------------------------------- the run

export interface ReadResult extends StoredRead {
  readingIds: string[]
  generationId: string
}

/** Read one batch's photographs. Returns null when the job was correctly skipped. */
export async function runReadSurfaces(db: Db, job: AiJob, deps: AssistDeps): Promise<ReadResult | null> {
  const importId = latestImport(db, job.visit_id)
  if (!importId) {
    skipJob(db, job.id, 'this visit has no import, so there are no photographs to read')
    return null
  }

  const plan = planSurfaceReads(db, importId)
  const batch = plan.batches.find((b) => batchTargetId(b.zoneId, b.index) === job.target_id)
  if (!batch) {
    skipJob(
      db, job.id,
      `no pass-1 batch \`${job.target_id}\` in this visit's current plan — the import has changed since this job was queued`,
    )
    return null
  }

  const status = new Map(mediaForImport(db, importId).map((m) => [m.mediaId, m.fileStatus]))
  const present = batch.media.filter((m) => status.get(m.mediaId) === 'present')
  if (present.length === 0) {
    skipJob(db, job.id, `none of this batch's ${batch.media.length} photographs are on this machine`)
    return null
  }

  const model = deps.model ?? requireModel('fast')
  const prompt = currentPrompt(deps.prompts, READ_TASK)
  const edge = edgeForCall(present.length, model.maxImageEdge)

  const prepared: { mediaId: string; image: PreparedImage }[] = []
  for (const m of present) {
    prepared.push({
      mediaId: m.mediaId,
      image: await prepareImage(deps.resolvePath(db, job.visit_id, m.mediaId), edge),
    })
  }

  const zone = db
    .prepare('SELECT label, type FROM zones WHERE import_id = ? AND zone_id = ?')
    .get(importId, batch.zoneId) as { label: string | null; type: string | null } | undefined

  const facts = readingFacts({
    zoneLabel: zone?.label ?? zone?.type ?? null,
    batchIndex: batch.index,
    batchOf: batch.of,
    media: present,
  })

  const run = deps.run ?? runVisionTask
  const { output, inputTokens, outputTokens } = await run<SurfaceRead>({
    model,
    prompt,
    facts,
    schema: READ_SCHEMA,
    maxTokens: readMaxTokens(model),
    images: prepared.map(({ image }) => ({ data: image.data, mediaType: image.mediaType })),
  })

  const stored = normaliseRead(output, new Set(prepared.map((p) => p.mediaId)))

  const generationId = recordGeneration({
    db,
    propertyId: job.property_id,
    visitId: job.visit_id,
    importId,
    actorId: job.actor_id,
    task: READ_TASK,
    targetKind: job.target_kind,
    targetId: job.target_id,
    model: model.id,
    tier: model.tier,
    promptId: prompt.id,
    promptVersion: prompt.version,
    promptHash: prompt.hash,
    inputRefs: {
      zoneId: batch.zoneId,
      zoneLabel: zone?.label ?? null,
      batch: { index: batch.index, of: batch.of },
      // Named so the absence is provable rather than merely true: pass 1 sends
      // no canvas, and a reader should not have to infer that from a count.
      canvasSent: 0,
      detail: present.map((m) => m.mediaId),
      images: prepared.map((p) => ({ mediaId: p.mediaId, prepared: imageNote(p.image) })),
      imageEdge: { sent: edge, modelLimit: model.maxImageEdge, imageCount: prepared.length },
      captureNotes: present.filter((m) => m.captureNote),
    },
    output: stored,
    // No label read anywhere in the batch. Ordinary for pipework and a warning
    // for a wall of equipment — either way there is nothing for a human to take.
    abstained: stored.labels.length === 0,
    inputTokens,
    outputTokens,
  })

  const readingIds = writeReadings(db, {
    propertyId: job.property_id,
    importId,
    zoneId: batch.zoneId,
    actorId: job.actor_id,
    labels: stored.labels,
    generationId,
  })

  completeJob(db, job.id, generationId)
  return { ...stored, readingIds, generationId }
}

/**
 * Output ceiling for pass 1.
 *
 * Same shape as identification's: the constant is the floor so a model config
 * that declares nothing cannot make the ceiling smaller than what already
 * worked, and a stronger tier's larger window is used when it has one.
 */
export const READ_MAX_TOKENS = 4096
export const readMaxTokens = (model: ModelConfig): number =>
  Math.max(READ_MAX_TOKENS, model.maxOutputTokens)

// -------------------------------------------------------------------- the gate

export interface ReadState {
  zoneId: string
  /** Batches pass 1's plan produces for this zone. Zero is a real answer. */
  planned: number
  /** Of those, how many have reached a terminal state. */
  settled: number
  complete: boolean
  why: string
}

/**
 * Has pass 1 finished with this zone?
 *
 * **The gate pass 3 refuses on**, and it is here rather than in an orchestrator
 * script for the reason the ruling gives: *a warning is a sentence.* A check
 * that only runs when somebody uses the combined command is a check somebody
 * routes around by typing `npm run match`.
 *
 * ⚑ **Zero planned batches is COMPLETE, not pending.** A zone with only canvas
 * frames plans no pass-1 call and never will — refusing it forever would block
 * a room on work that is not coming. *There was nothing to read.*
 *
 * **`skipped` counts as settled and `failed` does not.** A skip is pass 1
 * deciding correctly not to run — the photographs are not on this machine — and
 * the zone's scaffold is genuinely empty. A failure is a call that should have
 * happened and did not, so matching after it would silently produce the
 * unscaffolded answer with no record that the scaffold was owed.
 */
export function readState(db: Db, importId: string, visitId: string, zoneId: string): ReadState {
  const planned = planSurfaceReads(db, importId).batches.filter((b) => b.zoneId === zoneId)
  if (planned.length === 0) {
    return {
      zoneId, planned: 0, settled: 0, complete: true,
      why: 'No pass-1 call is planned for this zone — it carries no detail photographs, so there was nothing to read.',
    }
  }

  const settled = planned.filter((b) => {
    const row = db
      .prepare(
        `SELECT status FROM ai_jobs
          WHERE visit_id = ? AND task = ? AND target_id = ? AND status IN ('done', 'skipped')`,
      )
      .get(visitId, READ_TASK, batchTargetId(b.zoneId, b.index)) as { status: string } | undefined
    return row !== undefined
  }).length

  return {
    zoneId,
    planned: planned.length,
    settled,
    complete: settled === planned.length,
    why:
      settled === planned.length
        ? `Pass 1 settled all ${planned.length} of this zone's batches.`
        : `Pass 1 has settled ${settled} of this zone's ${planned.length} batches. ` +
          `Matching now would ask the enumeration question with a scaffold that is still coming — ` +
          `and the two answers look identical afterwards.`,
  }
}
