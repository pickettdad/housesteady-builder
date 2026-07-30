/**
 * Running an audit and storing it — Increment 3 §3.
 *
 * Computed fresh on demand AND stored, so a rendered gap report is
 * reproducible. A client asking in September why their March report said
 * something different gets an answer out of the record rather than a re-run
 * against whatever the schema says today.
 *
 * This module is the only place that knows how the schema's sources map onto
 * this repo's tables. Everything below it — the evaluator, the graph, the
 * binder, the completeness rules — is pure and testable without a database, and
 * everything above it reads `audit_slots` rather than recomputing.
 */

import type { Db } from '../db/index.js'
import { newId, now } from '../db/index.js'
import { bindProperty, type BindingReport, type ItemBinding } from './binding.js'
import {
  assessItem, assessSlot, gapList, naReasonsOf, rollUp,
  type ItemAssessment, type SlotAssessment, type SlotEvidence,
} from './completeness.js'
import { propertyEvidence, unwalkedNote, type PropertyEvidence } from './propertyEvidence.js'
import { countEntries, isSlotReference, unwiredNote } from './sources.js'
import { evaluate } from './triggers.js'
import { loadProfile, loadSchema, provenanceOf, type LoadedProfile, type LoadedSchema, type Slot } from './schema.js'

export class AuditRefused extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'AuditRefused'
  }
}

export interface AuditResult {
  runId: string
  provenance: ReturnType<typeof provenanceOf>
  slots: SlotAssessment[]
  sections: { sectionId: string; number: number; title: string; rollup: ReturnType<typeof rollUp> }[]
  gaps: SlotAssessment[]
  binding: BindingReport
  warnings: string[]
  triggerFacts: Record<string, unknown>
  /** §1i — which visit most recently satisfied each slot, where anything has. */
  contributions: Map<string, Contribution>
}

/**
 * Coverage items, assessed from the binding report and the property's resolutions.
 *
 * The `unwalked` note is the correction the gap list needed. *"Main interior
 * water shutoff — nothing captured"* reads as **the concierge missed it**; on a
 * two-room capture the truth is that no room where that item is ever asked has
 * been walked. Same class of error as the binding report's bare 100%, and the
 * gap report is the one place a false implication reaches a client.
 */
function coverageItems(
  slot: Slot,
  bindings: ItemBinding[],
  evidence: PropertyEvidence,
): { items: ItemAssessment[]; contribution?: Contribution } {
  const naReasons = naReasonsOf(evidence.snapshot)
  const forSlot = new Map(bindings.filter((b) => b.slotId === slot.id).map((b) => [b.itemId, b]))

  const items = (slot.items ?? []).map((item) => {
    const binding = forSlot.get(item.id)
    const pinnedBy = item.binding?.pinnedBy
    const recorded = pinnedBy ? evidence.resolutions.get(pinnedBy) : undefined

    const assessed = assessItem({
      item,
      facts: evidence.facts,
      naReasons,
      evidence: {
        bound: binding?.state === 'bound',
        short: binding?.state === 'candidate-short' ? binding.unresolvedItems : [],
        brokenRefs: binding?.state === 'broken-binding' ? binding.brokenRefs : undefined,
        naReasonId: recorded?.kind === 'na' ? recorded.reasonId ?? undefined : undefined,
        supersededSince: recorded?.supersededSince,
        carriedForward: recorded?.carriedForward,
      },
    })

    // Only where nothing was captured — a shortfall that already names a
    // specific unresolved item does not need this, and stacking both would bury
    // the specific one.
    if (assessed.state === null && assessed.shortBecause === 'nothing captured') {
      const unwalked = unwalkedNote(evidence, pinnedBy)
      if (unwalked) return { ...assessed, shortBecause: unwalked }
    }
    return assessed
  })

  // §1i's contribution dimension: which visit most recently SATISFIED this slot.
  //
  // Only `satisfied` resolutions count. The first version of this took the newest
  // resolution of any kind, which gave an empty slot a contributing visit —
  // "what did this visit change" answered with a visit that changed nothing.
  const satisfying = (slot.items ?? [])
    .map((item) => item.binding?.pinnedBy)
    .filter((id): id is string => Boolean(id))
    .map((id) => evidence.resolutions.get(id))
    .filter((r): r is NonNullable<typeof r> => r?.kind === 'satisfied')
    .sort((a, b) => (a.at < b.at ? 1 : -1))[0]

  return {
    items,
    contribution: satisfying
      ? { visitId: satisfying.visitId, importId: satisfying.importId, at: satisfying.at }
      : undefined,
  }
}

