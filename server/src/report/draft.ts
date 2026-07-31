/**
 * The gap report as an editable draft — Increment 4 §1d and §5.
 *
 * Design v1 §4: **an editor over pre-populated rows, not a static render.** The
 * rows arrive from the audit; a person decides which of them a client sees, in
 * what words, and adds the ones no audit could know about.
 *
 * ---
 *
 * **§1d's named failure, which is why the third column ships manual.**
 *
 * > If "Missing from you" renders as an empty column with a heading, the client
 * > reads *you owe us nothing* — at the exact moment the deed, the permits and
 * > the well record are the most useful thing we could ask them for.
 *
 * The intake table does not exist and building it is not this slice's job. So
 * the column ships as rows a concierge types, carrying provenance
 * `human-entered` rather than `evidence-bound` — **the state is visible in the
 * record, not only in the render**, so when the intake table lands nothing has
 * to be untangled. A row that was typed says it was typed, forever.
 *
 * ---
 *
 * **Editing wording does not edit evidence.** A rewording is a `reword` edit
 * carrying the new sentence; `audit_carried_items.parts` is untouched. §2's
 * composer boundary holds through the editor exactly as it holds through the
 * render — the parts stay as the producer wrote them, and nothing downstream
 * ever un-composes a sentence to get them back.
 *
 * **Every row says which column it landed in and why.** A misclassified row
 * should be visible as misclassified rather than only as a wrong sentence, and
 * the *why* is what makes that possible: a reader can see the rule that placed
 * it and disagree with the rule rather than with the output.
 */

import type { Db } from '../db/index.js'
import { newId, now } from '../db/index.js'
import type { ColumnId } from '../audit/carriedItems.js'
import { clientRow, type ClientRow, type DescribeItem, type NaLabels } from './clientVoice.js'

/** What a row's presence rests on. §1d — visible in the record, not only in the render. */
export type RowProvenance = 'evidence-bound' | 'human-entered'

export interface DraftRow {
  rowKey: string
  column: ColumnId
  /**
   * Why it landed in that column, in one sentence a person can disagree with.
   *
   * Not a rule id. A concierge seeing *"this is ours because a checklist item in
   * the ensuite has no answer"* can tell it is misplaced; seeing `rule-3` cannot.
   */
  columnBecause: string
  provenance: RowProvenance
  /** The sentence as it stands — composed, or reworded by a person. */
  text: string
  /** True when a person rewrote it. The composed original stays available. */
  reworded: boolean
  composed: string | null
  included: boolean
  /** Set on a derived row: what it traces back to. */
  source?: {
    itemId: string
    scopeKind: string
    zoneId: string | null
    pinId: string | null
    where: string
    reason: string
    /** The structured parts, untouched by any rewording. */
    parts: { what: string; why?: string }
    /**
     * What the checklist asked, in the config's own words. **Desk-facing.**
     *
     * Shown beside a naming box so the person writing has something to
     * translate rather than something to invent — §9's evidence-first guard.
     * It is never the name itself; that mistake is Amendment 1 §C.
     */
    itemText: string | null
  }
  /** False when the item's client-facing name has not been ratified. */
  nameRatified: boolean
  /**
   * What the pin or zone this row points at is actually holding.
   *
   * **The mitigation that let the field side decline per-item evidence capture**,
   * and it is a row affordance rather than a filter. A person looking at this
   * before signing is the whole defence against telling a homeowner we did not
   * capture something we are holding a photograph of.
   *
   * **Deliberately not used to hide or gate a row.** A water-heater pin with a
   * wide shot and a nameplate but no drain-pan photo would go quiet on the drain
   * pan, which is the row that most needed saying.
   */
  media: MediaSummary | null
  /** Why this row cannot be written for a client yet, where that is so. */
  withheldBecause?: string
  actor?: string
  at?: string
}

/**
 * What a pin or zone holds, broken out by kind.
 *
 * **Bytes by kind, always** — CLAUDE.md §5. `media.kind` is open vocabulary and
 * video is arriving; minutes of video can outweigh a whole visit's photos, so a
 * single total would stop meaning anything the month that lands.
 */
export interface MediaSummary {
  /**
   * Whether this is a pin's media or a room's — and the two must not be worded
   * alike.
   *
   * A zone-scoped row saying *"this pin holds 23 photos"* is false twice: it is
   * a room, and the twenty-three are of the room rather than of the thing the
   * row is about. The false version shipped in the first screenshot of this
   * screen, on every one of nineteen rows.
   */
  ofWhat: 'pin' | 'room'
  ofKind: { kind: string; count: number; bytes: number }[]
  total: number
  /** The most recent few, so the reviewer can actually look. */
  recent: { mediaId: string; kind: string; capturedAt: string | null }[]
}

