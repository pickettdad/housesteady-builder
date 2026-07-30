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

/** One Table I row, as the config emits it. */
export interface ProvenanceRow {
  /** The derived value's own item id. */
  itemId: string
  /** The photo item it was read off. */
  sourceItemId: string
  /** The master's own prose for the relationship. Human-facing. */
  derivedFrom?: string
}

/**
 * Table I, from `config.snapshot.provenance`.
 *
 * **The key and its three columns are confirmed by the field session** —
 * `itemId` (the derived value), `sourceItemId` (the photo item it was read off),
 * `derivedFrom` (prose, human-facing). Top-level in the snapshot, beside
 * `propertyFlags`, `zoneAttributes`, `naReasons` and `layers`.
 *
 * An earlier version of this read three other shapes as well, because the key
 * was unknown and guessing one would have made the reader silently find nothing
 * the day the real one arrived. **All three are now deleted.** A speculative
 * read path that survives past the answer is not caution — it is an untested
 * branch that will never run and will be maintained forever by people who
 * assume it must be there for a reason.
 *
 * **Eight rows at master v1.11, six at v1.10 — a growing list.** Nothing here
 * counts them, and nothing should: a count that was right once becomes a check
 * that fails on the next master, which trains people to update the number
 * rather than read the reason.
 */
export function provenanceMap(snapshot: Record<string, unknown>): Map<string, ProvenanceRow> {
  const out = new Map<string, ProvenanceRow>()
  const declared = snapshot.provenance
  if (!Array.isArray(declared)) return out

  for (const entry of declared as Record<string, unknown>[]) {
    const itemId = entry.itemId
    const sourceItemId = entry.sourceItemId
    if (typeof itemId !== 'string' || typeof sourceItemId !== 'string') continue
    out.set(itemId, {
      itemId,
      sourceItemId,
      derivedFrom: typeof entry.derivedFrom === 'string' ? entry.derivedFrom : undefined,
    })
  }
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
  provenance: Map<string, ProvenanceRow>
  /** Resolutions recorded against THIS pin. Co-visibility, not global existence. */
  pinResolutions: PinResolutions
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

  /**
   * A direct lookup, and inheritance needs no special handling.
   *
   * §1b: *"the child's rendered list is the parent's items followed by its own,
   * and ids stay globally unique."* So a water-softener pin's nameplate item IS
   * `wt.nameplate` — the parent's id, unchanged — and the Table I row is keyed
   * on it. An earlier version rebased ids across the type graph by guessing a
   * prefix from the type's initials. That was scaffolding built without the
   * declaration's shape, and the rule it was working around does not exist.
   */
  const row = provenance.get(valueItem)
  const capturedBy = row?.sourceItemId
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

  // The master's own words where it has them. Rule 4 again: the producer wrote
  // the relationship down, so quoting it beats paraphrasing it — and if the
  // wording ever needs to change, it changes in one place, upstream.
  const relationship = row?.derivedFrom ? `${row.derivedFrom} (${capturedBy})` : capturedBy

  if (resolution.kind === 'satisfied') {
    return { field, value, capturedBy, verification: 'verified', because: `${relationship} was satisfied on this pin` }
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
      because: `${relationship} was recorded ${resolution.reasonId} on this pin — no photograph backs this value`,
    }
  }

  return {
    field, value, capturedBy,
    verification: 'unverifiable',
    because: `${relationship} resolved ${resolution.kind}${resolution.reasonId ? ` / ${resolution.reasonId}` : ''} on this pin, not satisfied`,
  }
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
