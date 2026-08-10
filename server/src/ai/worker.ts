/**
 * Draining the queue.
 *
 * Spec §4: "a job table in SQLite, drained by a worker while the server runs."
 * The queue module owns the bookkeeping and the task modules own the model
 * calls; this file is the loop between them, and it is deliberately the only
 * place that decides when to STOP.
 *
 * Four reasons to stop, and each is a sentence rather than a status code,
 * because every one of them is something a person has to be told. A drain that
 * ran nothing and returned silently is indistinguishable from a drain that
 * finished the work — doctrine 6 again, one layer up from the data.
 *
 * NOTHING IN THE PASS BLOCKS ON THIS. §0.4: the pass is fully usable with no API
 * key, no network, or a failed job. So the loop is started and left to run, the
 * screen reads progress from the job rows, and no request waits for a model.
 */

import { anthropic, ModelCallFailed } from './client.js'
import { modelFor } from './models.js'
import { loadPrompts } from './prompts.js'
import { claimNext, failJob, MAX_ATTEMPTS, recordGeneration, visitSpend, type AiJob } from './queue.js'
import { runnerFor, UnknownTask, type AssistDeps } from './tasks/index.js'
import type { Db } from '../db/index.js'
import { findMedia, originalPath } from '../pass/thumbs.js'

/** Why the loop stopped. Every value carries a sentence with it. */
export type DrainStop = 'empty' | 'cap' | 'no-model' | 'no-key' | 'limit'

export interface DrainResult {
  ran: number
  failed: number
  stopped: DrainStop
  /** Plain words, for the screen. A code alone tells a concierge nothing. */
  reason: string
}

export interface DrainOptions {
  /** A ceiling on one drain, so a synchronous call cannot run for an hour. */
  limit?: number
  /** Injected whole in tests, so the loop is exercised without a network. */
  deps?: AssistDeps
}

/**
 * Where a media file is, for a task that needs to send it to a model.
 *
 * Deliberately not `resolveOriginal`: that returns a rich result for a screen —
 * quarantined, absent, the message to show — and the tasks want a path or a
 * throw. A quarantined file must never reach a model regardless, so failing here
 * is the right shape.
 */
export const mediaPath = (db: Db, visitId: string, mediaId: string): string => {
  const m = findMedia(db, visitId, mediaId)
  if (!m) throw new Error('That file is not in this visit.')
  if (m.file_status !== 'present') throw new Error(`The file is ${m.file_status}, so there is nothing to read.`)
  return originalPath(m)
}

/** The real dependencies. Built once per drain, not once per job. */
export const liveDeps = (): AssistDeps => ({
  prompts: loadPrompts(),
  model: modelFor('fast'),
  resolvePath: mediaPath,
})

const NO_MODEL =
  'No model is configured on this machine, so the assists are waiting rather than running. ' +
  'Everything else on this screen works exactly as it does with them.'

const NO_KEY =
  'There is no API key on this machine, so the assists are waiting rather than running. ' +
  'They pick up where they left off when one is set — nothing queued is lost.'

/**
 * Why the assists cannot run, in words, or null when they can.
 *
 * The same sentence the drain would return, available to the screen before
 * anybody presses anything. §0.4 makes "no key" an ordinary state rather than an
 * error, and an ordinary state has to be sayable — a run button that does
 * nothing and explains nothing is the worst version of this.
 */
export const assistsBlocked = (): string | null => {
  if (!modelFor('fast')) return NO_MODEL
  if (!anthropic()) return NO_KEY
  return null
}

/**
 * Run queued work for one visit until there is a reason to stop.
 *
 * Serial on purpose. Parallelism here would buy a few minutes on a baseline
 * visit and cost the one property that makes the spend cap a limit rather than
 * a report: the cap is checked before each call, and that check is only true if
 * nothing else is in flight spending against it.
 */
export async function drainVisit(db: Db, visitId: string, options: DrainOptions = {}): Promise<DrainResult> {
  const limit = options.limit ?? 500
  const deps = options.deps ?? liveDeps()

  // Both checked before a single row is claimed. Claiming first would leave
  // jobs `running` with a live lease for five minutes over a condition that was
  // knowable up front, and the screen would report work in flight that is not.
  const blocked = options.deps ? (deps.model ? null : NO_MODEL) : assistsBlocked()
  if (blocked) {
    return { ran: 0, failed: 0, stopped: blocked === NO_MODEL ? 'no-model' : 'no-key', reason: blocked }
  }

  let ran = 0
  let failed = 0

  while (ran < limit) {
    // At the tier actually running. Checking a strong-tier drain against the
    // fast tier's rates is a cap that lets through several times what it says.
    const spend = visitSpend(db, visitId, deps.model?.tier ?? 'fast')
    if (spend.capReached) {
      return {
        ran, failed, stopped: 'cap',
        reason:
          `This visit has reached its ceiling of $${spend.cap.toFixed(2)}. The rest of the work is still ` +
          `queued and nothing has been thrown away — raise the ceiling to carry on.`,
      }
    }

    const job = claimNext(db, visitId)
    if (!job) {
      return { ran, failed, stopped: 'empty', reason: describeEmpty(ran, failed) }
    }

    if (await runOne(db, job, deps)) ran++
    else failed++
  }

  return {
    ran, failed, stopped: 'limit',
    reason: `Stopped after ${limit} jobs in one go. Whatever is left is still queued — run it again.`,
  }
}

