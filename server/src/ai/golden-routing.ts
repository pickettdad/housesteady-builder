/**
 * The golden set for loose-photo routing.
 *
 * Written now rather than abstracted out of the nameplate one, on the reasoning
 * recorded in `/docs/..._Note_Golden-Set-Generality_2026-07-27.md`: the
 * ratification log is task-agnostic and shared (`ratification.ts`), the
 * comparison is task-shaped and should stay that way. A comparator abstracted
 * against a single task is an abstraction fitted to a sample of one.
 *
 * WHAT THIS SHARES WITH THE NAMEPLATE HARNESS, DELIBERATELY:
 *
 * - The same ratification log, with the same authors. One company artifact, one
 *   review role, one place to see drift.
 * - No model checks a model. Every comparison is identity equality against a pin
 *   a human approved.
 * - Unratified expectations gate nothing, and an unratified difference summons
 *   somebody to ratify it.
 * - The failure directions are never summed.
 *
 * WHAT IS DIFFERENT, AND WHY IT COULD NOT HAVE BEEN SHARED:
 *
 * A nameplate verdict is about a string. A routing verdict is about a ranked
 * list and about whether anything was said at all — `compareField` has no way to
 * express *offered the right pin, second*, which is neither right nor wrong, or
 * *said nothing, correctly*, which is a success this task has and the other does
 * not.
 *
 * THE ASYMMETRY SURVIVES INTACT, which is the part that generalises. `invented`
 * and `misrouted` are the cardinal errors: a photograph filed against the wrong
 * thing is in the permanent record of a house and looks filed. `missed` and
 * `stayed-silent` are never penalised, for exactly the reason a declined
 * nameplate reading is not — penalising a decline pushes the next prompt edit
 * toward guessing, which is the opposite of the point.
 *
 * WHAT IS COMPARED IS WHAT WAS SHOWN, NOT WHAT WAS GENERATED. The bar is part of
 * the behaviour: a model that offers the right pin at `possible` and a bar that
 * hides it produce silence, and silence is what the concierge experienced. So a
 * run records its bar the same way it records its prompt version, and moving the
 * bar is a change the harness can see.
 *
 * NO FIXTURE SET YET, AND THE REASON IS WORTH KEEPING. Ground truth here is
 * "which pin is this photograph of", which needs a visit with room photographs
 * on disk. The reference export is manifest-only — 28 zone-owned photos with no
 * bytes behind them — so nothing can be run against it. The comparison logic is
 * built and tested against plain data; the loader and the command follow the
 * first export that carries its media.
 */

import { clears, type Confidence } from './confidence.js'
import { contested as contestedIn, ratificationView, type Ratifiable } from './ratification.js'

/**
 * One photograph the set has an opinion about.
 *
 * `pin` is the field-minted uuid this repo adopts as canonical, because that is
 * what actually carries across visits — the human-facing number restarts at 1
 * every session and is a display label, never a join key. `pinLabel` is beside
 * it so a person ratifying reads "the water heater" rather than a uuid; only the
 * uuid is compared, and only the uuid is what a ratification copies.
 */
export interface ExpectedRoute extends Ratifiable {
  /** The photograph, relative to the fixture root. Also its name in reports. */
  file: string
  /** The room it was filed against. */
  zone?: string
  hard?: string
  /** The pin it belongs to, or null for "nothing in this room". */
  pin: string | null
  /** Display only. Never compared. */
  pinLabel?: string
}

export interface ExpectedRouteSet {
  version: number
  routes: ExpectedRoute[]
  notes?: string[]
}

/** The one task-shaped function the shared ratification machinery needs. */
export const currentRoute = (entry: ExpectedRoute, key: string): string =>
  key === 'pin' ? (entry.pin ?? NOTHING) : ''

/** How "no pin in this room" is written in a ratification's value copy. */
export const NOTHING = 'none'

const ratification = ratificationView<ExpectedRoute>(currentRoute)
export const isRatified = ratification.isRatified
export const ratifiedBy = ratification.ratifiedBy
export const contested = (set: ExpectedRouteSet) => contestedIn(set.routes)

export type RouteVerdict =
  /** The approved pin was offered first. The good case. */
  | 'led-right'
  /** The approved pin was offered, but something else led. Weaker, not wrong. */
  | 'offered-lower'
  /** Nothing was approved and nothing was offered. A success, and the common one. */
  | 'stayed-silent'
  /** A pin was approved and nothing was offered. Safe — it gets filed by hand. */
  | 'missed'
  /** Nothing was approved and something was offered. THE CARDINAL ERROR. */
  | 'invented'
  /** A pin was approved and a different one was offered. ALSO CARDINAL. */
  | 'misrouted'

