/**
 * §1g.1 — unverifiable provenance must survive aggregation.
 *
 * Master Table I declares, for every value transcribed from a physical artifact,
 * the photo item that captures it. A serial number read off a nameplate is
 * backed by `wh.nameplate`; if that item resolved `na / none-present` **on that
 * pin**, the serial has no photograph behind it and is **unverifiable**.
 *
 * **The failure this exists to prevent is one layer down, not here.** Marking a
 * value unverifiable at read time is easy. The spec's actual worry: *"if that
 * flag is dropped when values roll into a fleet or registry view, an
 * unverifiable install year re-enters looking verified — the exact failure Table
 * I exists to prevent, reintroduced one layer down where nobody is looking."* So
 * the aggregate in this file **cannot** return a bare count. It returns the
 * breakdown, and there is no function here that collapses it.
 *
 * **Two invariants, both from the spec, both easy to get subtly wrong:**
 *
 *   **Provenance is co-visibility on the same pin**, resolved across component
 *   inheritance — *not* global existence of the item somewhere in the config. A
 *   nameplate item declared for water heaters says nothing about whether THIS
 *   water heater's nameplate was photographed.
 *
 *   **The declaration travels.** Every layer that derives, aggregates or renders
 *   a value carries it forward.
 */

import type { ComponentGraph } from './components.js'

/**
 * Three states, not two — and the third is the one that matters.
 *
 * A config that declares no capturing item for a value cannot tell us the value
 * is verified. Reporting it as verified would be the §1g.1 failure committed by
 * omission: a value with no provenance declaration looking exactly like one with
 * a photograph behind it. Same shape as §1h.2's three-branch fail-open, and for
 * the same reason — the missing middle state is where confident wrongness lives.
 */
export type Verification = 'verified' | 'unverifiable' | 'unknown-provenance'

export interface VerifiedValue<T = unknown> {
  /** Which value this is — the field on the record, e.g. `serial`. */
  field: string
  value: T
  verification: Verification
  /** The field checklist item whose photograph backs this value, where declared. */
  capturedBy?: string
  /** Why it is unverifiable or unknown, in words a person can act on. */
  because: string
}

/**
 * How a config declares Table I.
 *
 * Read in more than one shape on purpose. Table I arrived at master v1.9–v1.11
 * and the reference export is config v1.2.1, which declares none of it — so the
 * exact key is not yet observable in a real snapshot, and **committing to one
 * guessed shape would make this silently read nothing the day it arrives in
 * another.** Both plausible shapes are read; neither is invented downstream.
 *
 * Where a config declares nothing, every value is `unknown-provenance` and says
 * so. That is the honest answer and it is deliberately not `verified`.
 */
export function provenanceMap(snapshot: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>()

  // Shape one: a top-level map or list, which is how the master's own table
  // would serialise most directly.
  const declared = snapshot.provenance ?? snapshot.tableI
  if (Array.isArray(declared)) {
    for (const row of declared as Record<string, unknown>[]) {
      const value = row.valueItem ?? row.item ?? row.id
      const photo = row.photoItem ?? row.capturedBy ?? row.photo
      if (typeof value === 'string' && typeof photo === 'string') out.set(value, photo)
    }
  } else if (declared && typeof declared === 'object') {
    for (const [value, photo] of Object.entries(declared as Record<string, unknown>)) {
      if (typeof photo === 'string') out.set(value, photo)
    }
  }

  // Shape two: declared on the item itself, which is how every other per-item
  // rule in this config is declared (`satisfy`, `attest`, `trigger`).
  const walk = (items: unknown): void => {
    if (!Array.isArray(items)) return
    for (const entry of items) {
      const item = entry as Record<string, unknown>
      const id = item.id
      const photo = item.capturedBy ?? item.provenance
      if (typeof id === 'string' && typeof photo === 'string') out.set(id, photo)
    }
  }
  for (const key of ['baseLists', 'zoneLists', 'componentLists']) {
    const lists = snapshot[key]
    if (Array.isArray(lists)) for (const e of lists) walk((e as { items?: unknown }).items)
  }
  walk(snapshot.sessionItems)

  return out
}

