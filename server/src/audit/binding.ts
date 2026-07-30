/**
 * Deterministic binding, and the measurement that decides whether AI is ever
 * needed here.
 *
 * §1a — **binding is deterministic, and it is a design failure if it isn't.**
 * The schema knows §1's `main-water` item is satisfied by a pin whose component
 * type is a water main carrying the shutoffs layer. That is a lookup, not a
 * judgement. The field config's canonical component types and layer definitions
 * exist precisely so binding does not require inference. *Build the lookup; do
 * not reach for a model to do a join.*
 *
 * **The unmatched rate is a first-class output, not a debug figure.** At 5%,
 * manual binding is trivial and an assist is over-engineering. At 40%, that is
 * not a case for AI — it is a signal the schema's source mappings are wrong, and
 * an assist would paper over the defect and make it permanent. So this module's
 * real product is the report at the bottom of the file, and the binding itself
 * is what produces it.
 *
 * Three things are kept apart that are easy to collapse into one number:
 *
 *   **nothing was captured for this** — no candidate evidence at all
 *   **something was captured but falls short** — a pin exists, its locating photo does not
 *   **this evidence matches nothing** — captured, and no slot wants it
 *
 * Different problems, different fixes, and a single "unmatched" count would send
 * somebody to the wrong one.
 */

import type { ComponentGraph } from './components.js'
import { declaredItemIds, type CurrentPin, type PropertyEvidence } from './propertyEvidence.js'
import { evaluate, type FactSet } from './triggers.js'
import type { Binding, CoverageItem, LoadedSchema, Slot } from './schema.js'

/**
 * One binding reference, which may name alternatives.
 *
 * `utl.floor-drain|utl.cleanout|utl.backwater` is **one entry meaning any of
 * these three**, not an item id containing pipes. §1g.2 records what happens
 * when this is got wrong, in the master's own words: *"a naive cell split drops
 * every such row silently: it produced a phantom stale-id report and a wrong
 * item count that stood for days."*
 *
 * It produced one here too, first run — `drains-cleanouts-backwater` reported as
 * a broken reference against an id that is really three live ones. The check
 * whose entire job is to be believed is the worst place for a false positive, so
 * the escaped form is neutralised BEFORE splitting, exactly as the warning says.
 */
export const alternativesOf = (ref: string): string[] => {
  // An escaped pipe is a literal character, never a separator. Parked on a
  // sentinel that cannot occur in a JSON string id — a space would work for
  // today's ids and quietly corrupt the first one that ever contains one.
  const SENTINEL = '\u0000'
  return ref
    .split('\\|').join(SENTINEL)
    .split('|')
    .map((part) => part.split(SENTINEL).join('|').trim())
    .filter(Boolean)
}

/**
 * A pin as binding sees it — the property's CURRENT state of it.
 *
 * §1i: not the row from one import but the latest row per field-minted uuid, so
 * a water heater captured at the baseline is still bindable in March.
 */
export type Candidate = CurrentPin

export type BindState =
  /** A candidate was found and everything the binding requires is resolved. */
  | 'bound'
  /** Nothing was captured that could satisfy this. */
  | 'no-candidate'
  /** Something was captured; a required field item is unresolved. */
  | 'candidate-short'
  /** The binding names a field item this import's config does not declare. */
  | 'broken-binding'
  /** The item does not apply to this house. */
  | 'not-applicable'

export interface ItemBinding {
  slotId: string
  itemId: string
  label: string
  state: BindState
  /** Pins that satisfied the component type, through inheritance. */
  matched: Candidate[]
  /** Which required field items are not resolved. Named, never counted. */
  unresolvedItems: string[]
  /** Field item ids the import's config does not declare — §1g.2. */
  brokenRefs: string[]
  /** False when a fail-open decision put this item in scope at all. */
  certain: boolean
  unrecognised: string[]
}

export interface UnmatchedEvidence {
  pinId: string
  number: number
  zoneId: string | null
  /** What it is, as the field recorded it. Typeless pins are normal, not corrupt. */
  describedAs: string
  reason: 'no-slot-wants-this-type' | 'typeless' | 'freeform'
}

