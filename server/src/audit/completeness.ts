/**
 * Completeness, per slot kind — Increment 3 §2.
 *
 * Pure: given what was captured, return what is short. No database, no schema
 * loading, no writes, which is what makes the awkward rules — a `derived` slot
 * that must never report independently, a `narrative` slot that must never be a
 * gap under any profile — cheap enough to test exhaustively.
 *
 * **Two of the five rules are non-negotiables rather than defaults** (§0.4,
 * §0.5) and they are enforced first, before anything else can reach them. A
 * later kind-specific branch that happened to mark a narrative slot incomplete
 * would be a lie shipped to a client, and the ordering here is what makes that
 * unreachable rather than merely unlikely.
 */

import { evaluate, type FactSet } from './triggers.js'
import type { Classification, CoverageItem, Slot } from './schema.js'

export type SlotState = 'complete' | 'partial' | 'empty' | 'not-applicable' | 'n-a-narrative'

/** §2 — the three answers a coverage item may carry. */
export type ItemState = 'present' | 'confirmed-absent' | 'not-found'

export interface ItemAssessment {
  itemId: string
  label: string
  /** Null when nothing was recorded — which is what makes the slot incomplete. */
  state: ItemState | null
  /** Why it is short, in words. */
  shortBecause?: string
  applicable: boolean
}

export interface SlotAssessment {
  slotId: string
  kind: string
  applicable: boolean
  required: boolean
  state: SlotState
  /** What specifically is short. Named, never counted — §3. */
  missing: string[]
  detail: Record<string, unknown>
}

/**
 * How this import's config classifies each `na` reason.
 *
 * **The config decides, not the builder** — CLAUDE.md §5, and this is the third
 * place that rule has bitten. Read per import from `naReasons[]`; never
 * hardcode which reasons mean what, because a config that adds one would
 * otherwise be silently mishandled by code nobody thought to update.
 */
export interface NaReasons {
  feedsGapList: (reasonId: string) => boolean
  recordsFinding: (reasonId: string) => boolean
  /** True when this import's config has never heard of the reason. */
  unrecognised: (reasonId: string) => boolean
}

export function naReasonsOf(snapshot: Record<string, unknown>): NaReasons {
  const feeds = new Set<string>()
  const finds = new Set<string>()
  const known = new Set<string>()
  const declared = snapshot.naReasons
  if (Array.isArray(declared)) {
    for (const entry of declared as Record<string, unknown>[]) {
      const id = typeof entry.id === 'string' ? entry.id : null
      if (!id) continue
      known.add(id)
      if (entry.feedsGapList === true) feeds.add(id)
      if (entry.recordsFinding === true) finds.add(id)
    }
  }
  return {
    feedsGapList: (id) => feeds.has(id),
    recordsFinding: (id) => finds.has(id),
    unrecognised: (id) => !known.has(id),
  }
}

/** What the audit knows about one item's evidence, from binding and resolutions. */
export interface ItemEvidence {
  /** A binding matched live evidence and everything it requires is resolved. */
  bound: boolean
  /** A candidate exists but a required field item is unresolved. */
  short: string[]
  /** `na` reason recorded against this item's field checklist item, if any. */
  naReasonId?: string
  /** The binding could not be evaluated at all — a broken reference. */
  brokenRefs?: string[]
}

/**
 * One coverage item's state.
 *
 * **`confirmed-absent` and `not-found` are different answers and must not
 * merge.** The config draws the line: `none-present` records a finding and does
 * NOT feed the gap list — *there is no fireplace* is a substantive fact about
 * the house. `no-access` feeds the gap list and records no finding — *nobody
 * could reach it* is a hole. Collapsing them would either turn every confirmed
 * absence into a chore for the client or bury a room nobody could get into.
 */
