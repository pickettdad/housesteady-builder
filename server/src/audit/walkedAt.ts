/**
 * When the house was actually walked.
 *
 * ---
 *
 * **`visits.visit_date` is hand-typed and nothing checks it.**
 *
 * `POST /api/properties/:id/visits` takes `req.body.visitDate ?? null`, and **no
 * import path writes that column at all.** It is a free-text field a person
 * fills in, and it can disagree with the evidence without anything noticing.
 *
 * **It did.** The reference session ran `startedAt 2026-07-25T16:55:14Z` and the
 * Observed Addendum records the export as 2026-07-25. The first signed gap
 * report rendered *"visited 2026-07-24"* — a date that came from a seed script's
 * literal and contradicts the manifest by a day, in a client-facing document,
 * with no path that could have caught it.
 *
 * So: **anything that tells a client or the field app when we were in the house
 * reads the manifest, not the typed field.** A doctrine scan holds it.
 *
 * ---
 *
 * **`startedAt`, not `completedAt`, and the reason is in this very export.**
 *
 * A session can be reopened, and then it has more than one completion. This one
 * reads:
 *
 * > completed 17:41:41 · reopened *"Test ai"* 17:42:11 · completed 17:45:18
 *
 * `completedAt` moves when that happens — it is the last completion, which is
 * when somebody stopped editing rather than when the house was walked.
 * `startedAt` is when the walk began and does not move.
 *
 * ---
 *
 * **The typed field is not deleted, and it is not wrong to have.** A visit
 * booked for next Tuesday genuinely has a date and no manifest. It is simply
 * not evidence, so nothing client-facing may read it.
 */

import type { Db } from '../db/index.js'

export interface Walked {
  /** ISO instant the session began, from the manifest. Null when no import. */
  startedAt: string | null
  /** The date part, for a sentence a person reads. */
  date: string | null
  /**
   * Set when the hand-typed `visits.visit_date` disagrees with the evidence.
   *
   * **Reported rather than silently preferred.** The two are different claims —
   * one is what somebody typed, the other is what the field app recorded — and
   * a disagreement is a fact about the record that somebody should see.
   */
  disagreesWithTyped?: { typed: string; evidence: string }
}

/**
 * When the walk that produced this visit's import began.
 *
 * Earliest session start across the visit's imports: a visit with two imports is
 * one walk that exported twice, and the earlier start is when it began.
 */
export function walkedAt(db: Db, visitId: string): Walked {
  const row = db
    .prepare(
      `SELECT MIN(s.started_at) AS started_at
         FROM session_meta s JOIN imports i ON i.id = s.import_id
        WHERE i.visit_id = ? AND s.started_at IS NOT NULL`,
    )
    .get(visitId) as { started_at: string | null } | undefined

  const startedAt = row?.started_at ?? null
  const date = startedAt ? startedAt.slice(0, 10) : null

  const typed = (db.prepare('SELECT visit_date FROM visits WHERE id = ?').get(visitId) as
    | { visit_date: string | null }
    | undefined)?.visit_date ?? null

  return {
    startedAt,
    date,
    disagreesWithTyped: typed && date && typed.slice(0, 10) !== date
      ? { typed, evidence: date }
      : undefined,
  }
}

/** The same, for every visit on a property. One query rather than one per gap. */
export function walkedAtByVisit(db: Db, propertyId: string): Map<string, Walked> {
  const rows = db
    .prepare(
      `SELECT i.visit_id, MIN(s.started_at) AS started_at, v.visit_date
         FROM session_meta s
         JOIN imports i ON i.id = s.import_id
         JOIN visits v ON v.id = i.visit_id
        WHERE i.property_id = ? AND s.started_at IS NOT NULL
        GROUP BY i.visit_id`,
    )
    .all(propertyId) as { visit_id: string; started_at: string; visit_date: string | null }[]

  return new Map(rows.map((r) => {
    const date = r.started_at.slice(0, 10)
    return [r.visit_id, {
      startedAt: r.started_at,
      date,
      disagreesWithTyped: r.visit_date && r.visit_date.slice(0, 10) !== date
        ? { typed: r.visit_date, evidence: date }
        : undefined,
    }]
  }))
}
