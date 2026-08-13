/**
 * Pass 3 · Match and complete — Amendment 11 §C, and the ruling of 2026-08-12.
 *
 * **The enumeration moves inside this pass and stage 4 as a standalone first
 * step is superseded.** Nothing is deleted: `identify_objects` still runs and
 * still works. What changed is that it is no longer the first question asked.
 *
 * ---
 *
 * ## Why the order is structural rather than a cost saving
 *
 * A pass asked *what is in this room* has to enumerate, and enumeration is the
 * act every measured failure came out of — `reverse-osmosis` in a room with
 * none, a metering pump as a well pump, two vessels as four tanks.
 *
 * **A pass asked *here are twenty-two known objects, what else is here* cannot
 * produce a duplicate of a known object, because the known object is in the
 * question rather than in the answer.** Four pressure tanks stops being a thing
 * the model gets wrong and becomes a thing it is no longer asked.
 *
 * **And anchoring is the sharper half.** A pass that has already said *reverse
 * osmosis system* has committed, and **nothing downstream un-commits a row that
 * already carries a class and a maintenance rhythm.** The order prevents the
 * claim; it does not correct it.
 *
 * ---
 *
 * ## ⚑ Two tasks, one runner — and the task name is the record
 *
 * The scaffold argument only holds where there is a scaffold. **A bedroom has no
 * plated objects, and *here are zero known objects, what else is here* is the
 * enumeration question wearing different words.** So the question changes with
 * the inventory:
 *
 * | inventory | task | question |
 * |---|---|---|
 * | non-empty | `match_known` | find these, then say what else |
 * | empty | `enumerate_room` | say what is here, and every answer is a guess |
 *
 * **They are two task names rather than one task with a branch, and that is the
 * whole point.** `ai_generations.task` then records **which question was
 * asked** — otherwise a run where the inventory happened to be empty is
 * indistinguishable from one where it was not, which is *an absence
 * indistinguishable from a completion* arriving in the ledger.
 *
 * Each also gets its own prompt file, its own version pin and its own golden-set
 * gate, because they are different instructions with different failure modes.
 *
 * ---
 *
 * ## The two lanes, and they must not merge
 *
 * **`located` is plate-derived**: its class follows from a resolution that was
 * read off a nameplate and looked up. **`additional` is appearance-derived**:
 * recognised from shape and context, and marked as a guess in the row itself.
 *
 * `objects.derived_from` carries it, and `resolution_id` is what makes `plate`
 * checkable — a plate-derived object with no resolution behind it is a claim
 * about provenance with nothing supporting it.
 */

import { randomUUID } from 'node:crypto'
import { now, type Db } from '../../db/index.js'
import { readClassFrame } from '../../engine/classFrame.js'
import { planIdentificationCalls } from '../../engine/identify.js'
import { projectClasses } from '../../engine/projection.js'
import { edgeForCall, imageNote, prepareImage, type PreparedImage } from '../image.js'
import { requireModel, type ModelConfig } from '../models.js'
import { currentPrompt } from '../prompts.js'
import { runVisionTask } from '../client.js'
import { completeJob, enqueue, recordGeneration, requeueBatch, skipJob, type AiJob } from '../queue.js'
import type { AssistDeps } from './index.js'
import { batchTargetId, latestImport, mediaForImport, zoneRoutes } from './identify.js'
import { readState, type ReadState } from './readSurfaces.js'
import { knownInventory } from './resolveProduct.js'

/** The room has a scaffold: find these, then say what else. */
export const MATCH_TASK = 'match_known'
/** The room has no scaffold, and the question says so. */
export const ENUMERATE_TASK = 'enumerate_room'

export const MATCH_TARGET_KIND = 'zone-batch'

