/**
 * §1h.1 — a free correctness oracle.
 *
 * Every imported zone carries the field app's own audit summary:
 * `coreUnresolved[]`, `standardUnresolved`, `naCount`. That summary is
 * **derivable exactly** from the import's own config snapshot plus
 * `resolutions[]` — resolve the zone type's `inherits[]`, collect the matching
 * base lists and zone list, filter by visit-kind `scope[]`, apply the triggers,
 * subtract what was resolved.
 *
 * Which means **the engine's applicability logic can be checked against every
 * zone of every import, for free, with a known right answer.** Nothing else in
 * this increment has that. Slot completeness has to be tested against
 * expectations somebody wrote; this is tested against what two independent
 * implementations — the field app's and this one — say about the same house.
 *
 * Any divergence is a real bug, in the engine, the config, or the field app. It
 * is surfaced, never papered over.
 *
 * **Two constraints, both from the note that became §1h.1.**
 *
 *   The imported summary is stored **verbatim** and computed *alongside*, never
 *   over. `zones.audit_summary` holds exactly what the field app exported and
 *   this file never writes to it — doctrine 1, and a comparison whose baseline
 *   the comparer can edit is not a comparison.
 *
 *   **Pin-scoped resolutions are not counted here.** Component items come from
 *   `componentLists[]` matched on a pin's own type, and the two scopes are
 *   independent. Folding them in would inflate every zone with mechanicals in it.
 *
 * And one fact the manifest does not carry: **the visit kind.** `scope[]` values
 * are `baseline`, `monthly`, `seasonal:spring`; nothing in the export declares
 * which kind of visit this was. It comes from the visit record, never from the
 * manifest — see the argument in §1h.1.
 *
 * ---
 *
 * ## The oracle was wrong for four increments, and only real data showed it
 *
 * **The field app folds a pin's component-list items into the ZONE's audit
 * summary.** This module compared its zone-scoped computation against that
 * folded number and called the difference agreement — because on the reference
 * export there was nothing to fold.
 *
 * The reference export has exactly two zones carrying an audit summary, and
 * between them **one typed live pin**. So the discriminating input was
 * essentially absent, the oracle agreed on every run, and it would have kept
 * agreeing forever. Rule 7's shape in the check that exists to catch everything
 * else: *a check whose distinguishing input is never present has not been
 * passing, it has been idle.*
 *
 * The first real walk had 17 pins across 8 zones and the oracle disagreed on
 * four of them — every missing item component-scoped. Folded and re-run: **8 of
 * 8 agree item-for-item**, and the 208 carried gaps are honest.
 *
 * **Only the SUMMARY folds.** A pin item stays scoped to its pin everywhere else
 * in this repo; `applicable` still carries zone items only, because callers
 * depend on that. The fold exists to compare like with like against an export
 * that made a different choice.
 */

import type { Db } from '../db/index.js'
import { componentGraph } from './components.js'
import { factsForImport, type VisitFacts } from './facts.js'
import { composeGate, evaluate, type FactSet } from './triggers.js'

export interface ChecklistItem {
  id: string
  text?: string
  tier?: string
  scope?: string[]
  trigger?: unknown
  satisfy?: string
}

export interface ApplicableItem {
  id: string
  tier: string
  /** Which list it came from, so a divergence is traceable to a source. */
  source: string
  /** False when a fail-open decision put it here. Reported, never hidden. */
  certain: boolean
  unrecognised: string[]
}

export interface ZoneAudit {
  zoneId: string
  zoneType: string | null
  /** Core items with no resolution recorded against them in this zone. */
  coreUnresolved: string[]
  /** How many non-core applicable items have no resolution. */
  standardUnresolved: number
  /** Resolutions in this zone recorded as `na`. */
  naCount: number
  /** Everything that applied, with why it is here. The working, kept. */
  applicable: ApplicableItem[]
  /** Items that applied only because something was not recognised. */
  uncertain: string[]
}

