/**
 * The identification pass, model-call half — Increment 5 §3, Amendment 10.
 *
 * `engine/identify.ts` decides **which media, in what order, how many batches**,
 * and every one of those decisions is testable with no API key and no
 * photographs on disk. This file is the other half: it turns one planned batch
 * into a call, and the call's answer into proposed objects.
 *
 * ---
 *
 * ## Why this is not in `queueAssists`
 *
 * **Nameplate reading, routing and pin typing run automatically after every
 * import. Identification does not, and that is deliberate.**
 *
 * The AI Processing Decision's identification addendum §A: *nameplate extraction
 * sends a data plate; routing sends loose room photographs; **identification
 * sends the room**.* §B authorizes it on the owner's own property. **§C gates a
 * client's property behind a disclosure sentence that does not exist yet.**
 *
 * There is no column in this database saying whose house an import is of, so no
 * code here can enforce §C. What it can do is refuse to be automatic: a pass
 * that sends the photographic interior of a house has to be started by somebody,
 * which is `queueIdentification`, called from the run script and from nowhere in
 * the import path. **A gate a person has to walk through is weaker than a
 * constraint and much stronger than a comment.**
 *
 * ---
 *
 * ## What rides the call, and what does not
 *
 * **Sent:** the zone's photographs, the class projection (ids and labels only —
 * `engine/projection.ts` has the arithmetic and the doctrine reason), the zone's
 * label and type, the property flags, and any capture notes.
 *
 * **Not sent:** the frame's prose, the manifest, the binder, any other zone,
 * video, audio. §2.6 of the original decision, unchanged.
 *
 * ## Canvas frames are a separate block and say so
 *
 * Amendment 10 §B2 puts the zone's canvas media on every batch outside the
 * ceiling. **§B1 then decides their order: canvas first, detail second**, because
 * *the finest read of an object is the authoritative one* and the only ordering
 * in which the finest read touches an object last is coarse-to-fine. The
 * mechanical-room reading went the other way — 54 close-ups, then the canvas
 * shots — and a forty-pixel dark circle in a wide frame overwrote a nameplate
 * that had already been read properly.
 *
 * ## Every image is labelled in the facts block, and that is load-bearing
 *
 * The model is asked for `evidenceMediaIds`, so it has to be told which id goes
 * with which picture. The same list carries whether each frame is context or
 * detail, and its capture note where there is one. **A photograph the concierge
 * framed on purpose looks like a corner of a room until its note says
 * otherwise** — Amendment 10 §D, and the third of the three errors.
 */

import { randomUUID } from 'node:crypto'
import { now, type Db } from '../../db/index.js'
import { readClassFrame } from '../../engine/classFrame.js'
import { planIdentificationCalls, type Batch, type MediaRow, type ZoneRoutes } from '../../engine/identify.js'
import { projectClasses } from '../../engine/projection.js'
import { edgeForCall, imageNote, prepareImage, type PreparedImage } from '../image.js'
import { requireModel, type ModelConfig } from '../models.js'
import { currentPrompt, type Prompt } from '../prompts.js'
import { runVisionTask, type RunArgs } from '../client.js'
import { completeJob, enqueue, recordGeneration, requeueBatch, skipJob, type AiJob } from '../queue.js'

/** Matches the prompt directory. Identity comes from the path, in both places. */
export const IDENTIFY_TASK = 'identify_objects'

/** One job is one planned call, so the target is a zone and a batch index. */
export const IDENTIFY_TARGET_KIND = 'zone-batch'

export const batchTargetId = (zoneId: string, index: number): string => `${zoneId}#${index}`

/**
 * How much room the answer gets.
 *
 * A kitchen can hold a dozen objects and each carries a clause of evidence. The
 * default 1024 truncates that, and a truncated JSON object is not a partial
 * answer but a broken one.
 *
 * **This is the FAST tier's ceiling and the floor for every tier** — see
 * `identifyMaxTokens`. *(An earlier version of this comment said truncation
 * "pays for the images twice" because `client.ts` retried it. It did, nine
 * times, on 2026-08-09. It no longer retries.)*
 */
