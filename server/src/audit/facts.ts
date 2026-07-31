/**
 * Assembling the fact set from this repo's own tables.
 *
 * The evaluator is pure and knows nothing about storage; this is the layer that
 * knows where each fact lives. Nothing here reads manifest JSON — it reads the
 * builder's tables, which is what makes v4 an adapter change rather than a
 * rewrite of the audit engine.
 *
 * **Values and vocabulary come from different places and both are needed.** The
 * session's `flags[]` says which flags are true of this house; the config
 * snapshot's `propertyFlags[]` says which flags exist at all. Without the second
 * there is no way to tell *declared and false* from *never heard of it*, and
 * that distinction is the whole of fail-open.
 */

import type { Db } from '../db/index.js'
import { answersForProperty } from './answers.js'
import { componentGraph, type ComponentGraph } from './components.js'
import { noFacts, type FactSet } from './triggers.js'

const parse = <T,>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string') return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
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

export interface VisitFacts {
  snapshot: Record<string, unknown>
  graph: ComponentGraph
  /** Visit-wide facts: no zone in scope. `zone.*` and `pin.*` are unknown here. */
  visit: FactSet
  /** One fact set per zone, keyed by zone id. */
  byZone: Map<string, FactSet>
  /**
   * Property flags declared by the intake form but not by the session, and the
   * reverse.
   *
   * §1: *"Where the manifest and intake disagree — intake says well, no wellhead
   * pin exists — that disagreement is a gap and a good one. Record both sides;
   * never silently pick."* There is no intake form yet, so this is empty and the
   * shape is here to be filled rather than retrofitted.
   */
  disagreements: { flag: string; sessionSays: boolean; intakeSays: boolean }[]
  /** Anything the fact assembly could not settle. Surfaced, never absorbed. */
  warnings: string[]
  /**
   * §1f — what the recorded-value reader found, and what it did not.
   *
   * Null only where the import has no property, which the schema allows.
   * Otherwise always present, including when it found nothing: *no item records
   * a value*, *none has been answered*, and *the reader is looking in the wrong
   * place* are three different facts behind one empty map.
   */
  answers: import('./answers.js').Answers | null
}

/**
 * Zone attributes that default true for a zone type — Increment 4 §3c.
 *
 * A zone attribute may declare `defaultsTrueFor: [zoneType, …]`, meaning it is
 * true of that kind of room unless the record says otherwise. Without it, an
 * attribute nobody ticked reads as false and every item gated on it silently
 * stops being due.
 *
 * **UNEXERCISED, and it says so.** The reference export carries field config
 * v1.2.1, whose `zoneAttributes[]` declare `id`, `label` and `askAtCreation` and
 * no defaults at all. So this branch has never run against real data, and the
 * warning below exists so the first config that uses it announces itself rather
 * than quietly taking a path nobody has checked. The zone-audit oracle (§1h.1)
 * is what would catch a wrong implementation: it compares this engine's
 * applicability against the field app's own numbers on every closed zone.
 *
 * **An explicit `false` in the record wins.** A default is what to believe in the
 * absence of an answer, and a recorded `false` is an answer.
 */
function defaultedAttributes(
  snapshot: Record<string, unknown>,
  zoneType: string | null,
  recorded: Record<string, unknown>,
): { held: Set<string>; used: string[] } {
  const held = new Set<string>()
  const used: string[] = []
  if (!zoneType) return { held, used }

  const declared = snapshot.zoneAttributes
  if (!Array.isArray(declared)) return { held, used }

  for (const entry of declared as Record<string, unknown>[]) {
    const id = typeof entry.id === 'string' ? entry.id : null
    const defaults = Array.isArray(entry.defaultsTrueFor) ? (entry.defaultsTrueFor as unknown[]) : null
    if (!id || !defaults) continue
    if (!defaults.includes(zoneType)) continue
    if (Object.prototype.hasOwnProperty.call(recorded, id)) continue
    held.add(id)
    used.push(`${id} on ${zoneType}`)
  }
  return { held, used }
}

/**
 * Every fact the evaluator can be asked about, for one import.
 *
 * Assembled once per audit run rather than per slot: a baseline visit has
 * twenty-five zones and forty-one slots, and re-reading the pin table for each
 * pair is a thousand queries for facts that cannot change mid-run.
 */
