/**
 * Which checklist items were ever due on this property — Increment 4 §3c.
 *
 * **The unresolved half of a gap needs this and nothing else can supply it.**
 * *"Nineteen items in the ensuite have no answer"* is only sayable if you know
 * those nineteen were asked, and that is property flags × zone attributes ×
 * `pin.*` and `house.*` refs × list gates × component inheritance × visit kind.
 *
 * **v4 ships the field's own resolved set and this module reads it.** Computing
 * it here is a second implementation of the field's trigger engine, whose
 * failure mode is silent divergence — two apps disagreeing about whether an item
 * was ever due, with nothing to error. Ratified with the field session
 * 2026-07-30.
 *
 * **v3 does not ship it, so for a v3 import this module computes it** and marks
 * every item `computed`. That is the entire adapter difference. §C3 of the
 * amendment: one thin adapter per manifest version, everything downstream
 * reading this repo's own tables and never knowing which version produced them.
 *
 * ---
 *
 * **Origin is per item, not per set — and the spec's wording needs correcting
 * here.** §3c says the two paths differ only in *"a provenance field that says
 * which"*, singular. But the audit is property-scoped (§1i), so a property with
 * a v3 baseline and a v4 monthly holds both origins at once — and from v4 onward
 * that is the ordinary case, not an edge. A single field on the set would have
 * to lie about one half. So origin rides on each item and the set reports the
 * breakdown, the same discipline as §1g.1's refusal to return a bare count.
 *
 * **Two bounds this module carries and does not paper over.**
 *
 *   `zones[].audit` covers closed zones only, so on a real walk most zones are
 *   absent from it at export time. **It is not a source here** and the computed
 *   path never reads it — the zone-audit oracle compares against it separately,
 *   which is a different question.
 *
 *   The active set is **a snapshot at export time.** A pin created and retired
 *   mid-walk had items due that the set will not show. The event log stays the
 *   record of what happened, and nothing here assumes otherwise.
 */

import type { Db } from '../db/index.js'
import { componentGraph } from './components.js'
import { factsForImport } from './facts.js'
import { composeGate, evaluate, type FactSet } from './triggers.js'
import { inScope, listsForZoneType, type ChecklistItem } from './zoneAudit.js'

/** Where a checklist item was asked. Three scopes, and they are not interchangeable. */
export interface ItemScope {
  kind: string
  zoneId: string | null
  pinId: string | null
}

/**
 * The join key, matching `resolutions` exactly.
 *
 * **Session scope carries no discriminator, deliberately.** A session item is a
 * question about the property asked once per visit, and the latest answer is the
 * answer — the same latest-wins rule `propertyEvidence` applies everywhere else.
 * Keying it per import would make a `deferred` from the baseline permanently
 * unanswerable: visit two would resolve a *different* key and the deferral would
 * sit in the gap list forever, which is the opposite of what deferring means.
 *
 * Zone and pin scope key on the field-minted uuid, which is the cross-visit
 * identity. The same ensuite seen twice is one ensuite.
 */
export const itemScopeKey = (scope: ItemScope): string => {
  if (scope.kind === 'zone') return `zone:${scope.zoneId ?? ''}`
  if (scope.kind === 'pin') return `pin:${scope.pinId ?? ''}`
  if (scope.kind === 'session') return 'session'
  // An unrecognised scope kind is preserved and keyed on its own, never folded
  // into one of the three. Fail open on vocabulary — a scope the builder has not
  // met is still a scope, and dropping it would drop its items.
  return `${scope.kind}:${scope.zoneId ?? scope.pinId ?? ''}`
}

export const activeItemKey = (scope: ItemScope, itemId: string): string =>
  `${itemScopeKey(scope)}/${itemId}`

export type Origin = 'received' | 'computed'

