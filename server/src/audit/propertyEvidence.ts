/**
 * Everything a property has accumulated — Increment 3 §1i.
 *
 * **A binder is the property's record, not a visit's.** If the audit evaluates
 * only the current visit's data then on the first monthly run §7's systems
 * inventory reads as empty — every component was captured at the Baseline — and
 * the gap report announces *"no components recorded"* for a house whose furnace
 * has been in the binder for a year. That is the gap report being confidently
 * wrong on its second-ever run, in the one artifact a client reads.
 *
 * So this module is the evaluation's input, and it is keyed on the PROPERTY.
 *
 * **What stays per-import, deliberately.** `facts.ts` and the zone-audit oracle
 * remain scoped to a single import and must: §1h.1 compares a computed summary
 * against the summary *that import* exported, under *that import's* config.
 * Widening it would be comparing against the wrong baseline. Two scopes, both
 * correct, for two different questions.
 *
 * **Currency is a query, not a concept** (§1j). The current state of a pin is
 * its most recent row; the current config is the newest import's. No validity
 * column, no expiry, nothing to keep in step — resolved on read, the same shape
 * as every other piece of evidence here.
 */

import type { Db } from '../db/index.js'
import { componentGraph, type ComponentGraph } from './components.js'
import { noFacts, type FactSet } from './triggers.js'

export interface ImportRow {
  id: string
  visit_id: string | null
  imported_at: string
  producer: string | null
  config_version: string | null
}

/** A pin as the property currently holds it. */
export interface CurrentPin {
  pinId: string
  number: number
  zoneId: string | null
  componentType: string | null
  freeformLabel: string | null
  flag: string | null
  retired: boolean
  /** Which import this state came from — the contribution dimension. */
  importId: string
  visitId: string | null
  at: string
}

/** What is known about one checklist item, across every visit. */
export interface ResolutionState {
  itemId: string
  kind: string | null
  reasonId: string | null
  result: string | null
  importId: string
  visitId: string | null
  at: string

  /**
   * §1k.1 — answered under a config that has since retired the item.
   *
   * **Not unrecognised vocabulary.** It is a valid answer to a question that has
   * since changed, and the two carry opposite implications: unrecognised says
   * the record is malformed, superseded says the question moved. Same class of
   * distinction as broken-binding versus gap.
   */
  supersededSince?: string

  /**
   * §1k.2 — this answer is an EARLIER reading carried forward, because the
   * latest visit could not re-confirm it.
   *
   * Provisional. See `identityPersists`.
   */
  carriedForward?: { since: string; blockedBy: string; blockedAt: string }
}

/**
 * §1k.2 — does this item's answer survive a later "could not reach it"?
 *
 * **The spec asks whether the config declares which items are identity and which
 * are state. It does, under a different name: `attest`.**
 *
 * `attest: 'evidence'` marks an item that CAPTURES something — a nameplate
 * photographed, an age decoded from a serial, a canvas of the room. `attest:
 * 'action'` marks one where the concierge looked and judged — storage
 * conditions, alarm coverage. Every nameplate, age and serial item in the
 * reference config is `evidence`; every state check is `action`.
 *
 * And the rule follows from what the words mean rather than from what they are
 * being used for here: **evidence, once captured, does not un-capture.** A
 * nameplate photographed in January is still photographed in March even if
 * nobody could reach the unit; a judgement made in January is not still true in
 * March. §19's capital plan depends on install dates, and they must not
 * evaporate on a no-access visit.
 *
 * **A counterexample was looked for and not found.** `measure` items are where
 * this should break — a crack width read in January must not read as current in
 * March. Every state-reading measure item is `action` (`fc.width`,
 * `utl.pressure`, `bsm.humidity`, `att.insulation-depth`, `rgh.moisture`) and
 * every label-reading one is `evidence` (`wh.age`, `ft.age`, `app.age`,
 * `apw.hose-age`). So the crack width reverts and the water heater's year
 * persists, correctly, on the same rule. The master's authors drew this line
 * under a different name, which is why it is safe to lean on: a correlation
 * inside one config could be coincidence, and a distinction that survives a
 * search for its counterexample is not.
 *
 * **PROVISIONAL.** The spec routes this to the field session rather than letting
 * the builder invent it, so every value carried forward this way is recorded in
 * the run's warnings naming `attest` as the basis. If the master says otherwise,
 * this is one predicate to change and the warnings say where it was applied.
 */