/** Both questions produce the same answer shape; two of its arrays are empty for one of them. */
export const MATCH_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['located', 'couldNotLocate', 'additional', 'unsure', 'roomNote'],
  properties: {
    located: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['product', 'mediaIds', 'whereItIs'],
        properties: {
          product: { type: 'string' },
          mediaIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          model: {
            type: ['string', 'null'],
            description:
              'The model or part number printed on THIS object, exactly as it reads, or null. ' +
              'Never a number read off a different thing in the same photograph, and never a guess.',
          },
          whereItIs: { type: 'string' },
          partOf: { type: ['string', 'null'] },
        },
      },
    },
    couldNotLocate: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['product', 'whereExpected'],
        properties: { product: { type: 'string' }, whereExpected: { type: 'string' } },
      },
    },
    additional: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'classId', 'mediaIds', 'whatYouCanSee', 'whatMakesItDifferent'],
        properties: {
          label: { type: 'string' },
          classId: { type: ['string', 'null'] },
          mediaIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          model: {
            type: ['string', 'null'],
            description:
              'The model or part number printed on THIS object, exactly as it reads, or null. ' +
              'Never a number read off a different thing in the same photograph, and never a guess.',
          },
          whatYouCanSee: { type: 'string' },
          // The duplicate guard. Required, because an entry that cannot say how
          // it differs from a known product is probably that product.
          whatMakesItDifferent: { type: 'string' },
          partOf: { type: ['string', 'null'] },
        },
      },
    },
    unsure: { type: 'array', items: { type: 'string' } },
    roomNote: { type: 'string' },
  },
}

export interface Located {
  product: string
  mediaIds: string[]
  /**
   * The model or part number printed on THIS object, or null.
   *
   * ⚑ **Object-level, which is the whole point.** The photograph-level list
   * bleeds — a fire extinguisher carried the geothermal unit's model number in
   * the first real run, because both were in the frame. Scoring rule 6 asks a
   * question about *this thing's plate* and cannot answer it from that list.
   */
  modelRead?: string | null
  whereItIs: string
  partOf?: string | null
}
export interface NotLocated { product: string; whereExpected: string }
export interface Additional {
  label: string
  classId: string | null
  mediaIds: string[]
  /**
   * The model or part number printed on THIS object, or null.
   *
   * ⚑ **Object-level, which is the whole point.** The photograph-level list
   * bleeds — a fire extinguisher carried the geothermal unit's model number in
   * the first real run, because both were in the frame. Scoring rule 6 asks a
   * question about *this thing's plate* and cannot answer it from that list.
   */
  modelRead?: string | null
  whatYouCanSee: string
  whatMakesItDifferent: string
  partOf?: string | null
}
export interface MatchOutput {
  located: Located[]
  couldNotLocate: NotLocated[]
  additional: Additional[]
  unsure: string[]
  roomNote: string
}

export interface StoredMatch extends MatchOutput {
  /** Which question was asked. Recorded, never inferred from an empty array. */
  question: typeof MATCH_TASK | typeof ENUMERATE_TASK
  /** `located` entries naming a product that was not on the list. Reported. */
  unknownProducts: string[]
  /** Class ids the frame does not declare. The object survives; the class does not. */
  unknownClasses: { label: string; classId: string }[]
  /** Evidence naming a photograph this call did not carry. */
  strayEvidence: { label: string; mediaId: string }[]
  /** `partOf` naming nothing in this answer. Kept, never guessed at. */
  danglingParents: { child: string; named: string }[]
  /**
   * ⚑ Entries whose every cited photograph belonged to another batch.
   *
   * **Not written as objects, and that is doctrine 3 rather than tidiness.** An
   * object citing no photograph has no provenance: nothing can verify it,
   * nothing can score it — it cannot overlap a key object by construction — and
   * a binder would render it as a fact about the house with no evidence behind
   * it at all.
   *
   * *Found in the first real run:* `Pressurized bladder tank isolation hardware`
   * was written from the mechanical room with an empty `mediaIds`, and became
   * the run's only false positive. **Its citations are in `strayEvidence`, so
   * nothing is lost by refusing the object** — the answer is kept, it just does
   * not become a thing in the house.
   */
  evidenceless: string[]
}

// ---------------------------------------------------------------- the planning

export interface MatchBatch {
  zoneId: string
  index: number
  of: number
  media: string[]
  context: string[]
  /** Empty means the enumeration question. Never a branch nobody can see. */
  inventory: { product: string; kind: string; specificity: string }[]
}

export interface MatchPlan {
  batches: MatchBatch[]
  withScaffold: number
  withoutScaffold: number
  note: string
}

/**
 * Which zones get which question.
 *
 * **Inventory is per zone**, resolved through the readings' media: a product
 * read off a plate in the mechanical room scaffolds the mechanical room and
 * says nothing about the kitchen.
 */