export interface ActiveItem {
  scope: ItemScope
  itemId: string
  tier: string
  /** Which list put it here, so a divergence is traceable to a source. */
  source: string
  /** False when a fail-open decision put it here. Reported, never hidden. */
  certain: boolean
  unrecognised: string[]
  /** The field app's own grouping, where it sent one. Display only. */
  group: string | null
  /** §1c — `proposed` and nothing else is read from here. Null on a computed set. */
  status: string | null
  origin: Origin
  /** The import that first made it due. */
  dueSince: { importId: string; visitId: string | null; at: string }
  /** Where it was asked, in words. For a person, never joined on. */
  where: string
}

export interface ActiveItemSet {
  items: Map<string, ActiveItem>
  /**
   * How many items came from each origin.
   *
   * Named counts rather than a single word, because a mixed property is normal
   * and a set that calls itself `received` while a third of it was computed is
   * the §1g.1 failure in a different costume.
   */
  origins: { received: number; computed: number }
  warnings: string[]
}

const labelFor = (label: string | null, type: string | null, fallback: string): string =>
  label ?? (type ? `the ${type}` : fallback)

/**
 * Every item the property has ever had due, per scope.
 *
 * Walked oldest import first, so `dueSince` records the visit that first asked
 * — which is what makes *"open since the baseline"* sayable rather than
 * *"open"*. A later import re-asking the same item does not reset it.
 */
export function activeItemSet(db: Db, propertyId: string): ActiveItemSet {
  const items = new Map<string, ActiveItem>()
  const warnings: string[] = []
  let received = 0
  let computed = 0

  const imports = db
    .prepare(
      `SELECT i.id, i.visit_id, i.imported_at, v.kind AS visit_kind
         FROM imports i LEFT JOIN visits v ON v.id = i.visit_id
        WHERE i.property_id = ? ORDER BY i.imported_at, i.id`,
    )
    .all(propertyId) as { id: string; visit_id: string | null; imported_at: string; visit_kind: string | null }[]

  for (const imp of imports) {
    const declared = db
      .prepare(
        `SELECT scope_kind, scope_zone_id, scope_pin_id, item_id, item_group, status
           FROM active_items WHERE import_id = ? AND origin = 'received'`,
      )
      .all(imp.id) as {
      scope_kind: string; scope_zone_id: string | null; scope_pin_id: string | null
      item_id: string; item_group: string | null; status: string | null
    }[]

    const found = declared.length > 0
      ? fromReceived(db, imp, declared)
      : fromConfig(db, imp, warnings)

    if (declared.length > 0) received += found.length
    else computed += found.length

    for (const item of found) {
      const key = activeItemKey(item.scope, item.itemId)
      const existing = items.get(key)
      // First due wins for the date; the newest wins for everything else,
      // because the newest import's config is the current definition (§1j).
      items.set(key, existing ? { ...item, dueSince: existing.dueSince } : item)
    }
  }

  /**
   * A visit whose kind the record does not carry.
   *
   * `scope[]` filtering turns on the visit kind, and there is no safe default:
   * guessing `baseline` makes every seasonal item due and guessing `monthly`
   * makes most of them disappear. So the import is skipped for the computed
   * path and the omission is said out loud rather than absorbed.
   */
  if (warnings.length > 0) {
    warnings.unshift('the computed active item set is incomplete — see below')
  }

  return { items, origins: { received, computed }, warnings }
}