export function assessItem(args: {
  item: CoverageItem
  facts: FactSet
  evidence: ItemEvidence
  naReasons: NaReasons
}): ItemAssessment {
  const { item, facts, evidence, naReasons } = args
  const verdict = evaluate(item.appliesWhen ?? 'always', facts)

  const base = { itemId: item.id, label: item.label, applicable: verdict.applies }
  if (!verdict.applies) return { ...base, state: null }

  if (evidence.brokenRefs?.length) {
    // Not a gap. The schema points at a field item this import's config does not
    // declare, and reporting it as *the house is missing this* would send
    // somebody to look for a shutoff when the fix is in the schema.
    return { ...base, state: null, shortBecause: `binding refers to ${evidence.brokenRefs.join(', ')}, which this import's config does not declare` }
  }

  if (evidence.naReasonId) {
    const id = evidence.naReasonId
    if (naReasons.unrecognised(id)) {
      // Doctrine 7 — fail open on vocabulary. An `na` reason the builder has not
      // met is preserved and reported, never guessed at and never dropped.
      return { ...base, state: null, shortBecause: `recorded n/a for "${id}", which this import's config does not declare` }
    }
    if (naReasons.recordsFinding(id) && !naReasons.feedsGapList(id)) {
      return { ...base, state: 'confirmed-absent' }
    }
    if (naReasons.feedsGapList(id)) return { ...base, state: 'not-found' }
    // Declared, feeds nothing, records nothing — the config's way of saying the
    // question does not apply here.
    return { ...base, state: null, applicable: false }
  }

  if (evidence.bound) return { ...base, state: 'present' }

  if (evidence.short.length > 0) {
    // §2's locating-photo rule. A shutoff marked present with only a close-up
    // FAILS the slot — the Master Spec is explicit that the photo must be wide
    // enough to locate the item in the room. Bound to the field's own items
    // rather than checked here (§1c), so this reports rather than judges.
    return { ...base, state: null, shortBecause: `captured, but ${evidence.short.join(', ')} is unresolved` }
  }

  return { ...base, state: null, shortBecause: 'nothing captured' }
}

/**
 * §10's specificity rule — a completeness rule, not style advice.
 *
 * *"A concern that says only 'watch this' fails the slot."* This is the
 * identification/assessment line made mechanically checkable: a watch schedule
 * without a measurement, a cadence and a named escalation trigger is an opinion
 * wearing a plan's clothes, and the concierge cannot defend an opinion.
 */
export function watchScheduleShortfall(
  record: Record<string, unknown>,
  requires: string[],
): string[] {
  const present = (key: string): boolean => {
    const v = record[key]
    if (v === null || v === undefined) return false
    if (typeof v === 'string') return v.trim() !== ''
    return true
  }
  return requires.filter((key) => !present(key))
}

// ------------------------------------------------------------------ the slots

export interface SlotEvidence {
  /** Coverage: one entry per item. */
  items?: ItemAssessment[]
  /** Fixed: whether a value is recorded, and whether it is an explicit unknown. */
  value?: { recorded: boolean; explicitUnknown: boolean }
  /** Record-set: the expectation set and what has a record. */
  records?: { expected: number; withRecord: number; shortfalls: string[] }
  /** Derived: the states of the slots this one reads from. */
  inputs?: SlotState[]
  /** Narrative: how much has been written. */
  narrative?: { entries: number }
  /** Set when this repo has no source wired for the slot yet. */
  noSourceWired?: string
}