/** One pin's resolutions, keyed by field item id. */
export type PinResolutions = Map<string, { kind: string | null; reasonId: string | null }>

export interface VerifyArgs {
  /** The value's own field item id — `wh.serial`, or the record field name. */
  valueItem: string
  field: string
  value: unknown
  /** Table I, from this import's config. */
  provenance: Map<string, string>
  /** Resolutions recorded against THIS pin. Co-visibility, not global existence. */
  pinResolutions: PinResolutions
  /** For resolving the capturing item across component inheritance. */
  graph: ComponentGraph
  /** The pin's component type, for the inheritance walk. */
  componentType: string | null
  /**
   * Which `na` reasons this config marks as recording a finding — a confirmed
   * absence rather than a failure to reach. Read from the config, never guessed.
   */
  recordsFinding: (reasonId: string) => boolean
}

/**
 * Is this value backed by a photograph of the thing it was read from?
 *
 * **Co-visibility on the same pin.** The question is not *does this config have
 * a nameplate item* — it is *was this pin's nameplate photographed*. Those
 * differ on exactly the pin where it matters: the one where the photo item
 * resolved `none-present`.
 */
export function verify(args: VerifyArgs): VerifiedValue {
  const { valueItem, field, value, provenance, pinResolutions, recordsFinding } = args

  const capturedBy = capturingItem(args)
  if (!capturedBy) {
    return {
      field, value,
      verification: 'unknown-provenance',
      because:
        `this config declares no capturing photo item for ${valueItem}, so whether a photograph ` +
        'backs this value cannot be determined — which is not the same as it being verified',
    }
  }

  const resolution = pinResolutions.get(capturedBy)
  if (!resolution) {
    return {
      field, value, capturedBy,
      verification: 'unknown-provenance',
      because: `${capturedBy} has no resolution recorded on this pin, so the photograph is neither confirmed nor ruled out`,
    }
  }

  if (resolution.kind === 'satisfied') {
    return { field, value, capturedBy, verification: 'verified', because: `${capturedBy} was satisfied on this pin` }
  }

  /**
   * `na / none-present` is the case Table I is written for: a confirmed absence
   * of the artifact the value was supposedly read from. The value may still be
   * right — a homeowner may have reported it, a document may name it — but
   * nothing photographic backs it, and that has to keep travelling.
   */
  if (resolution.kind === 'na' && resolution.reasonId && recordsFinding(resolution.reasonId)) {
    return {
      field, value, capturedBy,
      verification: 'unverifiable',
      because: `${capturedBy} was recorded ${resolution.reasonId} on this pin — no photograph backs this value`,
    }
  }

  return {
    field, value, capturedBy,
    verification: 'unverifiable',
    because: `${capturedBy} resolved ${resolution.kind}${resolution.reasonId ? ` / ${resolution.reasonId}` : ''} on this pin, not satisfied`,
  }
}

/**
 * Which photo item captures this value, resolved across component inheritance.
 *
 * §1b — a `water-softener` pin's nameplate item may be declared on
 * `water-treatment`. The declaration is looked up against the value item first,
 * then against the same item id rebased on each ancestor type, because a
 * sub-type inherits its parent's items and therefore its parent's provenance.
 */
function capturingItem(args: VerifyArgs): string | undefined {
  const { valueItem, provenance, graph, componentType } = args

  const direct = provenance.get(valueItem)
  if (direct) return direct

  if (!componentType) return undefined

  // The item id's prefix is its component's, so rebasing means swapping the
  // prefix for an ancestor's. `ws.serial` on a softener inheriting from
  // water-treatment looks for `wt.serial`.
  const suffix = valueItem.includes('.') ? valueItem.slice(valueItem.indexOf('.') + 1) : valueItem
  for (const ancestor of graph.lineage(componentType)) {
    const prefix = prefixFor(ancestor, provenance)
    if (!prefix) continue
    const found = provenance.get(`${prefix}.${suffix}`)
    if (found) return found
  }
  return undefined
}

