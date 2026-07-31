/**
 * When the house was actually walked.
 *
 * ---
 *
 * **The planned date is hand-typed and nothing checks it.**
 *
 * `POST /api/properties/:id/visits` takes `req.body.plannedDate ?? null`, and
 * **no import path writes that column at all.** It is a free-text field a person
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
 * **The column was called `visit_date`, and the rename is half the fix.**
 *
 * Routing every reader through this module stops anyone picking the wrong date
 * today; it leaves a column named `visit_date` holding something that is not the
 * visit date. One field standing for two facts has cost this repo three times —
 * a zone `type` doing a nickname's job, `sinceImportedAt` describing a different
 * import than `since`, and this. Each time the fix was a name.
 *
 * Migration 015 renames it `planned_date`. **Two facts, two names, and no reader
 * able to pick the wrong one.**
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
 * **The planned date is not deleted, and it is not wrong to have.** A visit
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
   * Set when the hand-typed `visits.planned_date` disagrees with the evidence.
   *
   * **Reported rather than silently preferred.** The two are different claims —
   * one is what somebody planned, the other is what the field app recorded — and
   * a disagreement is a fact about the record that somebody should see.
   */
  disagreesWithPlanned?: { planned: string; walked: string }
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

  const planned = (db.prepare('SELECT planned_date FROM visits WHERE id = ?').get(visitId) as
    | { planned_date: string | null }
    | undefined)?.planned_date ?? null

  return {
    startedAt,
    date,
    disagreesWithPlanned: planned && date && planned.slice(0, 10) !== date
      ? { planned, walked: date }
      : undefined,
  }
}

/**
 * What a person typed, under its own name.
 *
 * **The only accessor for it, and it is deliberately not on `Walked`.** A caller
 * wanting the planned date has to ask for the planned date; there is no shape
 * here where reaching for one and getting the other is possible.
 */
export function plannedDate(db: Db, visitId: string): string | null {
  const row = db.prepare('SELECT planned_date FROM visits WHERE id = ?').get(visitId) as
    | { planned_date: string | null }
    | undefined
  return row?.planned_date ?? null
}

/** The same, for every visit on a property. One query rather than one per gap. */
export function walkedAtByVisit(db: Db, propertyId: string): Map<string, Walked> {
  const rows = db
    .prepare(
      `SELECT i.visit_id, MIN(s.started_at) AS started_at, v.planned_date
         FROM session_meta s
         JOIN imports i ON i.id = s.import_id
         JOIN visits v ON v.id = i.visit_id
        WHERE i.property_id = ? AND s.started_at IS NOT NULL
        GROUP BY i.visit_id`,
    )
    .all(propertyId) as { visit_id: string; started_at: string; planned_date: string | null }[]

  return new Map(rows.map((r) => {
    const date = r.started_at.slice(0, 10)
    return [r.visit_id, {
      startedAt: r.started_at,
      date,
      disagreesWithPlanned: r.planned_date && r.planned_date.slice(0, 10) !== date
        ? { planned: r.planned_date, walked: date }
        : undefined,
    }]
  }))
}
