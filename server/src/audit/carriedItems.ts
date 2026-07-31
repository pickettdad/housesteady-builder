/**
 * The field-checklist gap stream — Increment 4 §1b.
 *
 * **This is not `audit_slots` and must never be read off it.** Increment 3 built
 * binder-*slot* completeness: whether §7's systems inventory has enough behind
 * it to render. This answers a different question about a different object —
 * *which checklist item, in which room, was never answered.*
 *
 * ---
 *
 * **The named failure, §1a.** *If the gap report is assembled from Increment 3's
 * slot states, it reports twenty fewer items than exist on the reference export,
 * and every one of the twenty is a real thing the client should have been told.*
 *
 * Measured, and confirmed against the export before any of this was written:
 * **19 unresolved items, all in the ensuite, plus one `na` carrying
 * `feedsGapList`** — `ses.termination-reconcile`, deferred. Twenty. Increment
 * 3's output carries none of them.
 *
 * **The reason is two correct rules producing a false picture.** Increment 3 §2
 * says a coverage slot is complete when every applicable item has a *state* —
 * and `not-found` is a state. So `na / no-access` resolves the SLOT correctly
 * while leaving a GAP nobody can see. Neither rule is wrong. Verification
 * Discipline rule 5: a fix that removes a symptom has not removed a class.
 *
 * ---
 *
 * **Two vocabularies, kept apart.** Increment 3's causes — *nothing captured* ·
 * *captured but short* · *never reached* — describe why a binder slot is short.
 * This stream has its own, and merging them would make one word mean two things
 * depending on which query you came from.
 *
 * **The config supplies both the membership rule and the wording.** §1b says to
 * classify from the boolean rather than the reason id, and it is right — but the
 * same `naReasons[]` entry that carries `feedsGapList` also carries a `label`
 * written for a person: *"Not accessible today"*, *"Deferred to visit two"*. So
 * membership comes from the boolean and the words come from the label, and a
 * config that adds a fifth gap-feeding reason needs no code change at all. That
 * is instance six of *before building a check, look for whether the config
 * already declares it* — this time it declared two things, not one.
 *
 * Only `not-reached` is this builder's own word, and only because there is no
 * resolution record to carry a reason. An unanswered item has nothing to quote.
 */

import { naReasonsOf, type Missing } from './completeness.js'
import type { ActiveItem, ActiveItemSet, ItemScope } from './activeItems.js'
import { activeItemKey, itemScopeKey } from './activeItems.js'
import type { PropertyEvidence } from './propertyEvidence.js'

/**
 * Which of the report's three columns a row belongs to.
 *
 * Carried on the row rather than worked out at render, so §5's editor can show a
 * misclassification rather than only a wrong sentence.
 */
export type ColumnId = 'missing-from-you' | 'missing-from-us' | 'triggered-flags'

export interface CarriedItem {
  scope: ItemScope
  itemId: string
  tier: string
  /**
   * `not-reached`, or the na reason id verbatim.
   *
   * **Open vocabulary.** A config that declares a gap-feeding reason this
   * builder has never met produces a row carrying that reason's own id, not a
   * silence and not a guess at which of three buckets it resembles.
   */
  reason: string
  /** Set where the reason came from an `na`. Null for `not-reached`. */
  naReasonId: string | null
  column: ColumnId
  /**
   * The structured parts — §2a's composition boundary.
   *
   * **Never a composed sentence.** Two composers read these: `sentenceOf()` for
   * the desk, and the client-facing one for the report. Neither reads the
   * other's output, because un-composing a sentence somebody already composed is
   * information destruction followed by guessing.
   */
  parts: Missing
  /** §1c — `proposed` and nothing else. Null unless the field declared it. */
  status: string | null
  origin: ActiveItem['origin']
  dueSince: ActiveItem['dueSince']
  where: string
  /** False when a fail-open decision put the item in the active set at all. */
  certain: boolean
  unrecognised: string[]
}

export interface CarriedItems {
  items: CarriedItem[]
  /**
   * The derivation, named rather than counted — §8's *"names its evidence"*.
   *
   * A bare *"20 gaps"* cannot be checked by the person reading it. *"19 of 19
   * applicable items in the ensuite have no resolution record"* can be, and an
   * implausible result is visible as implausible.
   */
  evidence: string[]
  /** Per scope, so a stream that is two-thirds built is visible as two-thirds built. */
  byScope: { zone: number; pin: number; session: number; other: number }
  warnings: string[]
}

/** How the field app said an item stands, where it said anything. */
export interface StatusCheck {
  itemId: string
  scopeKey: string
  /** What `activeItems[].status` claimed. */
  declared: string
  /** What `resolutions[]` says. */
  derived: string
}

/**
 * The gap stream, plus the cross-check §1c asks for.
 *
 * **The cross-check reports disagreement rather than picking a winner.** Same
 * treatment as `zones[].audit` in the Zone-Audit Reconstruction note: store what
 * the field exported verbatim, compute alongside, surface divergence. The
 * duplication becomes a free oracle instead of a hazard — which is the only way
 * a second copy of a fact is ever safe to hold.
 */
