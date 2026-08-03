/**
 * What a run sent, what came back, and what it cost — per zone.
 *
 * WHY THIS EXISTS AT ALL (Amendment 1, Builder Claude's second ruling).
 *
 * The first time the identification pass meets a photograph of a real water
 * heater is on the owner's machine, not in any container a test runs in. If that
 * run produces only an outcome, then when something looks wrong nobody can tell
 * whether it was the batching, the prompt, the parsing or the model. So the run
 * produces evidence: a document that travels back with the answer and says what
 * was actually done.
 *
 * Same shape as the active item set reporting `{received, computed}`. The record
 * is not a log written for developers — it is the run's own account of itself, in
 * a form a person can read and hand back.
 *
 * COST IS MEASURED, NEVER CALCULATED.
 *
 * `tokensIn` and `tokensOut` come from the API response's `usage`. Nothing in
 * this build multiplies photographs by a per-image token figure to produce a
 * number that looks measured and is not. On this walk that temptation is
 * unusually strong: all 157 photographs are 4032 on the long edge, so a per-image
 * constant would appear to give exact per-zone totals. It would still be a guess
 * wearing an exact number's clothes, which is worse than an honest absence.
 *
 * A zone that has not run has `usage: null`, and a zone that ran with rates
 * unconfigured has a usage with `costUsd: null`. Those are three different
 * states — not run, ran but cost unknown, ran and cost known — and merging any
 * two of them puts a false zero in a budget.
 */

import type { ZoneAssembly } from './assembly.js'
import { reconciles, unconsumedNote } from './assembly.js'
import { estimateCost, ratesKnown, type ModelConfig } from '../ai/models.js'

/** What one call actually cost, from the response rather than from arithmetic. */
export interface CallUsage {
  tokensIn: number
  tokensOut: number
  /**
   * Null when the model's rates are unconfigured. Not zero — `estimateCost`
   * returns 0 for unset rates and a screen printing $0.00 would be a lie about a
   * call that certainly cost something.
   */
  costUsd: number | null
}

/** One call's outcome. A refusal is an outcome, not an absence. */
export interface CallOutcome {
  batchIndex: number
  photographsSent: number
  /**
   * The dimensions actually transmitted, distinct from what was on disk.
   * `prepareImage` decides these; recording them is how a poor read gets
   * explained without guessing.
   */
  sentLongestEdge: number | null
  downscaled: boolean
  /** null when the call has not been made yet. */
  usage: CallUsage | null
  /**
   * What came back, in the run's own words. A refusal code, an abstention, or a
   * count of proposals — never the proposals themselves, which live in their own
   * table. This document is about the run, not its output.
   */
  returned: string
  /** Set when the call failed. Failure is reported, never swallowed. */
  failure: string | null
}

export interface ZoneRunRecord {
  zoneId: string
  zoneLabel: string | null
  /** Rows the zone had, before any partition. */
  received: number
  /** Distinct photographs to identify. Counted once however many batches. */
  sent: number
  /**
   * The room's wide shots, counted once. Sent into every batch, so a split zone
   * transmits them more than once — `contextSends` is that number, and the gap
   * between the two is the real cost of splitting.
   */
  context: number
  contextSends: number
  /** Files a kind rule excluded, with the sentence a person reads. */
  unconsumed: number
  unconsumedNote: string | null
  /** Photographs that could not be sent because the file was not usable. */
  unavailable: number
  /** Non-null when §3's whole-room claim does not hold for this zone. */
  splitNote: string | null
  thresholdInForce: boolean
  /**
   * False when the buckets do not add up to `received`. Always reported, never
   * only asserted in a test — a run that lost a row must say so on the run.
   */
  reconciled: boolean
  calls: CallOutcome[]
}

export interface RunRecord {
  importId: string
  /** The pinned model ID, so a changed model explains a changed result. */
  modelId: string | null
  maxImageEdge: number | null
  ratesConfigured: boolean
  zones: ZoneRunRecord[]
}

