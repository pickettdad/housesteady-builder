/**
 * Pass 2 · Resolve — what product is that model number.
 *
 * Amendment 11 §C, **the keystone.** Seven of the eight confident wrong classes
 * measured on one real room die here, in a call that carries no images.
 *
 * ---
 *
 * ## Text only, and that is the whole cost argument
 *
 * `images: []`. A room of plates costs a few thousand input tokens instead of a
 * hundred thousand, which is why this pass can run over every string in a house
 * without a budget conversation — and why #122 keeps the product-image
 * comparison in pass 3, where the room photographs are already in context.
 *
 * ## ⚑ It has no search, and the honesty label is built around that
 *
 * Amendment 11 declares `Documented` for a manufacturer's own documentation.
 * **This build cannot reach one.** A model recognising `600545B` is recalling
 * training data, which is exactly what §A blames for the reverse-osmosis error —
 * *reading `PP20B-20` recalls training data rather than checking.*
 *
 * **So why build it anyway?** Because the failure §A describes is a *vision*
 * call guessing a class from a photograph, and this is a text call asked one
 * bounded question with abstention made easy. Those are different acts with
 * different reliabilities, and the second is the one the amendment ordered.
 *
 * **What is not done is overclaim about it.** There is no `source_url` column,
 * `Documented` is not a value the schema offers, and every row says `Inferred`.
 * *A resolution that cannot state its source does not ship* — enforced by having
 * nowhere to state one.
 *
 * ## One call, many queries
 *
 * Batched because it is text: the mechanical room's twenty-two labels are one
 * call. Split only at `MAX_QUERIES_PER_CALL`, which exists for the output
 * ceiling and nothing else.
 */

import { randomUUID } from 'node:crypto'
import { now, type Db } from '../../db/index.js'
import { buildQueries, shippable, type LookupQuery, type ProductKind, type Resolution } from '../../engine/lookup.js'
import { requireModel, type ModelConfig } from '../models.js'
import { currentPrompt } from '../prompts.js'
import { runVisionTask } from '../client.js'
import { completeJob, enqueue, recordGeneration, requeueBatch, skipJob, type AiJob } from '../queue.js'
import type { AssistDeps } from './index.js'
import { claimsForImport } from './readSurfaces.js'
import { latestImport } from './identify.js'

export const RESOLVE_TASK = 'resolve_product'
export const RESOLVE_TARGET_KIND = 'query-batch'

export const resolveTargetId = (index: number): string => `queries#${index}`

/**
 * Queries per call.
 *
 * **Sized against the answer, not the question.** A query is a few dozen tokens
 * and a resolution is maybe eighty, so twenty-four answers is ~2,000 output
 * tokens against a 4,096 floor — comfortable, and a whole mechanical room in
 * one call. It exists so a house with two hundred labels cannot truncate.
 */
export const MAX_QUERIES_PER_CALL = 24

export const RESOLVE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['resolutions'],
  properties: {
    resolutions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['readingId', 'resolved', 'product', 'kind', 'recognisedFrom'],
        properties: {
          readingId: { type: 'string' },
          resolved: { type: 'boolean' },
          product: { type: 'string' },
          kind: { type: 'string', enum: ['equipment', 'consumable', 'part', 'material', 'unknown'] },
          recognisedFrom: { type: 'string' },
          // ⚑ There is no `source` field and there must not be one until search
          // exists. A model asked where it read something will invent a URL.
        },
      },
    },
  },
}

interface RawResolution {
  readingId: string
  resolved: boolean
  product: string
  kind: string
  recognisedFrom: string
}

export interface ResolveOutput {
  resolutions: RawResolution[]
}

export interface StoredResolve {
  resolutions: Resolution[]
  /** Answers naming a label this call did not ask about. Kept as a report. */
  strayAnswers: string[]
  /** Queries the model never answered. A hole, not a "no". */
  unanswered: string[]
  /** Answers claiming success with nothing behind them. Demoted, and counted. */
  demoted: string[]
}

// ---------------------------------------------------------------- the queueing

export interface QueuedResolve {
  jobs: number
  queries: number
  skipped: number
  note: string
}

/**
 * Plan and queue pass 2 for one visit.
 *
 * **Queries with `specificity: 'none'` are not sent and are counted.** A label
 * whose text identifies no product is a capture finding — there is a plate here
 * and nothing on it names a thing — and paying to ask about it would buy a
 * guaranteed `unresolved`.
 */
