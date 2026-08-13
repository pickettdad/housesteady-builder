/**
 * The job queue.
 *
 * Spec §4. Jobs are rows, not memory, which is what makes "survives a restart
 * mid-run" true rather than aspirational: the worker dies, the row stays
 * `running` with a stale lease, and the next worker reclaims it.
 *
 * Nothing here calls a model. This file is only the bookkeeping — what is owed,
 * what is in flight, what failed and why, and when the spending stops. Keeping
 * the model call out means the whole queue is testable without a network, which
 * matters because the failure modes worth testing (crash mid-run, cap reached,
 * one job failing without taking the others) are all bookkeeping failures.
 */

import { newId, now, type Db } from '../db/index.js'
import { estimateCost, modelFor, type Tier } from './models.js'

/** How long a claimed job may sit before another worker may take it. */
export const LEASE_MS = 5 * 60 * 1000

/** Give up after this many attempts. */
export const MAX_ATTEMPTS = 3

/** Backoff between attempts: 30s, then 2m, then 8m. */
export const backoffMs = (attempt: number): number => 30_000 * 4 ** (attempt - 1)

export interface AiJob {
  id: string
  property_id: string
  visit_id: string
  task: string
  target_kind: string
  target_id: string
  status: string
  attempts: number
  last_error: string | null
  run_after: string | null
  leased_at: string | null
  generation_id: string | null
  created_at: string
  updated_at: string
  /** Who triggered this run. Every generation it produces inherits it. */
  actor_id: string
}

export interface EnqueueArgs {
  db: Db
  propertyId: string
  visitId: string
  task: string
  targetKind: string
  targetId: string
  /**
   * Who TRIGGERED the run — never the model.
   *
   * The model is already recorded in its own column on the generation, and
   * conflating the two would make an AI proposal read as a human act. Doctrine
   * 5 is that AI drafts and a human writes; this column is part of how that
   * stays legible in the record.
   */
  actorId: string
}

/**
 * Add a job, or leave the existing one alone.
 *
 * Idempotent because §4 says the queue is re-triggerable by hand. A concierge
 * pressing "run the assists again" must not pay for every photo a second time,
 * so re-queueing an already-done job is a no-op and only genuinely failed work
 * comes back. `requeueFailed` is the deliberate opt-in for that.
 */
export function enqueue(args: EnqueueArgs): AiJob {
  const { db, propertyId, visitId, task, targetKind, targetId, actorId } = args
  const at = now()
  db.prepare(
    `INSERT INTO ai_jobs (id, property_id, visit_id, task, target_kind, target_id,
                          status, attempts, run_after, actor_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, NULL, ?, ?, ?)
     ON CONFLICT (visit_id, task, target_kind, target_id) DO NOTHING`,
  ).run(newId(), propertyId, visitId, task, targetKind, targetId, actorId, at, at)

  return db
    .prepare('SELECT * FROM ai_jobs WHERE visit_id = ? AND task = ? AND target_kind = ? AND target_id = ?')
    .get(visitId, task, targetKind, targetId) as AiJob
}

/**
 * Put one finished job back in the queue, so it runs again.
 *
 * **Separate from `requeueFailed`, and deliberately narrower.** That one exists
 * for work that broke; this one exists for work that succeeded and is being
 * asked a second time — a comparison run. Different intention, different name,
 * and neither can be reached by accident from the other.
 *
 * **The job row is reused rather than replaced**, so its history stays one row.
 * The second run writes a second `ai_generations` row, and that pair — same
 * target, two models — is the comparison.
 */
export function requeueBatch(db: Db, visitId: string, task: string, targetId: string): boolean {
  const r = db
    .prepare(
      `UPDATE ai_jobs SET status = 'queued', attempts = 0, run_after = NULL, last_error = NULL,
                          leased_at = NULL, updated_at = ?
        WHERE visit_id = ? AND task = ? AND target_id = ? AND status IN ('done', 'skipped', 'failed')`,
    )
    .run(now(), visitId, task, targetId)
  return r.changes > 0
}

/** Put failed jobs back in the queue. The hand-retrigger from the UI. */
export function requeueFailed(db: Db, visitId: string): number {
  const r = db
    .prepare(
      `UPDATE ai_jobs SET status = 'queued', attempts = 0, run_after = NULL, last_error = NULL,
                          leased_at = NULL, updated_at = ?
        WHERE visit_id = ? AND status = 'failed'`,
    )
    .run(now(), visitId)
  return r.changes
}

/**
 * Take the next runnable job for a visit, or nothing.
 *
 * "Runnable" is queued and past its backoff, OR running with an expired lease —
 * the second case is the crash recovery, and it is the same query rather than a
 * separate sweep so there is no window in which an orphan is invisible.
 *
 * The whole claim is one transaction: two workers cannot take the same row.
 */