export function planMatch(db: Db, importId: string): MatchPlan {
  const media = mediaForImport(db, importId)
  const plan = planIdentificationCalls(media, zoneRoutes(db, importId))

  // The known inventory reaches a zone the way everything else does — through
  // the photograph it was read from.
  const zoneOf = new Map<string, string>()
  for (const b of plan.batches) for (const m of [...b.media, ...b.context]) zoneOf.set(m.mediaId, b.zoneId)

  const byZone = new Map<string, MatchBatch['inventory']>()
  for (const p of knownInventory(db, importId)) {
    const zone = zoneOf.get(p.mediaId)
    if (!zone) continue
    const list = byZone.get(zone)
    const entry = { product: p.product, kind: p.kind, specificity: p.specificity }
    if (list) { if (!list.some((e) => e.product === entry.product)) list.push(entry) }
    else byZone.set(zone, [entry])
  }

  const batches: MatchBatch[] = plan.batches.map((b) => ({
    zoneId: b.zoneId,
    index: b.index,
    of: b.of,
    media: b.media.map((m) => m.mediaId),
    context: b.context.map((m) => m.mediaId),
    inventory: byZone.get(b.zoneId) ?? [],
  }))

  const withScaffold = batches.filter((b) => b.inventory.length > 0).length
  return {
    batches,
    withScaffold,
    withoutScaffold: batches.length - withScaffold,
    note:
      batches.length === 0
        ? 'No calls. Nothing in this import is a still image reaching a zone.'
        : `${batches.length} calls. ${withScaffold} carry a known inventory and are asked to MATCH; ` +
          `${batches.length - withScaffold} carry none and are asked to ENUMERATE, which is the harder ` +
          `question and is asked only where there is no scaffold.`,
  }
}

/** Which question a batch gets. The only place the choice is made. */
export const questionFor = (b: { inventory: unknown[] }): typeof MATCH_TASK | typeof ENUMERATE_TASK =>
  b.inventory.length > 0 ? MATCH_TASK : ENUMERATE_TASK

export interface QueuedMatch {
  jobs: number
  matching: number
  enumerating: number
  /** Zones refused because pass 1 has not settled. Named, never silently dropped. */
  blocked: ReadState[]
  note: string
}

export function queueMatch(
  db: Db,
  propertyId: string,
  visitId: string,
  actorId: string,
  only?: (zoneId: string) => boolean,
  again = false,
): QueuedMatch {
  const importId = latestImport(db, visitId)
  if (!importId) return { jobs: 0, matching: 0, enumerating: 0, blocked: [], note: `No import for visit ${visitId}.` }

  const plan = planMatch(db, importId)
  const wanted = only ? plan.batches.filter((b) => only(b.zoneId)) : plan.batches

  // ⚑ THE GATE. A zone whose pass-1 read has not settled is not queued at all —
  // not warned about. An unscaffolded run and a scaffolded one produce different
  // answers and look identical afterwards, so the refusal has to happen before
  // the money is spent rather than in a sentence somebody reads later.
  const blocked: ReadState[] = []
  const batches: MatchBatch[] = []
  for (const b of wanted) {
    const state = readState(db, importId, visitId, b.zoneId)
    if (state.complete) batches.push(b)
    else blocked.push(state)
  }

  for (const b of batches) {
    const task = questionFor(b)
    if (again) requeueBatch(db, visitId, batchTargetId(b.zoneId, b.index))
    enqueue({
      db, propertyId, visitId, task,
      targetKind: MATCH_TARGET_KIND,
      targetId: batchTargetId(b.zoneId, b.index),
      actorId,
    })
  }
  return {
    jobs: batches.length,
    matching: batches.filter((b) => questionFor(b) === MATCH_TASK).length,
    enumerating: batches.filter((b) => questionFor(b) === ENUMERATE_TASK).length,
    blocked,
    note:
      blocked.length === 0
        ? plan.note
        : `${plan.note}  ${blocked.length} zone(s) NOT queued because pass 1 has not settled there — ` +
          `run \`npm run read\` first, or \`npm run passes\` which does both in order.`,
  }
}

// ------------------------------------------------------------- the facts block

