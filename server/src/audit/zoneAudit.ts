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
 */

import type { Db } from '../db/index.js'
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
  /** Resolutions scoped to THIS ZONE only. Pin-scoped rows are a different question. */
  zoneResolutions: { item_id: string; kind: string | null }[]
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

  return {
    zoneId: args.zoneId,
    zoneType: args.zoneType,
    coreUnresolved: unresolved.filter((i) => i.tier === 'core').map((i) => i.id).sort(),
    standardUnresolved: unresolved.filter((i) => i.tier !== 'core').length,
    naCount: args.zoneResolutions.filter((r) => r.kind === 'na').length,
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

  return zones.map((z) => {
    const computed = computeZoneAudit({
      snapshot: f.snapshot,
      facts: f.byZone.get(z.zone_id) ?? f.visit,
      zoneId: z.zone_id,
      zoneType: z.type,
      visitKind,
      zoneResolutions: byZone.get(z.zone_id) ?? [],
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