/**
 * What the numbers have to be read against.
 *
 * A binding report without this is a figure with no denominator. The reference
 * export is two rooms with no utility zone, so *"nothing captured for
 * main-water"* is a fact about which rooms were walked, not about the house or
 * the schema — and a bare 100% unmatched rate reads as a case for AI when it is
 * a case for walking the mechanical room.
 *
 * §1a says the rate decides whether an AI assist is warranted. A decision input
 * that can be misread this badly has to carry its own context.
 */
export interface BindingContext {
  /** The config version this import captured under. */
  configVersion: string
  /** The master version the schema was reconciled against. */
  schemaReconciledAgainst: string
  /** Zone types actually walked. A slot's items live in rooms nobody entered. */
  zoneTypes: string[]
  zoneCount: number
  /**
   * How many imports the evaluation read — §1i.
   *
   * A run that saw one import of four is a different answer from one that saw
   * all four, and without this on the report the two are indistinguishable.
   */
  importsRead: number
  /** Which producers contributed — §1j. One field app today; not forever. */
  producers: string[]
}

export interface BindingReport {
  context: BindingContext
  bound: ItemBinding[]
  noCandidate: ItemBinding[]
  candidateShort: ItemBinding[]
  brokenBindings: ItemBinding[]
  notApplicable: ItemBinding[]
  /** Every pin no slot wanted, listed individually — §1a says never only counted. */
  unmatchedEvidence: UnmatchedEvidence[]
  /** The figure §1a exists to produce. */
  rate: {
    itemsConsidered: number
    itemsApplicable: number
    itemsBound: number
    evidenceConsidered: number
    evidenceBound: number
    evidenceUnmatched: number
    /** Unmatched evidence as a percentage of evidence considered, 1 decimal place. */
    unmatchedPercent: number
  }
}

// --------------------------------------------------------------- the evidence

/**
 * Does this pin satisfy a binding's component type?
 *
 * §1b — **a graph walk, not string equality.** A `water-softener` pin satisfies
 * a `water-treatment` expectation because a softener IS one. Upward only: a
 * generic `water-treatment` pin does not satisfy a binding that asks
 * specifically for a softener.
 *
 * §6 — **an alias never binds.** Only the canonical `component_type` is
 * consulted; a freeform label reading "water softener" is evidence a human must
 * look at, never a match. That is the whole reason freeform pins stay in the
 * unmatched list rather than being helpfully resolved: the unmatched rate is a
 * measurement, and a binder that guesses at labels would corrupt it.
 */
const satisfies = (pin: Candidate, binding: Binding, graph: ComponentGraph): boolean => {
  if (!binding.componentType || !pin.componentType || pin.retired) return false
  return graph.satisfies(pin.componentType, binding.componentType)
}

// ---------------------------------------------------------------- the binding

/**
 * Bind one coverage item.
 *
 * `resolvedItems` is the set of field checklist item ids resolved anywhere in
 * this visit, at any scope. Passed in rather than queried per item because a
 * baseline visit has hundreds of resolutions and twenty-one bindings, and
 * re-reading the table for each would be four hundred queries for a set that
 * cannot change mid-run.
 */