export function assessSlot(args: {
  slot: Slot
  classification: Classification
  /** Whether the slot itself applies — from `appliesWhen`, where the schema has one. */
  applicable: boolean
  evidence: SlotEvidence
}): SlotAssessment {
  const { slot, classification, applicable, evidence } = args
  const required = classification === 'required'

  const base = {
    slotId: slot.id,
    kind: slot.kind,
    applicable,
    required,
    missing: [] as string[],
    detail: {} as Record<string, unknown>,
  }

  /**
   * §0.4 — **`narrative` slots never produce a gap. Ever. Regardless of
   * profile.** Checked before applicability and before the profile, because
   * those are the two routes by which a later change could make one gap.
   *
   * §8 can never be complete: a house always has one more quirk, and software
   * that reports it 80% done is lying about something a client will read.
   */
  if (slot.kind === 'narrative') {
    return {
      ...base,
      required: false,
      state: 'n-a-narrative',
      detail: { entries: evidence.narrative?.entries ?? 0, reportsAs: (evidence.narrative?.entries ?? 0) > 0 ? 'started' : 'empty' },
    }
  }

  if (classification === 'out-of-scope' || !applicable) {
    return { ...base, applicable: false, required: false, state: 'not-applicable' }
  }

  /**
   * §0.5 — **`derived` slots never report independently.** They are complete
   * when their inputs are. A derived slot that reported `empty` on its own would
   * put a line in the gap list nobody can act on: there is nothing to capture,
   * only something upstream to finish.
   */
  if (slot.kind === 'derived') {
    const inputs = evidence.inputs ?? []
    if (inputs.length === 0) {
      return { ...base, state: 'partial', missing: ['its inputs have not been assessed'], detail: { inputs: 0 } }
    }
    const complete = inputs.every((s) => s === 'complete' || s === 'not-applicable' || s === 'n-a-narrative')
    return {
      ...base,
      state: complete ? 'complete' : 'partial',
      missing: complete ? [] : [`waiting on ${inputs.filter((s) => s !== 'complete').length} of ${inputs.length} inputs`],
      detail: { inputs: inputs.length },
    }
  }

  // A slot whose source this repo does not read yet is honestly empty, and the
  // reason travels with it. Reporting it as a plain gap would put "the client
  // owes us this" against a slot the builder simply cannot see — a true state
  // with a false implication, which doctrine 4 treats as the worse failure.
  if (evidence.noSourceWired) {
    return { ...base, state: 'empty', missing: [evidence.noSourceWired], detail: { noSourceWired: true } }
  }

  if (slot.kind === 'fixed') {
    const v = evidence.value
    if (!v?.recorded) return { ...base, state: 'empty', missing: ['no value recorded'] }
    // §2 — an explicit unknown COMPLETES a fixed slot. Doctrine 4: an explicit
    // unknown is information; a blank is an absence of one.
    return { ...base, state: 'complete', detail: { explicitUnknown: v.explicitUnknown } }
  }

  if (slot.kind === 'coverage') {
    const items = (evidence.items ?? []).filter((i) => i.applicable)
    if (items.length === 0) {
      return { ...base, state: 'empty', missing: ['no applicable items'], detail: { applicableItems: 0 } }
    }
    const short = items.filter((i) => i.state === null)
    const detail = {
      applicableItems: items.length,
      present: items.filter((i) => i.state === 'present').length,
      confirmedAbsent: items.filter((i) => i.state === 'confirmed-absent').length,
      notFound: items.filter((i) => i.state === 'not-found').length,
    }
    if (short.length === 0) return { ...base, state: 'complete', detail }
    return {
      ...base,
      state: short.length === items.length ? 'empty' : 'partial',
      // Named individually — §3's example is "3 of 19 applicable items have no
      // state: main electrical disconnect, panel directory, sump breaker",
      // never "§1 incomplete".
      missing: short.map((i) => `${i.label}${i.shortBecause ? ` — ${i.shortBecause}` : ''}`),
      detail,
    }
  }

  if (slot.kind === 'record-set') {
    const r = evidence.records
    if (!r || r.expected === 0) {
      return { ...base, state: 'complete', detail: { expected: 0 }, missing: [] }
    }
    if (r.withRecord === 0) {
      return { ...base, state: 'empty', missing: r.shortfalls.length ? r.shortfalls : [`no records for ${r.expected} expected`], detail: { ...r } }
    }
    if (r.shortfalls.length === 0 && r.withRecord >= r.expected) {
      return { ...base, state: 'complete', detail: { ...r } }
    }
    return { ...base, state: 'partial', missing: r.shortfalls, detail: { ...r } }
  }

  // An unrecognised slot kind. Doctrine 7 — preserved, reported, never a crash
  // and never silently complete.
  return { ...base, state: 'partial', missing: [`unrecognised slot kind "${slot.kind}"`] }
}

/**
 * Per-section rollup — **derived from slots, never stored separately.**
 *
 * §3: one state, many views. Two places holding the same truth is two places to
 * drift, and the one that drifts is always the summary.
 */
export function rollUp(slots: SlotAssessment[]): {
  state: SlotState
  complete: number
  partial: number
  empty: number
  notApplicable: number
} {
  const counted = slots.filter((s) => s.state !== 'n-a-narrative')
  const complete = counted.filter((s) => s.state === 'complete').length
  const partial = counted.filter((s) => s.state === 'partial').length
  const empty = counted.filter((s) => s.state === 'empty').length
  const notApplicable = counted.filter((s) => s.state === 'not-applicable').length

  let state: SlotState = 'complete'
  if (counted.length === 0) state = 'n-a-narrative'
  else if (counted.length === notApplicable) state = 'not-applicable'
  else if (partial > 0 || (empty > 0 && complete > 0)) state = 'partial'
  else if (empty > 0 && complete === 0) state = 'empty'

  return { state, complete, partial, empty, notApplicable }
}

/**
 * §3's gap list — **required slots that are applicable and not complete, each
 * naming what specifically is short.**
 *
 * A narrative slot can never reach this list: §0.4 makes it unrequired and
 * `n-a-narrative`, and both exclusions are asserted rather than assumed.
 */
export const gapList = (slots: SlotAssessment[]): SlotAssessment[] =>
  slots.filter((s) => s.required && s.applicable && s.state !== 'complete' && s.state !== 'n-a-narrative')