export function queueResolution(
  db: Db,
  propertyId: string,
  visitId: string,
  actorId: string,
  again = false,
): QueuedResolve {
  const importId = latestImport(db, visitId)
  if (!importId) return { jobs: 0, queries: 0, skipped: 0, note: `No import for visit ${visitId}.` }

  const plan = planResolution(db, importId)
  for (let i = 0; i < plan.batches.length; i++) {
    if (again) requeueBatch(db, visitId, resolveTargetId(i + 1))
    enqueue({
      db, propertyId, visitId,
      task: RESOLVE_TASK,
      targetKind: RESOLVE_TARGET_KIND,
      targetId: resolveTargetId(i + 1),
      actorId,
    })
  }
  return { jobs: plan.batches.length, queries: plan.asked, skipped: plan.skipped.length, note: plan.note }
}

export interface ResolvePlan {
  batches: LookupQuery[][]
  asked: number
  skipped: LookupQuery[]
  note: string
}

/** Which labels get asked about, and in what batches. Pure given the database. */
export function planResolution(db: Db, importId: string, maxPerCall = MAX_QUERIES_PER_CALL): ResolvePlan {
  const all = buildQueries(claimsForImport(db, importId))
  const askable = all.filter((q) => q.specificity !== 'none')
  const skipped = all.filter((q) => q.specificity === 'none')

  const batches: LookupQuery[][] = []
  for (let i = 0; i < askable.length; i += maxPerCall) batches.push(askable.slice(i, i + maxPerCall))

  const bySpec = new Map<string, number>()
  for (const q of askable) bySpec.set(q.specificity, (bySpec.get(q.specificity) ?? 0) + 1)

  return {
    batches,
    asked: askable.length,
    skipped,
    note:
      all.length === 0
        ? 'No labels are stored for this import. Pass 1 has not run against it.'
        : `${askable.length} of ${all.length} labels carry text that identifies a product — ` +
          `${[...bySpec].map(([k, n]) => `${n} to a ${k}`).join(', ')}. ` +
          (skipped.length > 0
            ? `${skipped.length} carry a label with nothing on it that names a thing, which is a capture finding rather than a lookup.`
            : 'Every label has something to resolve.'),
  }
}

// ------------------------------------------------------------- the facts block

/** The questions. Wording lives in the prompt file; these do not. */
export function resolutionFacts(queries: readonly LookupQuery[]): string {
  const lines = [`${queries.length} queries. Answer every one, using the id exactly as given.`, '']
  for (const q of queries) {
    lines.push(`id: ${q.readingId}`)
    lines.push(`  specificity: ${q.specificity} — ${q.why}`)
    lines.push(`  read from a ${q.surface}: ${q.text}`)
    for (const f of q.from) lines.push(`    ${f.field}: ${f.value}`)
    lines.push('')
  }
  lines.push('Every id above must appear exactly once in your answer. `resolved: false` is a complete answer.')
  return lines.join('\n')
}

// ------------------------------------------------------------------ normalising

/** Turn one answer into storable rows. **Nothing is discarded.** */
export function normaliseResolve(output: ResolveOutput, asked: readonly LookupQuery[]): StoredResolve {
  const wanted = new Map(asked.map((q) => [q.readingId, q]))
  const resolutions: Resolution[] = []
  const strayAnswers: string[] = []
  const demoted: string[] = []
  const seen = new Set<string>()

  for (const raw of output.resolutions ?? []) {
    const readingId = typeof raw.readingId === 'string' ? raw.readingId.trim() : ''
    const q = wanted.get(readingId)
    if (!q) { strayAnswers.push(readingId); continue }
    seen.add(readingId)

    const kind = (['equipment', 'consumable', 'part', 'material', 'unknown'] as const).includes(raw.kind as ProductKind)
      ? (raw.kind as ProductKind)
      : 'unknown'

    const r: Resolution = {
      readingId,
      product: typeof raw.product === 'string' ? raw.product.trim() : '',
      kind,
      recognisedFrom: typeof raw.recognisedFrom === 'string' ? raw.recognisedFrom.trim() : '',
      resolved: raw.resolved === true,
      specificity: q.specificity,
    }

    // ⚑ A resolved answer with nothing behind it is demoted rather than stored.
    // *If it cannot say how it knows, it does not know* — and the storage layer
    // refuses the row anyway, so catching it here is what turns a crash into a
    // counted outcome.
    if (!shippable(r)) {
      demoted.push(readingId)
      resolutions.push({ ...r, resolved: false, product: '', kind: 'unknown' })
      continue
    }
    resolutions.push(r)
  }

  return {
    resolutions,
    strayAnswers,
    // Never answered at all. **Different from `resolved: false`** — one is the
    // model declining and the other is nobody saying anything.
    unanswered: asked.filter((q) => !seen.has(q.readingId)).map((q) => q.readingId),
    demoted,
  }
}

// -------------------------------------------------------------------- storage