/** The field's own set, adopted as-is. */
function fromReceived(
  db: Db,
  imp: { id: string; visit_id: string | null; imported_at: string },
  rows: {
    scope_kind: string; scope_zone_id: string | null; scope_pin_id: string | null
    item_id: string; item_group: string | null; status: string | null
  }[],
): ActiveItem[] {
  const zoneLabels = new Map(
    (db.prepare('SELECT zone_id, label, type FROM zones WHERE import_id = ?').all(imp.id) as
      { zone_id: string; label: string | null; type: string | null }[])
      .map((z) => [z.zone_id, labelFor(z.label, z.type, 'an unnamed zone')]),
  )
  const pinLabels = new Map(
    (db.prepare('SELECT pin_id, number, component_type, freeform_label FROM pins WHERE import_id = ?').all(imp.id) as
      { pin_id: string; number: number; component_type: string | null; freeform_label: string | null }[])
      .map((p) => [p.pin_id, labelFor(p.freeform_label, p.component_type, `pin ${p.number}`)]),
  )

  return rows.map((r) => {
    const scope: ItemScope = { kind: r.scope_kind, zoneId: r.scope_zone_id, pinId: r.scope_pin_id }
    return {
      scope,
      itemId: r.item_id,
      // The field sends ids only, by design — an item body copied across the
      // seam is a second thing that can disagree with the config snapshot, and
      // the config snapshot is already stored. Tier comes from there.
      tier: tierOf(db, imp.id, r.item_id),
      source: 'field',
      certain: true,
      unrecognised: [],
      group: r.item_group,
      status: r.status,
      origin: 'received',
      dueSince: { importId: imp.id, visitId: imp.visit_id, at: imp.imported_at },
      where: r.scope_zone_id
        ? zoneLabels.get(r.scope_zone_id) ?? 'a zone this import does not carry'
        : r.scope_pin_id
          ? pinLabels.get(r.scope_pin_id) ?? 'a pin this import does not carry'
          : 'this visit',
    }
  })
}

/** One item's tier, from the import's own config snapshot. */
function tierOf(db: Db, importId: string, itemId: string): string {
  const row = db.prepare('SELECT snapshot FROM config_snapshots WHERE import_id = ?').get(importId) as
    | { snapshot: string }
    | undefined
  if (!row) return 'standard'
  try {
    const snap = JSON.parse(row.snapshot) as Record<string, unknown>
    for (const item of allItems(snap)) if (item.id === itemId) return item.tier ?? 'standard'
  } catch {
    // A snapshot that will not parse is a structural problem the import path
    // already refused on. Reaching here at all means something else is wrong,
    // and a wrong tier is not the thing to report about it.
  }
  return 'standard'
}

const allItems = (snapshot: Record<string, unknown>): ChecklistItem[] => {
  const out: ChecklistItem[] = []
  const collect = (items: unknown): void => {
    if (Array.isArray(items)) for (const i of items) if (typeof (i as ChecklistItem)?.id === 'string') out.push(i as ChecklistItem)
  }
  for (const key of ['baseLists', 'zoneLists', 'componentLists']) {
    const lists = snapshot[key]
    if (Array.isArray(lists)) for (const entry of lists) collect((entry as { items?: unknown }).items)
  }
  collect(snapshot.sessionItems)
  return out
}

/**
 * The v3 path — worked out from the import's own config snapshot.
 *
 * **A proving exercise, not the production path.** It exists to make the
 * contract executable and to flush out mismatches early, and the zone-audit
 * oracle checks it against the field app's own numbers on every closed zone. The
 * moment v4 arrives this branch stops running for new imports.
 */