/**
 * Claim the next runnable job for a visit.
 *
 * ⚑ **`task` narrows it, and a caller draining ONE job almost always wants it.**
 * Ordering is by `created_at, id` and says nothing about task, so a caller that
 * queues phase A, drains one, then queues phase B and drains one **gets A's
 * leftover, not B's first.** *That is not hypothetical:* `smoke.ts` did exactly
 * this and reported "pass 1 recorded no generation" for a pass 1 that had never
 * been asked to run — a false negative that cost a runner session a diagnosis
 * mid-run on 2026-08-13.
 *
 * Omitted, the behaviour is unchanged: any task, oldest first.
 */
export function claimNext(
  db: Db,
  visitId: string,
  leaseMs = LEASE_MS,
  atMs = Date.now(),
  task?: string,
): AiJob | undefined {
  const at = new Date(atMs).toISOString()
  const staleBefore = new Date(atMs - leaseMs).toISOString()

  return db.transaction(() => {
    const job = db
      .prepare(
        `SELECT * FROM ai_jobs
          WHERE visit_id = ?
            AND ( (status = 'queued' AND (run_after IS NULL OR run_after <= ?))
               OR (status = 'running' AND leased_at IS NOT NULL AND leased_at <= ?) )
            ${task ? 'AND task = ?' : ''}
          ORDER BY created_at, id
          LIMIT 1`,
      )
      .get(...(task ? [visitId, at, staleBefore, task] : [visitId, at, staleBefore])) as AiJob | undefined
    if (!job) return undefined

    db.prepare(
      `UPDATE ai_jobs SET status = 'running', leased_at = ?, attempts = attempts + 1, updated_at = ?
        WHERE id = ?`,
    ).run(at, at, job.id)

    return db.prepare('SELECT * FROM ai_jobs WHERE id = ?').get(job.id) as AiJob
  })()
}

export function completeJob(db: Db, jobId: string, generationId: string | null): void {
  db.prepare(
    `UPDATE ai_jobs SET status = 'done', generation_id = ?, leased_at = NULL, last_error = NULL, updated_at = ?
      WHERE id = ?`,
  ).run(generationId, now(), jobId)
}

/**
 * A job that was correctly not run.
 *
 * §11 requires that the non-nameplate is "not extracted at all". A row saying
 * so is how that becomes provable — an absent job and a job that decided not to
 * run look identical from the outside, and only one of them is the feature
 * working. Silence is never the record here; doctrine 6, nothing drops quietly.
 */
export function skipJob(db: Db, jobId: string, reason: string): void {
  db.prepare(
    `UPDATE ai_jobs SET status = 'skipped', leased_at = NULL, last_error = ?, updated_at = ? WHERE id = ?`,
  ).run(reason, now(), jobId)
}

/**
 * Record a failure and decide whether to try again.
 *
 * One job failing must not take the rest with it — a single unreadable file in
 * a 600-photo visit is a normal Tuesday, and the other 599 still have work
 * owed. So a failure marks its own row and nothing else.
 */
export function failJob(db: Db, jobId: string, error: string): 'retrying' | 'failed' {
  const job = db.prepare('SELECT attempts FROM ai_jobs WHERE id = ?').get(jobId) as
    | { attempts: number }
    | undefined
  if (!job) return 'failed'

  if (job.attempts >= MAX_ATTEMPTS) {
    db.prepare(
      `UPDATE ai_jobs SET status = 'failed', last_error = ?, leased_at = NULL, updated_at = ? WHERE id = ?`,
    ).run(error, now(), jobId)
    return 'failed'
  }

  const runAfter = new Date(Date.now() + backoffMs(job.attempts)).toISOString()
  db.prepare(
    `UPDATE ai_jobs SET status = 'queued', last_error = ?, run_after = ?, leased_at = NULL, updated_at = ?
      WHERE id = ?`,
  ).run(error, runAfter, now(), jobId)
  return 'retrying'
}

// ------------------------------------------------------------------- spending

/** Default ceiling per visit, in dollars. Overridable per install. */
export const spendCapDollars = (): number => {
  const raw = process.env.HOUSESTEADY_VISIT_SPEND_CAP
  const n = raw === undefined || raw === '' ? 5 : Number(raw)
  if (!Number.isFinite(n) || n < 0) throw new Error('HOUSESTEADY_VISIT_SPEND_CAP must be a non-negative number.')
  return n
}

export interface Spend {
  inputTokens: number
  outputTokens: number
  dollars: number
  generations: number
  cap: number
  capReached: boolean
  /**
   * False when no rates are configured. The screen must then say the cost is
   * unknown rather than print a confident $0.00 — an unmeasured cost and a zero
   * cost are different facts and merging them is the kind of quiet dishonesty
   * this codebase exists to avoid.
   */
  ratesKnown: boolean
}

/**
 * What this visit has spent so far.
 *
 * Summed from `ai_generations`, which is the row every call already writes.
 * A separate ledger would be a second place for the number to be wrong, and
 * reconciling two sources of truth about money is a job nobody wants.
 */