export const IDENTIFY_MAX_TOKENS = 4096

/**
 * How much room the answer gets, from the model rather than from this constant.
 *
 * **`IDENTIFY_MAX_TOKENS` was sized against the cheap tier and it is not enough
 * for a strong one.** Measured on the mechanical room 2026-08-09: Haiku answered
 * three batches in 2,185 / 2,877 / 1,507 output tokens; Sonnet overran 4,096 on
 * **all three, including the six-photograph batch Haiku finished in 1,507.**
 * With truncation correctly non-retryable, that is a strong tier that simply
 * cannot complete a dense room.
 *
 * The constant stays as the fast tier's value and as the floor, so a model
 * config that forgets to declare one cannot make the ceiling *smaller* than what
 * already worked.
 */
export const identifyMaxTokens = (model: ModelConfig): number =>
  Math.max(IDENTIFY_MAX_TOKENS, model.maxOutputTokens)

/** What the model may say about how well it saw a thing. Not a confidence score. */
export type Basis = 'detail' | 'context-only'

export const IDENTIFY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['objects', 'unsure', 'roomNote'],
  properties: {
    objects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'classId', 'evidenceMediaIds', 'basis', 'whatYouCanSee', 'readable'],
        properties: {
          label: { type: 'string' },
          // Null is a first-class answer, not a failure — §3 requires an object
          // with no matching class to be proposed anyway. Typed as nullable here
          // so the model has somewhere legitimate to put "none of these fits"
          // rather than reaching for the nearest id.
          classId: { type: ['string', 'null'] },
          evidenceMediaIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          basis: { type: 'string', enum: ['detail', 'context-only'] },
          whatYouCanSee: { type: 'string' },
          readable: { type: 'string' },
        },
      },
    },
    // Deliberately its own field rather than low-confidence objects. A maybe in
    // the same list as a yes gets read as a yes by whoever is going fast.
    unsure: { type: 'array', items: { type: 'string' } },
    roomNote: { type: 'string' },
  },
}

export interface ProposedObject {
  label: string
  classId: string | null
  evidenceMediaIds: string[]
  basis: Basis
  whatYouCanSee: string
  readable: string
}

export interface Identification {
  objects: ProposedObject[]
  unsure: string[]
  roomNote: string
}

export interface StoredIdentification extends Identification {
  /**
   * Class ids the model returned that the frame does not declare.
   *
   * **The object survives and its class does not.** Doctrine 7 fails open on
   * vocabulary, and the label carries what the model actually said — but a class
   * id is not open vocabulary in the way a field-app word is: the frame is this
   * repo's own file, so an id it does not declare was invented by the model or
   * is from a different frame version. Nulling it is the honest state and it is
   * exactly what `class_id IS NULL` already means. **Reported, never absorbed.**
   */
  unknownClasses: { label: string; classId: string }[]
  /** Evidence ids naming media this call did not carry. Kept as a report. */
  strayEvidence: { label: string; mediaId: string }[]
  /** Objects left with no resolvable photograph. Written anyway — see below. */
  unevidenced: string[]
}

export interface IdentifyDeps {
  prompts: Map<string, Prompt[]>
  model?: ModelConfig
  run?: <T>(args: RunArgs) => Promise<{ output: T; inputTokens: number; outputTokens: number }>
  resolvePath: (db: Db, visitId: string, mediaId: string) => string
}

// ---------------------------------------------------------------- reading rows

interface MediaFileRow extends MediaRow {
  fileStatus: string
  captureNote: string | null
}

export const latestImport = (db: Db, visitId: string): string | undefined =>
  (db.prepare('SELECT id FROM imports WHERE visit_id = ? ORDER BY imported_at DESC LIMIT 1').get(visitId) as
    | { id: string }
    | undefined)?.id

/**
 * Every media row of one import, with its capture note attached.
 *
 * **Amendment 10 §D is this LEFT JOIN and nothing else.** *The mechanism exists
 * in the manifest and does not reach the call today* — notes carry a target, the
 * target may be a media, and no code had ever followed it into a call.
 */
