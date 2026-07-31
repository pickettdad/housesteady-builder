/**
 * Desk-work timing — Increment 4 §7.
 *
 * > The effort map in `baseline-v1.json` holds four work classes and
 * > deliberately no hour figures, because they belong to the owner and were to
 * > come from a mock run. **Field timestamps cannot supply them.** They measure
 * > capture; most of the effort map is desk work — rules-generated content, AI
 * > drafts a human signs, the irreducibly human ordering of the top items — and
 * > none of that happens in the field app.
 * >
 * > So: timestamp desk work per section. **This is a column and a pair of
 * > timestamps, not a feature.**
 *
 * Ten houses in, the pricing basis exists without anyone having sat and measured
 * it, and it keeps calibrating as concierges get faster.
 *
 * ---
 *
 * ## What is deliberately absent
 *
 * The spec: *"**Recorded, not specced:** what gets reported from it. Collect
 * first."* So there is **no aggregate, no rate, no total** in this module. It
 * starts a span, stops a span, and lists spans. A caller wanting an average can
 * write one when somebody knows what the average is for.
 *
 * Building the report now would fix the shape of the answer before the first ten
 * houses have said what the question is, which is the whole reason the effort map
 * has no hour figures in it either.
 *
 * ---
 *
 * ## One span per row, and a running span is a fact
 *
 * A column that accumulates cannot be corrected without losing what it was
 * corrected from, and it cannot say a session was interrupted. Spans are
 * append-only, the same discipline as the overlay layer.
 *
 * **Nothing auto-closes a running span.** Somebody who started at four and went
 * home has a row with no end, and that is true. Closing it at midnight, or at the
 * next start, would put a guessed number into the pricing basis wearing the
 * clothes of a measured one — and the whole point of collecting this is that it
 * is measured.
 *
 * **One running span per operator per property**, enforced here rather than by a
 * constraint: two open spans on one desk means one of them is wrong and the
 * database cannot tell which. Starting a second returns the first instead of
 * silently opening another.
 */

import { newId, now, type Db } from '../db/index.js'

export interface DeskSpan {
  id: string
  propertyId: string
  visitId: string | null
  sectionId: string
  workClass: string | null
  startedAt: string
  endedAt: string | null
  note: string | null
  actorId: string
  /**
   * Elapsed milliseconds, **null while running.**
   *
   * Computed on read rather than stored: a stored duration is a second copy of
   * a fact the two timestamps already carry, and the two can disagree. Null
   * rather than "time so far" because a span in progress has no duration yet,
   * and a number that grows every time you look at it is not a measurement.
   */
  elapsedMs: number | null
}

export class DeskWorkRefused extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'DeskWorkRefused'
  }
}

const rowToSpan = (r: Record<string, unknown>): DeskSpan => {
  const startedAt = r.started_at as string
  const endedAt = (r.ended_at as string | null) ?? null
  return {
    id: r.id as string,
    propertyId: r.property_id as string,
    visitId: (r.visit_id as string | null) ?? null,
    sectionId: r.section_id as string,
    workClass: (r.work_class as string | null) ?? null,
    startedAt,
    endedAt,
    note: (r.note as string | null) ?? null,
    actorId: r.actor_id as string,
    elapsedMs: endedAt ? Date.parse(endedAt) - Date.parse(startedAt) : null,
  }
}

/** The span this operator has open on this property, if any. */
export function runningSpan(db: Db, propertyId: string, actorId: string): DeskSpan | null {
  const row = db
    .prepare(
      'SELECT * FROM desk_work WHERE property_id = ? AND actor_id = ? AND ended_at IS NULL ' +
        'ORDER BY started_at DESC LIMIT 1',
    )
    .get(propertyId, actorId) as Record<string, unknown> | undefined
  return row ? rowToSpan(row) : null
}

/**
 * Start timing work on a section.
 *
 * **A second start returns the span already running rather than opening
 * another.** Two open spans on one desk means one of them is wrong and nothing
 * can tell which — and the likely cause is a double-click, which should not cost
 * an hour of the pricing basis.
 */
export function startWork(args: {
  db: Db
  propertyId: string
  sectionId: string
  actorId: string
  visitId?: string | null
  workClass?: string | null
}): { span: DeskSpan; alreadyRunning: boolean } {
  const { db, propertyId, sectionId, actorId } = args

  if (!sectionId.trim()) {
    throw new DeskWorkRefused('A span records which section was worked on.', 'desk-work.no-section')
  }
  if (!db.prepare('SELECT 1 FROM properties WHERE id = ?').get(propertyId)) {
    throw new DeskWorkRefused('No such property.', 'desk-work.no-property')
  }

  const open = runningSpan(db, propertyId, actorId)
  if (open) return { span: open, alreadyRunning: true }

  const id = newId()
  db.prepare(
    `INSERT INTO desk_work (id, property_id, visit_id, section_id, work_class, started_at,
      ended_at, note, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
  ).run(id, propertyId, args.visitId ?? null, sectionId.trim(), args.workClass ?? null, now(), actorId, now())

  return { span: rowToSpan(db.prepare('SELECT * FROM desk_work WHERE id = ?').get(id) as Record<string, unknown>), alreadyRunning: false }
}

/**
 * Stop a running span.
 *
 * **Stopping an already-stopped span is refused rather than ignored.** A second
 * stop means somebody's screen disagrees with the record about what is running,
 * and silently succeeding leaves them believing they timed something they did
 * not.
 */
export function stopWork(args: { db: Db; spanId: string; note?: string | null; workClass?: string | null }): DeskSpan {
  const { db, spanId } = args
  const row = db.prepare('SELECT * FROM desk_work WHERE id = ?').get(spanId) as Record<string, unknown> | undefined
  if (!row) throw new DeskWorkRefused('No such span.', 'desk-work.no-span')
  if (row.ended_at) throw new DeskWorkRefused('That span has already been stopped.', 'desk-work.already-stopped')

  db.prepare('UPDATE desk_work SET ended_at = ?, note = COALESCE(?, note), work_class = COALESCE(?, work_class) WHERE id = ?')
    .run(now(), args.note ?? null, args.workClass ?? null, spanId)

  return rowToSpan(db.prepare('SELECT * FROM desk_work WHERE id = ?').get(spanId) as Record<string, unknown>)
}

export interface DeskWorkReport {
  spans: DeskSpan[]
  /** Open spans, named. A count alone cannot say which desk is still ticking. */
  running: DeskSpan[]
  /**
   * The one sentence this module will say about the numbers.
   *
   * **Not a total and not a rate** — §7 says collect first. This says how much
   * has been collected, which is the thing somebody needs in order to decide when
   * there is enough to report on.
   */
  note: string
}

/** Every span on a property, newest first. */
export function deskWork(db: Db, propertyId: string): DeskWorkReport {
  const spans = (db
    .prepare('SELECT * FROM desk_work WHERE property_id = ? ORDER BY started_at DESC, id DESC')
    .all(propertyId) as Record<string, unknown>[]).map(rowToSpan)

  const running = spans.filter((s) => s.endedAt === null)
  const closed = spans.length - running.length
  const sections = new Set(spans.map((s) => s.sectionId)).size

  return {
    spans,
    running,
    note: spans.length === 0
      ? 'no desk work has been timed on this property yet'
      : `${closed} completed span(s) across ${sections} section(s)` +
        (running.length > 0 ? `, ${running.length} still running` : '') +
        '. Deliberately no total: §7 records what gets reported from this as not yet specced, and a ' +
        'number reported before anyone has said what it is for fixes the shape of the answer early.',
  }
}