export function bindItem(args: {
  slot: Slot
  item: CoverageItem
  facts: FactSet
  graph: ComponentGraph
  candidates: Candidate[]
  resolvedItems: Set<string>
  /** Every field item id this import's config declares — §1g.2. */
  declaredItems: Set<string>
}): ItemBinding {
  const { slot, item, facts, graph, candidates, resolvedItems, declaredItems } = args
  const binding = item.binding ?? {}

  const verdict = evaluate(item.appliesWhen ?? 'always', facts)
  const base = {
    slotId: slot.id,
    itemId: item.id,
    label: item.label,
    matched: [] as Candidate[],
    unresolvedItems: [] as string[],
    brokenRefs: [] as string[],
    certain: verdict.certain,
    unrecognised: verdict.unrecognised,
  }

  if (!verdict.applies) return { ...base, state: 'not-applicable' }

  /**
   * §1g.2 — **a retired id in a binding fails silently, matching nothing and
   * reporting a gap that is really a broken reference.**
   *
   * Checked before candidates, because a broken reference makes every downstream
   * answer meaningless: `no-candidate` against an item id nothing declares reads
   * as *the house is missing this*, when the truth is *the schema is pointing at
   * something that no longer exists*. Those go to different people.
   */
  const referenced = [binding.pinnedBy, ...(binding.viaItems ?? [])].filter((v): v is string => Boolean(v))
  // A reference is broken only when NONE of its alternatives are declared. Any
  // one of three drain items satisfies the drain binding.
  const brokenRefs = referenced.filter((ref) => !alternativesOf(ref).some((id) => declaredItems.has(id)))
  if (brokenRefs.length > 0) return { ...base, state: 'broken-binding', brokenRefs }

  const matched = candidates.filter((pin) => satisfies(pin, binding, graph))
  if (matched.length === 0) return { ...base, state: 'no-candidate' }

  /**
   * §1c — **bind, do not re-implement.** The locating-photo rule and the 23
   * `.unit` whole-object photo items are already field checklist items, so
   * sufficiency is *were those items resolved*, never a photo check of our own.
   * A second implementation of a rule the config declares is a second thing to
   * keep in step, and it is the copy that drifts.
   */
  const unresolvedItems = (binding.viaItems ?? [])
    .filter((ref) => !alternativesOf(ref).some((id) => resolvedItems.has(id)))
  if (unresolvedItems.length > 0) return { ...base, state: 'candidate-short', matched, unresolvedItems }

  return { ...base, state: 'bound', matched }
}

/**
 * Bind every coverage item in the schema against one import, and measure.
 */
export function bindProperty(args: {
  evidence: PropertyEvidence
  schema: LoadedSchema
  /** The master version the schema was reconciled against, for the report context. */
  reconciledAgainst?: string
}): BindingReport {
  const { evidence, schema } = args
  const { pins: candidates, graph, facts } = evidence

  // Every item resolved anywhere on this property, latest answer wins. An item
  // satisfied at the baseline is still satisfied in March — §1i in one line.
  // §1k.2 — a carried-forward reading still satisfies. `resolutions` already
  // holds the earlier `satisfied` state where the config's `attest` says the
  // value is evidence rather than a judgement, so nothing extra is needed here;
  // the filter is on the answer, not on when it was given.
  const resolvedItems = new Set(
    [...evidence.resolutions.values()].filter((r) => r.kind === 'satisfied').map((r) => r.itemId),
  )
  const declaredItems = declaredItemIds(evidence.snapshot)

  const bindings: ItemBinding[] = []
  for (const slot of schema.slots) {
    for (const item of slot.items ?? []) {
      bindings.push(bindItem({ slot, item, facts, graph, candidates, resolvedItems, declaredItems }))
    }
  }

  const by = (state: BindState): ItemBinding[] => bindings.filter((b) => b.state === state)
  const bound = by('bound')

  // Evidence a slot actually claimed. A pin matched by two items is bound once.
  const boundPins = new Set(bound.concat(by('candidate-short')).flatMap((b) => b.matched.map((m) => m.pinId)))

  const unmatchedEvidence: UnmatchedEvidence[] = candidates
    .filter((pin) => !pin.retired && !boundPins.has(pin.pinId))
    .map((pin) => ({
      pinId: pin.pinId,
      number: pin.number,
      zoneId: pin.zoneId,
      // What the field recorded, in the field's own words. Typeless and freeform
      // pins are a normal visit, not a corrupt file — §11 — so they are
      // described rather than explained away.
      describedAs: pin.componentType ?? pin.freeformLabel ?? 'no type recorded',
      reason: pin.componentType ? 'no-slot-wants-this-type' : pin.freeformLabel ? 'freeform' : 'typeless',
    }))

  const live = candidates.filter((p) => !p.retired)
  const applicable = bindings.filter((b) => b.state !== 'not-applicable')

  return {
    context: {
      configVersion: String(evidence.snapshot.configVersion ?? evidence.latest?.config_version ?? 'unknown'),
      // The version token only. The schema's own field is a full sentence with
      // counts in it, which is right for a schema and unreadable in a report line.
      schemaReconciledAgainst: (String(args.reconciledAgainst ?? schema.raw.reconciledAgainst ?? 'unknown')
        .match(/^[\w-]+ v[\d.]+/) ?? ['unknown'])[0],
      zoneTypes: [...evidence.zoneTypes].sort(),
      zoneCount: evidence.zoneTypes.length,
      importsRead: evidence.imports.length,
      producers: [...new Set(evidence.imports.map((i) => i.producer).filter((p): p is string => Boolean(p)))],
    },
    bound,
    noCandidate: by('no-candidate'),
    candidateShort: by('candidate-short'),
    brokenBindings: by('broken-binding'),
    notApplicable: by('not-applicable'),
    unmatchedEvidence,
    rate: {
      itemsConsidered: bindings.length,
      itemsApplicable: applicable.length,
      itemsBound: bound.length,
      evidenceConsidered: live.length,
      evidenceBound: boundPins.size,
      evidenceUnmatched: unmatchedEvidence.length,
      unmatchedPercent: live.length === 0 ? 0 : Math.round((unmatchedEvidence.length / live.length) * 1000) / 10,
    },
  }
}