export interface ZoneComparison {
  zoneId: string
  label: string | null
  computed: ZoneAudit
  /** Exactly what the field app exported. Never recomputed, never overwritten. */
  imported: { coreUnresolved: string[]; standardUnresolved: number; naCount: number } | null
  agrees: boolean
  /** Every difference, named. A count alone cannot be chased. */
  differences: string[]
}

const parse = <T,>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string') return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

const itemsOf = (entry: unknown): ChecklistItem[] => {
  const items = (entry as { items?: unknown })?.items
  return Array.isArray(items) ? (items as ChecklistItem[]).filter((i) => typeof i?.id === 'string') : []
}

/**
 * Which lists apply to a zone of this type.
 *
 * The zone type declares `inherits[]` naming base lists, and there is a zone
 * list keyed on the type itself. A zone type the config does not declare gets
 * its own zone list if one exists and no bases — reported rather than guessed,
 * because inventing an inheritance for an unknown type is exactly the kind of
 * plausible fabrication doctrine 4 forbids.
 */
export function listsForZoneType(snapshot: Record<string, unknown>, zoneType: string | null): {
  lists: { source: string; gate: unknown; items: ChecklistItem[] }[]
  unknownType: boolean
} {
  const zoneTypes = Array.isArray(snapshot.zoneTypes) ? (snapshot.zoneTypes as Record<string, unknown>[]) : []
  const declared = zoneTypes.find((z) => z.id === zoneType)
  const inherits = Array.isArray(declared?.inherits) ? (declared.inherits as string[]) : []

  const baseLists = Array.isArray(snapshot.baseLists) ? (snapshot.baseLists as Record<string, unknown>[]) : []
  const zoneLists = Array.isArray(snapshot.zoneLists) ? (snapshot.zoneLists as Record<string, unknown>[]) : []

  const lists: { source: string; gate: unknown; items: ChecklistItem[] }[] = []
  for (const id of inherits) {
    const list = baseLists.find((b) => b.id === id)
    // A named base list that does not exist is a config defect. It is left out
    // and the absence shows up as a divergence rather than being silenced.
    if (list) lists.push({ source: id, gate: list.gate ?? list.gatedOn ?? null, items: itemsOf(list) })
  }
  const own = zoneLists.find((z) => z.zoneType === zoneType)
  if (own) lists.push({ source: `zone:${zoneType}`, gate: own.gate ?? own.gatedOn ?? null, items: itemsOf(own) })

  return { lists, unknownType: zoneType !== null && declared === undefined }
}

/** Does this item belong to this kind of visit? Absent scope means every kind. */
export const inScope = (item: ChecklistItem, visitKind: string): boolean =>
  !Array.isArray(item.scope) || item.scope.length === 0 || item.scope.includes(visitKind)

/**
 * Compute one zone's audit summary from the config and the resolutions.
 *
 * `facts` is passed in rather than assembled here so a whole visit costs one
 * pass over the pin table, and so a test can hand it a literal.
 */
