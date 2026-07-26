/**
 * The pass's own lifecycle — starting the sitting, walking into a room, and
 * declaring it finished.
 *
 * None of this is a claim about the house, which is why it is not an overlay.
 * It is the record of an afternoon's work.
 */

import { newId, now, type Db } from '../db/index.js'
import { buildPass, type PassModel } from './read.js'

export class PassRefused extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly outstanding: string[] = [],
  ) {
    super(message)
    this.name = 'PassRefused'
  }
}

export interface PassRow {
  id: string
  property_id: string
  visit_id: string
  mode: string
  started_at: string
  completed_at: string | null
  completed_with_outstanding: string | null
}

export const findPass = (db: Db, visitId: string): PassRow | undefined =>
  db.prepare('SELECT * FROM passes WHERE visit_id = ?').get(visitId) as PassRow | undefined

/**
 * Start the sitting, or return the one already under way.
 *
 * Idempotent on purpose: opening the screen twice, or reloading it, is not a new
 * pass. "Time in pass" would otherwise reset every refresh and the number would
 * mean nothing.
 */
export function startPass(db: Db, visitId: string): PassRow {
  const existing = findPass(db, visitId)
  if (existing) return existing

  const visit = db.prepare('SELECT id, property_id, kind FROM visits WHERE id = ?').get(visitId) as
    | { id: string; property_id: string; kind: string }
    | undefined
  if (!visit) throw new PassRefused('No such visit.', 'pass.no-visit')

  // Spec §1: baseline is the full walk, monthly is mostly what changed — and
  // change detection needs cross-visit identity, so it needs manifest v4. Both
  // therefore get the full walk today, and the row records which was meant.
  const mode = 'full'
  const id = newId()
  db.prepare(
    `INSERT INTO passes (id, property_id, visit_id, mode, started_at, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  ).run(id, visit.property_id, visit.id, mode, now(), now())
  return findPass(db, visitId)!
}

/**
 * Record that the concierge walked into a zone.
 *
 * Appends rather than updating, so a room opened, left, and returned to reads as
 * three visits to it rather than one with a bigger number beside it.
 */
export function openZone(db: Db, visitId: string, zoneId: string): PassRow {
  const pass = startPass(db, visitId)
  const zone = db.prepare('SELECT 1 FROM zones WHERE visit_id = ? AND zone_id = ? LIMIT 1').get(visitId, zoneId)
  if (!zone) throw new PassRefused('This visit has no such zone.', 'pass.no-zone')

  db.prepare('INSERT INTO pass_zone_opens (pass_id, zone_id, at) VALUES (?, ?, ?)').run(pass.id, zoneId, now())
  return pass
}

/**
 * Mark the pass complete.
 *
 * Asked once with work still open, this answers with what is open rather than
 * refusing outright, so the screen can put the question to the concierge. Asked
 * again with force, it closes the pass and stores what was closed over.
 *
 * What is NOT required, deliberately: room-photo assignment (most room photos
 * are context, and requiring assignment would turn the pass into the chore this
 * design exists to avoid) and memory capture (prompted every zone, always
 * skippable).
 *
 * And completion is not a claim about the binder. What must be verified for
 * binder content is the Binder Schema's business in Increment 3; a pass can be
 * complete while the binder is still short.
 */
export function completePass(
  db: Db,
  visitId: string,
  opts: { force?: boolean } = {},
): { pass: PassRow; model: PassModel } {
  const pass = findPass(db, visitId)
  if (!pass) throw new PassRefused('This pass has not been started.', 'pass.not-started')

  const model = buildPass(db, visitId)
  if (!model) throw new PassRefused('No such visit.', 'pass.no-visit')

  // Answers rather than refuses. The first call with work outstanding comes
  // back with what is outstanding, in words, so the screen can ask "5 decisions
  // still open in 3 rooms — complete anyway?". The second call says yes.
  //
  // The concierge is the accountable human here; the software's job is to make
  // sure they know what they are closing over, not to stop them. What they
  // closed over is then part of the record permanently.
  if (!model.progress.complete && !opts.force) {
    throw new PassRefused('This pass is not finished yet.', 'pass.outstanding', model.progress.outstanding)
  }

  if (!pass.completed_at) {
    const at = now()
    const outstanding = model.progress.complete ? null : JSON.stringify(model.progress.outstanding)
    db.transaction(() => {
      db.prepare('UPDATE passes SET completed_at = ?, completed_with_outstanding = ? WHERE id = ?').run(
        at, outstanding, pass.id,
      )
      // The history keeps its own frozen copy, so reopening later cannot erase
      // the fact that this was once closed over open work.
      db.prepare('INSERT INTO pass_events (pass_id, type, at, outstanding, reason) VALUES (?, ?, ?, ?, NULL)')
        .run(pass.id, 'completed', at, outstanding)
    })()
  }
  const updated = findPass(db, visitId)!
  return { pass: updated, model: { ...model, pass: {
    id: updated.id,
    mode: updated.mode,
    startedAt: updated.started_at,
    completedAt: updated.completed_at,
    completedWithOutstanding: parseOutstanding(updated.completed_with_outstanding),
  } } }
}

const parseOutstanding = (s: string | null): string[] | null => {
  if (!s) return null
  try {
    return JSON.parse(s) as string[]
  } catch {
    return null
  }
}

/** Re-open a completed pass — late thoughts are normal and must not need a hack. */
export function reopenPass(db: Db, visitId: string, reason = 'reopened at the desk'): PassRow {
  const pass = findPass(db, visitId)
  if (!pass) throw new PassRefused('This pass has not been started.', 'pass.not-started')
  if (!pass.completed_at) return pass

  // The outstanding note is cleared: once reopened there is nothing being
  // closed over, and leaving the old list on the row would describe a state
  // that is no longer true. The frozen copy in pass_events keeps the history.
  db.transaction(() => {
    db.prepare('UPDATE passes SET completed_at = NULL, completed_with_outstanding = NULL WHERE id = ?')
      .run(pass.id)
    db.prepare('INSERT INTO pass_events (pass_id, type, at, outstanding, reason) VALUES (?, ?, ?, NULL, ?)')
      .run(pass.id, 'reopened', now(), reason)
  })()
  return findPass(db, visitId)!
}

/**
 * A decision recorded after the pass was closed reopens it.
 *
 * Without this the completion record quietly becomes a lie: it says "closed
 * with 5 decisions open" while three of them have since been decided. The
 * figure was true when it was written and the software must keep it true, so
 * either the decision is blocked or the completion is withdrawn — and blocking
 * is the dead control this screen has been avoiding everywhere else.
 *
 * So the pass reopens, with the reason recorded, and the trail reads
 * completed → reopened. No friction, and nothing on the record is false.
 */
export function reopenIfCompleted(db: Db, visitId: string): PassRow | undefined {
  const pass = findPass(db, visitId)
  if (!pass?.completed_at) return pass
  return reopenPass(db, visitId, 'a decision was recorded after the pass was closed')
}

export interface PassEvent {
  type: string
  at: string
  outstanding: string[] | null
  reason: string | null
}

/** Completions and reopenings, oldest first. */
export function passHistory(db: Db, passId: string): PassEvent[] {
  return (
    db.prepare('SELECT type, at, outstanding, reason FROM pass_events WHERE pass_id = ? ORDER BY id').all(passId) as {
      type: string
      at: string
      outstanding: string | null
      reason: string | null
    }[]
  ).map((e) => ({ ...e, outstanding: parseOutstanding(e.outstanding) }))
}