export const identityPersists = (attest: string | undefined): boolean => attest === 'evidence'

export interface PropertyEvidence {
  propertyId: string
  /** Oldest first. */
  imports: ImportRow[]
  /** The newest import, whose config is the current definition of the vocabulary. */
  latest: ImportRow | undefined
  snapshot: Record<string, unknown>
  graph: ComponentGraph
  /** Property-wide facts. No zone in scope — the audit asks house-level questions. */
  facts: FactSet
  pins: CurrentPin[]
  /** Latest state per checklist item id, across every import. */
  resolutions: Map<string, ResolutionState>
  /**
   * Latest state per (pin, item) — §1g.1.
   *
   * The item-keyed map above cannot answer co-visibility: it says whether
   * `wh.nameplate` was satisfied *somewhere*, and Table I asks whether it was
   * satisfied *on this pin*. Those differ on exactly the pin where it matters —
   * the one whose nameplate was recorded absent.
   */
  pinResolutions: Map<string, Map<string, ResolutionState>>
  /** Zone types walked anywhere on this property, ever. */
  zoneTypes: string[]
  warnings: string[]
}

const parse = <T,>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string') return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

/** One checklist item, as much of it as this module needs. */
export interface ChecklistItem {
  id: string
  attest?: string
  satisfy?: string
}

/** Every checklist item a snapshot declares, keyed by id, across all four list kinds. */
export function itemsOf(snapshot: Record<string, unknown>): Map<string, ChecklistItem> {
  const out = new Map<string, ChecklistItem>()
  const collect = (items: unknown): void => {
    if (!Array.isArray(items)) return
    for (const item of items) {
      const i = item as ChecklistItem
      if (typeof i?.id === 'string') out.set(i.id, i)
    }
  }
  for (const key of ['baseLists', 'zoneLists', 'componentLists']) {
    const lists = snapshot[key]
    if (Array.isArray(lists)) for (const entry of lists) collect((entry as { items?: unknown }).items)
  }
  collect(snapshot.sessionItems)
  return out
}

/**
 * The `na` reasons this config says feed the gap list.
 *
 * **The config decides, not the builder.** A reason that feeds the gap list is a
 * failure to reach; one that does not is a substantive answer. §1k.2 turns on
 * that difference, and hardcoding which reasons are which would make a config
 * that adds one silently mishandled.
 */
const gapFeedingReasons = (snapshot: Record<string, unknown>): Set<string> => {
  const out = new Set<string>()
  const declared = snapshot.naReasons
  if (Array.isArray(declared)) {
    for (const entry of declared as Record<string, unknown>[]) {
      if (entry.feedsGapList === true && typeof entry.id === 'string') out.add(entry.id)
    }
  }
  return out
}

const idsOf = (list: unknown): Set<string> => {
  const out = new Set<string>()
  if (Array.isArray(list)) {
    for (const entry of list) {
      const id = (entry as { id?: unknown })?.id
      if (typeof id === 'string') out.add(id)
    }
  }
  return out
}