/**
 * The record for a zone whose calls have not been made.
 *
 * This is the state the whole assembly half can reach without a key, and it is
 * the thing a test asserts on. `calls` carries the batches with `usage: null` —
 * planned, not performed. A reader can tell exactly what would be sent.
 */
export function plannedRecord(a: ZoneAssembly): ZoneRunRecord {
  return {
    zoneId: a.zoneId,
    zoneLabel: a.zoneLabel,
    received: a.receivedCount,
    sent: a.subjectCount,
    context: a.context.length,
    contextSends: a.context.length * a.batches.length,
    unconsumed: a.unconsumed.length,
    unconsumedNote: unconsumedNote(a),
    unavailable: a.unavailable.length,
    splitNote: a.split?.note ?? null,
    thresholdInForce: a.thresholdInForce,
    reconciled: reconciles(a),
    calls: a.batches.map((b) => ({
      batchIndex: b.index,
      photographsSent: b.subjects.length + b.context.length,
      sentLongestEdge: null,
      downscaled: false,
      usage: null,
      returned: 'not yet run',
      failure: null,
    })),
  }
}

/**
 * Usage from a response, priced only where rates are known.
 *
 * Takes the token counts the API reported. There is no overload that accepts an
 * image count, deliberately — the absence of that door is what keeps an estimate
 * from entering the ledger through it.
 */
export function usageFrom(
  model: ModelConfig,
  tokensIn: number,
  tokensOut: number,
): CallUsage {
  return {
    tokensIn,
    tokensOut,
    costUsd: ratesKnown(model) ? estimateCost(model, tokensIn, tokensOut) : null,
  }
}

/** Totals across the run, each carrying its own unknown rather than a zero. */
export interface RunTotals {
  zones: number
  received: number
  sent: number
  unconsumed: number
  unavailable: number
  /** Distinct room shots, and the number of times they were transmitted. */
  context: number
  contextSends: number
  /** Null when no call has run. Distinct from 0, which means calls ran free. */
  tokensIn: number | null
  tokensOut: number | null
  /** Null when any run call had unknown rates — a partial total is not a total. */
  costUsd: number | null
  /** Zones whose buckets did not reconcile. Non-zero is a defect, reported. */
  unreconciled: number
  /** Zones read in more than one call, so §3's claim does not hold for them. */
  splitZones: number
}

export function totals(record: RunRecord): RunTotals {
  let tokensIn: number | null = null
  let tokensOut: number | null = null
  let costUsd: number | null = null
  let anyRun = false
  let anyUnpriced = false

  for (const z of record.zones) {
    for (const c of z.calls) {
      if (c.usage === null) continue
      anyRun = true
      tokensIn = (tokensIn ?? 0) + c.usage.tokensIn
      tokensOut = (tokensOut ?? 0) + c.usage.tokensOut
      if (c.usage.costUsd === null) anyUnpriced = true
      else costUsd = (costUsd ?? 0) + c.usage.costUsd
    }
  }

  return {
    zones: record.zones.length,
    received: record.zones.reduce((t, z) => t + z.received, 0),
    sent: record.zones.reduce((t, z) => t + z.sent, 0),
    unconsumed: record.zones.reduce((t, z) => t + z.unconsumed, 0),
    unavailable: record.zones.reduce((t, z) => t + z.unavailable, 0),
    context: record.zones.reduce((t, z) => t + z.context, 0),
    contextSends: record.zones.reduce((t, z) => t + z.contextSends, 0),
    tokensIn,
    tokensOut,
    // A cost total that silently omits unpriced calls understates the bill and
    // looks authoritative doing it. If any call ran unpriced there is no total.
    costUsd: anyRun && anyUnpriced ? null : costUsd,
    unreconciled: record.zones.filter((z) => !z.reconciled).length,
    splitZones: record.zones.filter((z) => z.splitNote !== null).length,
  }
}