export function factsForImport(db: Db, importId: string): VisitFacts {
  const configRow = db.prepare('SELECT snapshot FROM config_snapshots WHERE import_id = ?').get(importId) as
    | { snapshot: string }
    | undefined
  const snapshot = parse<Record<string, unknown>>(configRow?.snapshot, {})
  const graph = componentGraph(snapshot)

  const sessionRow = db.prepare('SELECT flags FROM session_meta WHERE import_id = ?').get(importId) as
    | { flags: string | null }
    | undefined
  const property = new Set(parse<string[]>(sessionRow?.flags, []).filter((f) => typeof f === 'string'))

  const propertyVocabulary = idsOf(snapshot.propertyFlags)
  const zoneVocabulary = idsOf(snapshot.zoneAttributes)
  const componentVocabulary = graph.declared

  // A pin of a sub-type answers a question about its parent: a water softener
  // IS a water treatment device, so `house.water-treatment` is true when one is
  // pinned. The walk is upward only — a generic water-treatment pin does not
  // satisfy a question that specifically asks for a softener.
  const expand = (type: string): string[] => graph.lineage(type)

  const pinRows = db
    .prepare(
      `SELECT zone_id, component_type FROM pins
        WHERE import_id = ? AND retired_at IS NULL AND component_type IS NOT NULL`,
    )
    .all(importId) as { zone_id: string | null; component_type: string }[]

  const pinsAnywhere = new Set<string>()
  const pinsByZone = new Map<string, Set<string>>()
  for (const p of pinRows) {
    for (const t of expand(p.component_type)) {
      pinsAnywhere.add(t)
      if (p.zone_id) {
        const set = pinsByZone.get(p.zone_id) ?? new Set<string>()
        set.add(t)
        pinsByZone.set(p.zone_id, set)
      }
    }
  }

  /**
   * §1f — recorded values, for `answer.*` conditions.
   *
   * **Property-scoped, not import-scoped, and deliberately.** A radon result
   * arrives three months after the walk and a permit date comes from a document;
   * an answer that only counted within its own import would make the whole class
   * useless, since the late arrivals are the reason the builder owns it. The
   * property's whole record is the answer set.
   */
  const propertyId = (db.prepare('SELECT property_id FROM imports WHERE id = ?').get(importId) as
    | { property_id: string }
    | undefined)?.property_id
  const recorded = propertyId ? answersForProperty(db, propertyId) : null

  const base = {
    property,
    propertyVocabulary,
    zoneVocabulary,
    componentVocabulary,
    pinsAnywhere,
    answers: recorded?.values ?? new Map<string, unknown>(),
  }

  const visit: FactSet = { ...noFacts(), ...base }

  const byZone = new Map<string, FactSet>()
  const zoneRows = db
    .prepare('SELECT zone_id, type, attributes FROM zones WHERE import_id = ?')
    .all(importId) as { zone_id: string; type: string | null; attributes: string | null }[]

  const warnings: string[] = []
  const defaultsUsed: string[] = []

  for (const z of zoneRows) {
    const attrs = parse<Record<string, unknown>>(z.attributes, {})
    // An attribute present and false is a confident no. Only truthy values
    // become facts; the vocabulary carries the rest.
    const held = new Set(Object.entries(attrs).filter(([, v]) => v === true).map(([k]) => k))

    const defaulted = defaultedAttributes(snapshot, z.type, attrs)
    for (const id of defaulted.held) held.add(id)
    defaultsUsed.push(...defaulted.used)

    byZone.set(z.zone_id, {
      ...base,
      zone: held,
      pinsHere: pinsByZone.get(z.zone_id) ?? new Set<string>(),
    })
  }

  if (defaultsUsed.length > 0) {
    warnings.push(
      `zone attribute defaults were applied for the first time in this repo — ${[...new Set(defaultsUsed)].join(', ')}. ` +
        '`defaultsTrueFor` is absent from the v1.2.1 reference config, so this path has never run against a real ' +
        'export. The zone-audit oracle compares applicability against the field app on every closed zone; check it.',
    )
  }

  // §1f's reader reports whether it found anything and why not. Carried up
  // rather than swallowed: an empty answer set is three different facts.
  if (recorded) warnings.push(...recorded.warnings)

  return { snapshot, graph, visit, byZone, disagreements: [], warnings, answers: recorded }
}
