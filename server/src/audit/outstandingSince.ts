/**
 * When a carried gap's **current unbroken run** of being outstanding began.
 *
 * ---
 *
 * ## The ruling, and what it replaces
 *
 * `since` shipped reading `dueSince` — the import that FIRST made an item due.
 * That is *the first time it was ever outstanding*, and it is wrong in both
 * directions the ruling names:
 *
 * > **Not the first time it was ever outstanding** — an item satisfied on visit
 * > two and unanswered again on visit three would tell a client it has been open
 * > for a year when it was closed for eleven months of it.
 * >
 * > **Not the most recent carry either**, or the clock resets every visit and the
 * > sentence stops meaning anything.
 *
 * So: walk the visit sequence backwards from the latest, and take the earliest
 * visit in the unbroken stretch of being outstanding. The outcome the mechanism
 * has to earn is that *"open since your March visit"* is true.
 *
 * ---
 *
 * ## What breaks a run, and what does not
 *
 * **An answer breaks it.** Satisfied, failed, or an `na` whose reason the config
 * does not mark `feedsGapList` — the item stopped being a hole, and a later
 * reopening starts a new run.
 *
 * **A visit that did not ask it does not break it, and does not extend it
 * either.** A pin retired for one visit and back the next was never answered in
 * between; treating the silence as an answer would reset the clock on a question
 * nobody ever closed. So a not-due visit is transparent — stepped over, not
 * counted. `runVisits` therefore counts visits where it was genuinely
 * outstanding, which is why it can be smaller than the span it covers.
 *
 * ---
 *
 * ## The third state, which is the point of the ruling
 *
 * > Where the history does not reach back far enough — the property's first
 * > import is visit three — `since` cannot be known, and must say so rather than
 * > defaulting to the earliest visit that happens to exist.
 *
 * **The test is whether the record's earliest visit is a `baseline`.** A baseline
 * is by definition a property's first visit, so a record that starts at one
 * reaches all the way back. A record that starts at a `monthly` had visits before
 * it that this database has never seen, and a run reaching that first held visit
 * may well have started earlier.
 *
 * `visits.kind` is operator-entered, so it can be wrong — but the failure
 * direction is the safe one. A first visit mistyped as `monthly` yields *"we
 * cannot say how far back this goes"* rather than a confident wrong date, and
 * Verification Discipline rule 7 is the reason this state exists at all: the
 * old code's `dueSince` fallback had an input that is always present, so it
 * never once announced that it could not answer.
 *
 * ---
 *
 * ## Four bases, not a nullable date
 *
 * `null` is four different facts here, and a receiver cannot tell them apart:
 *
 * | basis | what it means |
 * |---|---|
 * | `dated` | the run's first visit is known and the manifest carries its walk date |
 * | `undated` | the run's first visit is known; no import for it records a session start |
 * | `predates-record` | the run reaches this record's earliest visit and that is not the property's first |
 * | `no-visit` | no visit on record ever recorded this item as due — a visit-less import |
 *
 * `predates-record` outranks `undated`: it says the date would be wrong even if
 * we had one.
 *
 * ---
 *
 * ## Chronology is the walk date, and import order is only a fallback
 *
 * The run is a sequence of visits **as they happened in the house.** So the sort
 * key is the manifest's `session.startedAt` where there is one, and
 * `imports.imported_at` where there is not. Those are different clocks — the
 * reference session was walked on the 25th and imported days later — so where the
 * two orders disagree, the disagreement is warned about rather than absorbed.
 *
 * ---
 *
 * ## Membership is read per visit, from what that import's own config said
 *
 * `resolutions.feeds_gap_list` is written at import time from **that import's**
 * `naReasons[]`. Re-deciding history with today's config would rewrite whether a
 * two-year-old `na` was a gap, which is the config-decides rule pointed
 * backwards. The stored column is the config's contemporaneous answer and is what
 * this walk reads. An `na` whose reason the *current* config does not declare is
 * still counted outstanding, matching `carriedItems` exactly — unrecognised
 * vocabulary is listed, never decided.
 */

import type { Db } from '../db/index.js'
import type { ActiveItemSet } from './activeItems.js'
import { naReasonsOf } from './completeness.js'
import { walkedAtByVisit } from './walkedAt.js'

export type SinceBasis = 'dated' | 'undated' | 'predates-record' | 'no-visit'

export interface OutstandingSince {
  /** The visit the current run began at, where one is identifiable. */
  visitId: string | null
  /** That visit's walk date. Null on every basis but `dated`. */
  date: string | null
  basis: SinceBasis
  /** Visits in the run this record can see. Zero where the basis is not `dated` or `undated`. */
  runVisits: number
  /** Why, in a sentence — for the desk, and so a receiver never reads a bare null. */
  note: string
}

/** One visit on the property's record, in the order it happened. */
export interface VisitPoint {
  visitId: string
  kind: string | null
  /** From the manifest's session start. Null where no import for it carries one. */
  date: string | null
  /** The instant this visit sorts on: the walk where known, the import where not. */
  sortAt: string
  /** True when `sortAt` is an import timestamp rather than a walk. */
  sortedByImport: boolean
}