export function carriedItems(args: {
  evidence: PropertyEvidence
  active: ActiveItemSet
  /** Latest resolution per `(scopeKey, itemId)`. */
  resolutions: Map<string, { kind: string | null; reasonId: string | null; at: string }>
}): { carried: CarriedItems; statusDisagreements: StatusCheck[] } {
  const { evidence, active, resolutions } = args
  const naReasons = naReasonsOf(evidence.snapshot)
  const labels = naLabels(evidence.snapshot)

  const items: CarriedItem[] = []
  const statusDisagreements: StatusCheck[] = []
  const warnings: string[] = [...active.warnings]

  // Per-scope tallies of what was due and what was answered, so the evidence
  // line can say "19 of 19" rather than "19".
  const dueByWhere = new Map<string, { due: number; unanswered: number; where: string }>()

  for (const item of active.items.values()) {
    const key = activeItemKey(item.scope, item.itemId)
    const resolution = resolutions.get(key)

    // The scope key from the function that makes it, never split back out of the
    // composed key. Rule 4, in the file that cites it: the producer composed
    // those two parts and `item.scope` is right here — un-composing its output
    // would be guessing at a boundary that was never ambiguous.
    const scopeKey = itemScopeKey(item.scope)
    const bucket = dueByWhere.get(scopeKey) ?? { due: 0, unanswered: 0, where: item.where }
    bucket.due += 1
    // Stored on every item, not only on a gap. Counting `due` in a bucket that
    // is only written back when something is missing gives *"1 of 1"* for a room
    // where nineteen were asked — a denominator that quietly agrees with the
    // numerator, which is the one number nobody would think to check.
    dueByWhere.set(scopeKey, bucket)

    // §1c — the cross-check. Only `proposed` is read as a value; every other
    // status is compared against what `resolutions[]` says and any disagreement
    // is recorded. Neither side wins.
    if (item.status && item.status !== 'proposed') {
      const derived = resolution?.kind ?? 'unresolved'
      if (item.status !== derived) {
        statusDisagreements.push({ itemId: item.itemId, scopeKey: key, declared: item.status, derived })
      }
    }

    let reason: string | null = null
    let naReasonId: string | null = null

    if (!resolution) {
      reason = 'not-reached'
    } else if (resolution.kind === 'na' && resolution.reasonId) {
      // The BOOLEAN decides membership — §1b. The reason id is vocabulary and
      // fails open; a reason the config never declared is neither in the stream
      // nor silently dropped, because `naReasonsOf` reports it as unrecognised
      // and the import report already lists it.
      if (naReasons.feedsGapList(resolution.reasonId)) {
        reason = resolution.reasonId
        naReasonId = resolution.reasonId
      } else if (naReasons.unrecognised(resolution.reasonId)) {
        warnings.push(
          `${item.itemId} in ${item.where} was recorded na / ${resolution.reasonId}, which this property's ` +
            'current config does not declare — so whether it feeds the gap list is unknown and it is ' +
            'listed here rather than decided either way',
        )
        reason = resolution.reasonId
        naReasonId = resolution.reasonId
      }
    }

    if (reason === null) continue

    bucket.unanswered += 1

    items.push({
      scope: item.scope,
      itemId: item.itemId,
      tier: item.tier,
      reason,
      naReasonId,
      // Every row from this stream is ours to answer, not the client's. §1d's
      // "missing from you" column is document-owed and manual-entry only, and
      // nothing derived from a field checklist belongs there.
      column: 'missing-from-us',
      parts: partsFor(item, reason, naReasonId, labels),
      status: item.status,
      origin: item.origin,
      dueSince: item.dueSince,
      where: item.where,
      certain: item.certain,
      unrecognised: item.unrecognised,
    })
  }

  const byScope = { zone: 0, pin: 0, session: 0, other: 0 }
  for (const item of items) {
    if (item.scope.kind === 'zone') byScope.zone += 1
    else if (item.scope.kind === 'pin') byScope.pin += 1
    else if (item.scope.kind === 'session') byScope.session += 1
    else byScope.other += 1
  }

  const evidenceLines: string[] = []
  for (const [scopeKey, b] of [...dueByWhere].sort()) {
    if (b.unanswered === 0) continue
    evidenceLines.push(
      `${b.unanswered} of ${b.due} applicable item(s) in ${b.where} have no answer (${scopeKey})`,
    )
  }
  if (evidenceLines.length === 0) evidenceLines.push('every applicable item on this property has an answer')

  // The origin breakdown, always. A set that is half computed and half received
  // is the normal case from v4 onward, and a stream that does not say so lets a
  // locally-derived "was due" pass as the field app's own answer.
  evidenceLines.push(
    `active item set: ${active.origins.received} received from the field, ${active.origins.computed} computed here`,
  )

  return {
    carried: { items, evidence: evidenceLines, byScope, warnings },
    statusDisagreements,
  }
}

/** Each na reason's own label, for a person. Quoted, never paraphrased. */
function naLabels(snapshot: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>()
  const declared = snapshot.naReasons
  if (Array.isArray(declared)) {
    for (const entry of declared as Record<string, unknown>[]) {
      if (typeof entry.id === 'string' && typeof entry.label === 'string') out.set(entry.id, entry.label)
    }
  }
  return out
}

/**
 * The parts, composed by nobody here.
 *
 * `what` names the item and where it was asked; `why` names the reason. Both
 * stay separate all the way to a composer, because §1a's dash lesson applies to
 * every sentence this repo builds: the producer knew the parts and a consumer
 * that un-composes them is guessing at a boundary that was never ambiguous.
 */
function partsFor(
  item: ActiveItem,
  reason: string,
  naReasonId: string | null,
  labels: Map<string, string>,
): Missing {
  const what = item.scope.kind === 'session' ? item.itemId : `${item.itemId} in ${item.where}`
  if (reason === 'not-reached') {
    return { what, why: 'no answer was recorded' }
  }
  const label = naReasonId ? labels.get(naReasonId) : undefined
  // The config's own words where it has them. Where it does not, the id
  // verbatim — a reason this builder cannot name is still reported, and the
  // unnamed id is more honest than a bucket it was sorted into by resemblance.
  return { what, why: label ?? `recorded na / ${reason}` }
}