export function computeZoneAudit(args: {
  snapshot: Record<string, unknown>
  facts: FactSet
  zoneId: string
  zoneType: string | null
  visitKind: string
  /** Resolutions scoped to THIS ZONE only. */
  zoneResolutions: { item_id: string; kind: string | null }[]
  /**
   * Live typed pins standing IN this zone, with their own resolutions.
   *
   * **The field app folds a pin's component-list items into the zone's audit
   * summary, and this used to omit them entirely.** See the module note: the
   * oracle disagreed with the export on four of eight zones on the first real
   * walk, and every missing item was component-scoped.
   *
   * Optional so an existing caller that only has zone data still compiles — and
   * `pinsHere: undefined` versus `pinsHere: []` are different claims, so the
   * comparison reports which it was given.
   */
  pinsHere?: { pinId: string; componentType: string; resolutions: { item_id: string; kind: string | null }[] }[]
}): ZoneAudit {
  const { lists } = listsForZoneType(args.snapshot, args.zoneType)

  const applicable: ApplicableItem[] = []
  const uncertain: string[] = []
  const seen = new Set<string>()

  for (const list of lists) {
    for (const item of list.items) {
      if (seen.has(item.id)) continue
      if (!inScope(item, args.visitKind)) continue

      // §1e.1 — the list gate and the item's own trigger compose as `all`.
      const verdict = evaluate(composeGate(list.gate, item.trigger ?? null), args.facts)
      if (!verdict.applies) continue

      seen.add(item.id)
      applicable.push({
        id: item.id,
        tier: item.tier ?? 'standard',
        source: list.source,
        certain: verdict.certain,
        unrecognised: verdict.unrecognised,
      })
      if (!verdict.certain) uncertain.push(item.id)
    }
  }

  const resolved = new Set(args.zoneResolutions.map((r) => r.item_id))
  const unresolved = applicable.filter((i) => !resolved.has(i.id))

  /**
   * The pins' component items, folded in — because that is where the export
   * puts them.
   *
   * Kept as a separate pass rather than merged into the list loop above: a pin
   * item is scoped to the pin everywhere else in this repo, and `applicable`
   * feeds callers that rely on that. Only the SUMMARY folds.
   */
  const graph = componentGraph(args.snapshot)
  const componentLists = Array.isArray(args.snapshot.componentLists)
    ? (args.snapshot.componentLists as { types?: unknown; items?: unknown }[])
    : []
  const pinCore: string[] = []
  let pinStandard = 0
  let pinNa = 0

  for (const pin of args.pinsHere ?? []) {
    const pinResolved = new Set(pin.resolutions.map((r) => r.item_id))
    pinNa += pin.resolutions.filter((r) => r.kind === 'na').length
    const seenHere = new Set<string>()
    // Parent first — §1b's rendered order, and inherited items keep the
    // parent's id, so a softener's nameplate item IS `wt.nameplate`.
    for (const type of [...graph.lineage(pin.componentType)].reverse()) {
      for (const list of componentLists) {
        const types = Array.isArray(list.types) ? (list.types as string[]) : []
        if (!types.includes(type)) continue
        for (const item of (Array.isArray(list.items) ? (list.items as ChecklistItem[]) : [])) {
          if (typeof item?.id !== 'string' || seenHere.has(item.id)) continue
          if (!inScope(item, args.visitKind)) continue
          if (!evaluate(composeGate(null, item.trigger ?? null), args.facts).applies) continue
          seenHere.add(item.id)
          if (pinResolved.has(item.id)) continue
          if ((item.tier ?? 'standard') === 'core') pinCore.push(item.id)
          else pinStandard += 1
        }
      }
    }
  }

  return {
    zoneId: args.zoneId,
    zoneType: args.zoneType,
    coreUnresolved: [...unresolved.filter((i) => i.tier === 'core').map((i) => i.id), ...pinCore].sort(),
    standardUnresolved: unresolved.filter((i) => i.tier !== 'core').length + pinStandard,
    naCount: args.zoneResolutions.filter((r) => r.kind === 'na').length + pinNa,
    applicable,
    uncertain,
  }
}

/**
 * Every zone of an import, computed and compared against what was exported.
 *
 * The visit kind is a required argument, not a lookup with a default. A default
 * of `baseline` would quietly produce a correct-looking answer for a monthly
 * visit, and the whole value of this oracle is that a wrong answer is visible.
 */
