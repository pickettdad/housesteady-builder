/**
 * The review queue — Increment 5 §7, the freeform-label input.
 *
 * **The named failure:** *the class list is written once from imagination and
 * never grows, because the evidence that it should grow sits in the exports and
 * nobody counts it.*
 *
 * Freeform pin labels are the purest case of that. They have been **exported
 * verbatim and flagged since the Manifest Contract was written**, and nothing has
 * ever aggregated them. Measured across the two real exports in this repo:
 *
 * | label | walk | reference |
 * |---|---:|---:|
 * | `Receptacle` | 2 | 6 |
 * | `Ceiling light` · `Return` | — | 1 each |
 * | `Floor` · `Zone notes` · `Ceiling stains` | 1 each | — |
 *
 * **Eight receptacles across two houses is the frame telling you something**, and
 * it is the shape §7 predicts: *the first ten houses are when the frame is
 * emptiest and the proposals most numerous. That is the harvest, not the
 * warm-up.*
 *
 * ## What this does not do, deliberately
 *
 * **It proposes nothing and decides nothing.** A freeform label is a candidate
 * for a class, and several of these plainly are not one — `Ceiling stains` is a
 * concern about the house, `Zone notes` is a note, `Return` is already inside the
 * merged `register` class. Sorting those is a human reading, and the queue's job
 * is to put the evidence in front of that reading rather than to pre-empt it.
 *
 * **Retired pins are counted and marked, never dropped.** The reason a concierge
 * retired a pin is data — a label that keeps being typed and keeps being retired
 * is a different signal from one that sticks — and doctrine 6 forbids the silent
 * drop either way.
 */

import type { Db } from '../db/index.js'

export interface LabelProposal {
  /** Verbatim, exactly as the field app sent it. Never normalised for storage. */
  label: string
  /** How many pins carry it, live and retired together. */
  count: number
  retired: number
  /** Distinct properties it has appeared at — the number that matters most. */
  properties: number
  /** Every pin, so a human can go and look at the photographs. */
  pins: { pinId: string; propertyId: string; importId: string; retired: boolean }[]
}

export interface LabelReview {
  proposals: LabelProposal[]
  note: string
}

/**
 * Group every freeform pin label the database holds.
 *
 * **Grouping is case- and whitespace-insensitive; display is verbatim.** The same
 * discipline the repo already holds for extraction — normalise at query time,
 * never at write time, because the write is where the original is lost. So
 * `receptacle` and `Receptacle ` count as one proposal, and the label shown is
 * the one that appears most often, with ties broken by first sight.
 *
 * **A property count of one is a different fact from a count of one.** Six
 * receptacles in a single house is one concierge's habit; the same label at three
 * houses is a gap in the frame. Both are reported and neither is ranked away.
 */
export function freeformLabelProposals(db: Db, opts: { propertyId?: string } = {}): LabelReview {
  const rows = db
    .prepare(
      `SELECT p.pin_id, p.property_id, p.import_id, p.freeform_label, p.retired_at
         FROM pins p
        WHERE p.freeform_label IS NOT NULL
          AND TRIM(p.freeform_label) <> ''
          ${opts.propertyId ? 'AND p.property_id = ?' : ''}`,
    )
    .all(...(opts.propertyId ? [opts.propertyId] : [])) as {
    pin_id: string
    property_id: string
    import_id: string
    freeform_label: string
    retired_at: string | null
  }[]

  const groups = new Map<
    string,
    { seen: Map<string, number>; pins: LabelProposal['pins']; properties: Set<string>; retired: number }
  >()

  for (const r of rows) {
    const key = r.freeform_label.trim().toLowerCase().replace(/\s+/g, ' ')
    let g = groups.get(key)
    if (!g) {
      g = { seen: new Map(), pins: [], properties: new Set(), retired: 0 }
      groups.set(key, g)
    }
    g.seen.set(r.freeform_label, (g.seen.get(r.freeform_label) ?? 0) + 1)
    g.properties.add(r.property_id)
    if (r.retired_at) g.retired += 1
    g.pins.push({
      pinId: r.pin_id,
      propertyId: r.property_id,
      importId: r.import_id,
      retired: Boolean(r.retired_at),
    })
  }

  const proposals: LabelProposal[] = [...groups.values()].map((g) => {
    // Most-seen spelling wins; the map preserves first-sight order for ties.
    let label = ''
    let best = -1
    for (const [text, n] of g.seen) {
      if (n > best) {
        best = n
        label = text
      }
    }
    return {
      label,
      count: g.pins.length,
      retired: g.retired,
      properties: g.properties.size,
      pins: g.pins,
    }
  })

  // Across houses first, then volume, then alphabetical so the order is stable.
  proposals.sort(
    (a, b) => b.properties - a.properties || b.count - a.count || a.label.localeCompare(b.label),
  )

  return {
    proposals,
    note:
      proposals.length === 0
        ? 'No freeform labels. On an empty database that is an empty run rather than a clean frame — the distinction is rule 11, and this queue is at its most productive when the frame is emptiest.'
        : `${proposals.length} distinct labels across ${rows.length} pins. ` +
          `${proposals.filter((p) => p.properties > 1).length} appear at more than one property, which is the number worth reading first.`,
  }
}