interface Answered {
  /** Index into the sequence at which this state took effect. */
  index: number
  outstanding: boolean
}

export interface SinceResult {
  since: Map<string, OutstandingSince>
  sequence: VisitPoint[]
  /** True when the earliest visit on record is a baseline, so the record reaches the start. */
  recordReachesBack: boolean
  warnings: string[]
}

/**
 * The run start for each of the given item keys.
 *
 * `keys` are `activeItemKey()` strings — the carried gaps, already decided by
 * `carriedItems`. Nothing here re-decides membership for the present; it only
 * reconstructs the past.
 */
export function outstandingSince(args: {
  db: Db
  propertyId: string
  active: ActiveItemSet
  keys: string[]
  /** The property's current config snapshot — for unrecognised na reasons only. */
  snapshot: Record<string, unknown>
}): SinceResult {
  const { db, propertyId, active, keys, snapshot } = args
  const warnings: string[] = []
  const naReasons = naReasonsOf(snapshot)

  // ------------------------------------------------------- the visit sequence
  const walks = walkedAtByVisit(db, propertyId)
  const visitRows = db
    .prepare(
      `SELECT v.id, v.kind, MIN(i.imported_at) AS first_import
         FROM visits v JOIN imports i ON i.visit_id = v.id
        WHERE i.property_id = ? GROUP BY v.id`,
    )
    .all(propertyId) as { id: string; kind: string | null; first_import: string }[]

  const sequence: VisitPoint[] = visitRows
    .map((v) => {
      const walked = walks.get(v.id)
      return {
        visitId: v.id,
        kind: v.kind,
        date: walked?.date ?? null,
        sortAt: walked?.startedAt ?? v.first_import,
        sortedByImport: !walked?.startedAt,
      }
    })
    .sort((a, b) => (a.sortAt < b.sortAt ? -1 : a.sortAt > b.sortAt ? 1 : a.visitId < b.visitId ? -1 : 1))

  // Two clocks in one sort key. Where they order the visits differently, the
  // sentence a client reads depends on which one won, so it is said out loud.
  const byImport = [...visitRows]
    .sort((a, b) => (a.first_import < b.first_import ? -1 : a.first_import > b.first_import ? 1 : a.id < b.id ? -1 : 1))
    .map((v) => v.id)
  if (sequence.some((v, i) => v.visitId !== byImport[i])) {
    warnings.push(
      'the visits on this property sort differently by walk date than by import order, and `since` ' +
        'follows the walk — a baseline walked in March and imported in June happened before a monthly ' +
        'walked in April. Reported because the two are different clocks and the run is a sequence of ' +
        'walks, not of uploads.',
    )
  }

  const first = sequence[0]
  const recordReachesBack = first?.kind === 'baseline'
  if (first && !recordReachesBack) {
    warnings.push(
      `this property's earliest visit on record is \`${first.kind ?? 'unknown'}\`, not \`baseline\`, so ` +
        'the record may not reach the first visit. Gaps whose run reaches that visit are reported as ' +
        '`predates-record` rather than dated to it.',
    )
  }
  const strayBaseline = sequence.findIndex((v) => v.kind === 'baseline')
  if (strayBaseline > 0) {
    warnings.push(
      `a visit of kind \`baseline\` sits at position ${strayBaseline + 1} of ${sequence.length} in this ` +
        'property\'s sequence rather than first. A baseline is a property\'s first visit by definition, ' +
        'so either the sequence or the kind is wrong — neither is guessed at here.',
    )
  }

  const indexOf = new Map(sequence.map((v, i) => [v.visitId, i]))

  // ------------------------------------------------- resolution history, per key
  //
  // Every resolution the property holds, in the order its import was read. Only
  // the keys asked for are kept; on the reference export that is twenty of
  // several hundred rows.
  const wanted = new Set(keys)
  const history = new Map<string, Answered[]>()

  const rows = db
    .prepare(
      `SELECT r.scope_kind, r.scope_zone_id, r.scope_pin_id, r.item_id, r.kind, r.reason_id,
              r.feeds_gap_list, i.visit_id, i.imported_at
         FROM resolutions r JOIN imports i ON i.id = r.import_id
        WHERE r.property_id = ? ORDER BY i.imported_at, r.id`,
    )
    .all(propertyId) as {
    scope_kind: string | null; scope_zone_id: string | null; scope_pin_id: string | null
    item_id: string; kind: string | null; reason_id: string | null
    feeds_gap_list: number | null; visit_id: string | null; imported_at: string
  }[]

  for (const r of rows) {
    const scopeKey = r.scope_kind === 'zone'
      ? `zone:${r.scope_zone_id ?? ''}`
      : r.scope_kind === 'pin'
        ? `pin:${r.scope_pin_id ?? ''}`
        : r.scope_kind === 'session' ? 'session' : `${r.scope_kind}:${r.scope_zone_id ?? r.scope_pin_id ?? ''}`
    const key = `${scopeKey}/${r.item_id}`
    if (!wanted.has(key)) continue
    // A resolution from a visit-less import has no place in the sequence. It
    // still counts as an answer — it just cannot be located in time, so it
    // takes effect from the start rather than being dropped.
    const index = r.visit_id ? indexOf.get(r.visit_id) ?? -1 : -1
    // `feeds_gap_list` is the import's own config speaking. The unrecognised
    // branch mirrors `carriedItems`: a reason today's config cannot name is
    // listed, not decided.
    const outstanding = r.feeds_gap_list === 1
      || (r.kind === 'na' && r.reason_id !== null && naReasons.unrecognised(r.reason_id))
    const list = history.get(key) ?? []
    list.push({ index, outstanding })
    history.set(key, list)
  }

  // Re-ordered onto the sequence. The query returns import order; the sequence
  // is walk order, and where the two disagree the last row read is not the
  // latest answer. A stable sort by index keeps import order inside one visit,
  // which is still the right tiebreak for two exports of the same walk.
  for (const list of history.values()) list.sort((a, b) => a.index - b.index)

  // ------------------------------------------------------------- the walk back
  const since = new Map<string, OutstandingSince>()

  for (const key of keys) {
    const dueAt = active.items.get(key)?.dueAt ?? []
    const dueIndices = new Set(
      dueAt.map((v) => indexOf.get(v)).filter((i): i is number => typeof i === 'number'),
    )
    if (dueIndices.size === 0) {
      since.set(key, {
        visitId: null,
        date: null,
        basis: 'no-visit',
        runVisits: 0,
        note: 'no visit on this property\'s record recorded this item as due — its import carries no ' +
          'visit, so there is no walk to date it to',
      })
      continue
    }

    const events = history.get(key) ?? []
    let runStart: number | null = null
    let point: VisitPoint | null = null
    let runVisits = 0
    let brokeOnAnswer = false

    for (let i = sequence.length - 1; i >= 0; i -= 1) {
      const visit = sequence[i]
      if (!visit) continue
      if (!dueIndices.has(i)) continue // transparent: not asked, so not answered either
      // The state as of this visit: the latest resolution at or before it.
      // Nothing at all means never reached, which is outstanding.
      let state: boolean | null = null
      for (const e of events) {
        if (e.index <= i) state = e.outstanding
      }
      const outstanding = state ?? true
      if (!outstanding) {
        brokeOnAnswer = true
        break
      }
      runStart = i
      point = visit
      runVisits += 1
    }

    if (runStart === null || point === null) {
      // Due at some visit, but every one of them answered. `carriedItems` says
      // it is a gap now, so the two disagree — surfaced, never smoothed.
      since.set(key, {
        visitId: null,
        date: null,
        basis: 'no-visit',
        runVisits: 0,
        note: 'carried as a gap, yet every visit that asked it holds an answer — the gap stream and the ' +
          'resolution history disagree about this item and neither is preferred here',
      })
      warnings.push(
        `${key} is carried as a gap but no visit on record has it outstanding. Reported rather than ` +
          'dated; this is the kind of divergence a `since` that could not fail would have hidden.',
      )
      continue
    }

    // The run reached the earliest visit we hold without an answer closing it,
    // and the record does not reach this property's first visit. The true start
    // may be earlier and this database cannot see it.
    //
    // **`runStart === 0` is doing real work and is not a formality.** A run
    // starting later than the first held visit means there is a visit on record
    // where this item was NOT due — a water heater pinned for the first time on
    // visit three could not have been outstanding on visit two, and we can see
    // visit two. That is positive evidence from held data, so the date stands.
    // Only a run that reaches the record's own left edge has nothing behind it.
    if (!brokeOnAnswer && runStart === 0 && !recordReachesBack) {
      since.set(key, {
        visitId: point.visitId,
        date: null,
        basis: 'predates-record',
        runVisits,
        note: `outstanding at every visit this record holds, back to the earliest — a \`${point.kind ?? 'unknown'}\` ` +
          'visit rather than a baseline. Visits before it are not in this record, so how long this has ' +
          'been open cannot be stated.',
      })
      continue
    }

    if (point.date === null) {
      since.set(key, {
        visitId: point.visitId,
        date: null,
        basis: 'undated',
        runVisits,
        note: 'the visit this run began at is known, but no import for it records a session start — so ' +
          'there is no walk date. Not defaulted to the import timestamp, which is a different fact.',
      })
      continue
    }

    since.set(key, {
      visitId: point.visitId,
      date: point.date,
      basis: 'dated',
      runVisits,
      note: runVisits === 1
        ? 'outstanding since this visit; the visit before it holds an answer'
        : `outstanding at ${runVisits} consecutive visits, beginning with this one`,
    })
  }

  return { since, sequence, recordReachesBack, warnings }
}