export function matchFacts(args: {
  zoneLabel: string | null
  batchIndex: number
  batchOf: number
  context: string[]
  detail: string[]
  inventory: MatchBatch['inventory']
  projection: string
}): string {
  const lines: string[] = []
  lines.push(
    args.zoneLabel
      ? `This room is recorded as: ${args.zoneLabel}.`
      : `This room has no recorded label. That is ordinary; say what you see.`,
  )
  if (args.batchOf > 1) {
    lines.push(
      `Part ${args.batchIndex} of ${args.batchOf} for this room — you are seeing some of it, not all of it. ` +
        `Do not conclude anything from what is absent.`,
    )
  }

  lines.push('')
  if (args.inventory.length > 0) {
    lines.push(`KNOWN PRODUCTS IN THIS ROOM — ${args.inventory.length}, each read off a label and looked up:`)
    for (const p of args.inventory) lines.push(`  ${p.product}   [${p.kind}, resolved to a ${p.specificity}]`)
  } else {
    // Said in words rather than left as an empty block. An empty list and a
    // list nobody built are different facts, and the prompt for this case is
    // written knowing which one it is.
    lines.push(
      `KNOWN PRODUCTS IN THIS ROOM — none. No label in this room resolved to a product, so there is ` +
        `nothing to match against and every answer you give is recognised from appearance.`,
    )
  }

  lines.push('')
  lines.push(
    args.context.length > 0
      ? `ROOM CONTEXT — ${args.context.length} wide frame(s), shown first: ${args.context.join(', ')}`
      : `ROOM CONTEXT — none. You are seeing parts without the room they sit in. Say less rather than more.`,
  )
  lines.push('')
  lines.push(
    args.detail.length > 0
      ? `DETAIL PHOTOGRAPHS — ${args.detail.length}, in order: ${args.detail.join(', ')}`
      : `DETAIL PHOTOGRAPHS — none.`,
  )
  lines.push('')
  lines.push(args.projection)
  return lines.join('\n')
}

// ------------------------------------------------------------------ normalising

export function normaliseMatch(
  output: MatchOutput,
  known: {
    question: typeof MATCH_TASK | typeof ENUMERATE_TASK
    products: ReadonlySet<string>
    classIds: ReadonlySet<string>
    mediaIds: ReadonlySet<string>
  },
): StoredMatch {
  const located: Located[] = []
  const additional: Additional[] = []
  const unknownProducts: string[] = []
  const unknownClasses: StoredMatch['unknownClasses'] = []
  const strayEvidence: StoredMatch['strayEvidence'] = []
  const evidenceless: string[] = []

  /** A model reading, or null. **Doctrine 4 — a blank is not a model number.** */
  const modelOf = (v: unknown): string | null => {
    const t = typeof v === 'string' ? v.trim() : ''
    return t === '' ? null : t
  }

  const evidence = (label: string, ids: unknown): string[] => {
    const out: string[] = []
    for (const m of Array.isArray(ids) ? ids : []) {
      if (typeof m !== 'string') continue
      if (known.mediaIds.has(m)) out.push(m)
      else strayEvidence.push({ label, mediaId: m })
    }
    return out
  }

  for (const raw of output.located ?? []) {
    const product = typeof raw.product === 'string' ? raw.product.trim() : ''
    if (product === '') continue
    // ⚑ A located entry naming a product that is not on the list is not a
    // located entry. It is an appearance guess wearing the plate lane's badge,
    // and it is the one thing that would silently merge the two lanes.
    if (!known.products.has(product)) { unknownProducts.push(product); continue }
    const locatedEvidence = evidence(product, raw.mediaIds)
    if (locatedEvidence.length === 0) { evidenceless.push(product); continue }
    located.push({
      product,
      mediaIds: locatedEvidence,
      modelRead: modelOf((raw as { model?: unknown }).model),
      whereItIs: typeof raw.whereItIs === 'string' ? raw.whereItIs.trim() : '',
      partOf: typeof raw.partOf === 'string' && raw.partOf.trim() !== '' ? raw.partOf.trim() : null,
    })
  }

  for (const raw of output.additional ?? []) {
    const label = typeof raw.label === 'string' ? raw.label.trim() : ''
    if (label === '') continue
    let classId: string | null = null
    if (typeof raw.classId === 'string' && raw.classId.trim() !== '') {
      const id = raw.classId.trim()
      if (known.classIds.has(id)) classId = id
      else unknownClasses.push({ label, classId: id })
    }
    const additionalEvidence = evidence(label, raw.mediaIds)
    if (additionalEvidence.length === 0) { evidenceless.push(label); continue }
    additional.push({
      label,
      classId,
      mediaIds: additionalEvidence,
      modelRead: modelOf((raw as { model?: unknown }).model),
      whatYouCanSee: typeof raw.whatYouCanSee === 'string' ? raw.whatYouCanSee : '',
      whatMakesItDifferent: typeof raw.whatMakesItDifferent === 'string' ? raw.whatMakesItDifferent : '',
      partOf: typeof raw.partOf === 'string' && raw.partOf.trim() !== '' ? raw.partOf.trim() : null,
    })
  }

  // A `partOf` naming nothing in this answer is kept and reported rather than
  // resolved to the nearest thing. Guessing a parent is how a part joins the
  // wrong system, which renders as a fact.
  const names = new Set([...located.map((l) => l.product), ...additional.map((a) => a.label)])
  const danglingParents: StoredMatch['danglingParents'] = []
  for (const o of [...located.map((l) => ({ child: l.product, p: l.partOf })), ...additional.map((a) => ({ child: a.label, p: a.partOf }))]) {
    if (o.p && !names.has(o.p)) danglingParents.push({ child: o.child, named: o.p })
  }

  return {
    question: known.question,
    located,
    evidenceless,
    couldNotLocate: (output.couldNotLocate ?? []).filter(
      (c): c is NotLocated => typeof c?.product === 'string' && known.products.has(c.product.trim()),
    ).map((c) => ({ product: c.product.trim(), whereExpected: String(c.whereExpected ?? '') })),
    additional,
    unsure: (output.unsure ?? []).filter((u): u is string => typeof u === 'string'),
    roomNote: typeof output.roomNote === 'string' ? output.roomNote : '',
    unknownProducts,
    unknownClasses,
    strayEvidence,
    danglingParents,
  }
}