export interface Draft {
  propertyId: string
  auditRunId: string | null
  rows: DraftRow[]
  columns: { id: ColumnId; title: string; rows: DraftRow[] }[]
  /** Rows the client render cannot carry, with the reason. Never silently dropped. */
  withheld: DraftRow[]
}

const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: 'missing-from-you', title: 'Missing from you' },
  { id: 'missing-from-us', title: 'Missing from us' },
  { id: 'triggered-flags', title: 'Triggered flags' },
]

const parse = <T,>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string') return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

/** The latest edit of each kind per row. Append-only in, latest-wins out. */
interface RowEdits {
  included?: boolean
  text?: string
  column?: ColumnId
  added?: { text: string; column: ColumnId }
  retired?: boolean
  actor?: string
  at?: string
  /** Edit kinds this build does not understand. Preserved and reported. */
  unrecognised: string[]
}

function editsByRow(db: Db, propertyId: string): Map<string, RowEdits> {
  const rows = db
    .prepare(
      `SELECT row_key, kind, payload, actor_id, created_at FROM report_row_edits
        WHERE property_id = ? ORDER BY seq`,
    )
    .all(propertyId) as { row_key: string; kind: string; payload: string; actor_id: string; created_at: string }[]

  const out = new Map<string, RowEdits>()
  for (const row of rows) {
    const edits = out.get(row.row_key) ?? { unrecognised: [] }
    const payload = parse<Record<string, unknown>>(row.payload, {})
    edits.actor = row.actor_id
    edits.at = row.created_at

    if (row.kind === 'include') edits.included = true
    else if (row.kind === 'exclude') edits.included = false
    else if (row.kind === 'reword') edits.text = typeof payload.text === 'string' ? payload.text : undefined
    else if (row.kind === 'column') edits.column = payload.column as ColumnId
    else if (row.kind === 'retire') edits.retired = true
    else if (row.kind === 'add') {
      edits.added = {
        text: typeof payload.text === 'string' ? payload.text : '',
        column: (payload.column as ColumnId) ?? 'missing-from-you',
      }
    } else if (!edits.unrecognised.includes(row.kind)) {
      // Fail open on vocabulary. An edit kind this build has not met is still an
      // edit somebody made, and dropping it would drop their decision.
      edits.unrecognised.push(row.kind)
    }
    out.set(row.row_key, edits)
  }
  return out
}

