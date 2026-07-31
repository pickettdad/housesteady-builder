/**
 * The property's visits, in the order they happened in the house.
 *
 * **Extracted from `outstandingSince` when §1d's discontinuity display needed
 * the same thing.** Two modules deriving a visit order independently is the
 * shape rule 4 forbids — the producer of an ordering should have one place to be
 * right, and *"which visit came before which"* is the kind of question that gets
 * two answers quietly.
 *
 * ---
 *
 * **Chronology is the walk, not the upload.** The sort key is the manifest's
 * `session.startedAt` where there is one and `imports.imported_at` where there is
 * not. A baseline walked in March and imported in June happened before a monthly
 * walked in April, and import order gets that backwards.
 *
 * Those are two different clocks in one key, which is not ideal and is the best
 * available: a visit with no session start has no walk instant at all, and its
 * import timestamp is the only chronology the record holds. **Where the two
 * orders disagree, `sortedByImport` marks which entries were placed on the weaker
 * clock and `warnings` says so** — absorbed silently, it would decide a client
 * sentence with nothing to point at.
 */

import type { Db } from '../db/index.js'
import { walkedAtByVisit } from './walkedAt.js'

/** One visit on the property's record, in the order it happened. */
export interface VisitPoint {
  visitId: string
  kind: string | null
  /** From the manifest's session start. Null where no import for it carries one. */
  date: string | null
  /** The instant this visit sorts on: the walk where known, the import where not. */
  sortAt: string
  /** True when `sortAt` is an import timestamp rather than a walk. */
  sortedByImport: boolean
}

export interface Sequence {
  visits: VisitPoint[]
  /**
   * True when the earliest visit on record is a `baseline`.
   *
   * A baseline is a property's first visit by definition, so a record starting
   * at one reaches all the way back. A record starting at a `monthly` had visits
   * this database never saw — which is the difference between *"open since your
   * March visit"* and *"open at least as long as this record goes."*
   */
  reachesBack: boolean
  /** Position of each visit id, for callers walking the sequence by index. */
  indexOf: Map<string, number>
  warnings: string[]
}

/** Every visit with at least one import on this property, oldest walk first. */
export function visitSequence(db: Db, propertyId: string): Sequence {
  const warnings: string[] = []
  const walks = walkedAtByVisit(db, propertyId)

  const rows = db
    .prepare(
      `SELECT v.id, v.kind, MIN(i.imported_at) AS first_import
         FROM visits v JOIN imports i ON i.visit_id = v.id
        WHERE i.property_id = ? GROUP BY v.id`,
    )
    .all(propertyId) as { id: string; kind: string | null; first_import: string }[]

  const visits: VisitPoint[] = rows
    .map((v) => {
      const walked = walks.get(v.id)
      return {
        visitId: v.id,
        kind: v.kind,
        date: walked?.date ?? null,
        sortAt: walked?.startedAt ?? v.first_import,
        sortedByImport: !walked?.startedAt,
      }
    })
    .sort((a, b) => (a.sortAt < b.sortAt ? -1 : a.sortAt > b.sortAt ? 1 : a.visitId < b.visitId ? -1 : 1))

  // Two clocks in one sort key. Where they order the visits differently, the
  // sentence a person reads depends on which one won, so it is said out loud.
  const byImport = [...rows]
    .sort((a, b) => (a.first_import < b.first_import ? -1 : a.first_import > b.first_import ? 1 : a.id < b.id ? -1 : 1))
    .map((v) => v.id)
  if (visits.some((v, i) => v.visitId !== byImport[i])) {
    warnings.push(
      'the visits on this property sort differently by walk date than by import order, and this ' +
        'sequence follows the walk — a baseline walked in March and imported in June happened before a ' +
        'monthly walked in April. Reported because the two are different clocks.',
    )
  }

  const first = visits[0]
  const reachesBack = first?.kind === 'baseline'
  if (first && !reachesBack) {
    warnings.push(
      `this property's earliest visit on record is \`${first.kind ?? 'unknown'}\`, not \`baseline\`, so ` +
        'the record may not reach the first visit.',
    )
  }
  const strayBaseline = visits.findIndex((v) => v.kind === 'baseline')
  if (strayBaseline > 0) {
    warnings.push(
      `a visit of kind \`baseline\` sits at position ${strayBaseline + 1} of ${visits.length} in this ` +
        'property\'s sequence rather than first. A baseline is a property\'s first visit by definition, ' +
        'so either the sequence or the kind is wrong — neither is guessed at here.',
    )
  }

  return {
    visits,
    reachesBack,
    indexOf: new Map(visits.map((v, i) => [v.visitId, i])),
    warnings,
  }
}