export function propertyEvidence(db: Db, propertyId: string): PropertyEvidence {
  const warnings: string[] = []

  const imports = db
    .prepare(
      `SELECT id, visit_id, imported_at, producer, config_version FROM imports
        WHERE property_id = ? ORDER BY imported_at, id`,
    )
    .all(propertyId) as ImportRow[]

  const latest = imports[imports.length - 1]
  const order = new Map(imports.map((row, i) => [row.id, i]))

  // The newest import's config is the current definition. An older import's
  // vocabulary is what governed IT, and the zone oracle still reads it there —
  // but "does this config declare `fur.unit`" is a question about now.
  const snapshot = latest
    ? parse<Record<string, unknown>>(
        (db.prepare('SELECT snapshot FROM config_snapshots WHERE import_id = ?').get(latest.id) as
          { snapshot: string } | undefined)?.snapshot,
        {},
      )
    : {}
  const graph = componentGraph(snapshot)
  const gapFeeding = gapFeedingReasons(snapshot)

  if (imports.length > 1) {
    const versions = [...new Set(imports.map((i) => i.config_version).filter(Boolean))]
    if (versions.length > 1) {
      // Not an error. Captured over months, configs move, and the audit reads
      // the newest — but a person reading a result should know the evidence
      // underneath it was gathered under more than one set of rules.
      warnings.push(
        `this property's ${imports.length} imports span config versions ${versions.join(', ')}; ` +
          `vocabulary is read from the newest (${latest?.config_version ?? 'unknown'})`,
      )
    }
  }

  // ------------------------------------------------------------------- the pins
  //
  // The current row per pin, by field-minted uuid. That uuid is the cross-visit
  // identity — the reason the schema is longitudinal from commit one — so the
  // same water heater seen at the baseline and again in March is ONE pin with a
  // later state, not two pins.
  const pinRows = db
    .prepare(
      `SELECT p.pin_id, p.number, p.zone_id, p.component_type, p.freeform_label, p.flag,
              p.retired_at, p.import_id, i.visit_id, i.imported_at
         FROM pins p JOIN imports i ON i.id = p.import_id
        WHERE p.property_id = ?`,
    )
    .all(propertyId) as {
    pin_id: string; number: number; zone_id: string | null
    component_type: string | null; freeform_label: string | null; flag: string | null
    retired_at: string | null; import_id: string; visit_id: string | null; imported_at: string
  }[]

  const byPin = new Map<string, CurrentPin>()
  for (const r of pinRows) {
    const existing = byPin.get(r.pin_id)
    const rank = order.get(r.import_id) ?? -1
    if (existing && (order.get(existing.importId) ?? -1) >= rank) continue
    byPin.set(r.pin_id, {
      pinId: r.pin_id,
      number: r.number,
      zoneId: r.zone_id,
      componentType: r.component_type,
      freeformLabel: r.freeform_label,
      flag: r.flag,
      // Retirement is read from the CURRENT row. A pin retired in March is
      // retired, and a pin that was retired and re-created is not — the latest
      // state is the answer either way.
      retired: r.retired_at !== null,
      importId: r.import_id,
      visitId: r.visit_id,
      at: r.imported_at,
    })
  }
  const pins = [...byPin.values()].sort((a, b) => a.number - b.number)

  // ------------------------------------------------------------ the resolutions
  //
  // Latest wins per item id, across every import. An item satisfied at the
  // baseline stays satisfied on a monthly run — which is the whole of §1i in one
  // query — and an item later recorded `na / no-access` reverts to that, because
  // the most recent answer is the answer.
  const resolutionRows = db
    .prepare(
      `SELECT r.item_id, r.kind, r.reason_id, r.result, r.import_id, r.scope_pin_id,
              i.visit_id, i.imported_at
         FROM resolutions r JOIN imports i ON i.id = r.import_id
        WHERE r.property_id = ? ORDER BY i.imported_at, r.id`,
    )
    .all(propertyId) as {
    item_id: string; kind: string | null; reason_id: string | null; result: string | null
    import_id: string; scope_pin_id: string | null; visit_id: string | null; imported_at: string
  }[]

  // Every item id each import's OWN config declared, and what it declared about
  // it. §1k.1 needs the recording config, not the current one: an answer is
  // interpreted under the rules it was given under.
  const declaredPerImport = new Map<string, Map<string, ChecklistItem>>()
  for (const row of imports) {
    const snap = parse<Record<string, unknown>>(
      (db.prepare('SELECT snapshot FROM config_snapshots WHERE import_id = ?').get(row.id) as
        { snapshot: string } | undefined)?.snapshot,
      {},
    )
    declaredPerImport.set(row.id, itemsOf(snap))
  }
  const currentItems = itemsOf(snapshot)

  const resolutions = new Map<string, ResolutionState>()
  const pinResolutions = new Map<string, Map<string, ResolutionState>>()
  const superseded: string[] = []
  const carried: string[] = []

  for (const r of resolutionRows) {
    const state: ResolutionState = {
      itemId: r.item_id,
      kind: r.kind,
      reasonId: r.reason_id,
      result: r.result,
      importId: r.import_id,
      visitId: r.visit_id,
      at: r.imported_at,
    }

    // §1k.1 — declared when it was answered, not declared now.
    const recordingConfig = declaredPerImport.get(r.import_id)
    if (!currentItems.has(r.item_id) && recordingConfig?.has(r.item_id)) {
      const version = imports.find((i) => i.id === r.import_id)?.config_version ?? 'an earlier config'
      state.supersededSince = version
      if (!superseded.includes(r.item_id)) superseded.push(r.item_id)
    }

    /**
     * §1k.2 — a later "could not reach it" does not un-capture evidence.
     *
     * The prior reading stands and records that it could not be re-confirmed.
     * Only where the config's own `attest` marks the item as evidence, and only
     * where the blocking answer feeds the gap list — a `none-present` is a
     * substantive finding that genuinely replaces an earlier reading, not a
     * failure to reach.
     */
    const prior = resolutions.get(r.item_id)
    const declaration = recordingConfig?.get(r.item_id) ?? currentItems.get(r.item_id)
    const blocked = r.kind === 'na' && r.reason_id !== null && gapFeeding.has(r.reason_id)

    if (prior?.kind === 'satisfied' && blocked && identityPersists(declaration?.attest)) {
      resolutions.set(r.item_id, {
        ...prior,
        carriedForward: { since: prior.at, blockedBy: r.reason_id!, blockedAt: r.imported_at },
      })
      if (!carried.includes(r.item_id)) carried.push(r.item_id)
      continue
    }

    resolutions.set(r.item_id, state)

    // §1g.1 — the same answer, kept against the pin it was recorded on. Latest
    // wins here too, and for the same reason: the most recent answer is the
    // answer.
    if (r.scope_pin_id) {
      const forPin = pinResolutions.get(r.scope_pin_id) ?? new Map<string, ResolutionState>()
      forPin.set(r.item_id, state)
      pinResolutions.set(r.scope_pin_id, forPin)
    }
  }

  if (superseded.length > 0) {
    warnings.push(
      `${superseded.length} answer(s) were recorded against items this property's current config no longer ` +
        `declares — ${superseded.slice(0, 5).join(', ')}${superseded.length > 5 ? ', …' : ''}. ` +
        'These were answered under a superseded item, not unrecognised vocabulary; the successors are ' +
        'shown to a person and never joined by software.',
    )
  }
  if (carried.length > 0) {
    warnings.push(
      `${carried.length} value(s) were carried forward past a later "could not reach it" — ` +
        `${carried.slice(0, 5).join(', ')}${carried.length > 5 ? ', …' : ''}. ` +
        'Classified as identity rather than state by the config\'s own `attest: evidence`. ' +
        'PROVISIONAL — pending confirmation from the field session that attest is the right declaration.',
    )
  }

  // ------------------------------------------------------------------ the facts
  //
  // Flags come from the newest import that declares any. Where imports disagree
  // the difference is RECORDED rather than resolved — §1's rule for intake
  // against manifest, applied to the same question across time. A flag that
  // vanished between visits is either a corrected mistake or a dropped fact, and
  // the builder is not the thing that decides which.
  const flagRows = db
    .prepare(
      `SELECT s.flags, s.import_id FROM session_meta s JOIN imports i ON i.id = s.import_id
        WHERE i.property_id = ? ORDER BY i.imported_at, s.import_id`,
    )
    .all(propertyId) as { flags: string | null; import_id: string }[]

  const flagSets = flagRows.map((r) => new Set(parse<string[]>(r.flags, []).filter((f) => typeof f === 'string')))
  const property = flagSets[flagSets.length - 1] ?? new Set<string>()
  const everSet = new Set(flagSets.flatMap((s) => [...s]))
  const dropped = [...everSet].filter((f) => !property.has(f))
  if (dropped.length > 0) {
    warnings.push(
      `property flags ${dropped.join(', ')} were declared by an earlier import and not by the latest; ` +
        'the latest is used and the difference is recorded rather than reconciled',
    )
  }

  // A pin of a sub-type answers a question about its parent — §1b, upward only.
  const pinsAnywhere = new Set<string>()
  for (const p of pins) {
    if (p.retired || !p.componentType) continue
    for (const t of graph.lineage(p.componentType)) pinsAnywhere.add(t)
  }

  const facts: FactSet = {
    ...noFacts(),
    property,
    propertyVocabulary: idsOf(snapshot.propertyFlags),
    zoneVocabulary: idsOf(snapshot.zoneAttributes),
    componentVocabulary: graph.declared,
    pinsAnywhere,
    // No zone and no zone-scoped pins: the audit asks house-level questions, and
    // a `pin.*` condition here is honestly unknown rather than false. §1e.2.
    zone: null,
    pinsHere: null,
  }

  const zoneTypes = (
    db.prepare(
      `SELECT DISTINCT z.type FROM zones z JOIN imports i ON i.id = z.import_id
        WHERE i.property_id = ? AND z.type IS NOT NULL`,
    ).all(propertyId) as { type: string }[]
  ).map((z) => z.type)

  return {
    propertyId, imports, latest, snapshot, graph, facts, pins, resolutions, pinResolutions,
    zoneTypes, warnings,
  }
}