export function writeResolutions(
  db: Db,
  args: {
    propertyId: string
    importId: string | null
    actorId: string
    queries: readonly LookupQuery[]
    resolutions: readonly Resolution[]
    generationId?: string | null
  },
): string[] {
  const at = now()
  const queryText = new Map(args.queries.map((q) => [q.readingId, q.text]))
  const insert = db.prepare(
    `INSERT INTO product_resolutions
       (id, property_id, import_id, reading_id, query, specificity, resolved, product, kind,
        recognised_from, honesty, generation_id, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Inferred', ?, ?, ?)`,
  )
  const ids: string[] = []
  const write = db.transaction(() => {
    for (const r of args.resolutions) {
      const id = randomUUID()
      insert.run(
        id, args.propertyId, args.importId, r.readingId, queryText.get(r.readingId) ?? '',
        r.specificity, r.resolved ? 1 : 0, r.product, r.kind, r.recognisedFrom,
        args.generationId ?? null, args.actorId, at,
      )
      ids.push(id)
    }
  })
  write()
  return ids
}

/** The known inventory — passes 1 and 2's joint output, which pass 3 consumes. */
export function knownInventory(db: Db, importId: string): {
  product: string
  kind: string
  specificity: string
  mediaId: string
  readingId: string
}[] {
  return db
    .prepare(
      `SELECT p.product, p.kind, p.specificity, p.reading_id AS readingId, r.media_id AS mediaId
         FROM product_resolutions p JOIN readings r ON r.id = p.reading_id
        WHERE p.import_id = ? AND p.resolved = 1
        ORDER BY r.created_at, r.position`,
    )
    .all(importId) as { product: string; kind: string; specificity: string; mediaId: string; readingId: string }[]
}

// ---------------------------------------------------------------------- the run

export interface ResolveResult extends StoredResolve {
  rowIds: string[]
  generationId: string
}

/** Resolve one batch of queries. Returns null when correctly skipped. */
export async function runResolveProduct(db: Db, job: AiJob, deps: AssistDeps): Promise<ResolveResult | null> {
  const importId = latestImport(db, job.visit_id)
  if (!importId) {
    skipJob(db, job.id, 'this visit has no import, so there is nothing to resolve')
    return null
  }

  const plan = planResolution(db, importId)
  const index = plan.batches.findIndex((_, i) => resolveTargetId(i + 1) === job.target_id)
  const queries = index === -1 ? undefined : plan.batches[index]
  if (!queries || queries.length === 0) {
    skipJob(
      db, job.id,
      `no query batch \`${job.target_id}\` in this visit's current plan — pass 1's readings have changed since this job was queued`,
    )
    return null
  }

  const model = deps.model ?? requireModel('fast')
  const prompt = currentPrompt(deps.prompts, RESOLVE_TASK)

  const run = deps.run ?? runVisionTask
  const { output, inputTokens, outputTokens } = await run<ResolveOutput>({
    model,
    prompt,
    facts: resolutionFacts(queries),
    schema: RESOLVE_SCHEMA,
    maxTokens: resolveMaxTokens(model),
    // ⚑ TEXT ONLY. The pass's whole cost argument is this empty array.
    images: [],
  })

  const stored = normaliseResolve(output, queries)

  const generationId = recordGeneration({
    db,
    propertyId: job.property_id,
    visitId: job.visit_id,
    importId,
    actorId: job.actor_id,
    task: RESOLVE_TASK,
    targetKind: job.target_kind,
    targetId: job.target_id,
    model: model.id,
    tier: model.tier,
    promptId: prompt.id,
    promptVersion: prompt.version,
    promptHash: prompt.hash,
    inputRefs: {
      // Stated rather than inferred from a zero, the same way pass 1 states its
      // canvas count: this pass sends no images at all, by design.
      imagesSent: 0,
      queries: queries.map((q) => ({ readingId: q.readingId, specificity: q.specificity, text: q.text })),
      batch: { index: index + 1, of: plan.batches.length },
    },
    output: stored,
    // Nothing recognised in the whole batch. A complete answer for a wall of
    // unfamiliar part numbers, and a signal about the model if it repeats.
    abstained: stored.resolutions.every((r) => !r.resolved),
    inputTokens,
    outputTokens,
  })

  const rowIds = writeResolutions(db, {
    propertyId: job.property_id,
    importId,
    actorId: job.actor_id,
    queries,
    resolutions: stored.resolutions,
    generationId,
  })

  completeJob(db, job.id, generationId)
  return { ...stored, rowIds, generationId }
}

export const RESOLVE_MAX_TOKENS = 4096
export const resolveMaxTokens = (model: ModelConfig): number =>
  Math.max(RESOLVE_MAX_TOKENS, model.maxOutputTokens)