export function buildDraft(args: {
  db: Db
  propertyId: string
  describe: DescribeItem
  labels: NaLabels
}): Draft {
  const { db, propertyId, describe, labels } = args

  const run = db
    .prepare('SELECT id FROM audit_runs WHERE property_id = ? ORDER BY run_at DESC, id DESC LIMIT 1')
    .get(propertyId) as { id: string } | undefined

  const carried = run
    ? (db
        .prepare(
          `SELECT scope_kind, scope_zone_id, scope_pin_id, item_id, reason, na_reason_id,
                  column_id, parts, status, where_desk, where_label, item_text FROM audit_carried_items
             WHERE audit_run_id = ? ORDER BY scope_kind, item_id`,
        )
        .all(run.id) as {
        scope_kind: string; scope_zone_id: string | null; scope_pin_id: string | null
        item_id: string; reason: string; na_reason_id: string | null; column_id: string
        parts: string; status: string | null; where_desk: string | null; where_label: string | null
        item_text: string | null
      }[])
    : []

  const edits = editsByRow(db, propertyId)
  const rows: DraftRow[] = []
  const withheldRows: DraftRow[] = []

  for (const item of carried) {
    const scopeKey = item.scope_kind === 'zone'
      ? `zone:${item.scope_zone_id ?? ''}`
      : item.scope_kind === 'pin'
        ? `pin:${item.scope_pin_id ?? ''}`
        : item.scope_kind === 'session' ? 'session' : `${item.scope_kind}:`
    const rowKey = `carried:${scopeKey}/${item.item_id}`
    const edit = edits.get(rowKey)

    const parts = parse<{ what: string; why?: string }>(item.parts, { what: item.item_id })
    // Both registers as the audit stored them. An earlier version looked them up
    // again from the zone and pin tables — rule 4, and it put a `${zone.type}`
    // template into the client-facing directory, which a scan caught.
    const where = item.where_desk ?? 'this property'
    const whereLabel = item.where_label

    const composed = clientRow(
      {
        scope: { kind: item.scope_kind, zoneId: item.scope_zone_id, pinId: item.scope_pin_id },
        itemId: item.item_id, tier: 'standard', reason: item.reason,
        naReasonId: item.na_reason_id, column: item.column_id as ColumnId, parts,
        status: item.status, origin: 'computed',
        dueSince: { importId: '', visitId: null, at: '' },
        where, whereLabel, itemText: item.item_text, certain: true, unrecognised: [],
      },
      describe,
      labels,
    )

    const named = describe(item.item_id)
    const row: DraftRow = {
      rowKey,
      column: edit?.column ?? (item.column_id as ColumnId),
      columnBecause: edit?.column
        ? 'moved here by hand'
        : becauseOf(item.column_id as ColumnId, item.reason, where),
      // Derived from what the field recorded, so it is evidence-bound whatever a
      // person does to its wording. Rewording changes the sentence, never where
      // the row came from.
      provenance: 'evidence-bound',
      text: edit?.text ?? composed?.text ?? '',
      reworded: edit?.text !== undefined,
      composed: composed?.text ?? null,
      // Included unless somebody said otherwise. A gap the client should hear
      // about is the default; excluding it is the decision that needs an actor.
      included: edit?.included ?? true,
      source: {
        itemId: item.item_id, scopeKind: item.scope_kind, zoneId: item.scope_zone_id,
        pinId: item.scope_pin_id, where, reason: item.reason, parts, itemText: item.item_text,
      },
      nameRatified: named?.ratified ?? false,
      media: mediaFor(db, propertyId, item.scope_pin_id, item.scope_zone_id),
      actor: edit?.actor,
      at: edit?.at,
    }

    // A row with no composed sentence and no rewording cannot go to a client. It
    // is not dropped — it goes to the desk with the reason, because the whole
    // point of withholding it is that somebody writes the wording.
    if (!composed && edit?.text === undefined) {
      row.withheldBecause = item.status === 'proposed'
        ? 'evidence is on the pin awaiting confirmation — desk work, not the client\'s'
        : 'no client-facing name is written for this item yet'
      withheldRows.push(row)
      continue
    }
    rows.push(row)
  }

  // ------------------------------------------------------------ manual rows
  for (const [rowKey, edit] of edits) {
    if (!rowKey.startsWith('manual:') || !edit.added || edit.retired) continue
    rows.push({
      rowKey,
      column: edit.column ?? edit.added.column,
      columnBecause: 'typed by hand into this column',
      // §1d — the state is visible in the record. When the intake table lands,
      // a row that was typed still says it was typed and nothing has to be
      // untangled to find out which were which.
      provenance: 'human-entered',
      text: edit.text ?? edit.added.text,
      reworded: edit.text !== undefined,
      composed: null,
      included: edit.included ?? true,
      // A typed row has no client-name lookup behind it, so there is nothing to
      // ratify. The person typed the words and signs them.
      nameRatified: true,
      media: null,
      actor: edit.actor,
      at: edit.at,
    })
  }

  return {
    propertyId,
    auditRunId: run?.id ?? null,
    rows,
    columns: COLUMNS.map((c) => ({ ...c, rows: rows.filter((r) => r.column === c.id && r.included) })),
    withheld: withheldRows,
  }
}

/**
 * Why a row is in the column it is in, in words.
 *
 * A sentence rather than a rule id, because the point is that a concierge can
 * see a misclassification. *"This is ours because a checklist item in the
 * ensuite has no answer"* is disagreeable-with; `rule-3` is not.
 */
function becauseOf(column: ColumnId, reason: string, where: string): string {
  if (column === 'missing-from-us') {
    // "a checklist item in this visit" is what the session scope produced before
    // — grammatical, and slightly wrong: a session item is asked OF the visit
    // rather than located in it.
    const at = where === 'this visit' ? 'at close-out' : `in ${where}`
    return reason === 'not-reached'
      ? `a checklist item ${at} has no answer, so it is ours to carry`
      : `a checklist item ${at} was answered in a way the config marks as a gap, so it is ours to carry`
  }
  if (column === 'missing-from-you') return 'a document the client holds'
  return 'a flag the visit tripped, recommending a specialist'
}