/** Every checklist item id the current config declares, across all four list kinds. */
export function declaredItemIds(snapshot: Record<string, unknown>): Set<string> {
  const ids = new Set<string>()
  const collect = (items: unknown): void => {
    if (!Array.isArray(items)) return
    for (const item of items) {
      const id = (item as { id?: unknown })?.id
      if (typeof id === 'string') ids.add(id)
    }
  }
  for (const key of ['baseLists', 'zoneLists', 'componentLists']) {
    const lists = snapshot[key]
    if (Array.isArray(lists)) for (const entry of lists) collect((entry as { items?: unknown }).items)
  }
  collect(snapshot.sessionItems)
  return ids
}

/**
 * Which zone types' checklists would ever ask about this item — from the config.
 *
 * §1's shutoff items live in a utility room, a basement, outside. On a two-room
 * capture none of those rooms exist, and *"nothing captured for the main water
 * shutoff"* then reads as **the concierge missed it** — a different problem with
 * a different fix, and the gap report is the one place a false implication
 * reaches a client.
 *
 * Derived from the config, never a hardcoded list of room names. The question
 * *"which rooms would be asked this"* has an exact answer in `zoneLists[]`,
 * `baseLists[]` and `zoneTypes[].inherits`, and reading it there means a config
 * that moves an item to a different room is followed rather than second-guessed.
 */