export function mediaForImport(db: Db, importId: string): MediaFileRow[] {
  return db
    .prepare(
      `SELECT m.media_id      AS mediaId,
              m.kind          AS kind,
              m.owner_kind    AS ownerKind,
              m.owner_zone_id AS ownerZoneId,
              m.owner_pin_id  AS ownerPinId,
              m.owner_canvas_id AS ownerCanvasId,
              m.capture_intent AS captureIntent,
              m.file          AS file,
              m.file_status   AS fileStatus,
              n.text          AS captureNote
         FROM media m
         LEFT JOIN notes n
           ON n.import_id = m.import_id AND n.target_kind = 'media' AND n.target_id = m.media_id
        WHERE m.import_id = ?`,
    )
    .all(importId) as MediaFileRow[]
}

/** Where a pin and a canvas each live. Canvases are declared inside their zone. */
export function zoneRoutes(db: Db, importId: string): ZoneRoutes {
  const pinRows = db
    .prepare('SELECT pin_id AS pinId, zone_id AS zoneId FROM pins WHERE import_id = ? AND zone_id IS NOT NULL')
    .all(importId) as { pinId: string; zoneId: string }[]

  const canvasRows = db
    .prepare(
      `SELECT canvas_id AS canvasId, zone_id AS zoneId
         FROM canvases WHERE import_id = ? AND zone_id IS NOT NULL`,
    )
    .all(importId) as { canvasId: string; zoneId: string }[]

  return {
    pinZone: new Map(pinRows.map((r) => [r.pinId, r.zoneId])),
    canvasZone: new Map(canvasRows.map((r) => [r.canvasId, r.zoneId])),
  }
}

interface ZoneRow {
  zoneId: string
  type: string | null
  label: string | null
  level: string | null
}

const zoneRow = (db: Db, importId: string, zoneId: string): ZoneRow | undefined =>
  db
    .prepare(
      'SELECT zone_id AS zoneId, type, label, level FROM zones WHERE import_id = ? AND zone_id = ?',
    )
    .get(importId, zoneId) as ZoneRow | undefined

/**
 * The property flags this visit recorded, and every flag its config declares.
 *
 * **Both, because they mean different things.** A declared flag that is not set
 * is a confident no; a flag the config never declared is a word the builder has
 * not met. Merging them would turn the second into the first, which is how a
 * house acquires a confident answer nobody gave.
 */