/**
 * The report in words.
 *
 * §1a says the rate is a decision input, so it has to be readable without a
 * query. Every unmatched pin is named — *"3 unmatched"* cannot be chased and
 * *"pin 14, freeform 'Receptacle', in the ensuite"* can.
 */
export function describeBinding(report: BindingReport): string[] {
  const { rate, context } = report
  const lines = [
    `config ${context.configVersion} · schema reconciled against ${context.schemaReconciledAgainst}`,
    `${context.importsRead} import(s) read` +
      (context.producers.length ? ` from ${context.producers.join(', ')}` : ''),
    `${context.zoneCount} zone type(s) walked: ${context.zoneTypes.join(', ') || 'none'}`,
    `${rate.itemsBound} of ${rate.itemsApplicable} applicable items bound ` +
      `(${rate.itemsConsidered - rate.itemsApplicable} do not apply to this house)`,
    `${rate.evidenceBound} of ${rate.evidenceConsidered} pins bound to a slot; ` +
      `${rate.evidenceUnmatched} matched nothing (${rate.unmatchedPercent}%)`,
  ]

  if (report.brokenBindings.length > 0) {
    lines.push(
      `${report.brokenBindings.length} binding(s) name a field item this import's config (${context.configVersion}) ` +
        'does not declare. Either the id was retired, or it had not been introduced yet — this import predates ' +
        `${context.schemaReconciledAgainst}. The builder does not decide which: a retirement is a discontinuity ` +
        'by the master\'s own rule, and the successor is shown to a person, never joined by software.',
    )
    for (const b of report.brokenBindings) lines.push(`  ${b.itemId} → ${b.brokenRefs.join(', ')}`)
  }

  if (report.noCandidate.length > 0) {
    lines.push(`nothing captured for ${report.noCandidate.length}: ${report.noCandidate.map((b) => b.itemId).join(', ')}`)
  }
  if (report.candidateShort.length > 0) {
    lines.push('captured but short:')
    for (const b of report.candidateShort) {
      lines.push(`  ${b.itemId} — pin ${b.matched.map((m) => m.number).join(', ')} lacks ${b.unresolvedItems.join(', ')}`)
    }
  }
  if (report.unmatchedEvidence.length > 0) {
    lines.push('evidence matching no slot:')
    for (const e of report.unmatchedEvidence) lines.push(`  pin ${e.number} — ${e.describedAs} (${e.reason})`)
  }
  return lines
}