// ---------------------------------------------------------------------- writing

/** Write both lanes, keeping them apart, and resolve `partOf` within the batch. */
export function writeMatched(
  db: Db,
  args: {
    propertyId: string
    importId: string
    zoneId: string
    actorId: string
    stored: StoredMatch
    resolutionOf: ReadonlyMap<string, string>
    generationId?: string | null
  },
): { plate: string[]; appearance: string[] } {
  const at = now()
  const insert = db.prepare(
    `INSERT INTO objects (id, property_id, zone_id, import_id, class_id, label, confirmed_by, confirmed_at,
                          actor_id, generation_id, derived_from, resolution_id, model_read, parent_object_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, NULL, ?)`,
  )
  const link = db.prepare('INSERT OR IGNORE INTO object_media (object_id, media_id, created_at) VALUES (?, ?, ?)')
  const setParent = db.prepare('UPDATE objects SET parent_object_id = ? WHERE id = ?')

  const plate: string[] = []
  const appearance: string[] = []
  const idByName = new Map<string, string>()
  const parentWanted: { childId: string; named: string }[] = []

  const write = db.transaction(() => {
    for (const l of args.stored.located) {
      const id = randomUUID()
      insert.run(
        id, args.propertyId, args.zoneId, args.importId, null, l.product, args.actorId,
        args.generationId ?? null, 'plate', args.resolutionOf.get(l.product) ?? null, l.modelRead ?? null, at,
      )
      for (const m of l.mediaIds) link.run(id, m, at)
      idByName.set(l.product, id)
      if (l.partOf) parentWanted.push({ childId: id, named: l.partOf })
      plate.push(id)
    }
    for (const a of args.stored.additional) {
      const id = randomUUID()
      insert.run(
        id, args.propertyId, args.zoneId, args.importId, a.classId, a.label, args.actorId,
        args.generationId ?? null, 'appearance', null, a.modelRead ?? null, at,
      )
      for (const m of a.mediaIds) link.run(id, m, at)
      idByName.set(a.label, id)
      if (a.partOf) parentWanted.push({ childId: id, named: a.partOf })
      appearance.push(id)
    }
    // Second pass, because a parent may be written after its child and the
    // model's answer carries no ordering.
    for (const p of parentWanted) {
      const parentId = idByName.get(p.named)
      if (parentId && parentId !== p.childId) setParent.run(parentId, p.childId)
    }
  })
  write()
  return { plate, appearance }
}

// ---------------------------------------------------------------------- the run

export interface MatchResult extends StoredMatch {
  plateObjectIds: string[]
  appearanceObjectIds: string[]
  generationId: string
}

