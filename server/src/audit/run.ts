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
import { bindVisit, type BindingReport, type ItemBinding } from './binding.js'
import {
  assessItem, assessSlot, gapList, naReasonsOf, rollUp,
  type ItemAssessment, type SlotAssessment, type SlotEvidence,
} from './completeness.js'
import { componentGraph } from './components.js'
import { factsForImport, type VisitFacts } from './facts.js'
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
}

/** Coverage items, assessed from the binding report and the visit's resolutions. */
function coverageItems(slot: Slot, bindings: ItemBinding[], facts: VisitFacts, naReasonIds: Map<string, string>): ItemAssessment[] {
  const naReasons = naReasonsOf(facts.snapshot)
  const forSlot = new Map(bindings.filter((b) => b.slotId === slot.id).map((b) => [b.itemId, b]))

  return (slot.items ?? []).map((item) => {
    const binding = forSlot.get(item.id)
    // The `na` a resolution recorded against the field item this binding pins
    // by. Read through the binding rather than guessed at from the item id:
    // the schema's item and the field's item are different vocabularies and
    // only the binding knows how they line up.
    const pinnedBy = item.binding?.pinnedBy
    return assessItem({
      item,
      facts: facts.visit,
      naReasons,
      evidence: {
        bound: binding?.state === 'bound',
        short: binding?.state === 'candidate-short' ? binding.unresolvedItems : [],
        brokenRefs: binding?.state === 'broken-binding' ? binding.brokenRefs : undefined,
        naReasonId: pinnedBy ? naReasonIds.get(pinnedBy) : undefined,
      },
    })
  })
}

/**
 * Every `na` reason recorded in this visit, by field item id.
 *
 * Last write wins where an item was answered at more than one scope, which is
 * the same rule `resolutions[]` itself follows — it is a projection of the event
 * log, resolves minus reopens, and the array is the state.
 */
function naReasonsByItem(db: Db, importId: string): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT item_id, reason_id FROM resolutions
        WHERE import_id = ? AND kind = 'na' AND reason_id IS NOT NULL ORDER BY id`,
    )
    .all(importId) as { item_id: string; reason_id: string }[]
  return new Map(rows.map((r) => [r.item_id, r.reason_id]))
}

export function runAudit(args: {
  db: Db
  propertyId: string
  visitId: string
  importId: string
  visitKind: string
  actorId: string
  schema?: LoadedSchema
  profile?: LoadedProfile
}): AuditResult {
  const { db, propertyId, visitId, importId, visitKind, actorId } = args
  const schema = args.schema ?? loadSchema()
  const profile = args.profile ?? loadProfile(schema)

  const facts = factsForImport(db, importId)
  const graph = componentGraph(facts.snapshot)
  const binding = bindVisit({ db, importId, schema, facts, graph })
  const naIds = naReasonsByItem(db, importId)

  const warnings: string[] = []
  const provenance = provenanceOf(schema, profile)
  if (provenance.versionMismatch) warnings.push(provenance.versionMismatch)
  if (graph.anomalies.length > 0) warnings.push(...graph.anomalies.map((a) => `config: ${a}`))
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
  const derived: Slot[] = []

  for (const slot of schema.slots) {
    if (slot.kind === 'derived') { derived.push(slot); continue }

    const applies = evaluate(slot.appliesWhen ?? 'always', facts.visit)
    if (!applies.certain) {
      warnings.push(`${slot.id}: applicability uncertain — ${applies.unrecognised.join(', ')} not declared`)
    }

    const evidence: SlotEvidence = {}
    const unwired = unwiredNote(slot)
    if (unwired) evidence.noSourceWired = unwired

    if (slot.kind === 'coverage' && !unwired) {
      evidence.items = coverageItems(slot, allBindings, facts, naIds)
      // A coverage slot the schema declares with no items has nothing to read
      // yet; say which rather than reporting a bare empty.
      if (evidence.items.length === 0) {
        evidence.noSourceWired = `no items declared for this slot in schema ${schema.version}`
      }
    }
    if (slot.kind === 'narrative') {
      evidence.narrative = { entries: countEntries(db, slot, { visitId, importId }) }
    }
    if (slot.kind === 'record-set' && !unwired) {
      evidence.records = recordSetEvidence(db, importId, slot)
    }

    assessed.set(slot.id, assessSlot({
      slot, classification: profile.classify(slot.id), applicable: applies.applies, evidence,
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
    property: [...facts.visit.property].sort(),
    propertyVocabulary: [...facts.visit.propertyVocabulary].sort(),
    pinsAnywhere: [...facts.visit.pinsAnywhere].sort(),
    visitKind,
    disagreements: facts.disagreements,
  }

  const runId = newId()
  const at = now()
  db.transaction(() => {
    db.prepare(
      `INSERT INTO audit_runs (id, property_id, visit_id, import_id, schema_version, schema_hash,
         profile_id, profile_version, profile_hash, visit_kind, trigger_facts, binding_report,
         warnings, run_at, actor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      runId, propertyId, visitId, importId, provenance.schemaVersion, provenance.schemaHash,
      provenance.profileId, provenance.profileVersion, provenance.profileHash, visitKind,
      JSON.stringify(triggerFacts), JSON.stringify(binding), JSON.stringify(warnings), at, actorId, at,
    )
    const insert = db.prepare(
      `INSERT INTO audit_slots (audit_run_id, section_id, slot_id, kind, applicable, required, state, missing, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const s of slots) {
      insert.run(
        runId, schema.sectionOf(s.slotId)?.id ?? '', s.slotId, s.kind,
        s.applicable ? 1 : 0, s.required ? 1 : 0, s.state,
        JSON.stringify(s.missing), JSON.stringify(s.detail),
      )
    }
  })()

  return { runId, provenance, slots, sections, gaps: gapList(slots), binding, warnings, triggerFacts }
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
 * What a record-set has against what it expects.
 *
 * §7's components are keyed by the field-minted uuid, so the expectation set is
 * the live typed pins and the records are the same pins — which makes it
 * complete by construction today. That is honest rather than useless: the
 * shortfall arrives with `recordFields`, once nameplate values and documents
 * are bound to records, and the shape is here so that lands as data rather than
 * a rewrite.
 */
function recordSetEvidence(db: Db, importId: string, slot: Slot): { expected: number; withRecord: number; shortfalls: string[] } {
  if (slot.id !== 's7.components') {
    // Every other record-set is keyed on something this builder does not hold
    // yet — lab results, concerns (Increment 5, gated on v4), programs.
    return { expected: 0, withRecord: 0, shortfalls: [] }
  }
  const pins = db.prepare(
    `SELECT COUNT(*) AS n FROM pins
      WHERE import_id = ? AND retired_at IS NULL AND component_type IS NOT NULL`,
  ).get(importId) as { n: number }
  return { expected: pins.n, withRecord: pins.n, shortfalls: [] }
}

/** The most recent run for a visit, read back from storage rather than recomputed. */
export function latestRun(db: Db, visitId: string): { run: Record<string, unknown>; slots: Record<string, unknown>[] } | undefined {
  const run = db
    .prepare('SELECT * FROM audit_runs WHERE visit_id = ? ORDER BY run_at DESC, id DESC LIMIT 1')
    .get(visitId) as Record<string, unknown> | undefined
  if (!run) return undefined
  const slots = db
    .prepare('SELECT * FROM audit_slots WHERE audit_run_id = ? ORDER BY section_id, slot_id')
    .all(run.id) as Record<string, unknown>[]
  return { run, slots }
}