export function visitSpend(db: Db, visitId: string, tier: Tier = 'fast'): Spend {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(input_tokens), 0)  AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COALESCE(SUM(cost_estimate), 0) AS dollars,
              COUNT(*)                        AS generations
         FROM ai_generations WHERE visit_id = ?`,
    )
    .get(visitId) as { input_tokens: number; output_tokens: number; dollars: number; generations: number }

  const model = modelFor(tier)
  const cap = spendCapDollars()
  return {
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    dollars: row.dollars,
    generations: row.generations,
    cap,
    capReached: row.dollars >= cap,
    ratesKnown: Boolean(model && (model.inputPerMTok > 0 || model.outputPerMTok > 0)),
  }
}

/**
 * Would this call take the visit over its ceiling?
 *
 * §4: capped, and it "stops the worker and says so rather than quietly burning
 * credits". The check is before the call, not after — a cap noticed afterwards
 * has already been exceeded, which makes it a report rather than a limit.
 */
export function wouldExceedCap(db: Db, visitId: string, tier: Tier = 'fast'): boolean {
  return visitSpend(db, visitId, tier).capReached
}

export interface QueueProgress {
  queued: number
  running: number
  done: number
  failed: number
  skipped: number
  /** Failed jobs with the file they were about, so a failure is chaseable. */
  failures: { task: string; targetKind: string; targetId: string; error: string | null }[]
  /**
   * Why work was correctly not done, grouped and counted.
   *
   * Doctrine 6, and it is not a nicety. On the reference export 32 of 34 jobs
   * skip — 28 photographs are not on this machine, three are not nameplates,
   * one pin had nothing captured to read. A screen that says "32 needed
   * nothing" and stops has dropped 32 reasons, and the difference between
   * "there was nothing to do" and "the media never arrived" is the whole
   * difference between a working import and a broken one.
   */
  skips: { task: string; reason: string; n: number }[]
}

/** Queued / running / done / failed, with failures and skips both explained. */
export function queueProgress(db: Db, visitId: string): QueueProgress {
  const counts = db
    .prepare('SELECT status, COUNT(*) AS n FROM ai_jobs WHERE visit_id = ? GROUP BY status')
    .all(visitId) as { status: string; n: number }[]

  const by = (s: string): number => counts.find((c) => c.status === s)?.n ?? 0

  const failures = (
    db
      .prepare(
        `SELECT task, target_kind, target_id, last_error FROM ai_jobs
          WHERE visit_id = ? AND status = 'failed' ORDER BY updated_at`,
      )
      .all(visitId) as { task: string; target_kind: string; target_id: string; last_error: string | null }[]
  ).map((f) => ({ task: f.task, targetKind: f.target_kind, targetId: f.target_id, error: f.last_error }))

  // Grouped rather than listed one by one: twenty-eight rows all saying the
  // same sentence is noise, and "28 × the photograph is not on this machine" is
  // the fact somebody needs.
  const skips = (
    db
      .prepare(
        `SELECT task, last_error AS reason, COUNT(*) AS n FROM ai_jobs
          WHERE visit_id = ? AND status = 'skipped'
          GROUP BY task, last_error ORDER BY n DESC`,
      )
      .all(visitId) as { task: string; reason: string | null; n: number }[]
  ).map((s) => ({ task: s.task, reason: s.reason ?? 'no reason recorded', n: s.n }))

  return {
    queued: by('queued'), running: by('running'), done: by('done'),
    failed: by('failed'), skipped: by('skipped'), failures, skips,
  }
}

/**
 * Write the provenance row for a model call.
 *
 * Every generation records model, prompt id, prompt version and prompt hash —
 * §3 — so "why does this binder read differently" is answerable from the data
 * rather than from memory. `abstained` is an ordinary outcome here, never an
 * error: a blank gets chased, a wrong serial gets believed.
 */
export interface RecordGenerationArgs {
  db: Db
  propertyId: string
  visitId: string
  importId?: string | null
  task: string
  targetKind: string
  targetId: string
  model: string
  promptId: string
  promptVersion: string
  promptHash: string
  inputRefs: unknown
  output: unknown
  abstained: boolean
  confidence?: number | null
  inputTokens: number
  outputTokens: number
  tier?: Tier
  /** Who triggered the run. A human, never the model — see EnqueueArgs. */
  actorId: string
}

export function recordGeneration(args: RecordGenerationArgs): string {
  const id = newId()
  const model = modelFor(args.tier ?? 'fast')
  const cost = model ? estimateCost(model, args.inputTokens, args.outputTokens) : 0

  args.db
    .prepare(
      `INSERT INTO ai_generations
         (id, property_id, visit_id, import_id, task, target_kind, target_id, model,
          prompt_id, prompt_version, prompt_hash, input_refs, output, abstained, confidence,
          input_tokens, output_tokens, cost_estimate, human_decision, actor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .run(
      id, args.propertyId, args.visitId, args.importId ?? null, args.task, args.targetKind, args.targetId,
      args.model, args.promptId, args.promptVersion, args.promptHash,
      JSON.stringify(args.inputRefs ?? null), JSON.stringify(args.output ?? null),
      args.abstained ? 1 : 0, args.confidence ?? null,
      args.inputTokens, args.outputTokens, cost, args.actorId, now(),
    )
  return id
}