/**
 * §1i — which visit most recently satisfied a slot.
 *
 * *"What did this visit change"* answered without narrowing what the audit sees.
 * Nullable throughout: a slot nothing has satisfied has no answer, and defaulting
 * it to the triggering visit would invent one.
 */
export interface Contribution {
  visitId: string | null
  importId: string
  at: string
}

export function runAudit(args: {
  db: Db
  /** What is evaluated. §1i — the audit is property-scoped. */
  propertyId: string
  /**
   * Which visit TRIGGERED this run, if one did. Never a filter.
   *
   * §1j allows an import with no visit — a drone run covering six properties
   * three weeks after an inspection — so a run may have no triggering visit at
   * all.
   */
  visitId?: string | null
  /** Which import triggered it, likewise. */
  importId?: string | null
  visitKind: string
  actorId: string
  schema?: LoadedSchema
  profile?: LoadedProfile
}): AuditResult {
  const { db, propertyId, visitKind, actorId } = args
  const visitId = args.visitId ?? null
  const importId = args.importId ?? null
  const schema = args.schema ?? loadSchema()
  const profile = args.profile ?? loadProfile(schema)

  // Everything the property has accumulated, across every import. NOT the
  // triggering visit's data — see §1i, and the reason: on the first monthly run
  // a visit-scoped evaluation reads §7 as empty and the gap report announces
  // "no components recorded" for a house whose furnace has been in the binder
  // for a year.
  const evidence = propertyEvidence(db, propertyId)
  const binding = bindProperty({ evidence, schema })

  const warnings: string[] = [...evidence.warnings]
  const provenance = provenanceOf(schema, profile)
  if (provenance.versionMismatch) warnings.push(provenance.versionMismatch)
  if (evidence.graph.anomalies.length > 0) warnings.push(...evidence.graph.anomalies.map((a) => `config: ${a}`))
  for (const b of binding.brokenBindings) {
    warnings.push(`broken binding: ${b.itemId} refers to ${b.brokenRefs.join(', ')}, undeclared in config ${binding.context.configVersion}`)
  }

  const allBindings = [
    ...binding.bound, ...binding.noCandidate, ...binding.candidateShort,
    ...binding.brokenBindings, ...binding.notApplicable,
  ]

  // Two passes: everything that stands alone, then the derived slots that read
  // it. A derived slot is complete when its inputs are (§0.5), so it cannot be
  // assessed until they have been.
  const assessed = new Map<string, SlotAssessment>()
  const contributions = new Map<string, Contribution>()
  const derived: Slot[] = []

  for (const slot of schema.slots) {
    if (slot.kind === 'derived') { derived.push(slot); continue }

    const applies = evaluate(slot.appliesWhen ?? 'always', evidence.facts)
    if (!applies.certain) {
      warnings.push(`${slot.id}: applicability uncertain — ${applies.unrecognised.join(', ')} not declared`)
    }

    const slotEvidence: SlotEvidence = {}
    const unwired = unwiredNote(slot)
    if (unwired) slotEvidence.noSourceWired = unwired

    if (slot.kind === 'coverage' && !unwired) {
      const covered = coverageItems(slot, allBindings, evidence)
      slotEvidence.items = covered.items
      if (covered.contribution) contributions.set(slot.id, covered.contribution)
      // A coverage slot the schema declares with no items has nothing to read
      // yet; say which rather than reporting a bare empty.
      if (slotEvidence.items.length === 0) {
        slotEvidence.noSourceWired = `no items declared for this slot in schema ${schema.version}`
      }
    }
    if (slot.kind === 'narrative') {
      slotEvidence.narrative = { entries: countEntries(db, slot, { propertyId }) }
    }
    if (slot.kind === 'record-set' && !unwired) {
      const records = recordSetEvidence(evidence, slot)
      slotEvidence.records = records.evidence
      if (records.contribution) contributions.set(slot.id, records.contribution)
    }

    assessed.set(slot.id, assessSlot({
      slot, classification: profile.classify(slot.id), applicable: applies.applies, evidence: slotEvidence,
    }))
  }

  /**
   * Derived slots, to a fixed point.
   *
   * They depend on each other — `s2.services-due` reads §15, and
   * `s15.owner-pro-split` reads `s15.custom-schedule`, which is itself derived.
   * A single second pass leaves the outer one reporting *its inputs have not
   * been assessed*, which is a statement about the audit's own ordering
   * masquerading as a fact about the binder.
   *
   * So: repeat until nothing new resolves. Whatever is left is in a cycle, and
   * a cycle is a schema defect that gets named rather than iterated forever.
   */
  let pending = [...derived]
  for (;;) {
    const ready = pending.filter((slot) => inputSlotIds(schema, slot).every((id) => assessed.has(id)))
    if (ready.length === 0) break

    for (const slot of ready) {
      const inputIds = inputSlotIds(schema, slot)
      const evidence: SlotEvidence = inputIds.length === 0
        // No slot-level inputs at all: this one derives from reference data or
        // research, which this builder does not hold. Honestly empty with the
        // reason attached, exactly like any other unwired source — never
        // "waiting on inputs", which would send somebody looking for a slot.
        ? { noSourceWired: externalSourceNote(slot) }
        : { inputs: inputIds.map((id) => assessed.get(id)!.state) }

      assessed.set(slot.id, assessSlot({
        slot, classification: profile.classify(slot.id), applicable: true, evidence,
      }))
    }
    pending = pending.filter((slot) => !assessed.has(slot.id))
  }

  for (const slot of pending) {
    warnings.push(`${slot.id}: its inputs form a cycle in schema ${schema.version} and cannot be resolved`)
    assessed.set(slot.id, assessSlot({
      slot, classification: profile.classify(slot.id), applicable: true,
      evidence: { inputs: [] },
    }))
  }

  const slots = schema.slots.map((s) => assessed.get(s.id)!)
  const sections = schema.sections.map((section) => ({
    sectionId: section.id,
    number: section.number,
    title: section.title,
    rollup: rollUp(section.slots.map((s) => assessed.get(s.id)!)),
  }))

  const triggerFacts = {
    property: [...evidence.facts.property].sort(),
    propertyVocabulary: [...evidence.facts.propertyVocabulary].sort(),
    pinsAnywhere: [...evidence.facts.pinsAnywhere].sort(),
    visitKind,
    // §1i, made visible on the run: what the evaluation actually saw. A result
    // that read one import of four and one that read all four are different
    // answers, and nothing else on the row would tell them apart.
    importsRead: evidence.imports.map((i) => ({
      id: i.id, visitId: i.visit_id, at: i.imported_at,
      producer: i.producer, configVersion: i.config_version,
    })),
    zoneTypesWalked: [...evidence.zoneTypes].sort(),
  }

  const runId = newId()
  const at = now()
  db.transaction(() => {
    db.prepare(
      `INSERT INTO audit_runs (id, property_id, visit_id, import_id, schema_version, schema_hash,
         profile_id, profile_version, profile_hash, visit_kind, trigger_facts, binding_report,
         warnings, imports_read, run_at, actor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      runId, propertyId, visitId, importId, provenance.schemaVersion, provenance.schemaHash,
      provenance.profileId, provenance.profileVersion, provenance.profileHash, visitKind,
      JSON.stringify(triggerFacts), JSON.stringify(binding), JSON.stringify(warnings),
      evidence.imports.length, at, actorId, at,
    )
    const insert = db.prepare(
      `INSERT INTO audit_slots (audit_run_id, section_id, slot_id, kind, applicable, required, state,
         missing, detail, satisfied_by_visit_id, satisfied_by_import_id, satisfied_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const s of slots) {
      // §1i's contribution dimension. Recorded only where something actually
      // satisfied the slot — a fallback to the triggering visit would answer
      // "what did this visit change" with "everything", every time.
      // Recorded only on a slot that is actually satisfied. The column says
      // `satisfied_by`, and a partial or empty slot has not been satisfied by
      // anybody — writing the newest contributor there would make the monthly
      // report claim credit for work that is still outstanding.
      const c = s.state === 'complete' ? contributions.get(s.slotId) : undefined
      insert.run(
        runId, schema.sectionOf(s.slotId)?.id ?? '', s.slotId, s.kind,
        s.applicable ? 1 : 0, s.required ? 1 : 0, s.state,
        JSON.stringify(s.missing), JSON.stringify(s.detail),
        c?.visitId ?? null, c?.importId ?? null, c?.at ?? null,
      )
    }
  })()

  return {
    runId, provenance, slots, sections, gaps: gapList(slots), binding, warnings, triggerFacts,
    contributions,
  }
}

/**
 * Which assessed slots a derived one reads.
 *
 * `sources` naming a section (`s15`) or a slot (`s7.components`) both resolve —
 * the schema uses each form — and anything not shaped like a slot reference is
 * an external input rather than a missing one.
 */
function inputSlotIds(schema: LoadedSchema, slot: Slot): string[] {
  const refs = (slot.sources ?? []).filter(isSlotReference)
  return schema.slots
    .map((s) => s.id)
    .filter((id) => refs.some((ref) => id === ref || id.startsWith(`${ref}.`)))
}

/** What a derived slot with no slot-level inputs is actually waiting on. */
const externalSourceNote = (slot: Slot): string =>
  unwiredNote(slot) ?? `schema ${slot.id} declares no sources, so nothing can be derived for it`

/**
 * What a record-set has against what it expects — across the whole property.
 *
 * §7's components are keyed by the field-minted uuid, so the expectation set is
 * every live typed pin the property holds, from any visit. **This is the case
 * §1i exists for**: evaluated per-visit, a monthly run would find the pins it
 * captured this month and report a house's whole systems inventory as missing.
 */
function recordSetEvidence(evidence: PropertyEvidence, slot: Slot): {
  evidence: { expected: number; withRecord: number; shortfalls: string[] }
  contribution?: Contribution
} {
  if (slot.id !== 's7.components') {
    // Every other record-set is keyed on something this builder does not hold
    // yet — lab results, concerns (Increment 5, gated on v4), programs.
    return { evidence: { expected: 0, withRecord: 0, shortfalls: [] } }
  }

  const components = evidence.pins.filter((p) => !p.retired && p.componentType !== null)
  const newest = [...components].sort((a, b) => (a.at < b.at ? 1 : -1))[0]

  return {
    evidence: { expected: components.length, withRecord: components.length, shortfalls: [] },
    contribution: newest ? { visitId: newest.visitId, importId: newest.importId, at: newest.at } : undefined,
  }
}

/**
 * The most recent run for a PROPERTY, read back from storage rather than recomputed.
 *
 * Keyed on the property because that is what an audit is about — §1i. A run
 * triggered by one visit is still the property's current answer, and looking it
 * up by visit would miss it entirely for a visit that never triggered one.
 */
export function latestRun(db: Db, propertyId: string): { run: Record<string, unknown>; slots: Record<string, unknown>[] } | undefined {
  const run = db
    .prepare('SELECT * FROM audit_runs WHERE property_id = ? ORDER BY run_at DESC, id DESC LIMIT 1')
    .get(propertyId) as Record<string, unknown> | undefined
  if (!run) return undefined
  const slots = db
    .prepare('SELECT * FROM audit_slots WHERE audit_run_id = ? ORDER BY section_id, slot_id')
    .all(run.id) as Record<string, unknown>[]
  return { run, slots }
}