/**
 * What the pin or zone a row points at is holding.
 *
 * **A row affordance, never a filter.** Presence of media says nothing about
 * whether THIS item was captured — a water-heater pin can hold a wide shot and a
 * nameplate and still have no drain-pan photograph. Gating rows on media would
 * silence exactly the row that most needed saying.
 *
 * Its job is narrower and it is the whole reason the field side could decline
 * per-item evidence capture: a person looking at this before signing is the
 * defence against telling a homeowner we did not capture something we are
 * holding a photograph of.
 */
function mediaFor(db: Db, propertyId: string, pinId: string | null, zoneId: string | null): MediaSummary | null {
  if (!pinId && !zoneId) return null

  const rows = pinId
    ? (db.prepare(
        `SELECT m.media_id, m.kind, m.bytes, m.captured_at FROM media m JOIN imports i ON i.id = m.import_id
          WHERE i.property_id = ? AND m.owner_pin_id = ? ORDER BY m.captured_at DESC`,
      ).all(propertyId, pinId) as MediaRow[])
    : (db.prepare(
        `SELECT m.media_id, m.kind, m.bytes, m.captured_at FROM media m JOIN imports i ON i.id = m.import_id
          WHERE i.property_id = ? AND m.owner_zone_id = ? ORDER BY m.captured_at DESC`,
      ).all(propertyId, zoneId) as MediaRow[])

  const ofWhat = pinId ? 'pin' as const : 'room' as const
  if (rows.length === 0) return { ofWhat, ofKind: [], total: 0, recent: [] }

  const byKind = new Map<string, { count: number; bytes: number }>()
  for (const r of rows) {
    // `kind` is open vocabulary — photo, voice, and video is arriving. Never
    // switched on, only grouped, so a kind nobody has met still counts.
    const key = r.kind ?? 'unknown'
    const acc = byKind.get(key) ?? { count: 0, bytes: 0 }
    acc.count += 1
    acc.bytes += r.bytes ?? 0
    byKind.set(key, acc)
  }

  return {
    ofWhat,
    ofKind: [...byKind].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.count - a.count),
    total: rows.length,
    recent: rows.slice(0, 6).map((r) => ({ mediaId: r.media_id, kind: r.kind ?? 'unknown', capturedAt: r.captured_at })),
  }
}

interface MediaRow {
  media_id: string
  kind: string | null
  bytes: number | null
  captured_at: string | null
}

// ------------------------------------------------------------------- writing

export type EditKind = 'include' | 'exclude' | 'reword' | 'add' | 'retire' | 'column'

/**
 * Record one editorial decision. Append-only, always with an actor.
 *
 * Nothing here updates or deletes. A concierge who excludes a row and changes
 * their mind writes an `include`; both are in the record and the trail shows the
 * order. That is doctrine 1 applied to an editorial act rather than to evidence,
 * and the reasoning is the same — *why does this report not mention the attic*
 * has to be answerable.
 */
export function writeEdit(args: {
  db: Db
  propertyId: string
  rowKey: string
  kind: EditKind
  payload?: Record<string, unknown>
  actorId: string
}): string {
  const { db, propertyId, rowKey, kind, actorId } = args
  const id = newId()
  const at = now()
  const next = (db
    .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM report_row_edits WHERE property_id = ?')
    .get(propertyId) as { n: number }).n

  db.prepare(
    `INSERT INTO report_row_edits (id, property_id, row_key, kind, payload, actor_id, seq, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, propertyId, rowKey, kind, JSON.stringify(args.payload ?? {}), actorId, next, at)
  return id
}

/** A new manual row — §1d's column, typed. */
export function addManualRow(args: {
  db: Db
  propertyId: string
  text: string
  column: ColumnId
  actorId: string
}): string {
  const rowKey = `manual:${newId()}`
  writeEdit({
    db: args.db, propertyId: args.propertyId, rowKey, kind: 'add', actorId: args.actorId,
    payload: { text: args.text, column: args.column },
  })
  return rowKey
}

/** Every edit made to one row, oldest first. §5's trace-back, for a person. */
export function rowTrail(db: Db, propertyId: string, rowKey: string): {
  kind: string; payload: Record<string, unknown>; actorId: string; at: string
}[] {
  return (db
    .prepare(
      `SELECT kind, payload, actor_id, created_at FROM report_row_edits
        WHERE property_id = ? AND row_key = ? ORDER BY seq`,
    )
    .all(propertyId, rowKey) as { kind: string; payload: string; actor_id: string; created_at: string }[])
    .map((r) => ({ kind: r.kind, payload: parse(r.payload, {}), actorId: r.actor_id, at: r.created_at }))
}