const describeEmpty = (ran: number, failed: number): string =>
  ran === 0 && failed === 0
    ? 'There was nothing queued to run.'
    : `Finished: ${ran} ran${failed > 0 ? `, ${failed} could not` : ''}.`

/**
 * One job. True if it ran, false if it failed.
 *
 * A runner that skips (a photo already attached, a pin since typed) counts as
 * ran: it decided, wrote its reason on the row, and that is the feature working.
 * Only a throw is a failure.
 *
 * ONE JOB FAILING NEVER TAKES THE REST. §10. A single unreadable file in a
 * 600-photo visit is a normal Tuesday and the other 599 still have work owed.
 */
async function runOne(db: Db, job: AiJob, deps: AssistDeps): Promise<boolean> {
  try {
    await runnerFor(job.task)(db, job, deps)
    return true
  } catch (e) {
    abandonOrRetry(db, job, e)
    return false
  }
}

/**
 * Decide whether a failure is worth trying again.
 *
 * Retrying a request the API already rejected as malformed is not resilience, it
 * is spending the cap three times to get the same answer. `ModelCallFailed`
 * carries that judgement from the one place that can make it — the call site
 * that saw the status code — and an unknown task is a bug in this repo, which
 * never becomes true on the second attempt either.
 */
function abandonOrRetry(db: Db, job: AiJob, e: unknown): void {
  const message = e instanceof Error ? e.message : String(e)
  const permanent = (e instanceof ModelCallFailed && !e.retryable) || e instanceof UnknownTask

  /**
   * **A call that reached the model has been paid for whether or not it worked.**
   *
   * Nothing wrote a row for a failure, so on 2026-08-09 nine truncated calls —
   * nine full image payloads — cost roughly $1.30 that `visitSpend` could not
   * see. It reported **$0.17 against a $2.00 cap while about $1.50 had gone**,
   * and the cap therefore sat blind through the one situation it exists for:
   * **a run failing repeatedly is exactly when spend runs away.**
   *
   * `spend` is absent on a transport failure, which never reached the model. A
   * zero row there would be the same dishonesty pointing the other way.
   */
  if (e instanceof ModelCallFailed && e.spend) {
    recordGeneration({
      db,
      propertyId: job.property_id,
      visitId: job.visit_id,
      task: job.task,
      targetKind: job.target_kind,
      targetId: job.target_id,
      actorId: job.actor_id,
      model: e.spend.model,
      tier: e.spend.tier,
      promptId: e.spend.promptId,
      promptVersion: e.spend.promptVersion,
      promptHash: e.spend.promptHash,
      inputRefs: { attempt: job.attempts },
      // The failure IS the output. A row whose output looks like an answer would
      // be worse than no row — this one is legible as a cost with no result.
      output: { failed: true, code: e.code, message: e.message },
      // Not an abstention. Abstaining is the model declining to guess, which is
      // a success; this is a call that produced nothing usable.
      abstained: false,
      inputTokens: e.spend.inputTokens,
      outputTokens: e.spend.outputTokens,
    })
  }

  if (permanent) {
    // Burn the remaining attempts so the shared failure path records it,
    // rather than a second way of writing `failed` that could drift from it.
    db.prepare('UPDATE ai_jobs SET attempts = ? WHERE id = ?').run(MAX_ATTEMPTS, job.id)
  }
  failJob(db, job.id, message)
}

// ------------------------------------------------------------------ scheduling

/**
 * One drain per visit at a time, in this process.
 *
 * The lease already makes concurrent drains SAFE — two workers cannot claim the
 * same row. This makes them pointless rather than harmful: a concierge pressing
 * "run the assists" twice would otherwise start a second loop racing the first
 * for the same queue, doubling the calls in flight against a cap that is only a
 * limit while the checks are serial.
 */
const running = new Map<string, Promise<DrainResult>>()

export const drainInFlight = (visitId: string): boolean => running.has(visitId)

/**
 * Start a drain and return immediately.
 *
 * The caller gets the promise if it wants it and the HTTP route deliberately
 * does not: §0.4 means no request may wait on a model call, and the screen finds
 * out what happened by reading the job rows, which is the same thing it does
 * after a restart.
 */
export function startDrain(db: Db, visitId: string, options: DrainOptions = {}): Promise<DrainResult> {
  const existing = running.get(visitId)
  if (existing) return existing

  const run = drainVisit(db, visitId, options)
    .catch((e: unknown): DrainResult => ({
      ran: 0, failed: 0, stopped: 'empty',
      reason: `The assist run stopped early: ${e instanceof Error ? e.message : String(e)}`,
    }))
    .finally(() => running.delete(visitId))

  running.set(visitId, run)
  return run
}