export function propertyFlags(db: Db, importId: string): { set: string[]; declared: string[] } {
  const session = db.prepare('SELECT flags FROM session_meta WHERE import_id = ?').get(importId) as
    | { flags: string | null }
    | undefined
  const config = db.prepare('SELECT snapshot FROM config_snapshots WHERE import_id = ?').get(importId) as
    | { snapshot: string }
    | undefined

  const parse = <T>(raw: string | null | undefined, fallback: T): T => {
    if (!raw) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }

  const snapshot = parse<Record<string, unknown>>(config?.snapshot, {})
  const declaredRaw = Array.isArray(snapshot.propertyFlags) ? (snapshot.propertyFlags as unknown[]) : []
  const declared = declaredRaw
    .map((f) => (f && typeof f === 'object' ? (f as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string')

  return {
    set: parse<string[]>(session?.flags, []).filter((f) => typeof f === 'string'),
    declared,
  }
}

// ---------------------------------------------------------------- the queueing

export interface QueuedIdentification {
  jobs: number
  zones: number
  /** The planner's own sentence, so the person starting a run reads it first. */
  note: string
  excluded: number
  unresolved: number
}

/**
 * Plan the calls for one visit and put each on the queue.
 *
 * Idempotent like every other enqueue: a second press costs nothing and does not
 * re-pay for a zone already identified.
 */
export function queueIdentification(
  db: Db,
  propertyId: string,
  visitId: string,
  actorId: string,
  /**
   * Queue only the zones this accepts. Omit it and every zone is queued.
   *
   * **This is what makes "one room, then decide" possible.** `--limit` bounds
   * how many calls are *drained*, which is a different question: it stops after
   * N calls in queue order and cannot say *which* room. The first real run wants
   * the mechanical room specifically — it is the one whose right answer is
   * already known, so it is the only room that can be graded rather than merely
   * read.
   */
  only?: (zoneId: string) => boolean,
  /**
   * Run these batches again even though they are already done.
   *
   * **The default idempotency is right and stays.** `enqueue` is
   * `ON CONFLICT DO NOTHING`, so pressing a button twice costs nothing — which
   * is the correct answer for a person who is not sure whether the first press
   * landed.
   *
   * **A comparison run is a different intention and has to say so.** Running the
   * same room on the fast tier and then the strong tier is the only way to
   * answer *did the reverse osmosis persist* — `ai_generations` was built to
   * hold exactly that, and the container these runs happen in is ephemeral, so
   * two sessions cannot share one ledger. Without this flag the second run is a
   * silent no-op and the comparison degrades to two pasted text files.
   *
   * **It costs money by design**, which is why it is a named flag and not a
   * fallback when a job is found done.
   */
  again = false,
): QueuedIdentification {
  const importId = latestImport(db, visitId)
  if (!importId) {
    return { jobs: 0, zones: 0, excluded: 0, unresolved: 0, note: `No import for visit ${visitId}. Nothing to identify.` }
  }

  const all = planIdentificationCalls(mediaForImport(db, importId), zoneRoutes(db, importId))
  const plan = only ? { ...all, batches: all.batches.filter((b) => only(b.zoneId)) } : all
  for (const b of plan.batches) {
    if (again) requeueBatch(db, visitId, batchTargetId(b.zoneId, b.index))
    enqueue({
      db,
      propertyId,
      visitId,
      task: IDENTIFY_TASK,
      targetKind: IDENTIFY_TARGET_KIND,
      targetId: batchTargetId(b.zoneId, b.index),
      actorId,
    })
  }

  return {
    jobs: plan.batches.length,
    zones: new Set(plan.batches.map((b) => b.zoneId)).size,
    excluded: plan.excluded.length,
    unresolved: plan.unresolved.length,
    // The unfiltered note, deliberately: it describes the whole export, and a
    // filtered run must not read as though the rest of the house went missing.
    note: plan.note,
  }
}

// ---------------------------------------------------------------- the facts block

/**
 * The per-call data: what the model is looking at, and what it may choose from.
 *
 * **Kept out of the prompt file on purpose.** `/prompts/README.md`: *wording
 * lives here; per-call data does not.* A hash that changed with every room would
 * identify nothing, and identifying the wording is the whole reason the hash is
 * recorded.
 */
export function identificationFacts(args: {
  zone: ZoneRow | undefined
  zoneId: string
  batchIndex: number
  batchOf: number
  context: { mediaId: string; captureNote: string | null }[]
  detail: { mediaId: string; captureNote: string | null }[]
  flags: { set: string[]; declared: string[] }
  projection: string
}): string {
  const { zone, zoneId, batchIndex, batchOf, context, detail, flags, projection } = args
  const lines: string[] = []

  const named = zone?.label ?? zone?.type ?? null
  lines.push(
    named
      ? `This room is recorded as: ${named}${zone?.type && zone.type !== named ? ` (type ${zone.type})` : ''}${zone?.level ? `, on the ${zone.level} level` : ''}.`
      : `This room has no recorded label or type. That is ordinary; say what you see.`,
  )
  if (batchOf > 1) {
    lines.push(
      `These photographs are part ${batchIndex} of ${batchOf} for this room — you are seeing some of it, not all of it. Do not conclude anything from what is absent.`,
    )
  }

  lines.push('')
  lines.push(
    flags.set.length > 0
      ? `Recorded about this property: ${flags.set.join(', ')}.`
      : `Nothing is recorded about this property's services.`,
  )
  if (flags.declared.length > 0) {
    const off = flags.declared.filter((f) => !flags.set.includes(f))
    if (off.length > 0) {
      lines.push(`Asked and answered no: ${off.join(', ')}.`)
    }
  }

  const describe = (m: { mediaId: string; captureNote: string | null }): string =>
    m.captureNote && m.captureNote.trim().length > 0
      ? `${m.mediaId} — note written at capture: "${m.captureNote.trim()}"`
      : m.mediaId

  lines.push('')
  if (context.length > 0) {
    lines.push(`ROOM CONTEXT — ${context.length} wide frame${context.length === 1 ? '' : 's'}, shown first:`)
    context.forEach((m) => lines.push(`  ${describe(m)}`))
  } else {
    lines.push(
      `ROOM CONTEXT — none. No wide frame of this room was captured, so you are seeing parts without the room they sit in. Say less rather than more.`,
    )
  }

  lines.push('')
  if (detail.length > 0) {
    lines.push(`DETAIL PHOTOGRAPHS — ${detail.length}, shown after the context frames, in the order they appear:`)
    detail.forEach((m) => lines.push(`  ${describe(m)}`))
  } else {
    lines.push(
      `DETAIL PHOTOGRAPHS — none. Only the room context was captured here, so every object you report is context-only.`,
    )
  }

  lines.push('')
  lines.push(projection)
  return lines.join('\n')
}

// ---------------------------------------------------------------- the run

/**
 * Normalise one answer into something that can be stored.
 *
 * **Nothing is discarded.** An id the frame does not declare, an evidence
 * reference to a photograph this call never sent, an object with no usable
 * evidence at all — each is kept, corrected where correction is honest, and
 * reported. Doctrine 6, and every one of these is a thing a proposal review
 * needs to see rather than a thing a parser should tidy away.
 */
export function normaliseIdentification(
  output: Identification,
  known: { classIds: ReadonlySet<string>; mediaIds: ReadonlySet<string> },
): StoredIdentification {
  const objects: ProposedObject[] = []
  const unknownClasses: StoredIdentification['unknownClasses'] = []
  const strayEvidence: StoredIdentification['strayEvidence'] = []
  const unevidenced: string[] = []

  for (const raw of output.objects ?? []) {
    const label = typeof raw.label === 'string' ? raw.label.trim() : ''
    // An object with no name is not an identification. It is the one thing here
    // that cannot be stored — `objects.label` is NOT NULL because an object
    // nobody can name tells a reader nothing — so it becomes an `unsure` line,
    // which is where a thing the model could not name belongs anyway.
    if (label === '') continue

    let classId: string | null = null
    if (typeof raw.classId === 'string' && raw.classId.trim() !== '') {
      const id = raw.classId.trim()
      if (known.classIds.has(id)) classId = id
      else unknownClasses.push({ label, classId: id })
    }

    const evidence: string[] = []
    for (const m of raw.evidenceMediaIds ?? []) {
      if (typeof m !== 'string') continue
      if (known.mediaIds.has(m)) evidence.push(m)
      else strayEvidence.push({ label, mediaId: m })
    }
    if (evidence.length === 0) unevidenced.push(label)

    objects.push({
      label,
      classId,
      evidenceMediaIds: evidence,
      basis: raw.basis === 'context-only' ? 'context-only' : 'detail',
      whatYouCanSee: typeof raw.whatYouCanSee === 'string' ? raw.whatYouCanSee : '',
      readable: typeof raw.readable === 'string' ? raw.readable : '',
    })
  }

  const dropped = (output.objects ?? []).length - objects.length
  const unsure = (output.unsure ?? []).filter((u): u is string => typeof u === 'string')

  return {
    objects,
    unsure:
      dropped > 0
        ? [...unsure, `${dropped} proposed object${dropped === 1 ? '' : 's'} came back with no name and could not be stored.`]
        : unsure,
    roomNote: typeof output.roomNote === 'string' ? output.roomNote : '',
    unknownClasses,
    strayEvidence,
    unevidenced,
  }
}

export interface IdentifyResult extends StoredIdentification {
  /** The object ids written, in the order they were proposed. */
  objectIds: string[]
  generationId: string
}

/**
 * Identify one batch: one room, or one slice of a large one.
 *
 * Returns null when the job was correctly skipped. A skip writes its reason on
 * the row, because a job that decided not to run and a job that never existed
 * look identical from outside and only one of them is the pass working.
 */
export async function runIdentify(db: Db, job: AiJob, deps: IdentifyDeps): Promise<IdentifyResult | null> {
  const importId = latestImport(db, job.visit_id)
  if (!importId) {
    skipJob(db, job.id, 'this visit has no import, so there are no photographs to look at')
    return null
  }

  const media = mediaForImport(db, importId)
  const plan = planIdentificationCalls(media, zoneRoutes(db, importId))
  const batch = plan.batches.find((b) => batchTargetId(b.zoneId, b.index) === job.target_id)
  if (!batch) {
    // The plan is deterministic, so this means the import changed underneath a
    // queued job — a re-import, or media arriving late. Skipping with the reason
    // beats running against a batch that no longer describes the room.
    skipJob(
      db,
      job.id,
      `no batch \`${job.target_id}\` in this visit's current plan — the import has changed since this job was queued`,
    )
    return null
  }

  const status = new Map(media.map((m) => [m.mediaId, m.fileStatus]))
  const present = (m: { mediaId: string }): boolean => status.get(m.mediaId) === 'present'
  const context = batch.context.filter(present)
  const detail = batch.media.filter(present)

  if (context.length === 0 && detail.length === 0) {
    // The ordinary state of a manifest-only import: every row is here and no
    // bytes are. Counted as a skip with a reason rather than filtered out at
    // queue time, so "photographs this pass could not look at" is a row somebody
    // can find rather than a difference between two numbers nobody compares.
    skipJob(
      db,
      job.id,
      `none of this room's ${batch.context.length + batch.media.length} photographs are on this machine`,
    )
    return null
  }

  const model = deps.model ?? requireModel('fast')
  const prompt = currentPrompt(deps.prompts, IDENTIFY_TASK)
  const frame = readClassFrame()
  const projection = projectClasses(frame)

  // Over twenty image blocks, a stricter per-image dimension limit applies and
  // anything above it is REJECTED — see `edgeForCall`. Amendment 10 §B2 puts a
  // full room over that line by design, so this is the ordinary path.
  const edge = edgeForCall(context.length + detail.length, model.maxImageEdge)

  // CONTEXT FIRST, DETAIL SECOND — Amendment 10 §B1. The finest read must be the
  // last one to touch each object, and that is the only ordering that gives it.
  const prepared: { mediaId: string; image: PreparedImage }[] = []
  for (const m of [...context, ...detail]) {
    prepared.push({
      mediaId: m.mediaId,
      image: await prepareImage(deps.resolvePath(db, job.visit_id, m.mediaId), edge),
    })
  }

  const noteOf = new Map(media.map((m) => [m.mediaId, m.captureNote]))
  const withNotes = (list: readonly { mediaId: string }[]): { mediaId: string; captureNote: string | null }[] =>
    list.map((m) => ({ mediaId: m.mediaId, captureNote: noteOf.get(m.mediaId) ?? null }))

  const zone = zoneRow(db, importId, batch.zoneId)
  const flags = propertyFlags(db, importId)
  const facts = identificationFacts({
    zone,
    zoneId: batch.zoneId,
    batchIndex: batch.index,
    batchOf: batch.of,
    context: withNotes(context),
    detail: withNotes(detail),
    flags,
    projection: projection.text,
  })

  const run = deps.run ?? runVisionTask
  const { output, inputTokens, outputTokens } = await run<Identification>({
    model,
    prompt,
    facts,
    schema: IDENTIFY_SCHEMA,
    maxTokens: identifyMaxTokens(model),
    images: prepared.map(({ image }) => ({ data: image.data, mediaType: image.mediaType })),
  })

  const stored = normaliseIdentification(output, {
    classIds: new Set(frame.classes.map((c) => c.id)),
    mediaIds: new Set(prepared.map((p) => p.mediaId)),
  })

  const generationId = recordGeneration({
    db,
    propertyId: job.property_id,
    visitId: job.visit_id,
    importId,
    actorId: job.actor_id,
    task: IDENTIFY_TASK,
    targetKind: job.target_kind,
    targetId: job.target_id,
    model: model.id,
    // **Priced at the tier that actually ran, not at the default.**
    // `recordGeneration` falls back to `'fast'`, so a strong-tier run was
    // costed at the cheap tier's rates — the ledger and the spend cap would
    // both have under-counted by whatever the spread is. `tier` had been a
    // declared-and-unconsumed field since the queue was built; `--tier strong`
    // is what made it load-bearing.
    tier: model.tier,
    promptId: prompt.id,
    promptVersion: prompt.version,
    promptHash: prompt.hash,
    // Everything that produced the answer, so "why did it say that" survives the
    // next frame version and the next re-import. The frame VERSION rather than
    // the frame: a proposal made against 176 classes must stay distinguishable
    // from one made against 206, and the projection itself is reproducible from
    // the version.
    inputRefs: {
      zoneId: batch.zoneId,
      zoneLabel: zone?.label ?? null,
      zoneType: zone?.type ?? null,
      batch: { index: batch.index, of: batch.of },
      context: context.map((m) => m.mediaId),
      detail: detail.map((m) => m.mediaId),
      images: prepared.map((p) => ({ mediaId: p.mediaId, prepared: imageNote(p.image) })),
      // What was sent, and why it was that size. A read that went poorly because
      // the call was over the many-image threshold has to be explicable without
      // re-deriving the arithmetic from the batch.
      imageEdge: { sent: edge, modelLimit: model.maxImageEdge, imageCount: prepared.length },
      captureNotes: withNotes([...context, ...detail]).filter((m) => m.captureNote),
      propertyFlags: flags,
      classFrameVersion: projection.frameVersion,
      classCount: projection.classCount,
    },
    output: stored,
    // Nothing in this room, which is a complete answer for a hallway of closed
    // doors and a suspicious one for a mechanical room. Either way there is
    // nothing for a human to accept, which is what `abstained` guards.
    abstained: stored.objects.length === 0,
    inputTokens,
    outputTokens,
  })

  const objectIds = writeProposedObjects(db, {
    propertyId: job.property_id,
    importId,
    zoneId: batch.zoneId,
    actorId: job.actor_id,
    objects: stored.objects,
    // Doctrine 3. Also what makes a fast-then-strong comparison legible: two
    // passes over one room write two sets of proposals, and each set knows
    // which call produced it.
    generationId,
  })

  completeJob(db, job.id, generationId)
  return { ...stored, objectIds, generationId }
}

/**
 * Write the proposals.
 *
 * **`confirmed_by` and `confirmed_at` stay null, which is the whole shape of a
 * proposal.** `actor_id` is whoever triggered the run — a person, never the
 * model, which is recorded on the generation instead. Doctrine 5 is that AI
 * drafts and a human writes, and these columns are how that stays legible: an
 * object with an actor and no confirmation is something a machine suggested and
 * nobody has yet stood behind.
 *
 * **An object with no resolvable evidence is still written.** It has no
 * photograph to sit beside, which makes it precisely the kind of thing a person
 * should see and reject — deleting it here would be the builder quietly deciding
 * an outcome, and the review would never know it happened.
 */
export function writeProposedObjects(
  db: Db,
  args: {
    propertyId: string
    importId: string | null
    zoneId: string
    actorId: string
    objects: readonly ProposedObject[]
    /**
     * The generation that proposed these — doctrine 3, provenance travels.
     *
     * Optional because a later slice lets a human create an object at the desk
     * from a document, and that object has no generation. **Null means no model
     * produced this, which is a different fact from unknown.**
     */
    generationId?: string | null
  },
): string[] {
  const at = now()
  const insertObject = db.prepare(
    `INSERT INTO objects (id, property_id, zone_id, import_id, class_id, label, confirmed_by, confirmed_at, actor_id, generation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
  )
  const insertMedia = db.prepare(
    'INSERT OR IGNORE INTO object_media (object_id, media_id, created_at) VALUES (?, ?, ?)',
  )

  const ids: string[] = []
  const write = db.transaction(() => {
    for (const o of args.objects) {
      const id = randomUUID()
      insertObject.run(
        id, args.propertyId, args.zoneId, args.importId, o.classId, o.label, args.actorId,
        args.generationId ?? null, at,
      )
      for (const mediaId of o.evidenceMediaIds) insertMedia.run(id, mediaId, at)
      ids.push(id)
    }
  })
  write()
  return ids
}