function fromConfig(
  db: Db,
  imp: { id: string; visit_id: string | null; imported_at: string; visit_kind: string | null },
  warnings: string[],
): ActiveItem[] {
  if (!imp.visit_kind) {
    warnings.push(
      `import ${imp.id} has no visit, so no visit kind — checklist \`scope\` filtering turns on it and ` +
        'there is no safe default. Its items are not counted as due. §1j allows a visit-less import ' +
        '(a drone run over six properties); this is what that costs the gap stream.',
    )
    return []
  }

  const facts = factsForImport(db, imp.id)
  const snapshot = facts.snapshot
  const graph = componentGraph(snapshot)
  const out: ActiveItem[] = []
  const due = { importId: imp.id, visitId: imp.visit_id, at: imp.imported_at }

  const push = (scope: ItemScope, item: ChecklistItem, source: string, where: string, verdict: { certain: boolean; unrecognised: string[] }): void => {
    out.push({
      scope, itemId: item.id, tier: item.tier ?? 'standard', source,
      certain: verdict.certain, unrecognised: verdict.unrecognised,
      // A computed set has no `proposed` to read: `proposed` means matching
      // evidence exists on a pin and one human tap confirms it, which is a fact
      // about the field app's own state and is exactly the value §1c says this
      // repo cannot reconstruct. Null is the honest answer, not a default.
      group: null, status: null, origin: 'computed', dueSince: due, where,
    })
  }

  // ------------------------------------------------------------- zone scope
  const zones = db
    .prepare('SELECT zone_id, type, label FROM zones WHERE import_id = ?')
    .all(imp.id) as { zone_id: string; type: string | null; label: string | null }[]

  for (const zone of zones) {
    const { lists } = listsForZoneType(snapshot, zone.type)
    const zoneFacts = facts.byZone.get(zone.zone_id) ?? facts.visit
    const seen = new Set<string>()
    const where = labelFor(zone.label, zone.type, 'an unnamed zone')

    for (const list of lists) {
      for (const item of list.items) {
        if (seen.has(item.id)) continue
        if (!inScope(item, imp.visit_kind)) continue
        const verdict = evaluate(composeGate(list.gate, item.trigger ?? null), zoneFacts)
        if (!verdict.applies) continue
        seen.add(item.id)
        push({ kind: 'zone', zoneId: zone.zone_id, pinId: null }, item, list.source, where, verdict)
      }
    }
  }

  // -------------------------------------------------------- component scope
  //
  // §1b of Increment 3: a component list declares `types[]` — plural, one list
  // can serve several — and inherited items keep the parent's id. So a water
  // softener's nameplate item IS `wt.nameplate` and the lineage walk collects
  // the parent's list unchanged rather than rebasing anything.
  //
  // A retired pin's items are not due. Retirement reasons drive inclusion, and
  // a removed water heater is house history rather than an outstanding question.
  const componentLists = Array.isArray(snapshot.componentLists)
    ? (snapshot.componentLists as { types?: unknown; items?: unknown }[])
    : []

  const pins = db
    .prepare(
      `SELECT pin_id, number, component_type, freeform_label FROM pins
        WHERE import_id = ? AND retired_at IS NULL AND component_type IS NOT NULL`,
    )
    .all(imp.id) as { pin_id: string; number: number; component_type: string; freeform_label: string | null }[]

  for (const pin of pins) {
    const zoneFacts = facts.visit
    const seen = new Set<string>()
    const where = labelFor(pin.freeform_label, pin.component_type, `pin ${pin.number}`)
    // Parent first, so the child's own items follow the parent's — the order
    // §1b declares for a rendered list.
    for (const type of [...graph.lineage(pin.component_type)].reverse()) {
      for (const list of componentLists) {
        const types = Array.isArray(list.types) ? (list.types as string[]) : []
        if (!types.includes(type)) continue
        const listItems = Array.isArray(list.items) ? (list.items as ChecklistItem[]) : []
        for (const item of listItems) {
          if (typeof item?.id !== 'string' || seen.has(item.id)) continue
          if (!inScope(item, imp.visit_kind)) continue
          const verdict = evaluate(composeGate(null, item.trigger ?? null), zoneFacts)
          if (!verdict.applies) continue
          seen.add(item.id)
          push({ kind: 'pin', zoneId: null, pinId: pin.pin_id }, item, `component:${type}`, where, verdict)
        }
      }
    }
  }

  // ---------------------------------------------------------- session scope
  const sessionItems = Array.isArray(snapshot.sessionItems) ? (snapshot.sessionItems as ChecklistItem[]) : []
  for (const item of sessionItems) {
    if (typeof item?.id !== 'string') continue
    if (!inScope(item, imp.visit_kind)) continue
    const verdict = evaluate(composeGate(null, item.trigger ?? null), facts.visit)
    if (!verdict.applies) continue
    push({ kind: 'session', zoneId: null, pinId: null }, item, 'session', 'this visit', verdict)
  }

  return out
}

/** Every fact set this module hands the evaluator, for a test that wants to check one. */
export type { FactSet }