export function zoneTypesDeclaring(snapshot: Record<string, unknown>, itemId: string): string[] {
  const declares = (entry: unknown): boolean => {
    const items = (entry as { items?: unknown })?.items
    return Array.isArray(items) && items.some((i) => (i as { id?: unknown })?.id === itemId)
  }

  const zoneLists = Array.isArray(snapshot.zoneLists) ? (snapshot.zoneLists as Record<string, unknown>[]) : []
  const baseLists = Array.isArray(snapshot.baseLists) ? (snapshot.baseLists as Record<string, unknown>[]) : []
  const zoneTypes = Array.isArray(snapshot.zoneTypes) ? (snapshot.zoneTypes as Record<string, unknown>[]) : []

  const out = new Set<string>()

  // Declared directly on a zone type's own list.
  for (const entry of zoneLists) {
    if (declares(entry) && typeof entry.zoneType === 'string') out.add(entry.zoneType)
  }

  // Declared on a base list, which reaches every zone type inheriting it.
  const bases = baseLists.filter(declares).map((b) => b.id).filter((id): id is string => typeof id === 'string')
  if (bases.length > 0) {
    for (const zt of zoneTypes) {
      const inherits = Array.isArray(zt.inherits) ? (zt.inherits as string[]) : []
      if (inherits.some((b) => bases.includes(b)) && typeof zt.id === 'string') out.add(zt.id)
    }
  }

  return [...out].sort()
}

/**
 * Why an item has nothing behind it, distinguishing two very different causes.
 *
 * *"no zone whose checklist covers this was walked"* is a coverage fact about
 * the visit. *"nothing captured"* is a statement about the concierge. Only the
 * first is true of a two-room capture, and saying the second would be the same
 * class of error as the binding report's bare 100%.
 *
 * Returns undefined when the item is a component-scoped or session-scoped
 * question, where zone coverage is not the explanation.
 */
export function unwalkedNote(evidence: PropertyEvidence, pinnedBy: string | undefined): string | undefined {
  if (!pinnedBy) return undefined
  const wanted = zoneTypesDeclaring(evidence.snapshot, pinnedBy)
  if (wanted.length === 0) return undefined

  const walked = new Set(evidence.zoneTypes)
  if (wanted.some((t) => walked.has(t))) return undefined

  return `no ${wanted.join(' or ')} zone has been walked on this property — ` +
    `this item is asked there, so it has not been reached rather than missed`
}