export async function runMatchComplete(db: Db, job: AiJob, deps: AssistDeps): Promise<MatchResult | null> {
  const importId = latestImport(db, job.visit_id)
  if (!importId) {
    skipJob(db, job.id, 'this visit has no import, so there is nothing to match')
    return null
  }

  const plan = planMatch(db, importId)
  const batch = plan.batches.find((b) => batchTargetId(b.zoneId, b.index) === job.target_id)
  if (!batch) {
    skipJob(db, job.id, `no batch \`${job.target_id}\` in this visit's current plan`)
    return null
  }

  const status = new Map(mediaForImport(db, importId).map((m) => [m.mediaId, m.fileStatus]))
  const present = (id: string): boolean => status.get(id) === 'present'
  const context = batch.context.filter(present)
  const detail = batch.media.filter(present)
  if (context.length === 0 && detail.length === 0) {
    skipJob(db, job.id, `none of this room's ${batch.context.length + batch.media.length} photographs are on this machine`)
    return null
  }

  // ⚑ The question the job was queued with, not one re-derived here. If the
  // inventory changed between queueing and running, the job that was paid for
  // is the one that runs — and a mismatch is visible in the ledger rather than
  // silently corrected.
  // The gate again, at the moment of spending. `queueMatch` refuses to enqueue an
  // unready zone; this refuses to RUN one — because a job queued when pass 1 had
  // settled can be drained after a re-import when it has not.
  const state = readState(db, importId, job.visit_id, batch.zoneId)
  if (!state.complete) {
    skipJob(db, job.id, state.why)
    return null
  }

  const question = job.task === ENUMERATE_TASK ? ENUMERATE_TASK : MATCH_TASK

  const model = deps.model ?? requireModel('fast')
  const prompt = currentPrompt(deps.prompts, question)
  const frame = readClassFrame()
  const projection = projectClasses(frame)
  const edge = edgeForCall(context.length + detail.length, model.maxImageEdge)

  // Context first, detail second — Amendment 10 §B1. The finest read must be
  // the last one to touch each object.
  const prepared: { mediaId: string; image: PreparedImage }[] = []
  for (const mediaId of [...context, ...detail]) {
    prepared.push({ mediaId, image: await prepareImage(deps.resolvePath(db, job.visit_id, mediaId), edge) })
  }

  const zone = db
    .prepare('SELECT label, type FROM zones WHERE import_id = ? AND zone_id = ?')
    .get(importId, batch.zoneId) as { label: string | null; type: string | null } | undefined

  const facts = matchFacts({
    zoneLabel: zone?.label ?? zone?.type ?? null,
    batchIndex: batch.index,
    batchOf: batch.of,
    context,
    detail,
    inventory: batch.inventory,
    projection: projection.text,
  })

  const run = deps.run ?? runVisionTask
  const { output, inputTokens, outputTokens } = await run<MatchOutput>({
    model, prompt, facts,
    schema: MATCH_SCHEMA,
    maxTokens: Math.max(4096, model.maxOutputTokens),
    images: prepared.map(({ image }) => ({ data: image.data, mediaType: image.mediaType })),
  })

  const stored = normaliseMatch(output, {
    question,
    products: new Set(batch.inventory.map((p) => p.product)),
    classIds: new Set(frame.classes.map((c) => c.id)),
    mediaIds: new Set(prepared.map((p) => p.mediaId)),
  })

  const generationId = recordGeneration({
    db,
    propertyId: job.property_id,
    visitId: job.visit_id,
    importId,
    actorId: job.actor_id,
    task: question,
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
      // The scaffold, recorded verbatim: *why did this room read differently*
      // is only answerable if the list it was handed is on the row.
      inventory: batch.inventory,
      scaffolded: batch.inventory.length > 0,
      context,
      detail,
      images: prepared.map((p) => ({ mediaId: p.mediaId, prepared: imageNote(p.image) })),
      imageEdge: { sent: edge, modelLimit: model.maxImageEdge, imageCount: prepared.length },
      classFrameVersion: projection.frameVersion,
      classCount: projection.classCount,
    },
    output: stored,
    abstained: stored.located.length === 0 && stored.additional.length === 0,
    inputTokens,
    outputTokens,
  })

  const resolutionOf = new Map(
    (
      db
        .prepare(
          `SELECT p.product, p.id FROM product_resolutions p WHERE p.import_id = ? AND p.resolved = 1`,
        )
        .all(importId) as { product: string; id: string }[]
    ).map((r) => [r.product, r.id]),
  )

  const written = writeMatched(db, {
    propertyId: job.property_id,
    importId,
    zoneId: batch.zoneId,
    actorId: job.actor_id,
    stored,
    resolutionOf,
    generationId,
  })

  completeJob(db, job.id, generationId)
  return {
    ...stored,
    plateObjectIds: written.plate,
    appearanceObjectIds: written.appearance,
    generationId,
  }
}