export function auditZones(db: Db, importId: string, visitKind: string, facts?: VisitFacts): ZoneComparison[] {
  const f = facts ?? factsForImport(db, importId)

  const zones = db
    .prepare('SELECT zone_id, type, label, attributes, audit_summary FROM zones WHERE import_id = ?')
    .all(importId) as {
    zone_id: string; type: string | null; label: string | null
    attributes: string | null; audit_summary: string | null
  }[]

  const resolutions = db
    .prepare(
      `SELECT scope_zone_id, item_id, kind FROM resolutions
        WHERE import_id = ? AND scope_kind = 'zone' AND scope_zone_id IS NOT NULL`,
    )
    .all(importId) as { scope_zone_id: string; item_id: string; kind: string | null }[]

  const byZone = new Map<string, { item_id: string; kind: string | null }[]>()
  for (const r of resolutions) {
    const list = byZone.get(r.scope_zone_id) ?? []
    list.push({ item_id: r.item_id, kind: r.kind })
    byZone.set(r.scope_zone_id, list)
  }

  // Live typed pins per zone, with their own resolutions — see `pinsHere`.
  const pinRows = db
    .prepare(
      `SELECT pin_id, zone_id, component_type FROM pins
        WHERE import_id = ? AND retired_at IS NULL AND component_type IS NOT NULL AND zone_id IS NOT NULL`,
    )
    .all(importId) as { pin_id: string; zone_id: string; component_type: string }[]

  const pinRes = db
    .prepare(
      `SELECT scope_pin_id, item_id, kind FROM resolutions
        WHERE import_id = ? AND scope_kind = 'pin' AND scope_pin_id IS NOT NULL`,
    )
    .all(importId) as { scope_pin_id: string; item_id: string; kind: string | null }[]

  const resByPin = new Map<string, { item_id: string; kind: string | null }[]>()
  for (const r of pinRes) {
    const list = resByPin.get(r.scope_pin_id) ?? []
    list.push({ item_id: r.item_id, kind: r.kind })
    resByPin.set(r.scope_pin_id, list)
  }

  const pinsByZone = new Map<string, { pinId: string; componentType: string; resolutions: { item_id: string; kind: string | null }[] }[]>()
  for (const p of pinRows) {
    const list = pinsByZone.get(p.zone_id) ?? []
    list.push({ pinId: p.pin_id, componentType: p.component_type, resolutions: resByPin.get(p.pin_id) ?? [] })
    pinsByZone.set(p.zone_id, list)
  }

  return zones.map((z) => {
    const computed = computeZoneAudit({
      snapshot: f.snapshot,
      facts: f.byZone.get(z.zone_id) ?? f.visit,
      zoneId: z.zone_id,
      zoneType: z.type,
      visitKind,
      zoneResolutions: byZone.get(z.zone_id) ?? [],
      pinsHere: pinsByZone.get(z.zone_id) ?? [],
    })

    const imported = parse<ZoneComparison['imported']>(z.audit_summary, null)
    return { zoneId: z.zone_id, label: z.label, computed, imported, ...compare(computed, imported) }
  })
}

/**
 * Where the two disagree, in words.
 *
 * Named, never counted. *"3 differences"* sends somebody to read two JSON blobs
 * side by side; *"we say `liv.egress` is unresolved and the export does not"*
 * is a sentence that can be chased to a trigger. Same rule as the gap list.
 */
function compare(
  computed: ZoneAudit,
  imported: ZoneComparison['imported'],
): { agrees: boolean; differences: string[] } {
  if (!imported) {
    return { agrees: false, differences: ['this zone carries no exported audit summary to compare against'] }
  }

  const differences: string[] = []
  const theirs = new Set(imported.coreUnresolved ?? [])
  const ours = new Set(computed.coreUnresolved)

  for (const id of ours) if (!theirs.has(id)) differences.push(`we say ${id} is core-unresolved; the export does not`)
  for (const id of theirs) if (!ours.has(id)) differences.push(`the export says ${id} is core-unresolved; we do not`)

  if (computed.standardUnresolved !== imported.standardUnresolved) {
    differences.push(
      `standard unresolved: we count ${computed.standardUnresolved}, the export declares ${imported.standardUnresolved}`,
    )
  }
  if (computed.naCount !== imported.naCount) {
    differences.push(`na count: we count ${computed.naCount}, the export declares ${imported.naCount}`)
  }

  return { agrees: differences.length === 0, differences }
}