/**
 * Compare one photograph's routing against its approved answer.
 *
 * `offered` is the ranked pin ids the concierge would have been SHOWN — after
 * the bar, in order. An empty list is silence, whether because the model said
 * nothing or because nothing it said cleared the bar; both are the same
 * experience at the desk and the harness measures the experience.
 */
export function compareRoute(expected: string | null, offered: string[]): RouteVerdict {
  if (expected === null) return offered.length === 0 ? 'stayed-silent' : 'invented'
  if (offered.length === 0) return 'missed'
  if (offered[0] === expected) return 'led-right'
  return offered.includes(expected) ? 'offered-lower' : 'misrouted'
}

export interface RouteResult {
  file: string
  expected: string | null
  expectedLabel: string | null
  offered: string[]
  verdict: RouteVerdict
  /** Whether the approved answer is ratified. Unratified differences never gate. */
  ratified: boolean
  /** Anything that stopped this entry running — a crash, a refusal, no key. */
  error?: string
}

export interface RouteReport {
  routes: RouteResult[]
  /** The bar this run used. Part of what produced the result, so it is recorded. */
  bar: Confidence
  /** Counted separately and never summed — see the note at the top. */
  totals: {
    routes: number
    ledRight: number
    offeredLower: number
    stayedSilent: number
    missed: number
    invented: number
    misrouted: number
    errors: number
  }
  ratification: { ratified: number; total: number }
  /** Regressions among RATIFIED answers only. These are the ones that gate. */
  regressions: number
  /** Unratified answers that produced a difference — the set's next work. */
  pendingRatification: { file: string; key: string; expected: string; actual: string }[]
  clean: boolean
}

/** Verdicts that count against a run — when the answer they are about is ratified. */
const REGRESSION: RouteVerdict[] = ['invented', 'misrouted']

export function compareRoutes(
  entry: ExpectedRoute,
  produced: { offered: string[]; error?: string },
): RouteResult {
  return {
    file: entry.file,
    expected: entry.pin,
    expectedLabel: entry.pinLabel ?? null,
    offered: produced.offered,
    verdict: compareRoute(entry.pin, produced.offered),
    ratified: isRatified(entry, 'pin'),
    error: produced.error,
  }
}

export function summariseRoutes(routes: RouteResult[], bar: Confidence): RouteReport {
  const count = (v: RouteVerdict): number => routes.filter((r) => r.verdict === v).length

  const totals = {
    routes: routes.length,
    ledRight: count('led-right'),
    offeredLower: count('offered-lower'),
    stayedSilent: count('stayed-silent'),
    missed: count('missed'),
    invented: count('invented'),
    misrouted: count('misrouted'),
    errors: routes.filter((r) => r.error).length,
  }

  const regressions =
    routes.filter((r) => r.ratified && REGRESSION.includes(r.verdict)).length + totals.errors

  // `offered-lower` never gates: the right answer was in front of the concierge
  // and one keystroke away, which is the feature working less well rather than
  // failing. It is reported because a run where it climbs is a run where the
  // ranking is drifting, and that is worth seeing before it becomes `misrouted`.
  const pendingRatification = routes
    .filter((r) => !r.ratified && r.verdict !== 'led-right' && r.verdict !== 'stayed-silent')
    .map((r) => ({
      file: r.file,
      key: 'pin',
      expected: r.expected ?? NOTHING,
      actual: r.offered[0] ?? NOTHING,
    }))

  return {
    routes,
    bar,
    totals,
    ratification: { ratified: routes.filter((r) => r.ratified).length, total: routes.length },
    regressions,
    pendingRatification,
    clean: regressions === 0,
  }
}

/**
 * What the concierge was shown, from what the model produced.
 *
 * Here rather than in the harness because the harness has to apply the bar
 * exactly as production does, and the way that stops being true is two copies of
 * one rule. Same discipline as the nameplate run applying the classification
 * gate through the same code the queue does.
 */
export const offeredPins = (
  candidates: { pinId: string; confidence: string }[],
  bar: Confidence,
): string[] =>
  candidates.length > 0 && clears(candidates[0]!.confidence, bar) ? candidates.map((c) => c.pinId) : []