/**
 * The item-id prefix a component type uses.
 *
 * Derived from the declarations themselves rather than from a table of
 * abbreviations: `water-heater` uses `wh`, and nothing in the config states that
 * mapping, so the only honest source is which prefixes appear beside which
 * types. Where it cannot be derived, the lookup simply does not resolve — and an
 * unresolved lookup reports `unknown-provenance` rather than guessing.
 */
const prefixFor = (componentType: string, provenance: Map<string, string>): string | undefined => {
  // A type whose own items are declared gives its prefix away directly.
  for (const key of provenance.keys()) {
    const prefix = key.slice(0, key.indexOf('.'))
    // Initials of the hyphenated type — `water-heater` → `wh`, `water-treatment`
    // → `wt`. The convention the master uses, checked rather than assumed: if it
    // does not match, nothing resolves and the value reports unknown.
    const initials = componentType.split('-').map((w) => w[0]).join('')
    if (prefix === initials) return prefix
  }
  return undefined
}

// ------------------------------------------------------------- the aggregation

export interface ProvenanceBreakdown {
  verified: number
  unverifiable: number
  unknownProvenance: number
  total: number
  /** Every unverifiable value, named. A count alone cannot be chased. */
  unverifiableValues: VerifiedValue[]
  unknownValues: VerifiedValue[]
}

/**
 * Roll values up **without losing the declaration.**
 *
 * This is the whole of §1g.1. There is deliberately no function in this module
 * that returns a single number for a set of values, because the moment one
 * exists somebody will call it and an unverifiable install year will re-enter a
 * fleet view looking exactly like a photographed one.
 *
 * If a caller wants "how many components have a serial", they get three numbers
 * and the list. Making the honest answer the only available answer is cheaper
 * than remembering to ask for it.
 */
export function aggregate(values: VerifiedValue[]): ProvenanceBreakdown {
  const by = (v: Verification) => values.filter((x) => x.verification === v)
  return {
    verified: by('verified').length,
    unverifiable: by('unverifiable').length,
    unknownProvenance: by('unknown-provenance').length,
    total: values.length,
    unverifiableValues: by('unverifiable'),
    unknownValues: by('unknown-provenance'),
  }
}

/**
 * Merge two breakdowns — the fleet or registry case, stated explicitly.
 *
 * Written so that the aggregation §1g.1 worries about has a correct
 * implementation available. Rolling several properties together keeps every
 * unverifiable value named, because the alternative is the failure the section
 * exists to name.
 */
export const mergeBreakdowns = (parts: ProvenanceBreakdown[]): ProvenanceBreakdown => ({
  verified: parts.reduce((n, p) => n + p.verified, 0),
  unverifiable: parts.reduce((n, p) => n + p.unverifiable, 0),
  unknownProvenance: parts.reduce((n, p) => n + p.unknownProvenance, 0),
  total: parts.reduce((n, p) => n + p.total, 0),
  unverifiableValues: parts.flatMap((p) => p.unverifiableValues),
  unknownValues: parts.flatMap((p) => p.unknownValues),
})

/**
 * The breakdown in words, for anything that renders it.
 *
 * Never *"12 serials recorded"*. Table I exists because that sentence is a lie
 * when three of them have no photograph behind them.
 */
export function describeProvenance(b: ProvenanceBreakdown): string[] {
  if (b.total === 0) return ['no transcribed values']
  const lines = [
    `${b.verified} of ${b.total} value(s) backed by a photograph on the same pin` +
      (b.unverifiable > 0 ? ` · ${b.unverifiable} unverifiable` : '') +
      (b.unknownProvenance > 0 ? ` · ${b.unknownProvenance} provenance undeclared` : ''),
  ]
  for (const v of b.unverifiableValues) lines.push(`  unverifiable — ${v.field}: ${v.because}`)
  for (const v of b.unknownValues) lines.push(`  undeclared — ${v.field}: ${v.because}`)
  return lines
}
