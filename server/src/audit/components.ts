/**
 * The component type graph, per import.
 *
 * Two jobs, both from the spec, both about the same question — *does this thing
 * satisfy that expectation*:
 *
 *   §1b · **Binding is a graph walk, not string equality.** If `water-softener`
 *   inherits from `water-treatment`, a §7 expectation for `water-treatment` is
 *   satisfied by a softener pin. String equality would report every softener in
 *   every visit as a gap that isn't one.
 *
 *   §1h.2 · **Fail open has three branches, not two.** A stub — declared, ids
 *   reserved, no items — passes a name check and can never satisfy a
 *   checklist-based expectation. Silently counting it as "declared" makes it
 *   look resolved when it is not.
 *
 * **Built from the import's OWN config snapshot, never from the binder schema.**
 * The schema records what the current field master declares; an import records
 * what its own config declared at capture time. Applying today's inheritance to
 * a two-versions-old export is precisely the mistake that produced confident
 * wrong answers during the schema reconciliation — a stale reference reads
 * exactly like a real finding. The reference export is v1.2.1 and declares no
 * component inheritance at all, and an empty graph is the correct answer for it.
 */

import type { Db } from '../db/index.js'

/** §1h.2's three states. A stub is not a weaker `typed`. */
export type TypeState = 'typed' | 'stub' | 'undeclared'

export interface ComponentGraph {
  /** Every component type this config declares, at any state. */
  declared: ReadonlySet<string>
  state: (type: string) => TypeState
  /** Direct parent, if the config declares one. */
  parentOf: (type: string) => string | undefined
  /** `type` and every ancestor, nearest first. Includes the type itself. */
  lineage: (type: string) => string[]
  /**
   * Does a pin of `candidate` satisfy an expectation written for `expected`?
   *
   * True when they are the same type or when `candidate` descends from
   * `expected`. Never the other way round: a `water-treatment` pin does not
   * satisfy an expectation that specifically wants a `water-softener`.
   */
  satisfies: (candidate: string, expected: string) => boolean
  /** Config defects worth surfacing rather than absorbing. Usually empty. */
  anomalies: string[]
}

interface ComponentEntry {
  types?: unknown
  stub?: unknown
  items?: unknown
  inherits?: unknown
  note?: unknown
}

/**
 * Read the graph out of a config snapshot.
 *
 * Takes the parsed snapshot rather than a database handle so it is testable
 * against a literal, and so the same function serves an import already stored
 * and a manifest being examined.
 */
export function componentGraph(snapshot: Record<string, unknown>): ComponentGraph {
  const entries = Array.isArray(snapshot.componentLists) ? (snapshot.componentLists as ComponentEntry[]) : []

  const declared = new Set<string>()
  const states = new Map<string, TypeState>()
  const parents = new Map<string, string>()
  const anomalies: string[] = []

  for (const entry of entries) {
    const types = Array.isArray(entry?.types) ? (entry.types as unknown[]).filter((t): t is string => typeof t === 'string') : []
    const hasItems = Array.isArray(entry?.items) && (entry.items as unknown[]).length > 0
    const flaggedStub = entry?.stub === true

    // The config carries both signals. Where they disagree the entry is
    // surfaced rather than silently resolved — a type flagged as a stub that
    // ships items, or a non-stub with none, is a config defect and the builder
    // is not the place to decide which half is right.
    if (flaggedStub && hasItems) anomalies.push(`${types.join(', ')} is flagged stub but declares items`)
    if (!flaggedStub && !hasItems) anomalies.push(`${types.join(', ')} declares no items and is not flagged stub`)

    const state: TypeState = flaggedStub || !hasItems ? 'stub' : 'typed'
    for (const t of types) {
      declared.add(t)
      states.set(t, state)
    }

    // Inheritance arrived at field master v1.5.1. Older snapshots simply have
    // none, and an empty graph is the right answer for them.
    const parent = typeof entry?.inherits === 'string' ? entry.inherits : undefined
    if (parent) for (const t of types) parents.set(t, parent)
  }

  // A declaration may also live at the top level of the snapshot, which is how
  // the current master writes it. Read both; the config decides, not the builder.
  const topLevel = snapshot.componentInheritance
  if (topLevel && typeof topLevel === 'object' && !Array.isArray(topLevel)) {
    for (const [child, parent] of Object.entries(topLevel as Record<string, unknown>)) {
      if (typeof parent === 'string') parents.set(child, parent)
    }
  }

  const lineage = (type: string): string[] => {
    const out: string[] = [type]
    const seen = new Set([type])
    let at = parents.get(type)
    // A cycle in a config is a config defect, not a reason to hang.
    while (at && !seen.has(at)) {
      out.push(at)
      seen.add(at)
      at = parents.get(at)
    }
    if (at) anomalies.push(`inheritance cycle reaching ${at}`)
    return out
  }

  return {
    declared,
    state: (type) => states.get(type) ?? 'undeclared',
    parentOf: (type) => parents.get(type),
    lineage,
    satisfies: (candidate, expected) => lineage(candidate).includes(expected),
    anomalies,
  }
}

/** The graph for a stored import. One query, cached by the caller if needed. */
export function graphForImport(db: Db, importId: string): ComponentGraph {
  const row = db.prepare('SELECT snapshot FROM config_snapshots WHERE import_id = ?').get(importId) as
    | { snapshot: string }
    | undefined
  let snapshot: Record<string, unknown> = {}
  if (row?.snapshot) {
    try {
      snapshot = JSON.parse(row.snapshot) as Record<string, unknown>
    } catch {
      // Never throw reading our own storage back — same instinct as the import
      // path. An unreadable snapshot yields an empty graph, which reports
      // everything as undeclared rather than pretending to know.
      snapshot = {}
    }
  }
  return componentGraph(snapshot)
}

/**
 * How a binding to a component type reports.
 *
 * §1h.2 asks for the three states distinctly, and the wording matters: *declared
 * but not yet answerable* is a different message from *unrecognised name*, and
 * both are different from a valid binding. A person reading a gap report has a
 * different next action for each.
 */
export const describeBinding = (type: string, graph: ComponentGraph): { state: TypeState; note: string } => {
  const state = graph.state(type)
  if (state === 'typed') return { state, note: `${type} is declared and carries checklist items` }
  if (state === 'stub') {
    return {
      state,
      note:
        `${type} is declared but reserves its id only — this config gives it no checklist items, so ` +
        `nothing captured can satisfy an expectation written against it`,
    }
  }
  return {
    state,
    note: `${type} is not declared by this import's config — preserved and reported, never failed over`,
  }
}
