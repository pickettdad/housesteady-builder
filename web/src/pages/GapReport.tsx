/**
 * The gap report editor — Increment 4 §1d and §5.
 *
 * Design v1 §4: **an editor over pre-populated rows, not a static render.** This
 * is the surface where a person decides what a client reads, and every affordance
 * on it exists for a stated reason rather than because editors usually have one.
 *
 * **Three columns, and the third ships typed.** §1d's failure: *if "Missing from
 * you" renders as an empty column with a heading, the client reads "you owe us
 * nothing" — at the exact moment the deed, the permits and the well record are
 * the most useful thing we could ask them for.* The intake table does not exist,
 * so the column is rows a concierge types, and they carry `human-entered` in the
 * record so nothing has to be untangled when it lands.
 *
 * **The pin's media sits on the row, at the point of review.** This is the
 * mitigation that let the field side decline per-item evidence capture, and it
 * is the whole defence against telling a homeowner we did not capture something
 * we are holding a photograph of — *a person looking at it before signing.*
 *
 * **It is a row affordance and never a filter.** Nothing here hides a row
 * because its pin has photographs. A water-heater pin with a wide shot and a
 * nameplate but no drain-pan photo would go quiet on the drain pan, which is the
 * row that most needed saying.
 *
 * **Editing wording does not edit evidence.** A rewording is an overlay; the
 * structured parts stay exactly as the producer wrote them, and the composed
 * original stays visible beside the edit so a reader can see what changed.
 */

import { useCallback, useEffect, useState } from 'react'
import { api, type Draft, type DraftRow } from '../api.js'

export function GapReportView({ propertyId }: { propertyId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.gapReport(propertyId).then(setDraft).catch((e: Error) => setError(e.message))
  }, [propertyId])

  useEffect(load, [load])

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <section className="card"><p className="error">{error}</p></section>
  if (!draft) return <section className="card"><p className="muted">Loading…</p></section>

  if (!draft.auditRunId) {
    return (
      <section className="card">
        <h3>Gap report</h3>
        <p className="muted">
          This property has not been audited yet, so there is nothing carried to report.
          Run the audit first.
        </p>
      </section>
    )
  }

  return (
    <>
      <section className="card">
        <h3>
          Gap report <span className="muted small">— an editor, not a render. Nothing sends itself.</span>
        </h3>
        <p className="muted small">
          {draft.rows.filter((r) => r.included).length} row(s) in · {draft.rows.filter((r) => !r.included).length} held
          back · {draft.withheld.length} cannot be written yet
        </p>
      </section>

      {draft.columns.map((column) => (
        <Column
          key={column.id}
          id={column.id}
          title={column.title}
          rows={draft.rows.filter((r) => r.column === column.id)}
          propertyId={propertyId}
          busy={busy}
          act={act}
        />
      ))}

      {/* Never drop anything silently — doctrine 6. A row withheld because
          nothing can name its item is a DESK TASK, and it has to reach the desk.
          The whole point of withholding it is that somebody writes the wording;
          a withheld row nobody hears about is a dropped row with extra steps. */}
      {draft.withheld.length > 0 && (
        <section className="card">
          <h3>
            Needs wording <span className="muted small">— held out of the report until somebody names it</span>
          </h3>
          <p className="muted small">
            A name written here goes into the company-wide table and is used everywhere.
            It stays marked unratified until the design session confirms it.
          </p>
          <ul className="gaps">
            {draft.withheld.map((row) => (
              <NeedsName key={row.rowKey} row={row} propertyId={propertyId} busy={busy} act={act} />
            ))}
          </ul>
        </section>
      )}

      {draft.supersededNames.length > 0 && (
        <section className="card">
          <h3>
            Names the design session settled differently{' '}
            <span className="muted small">— what was written here, and what shipped</span>
          </h3>
          <ul className="gaps">
            {draft.supersededNames.map((n) => (
              <li key={n.itemId}>
                <strong>{n.ratified}</strong>{' '}
                <span className="muted small">
                  ratified · written here as “{n.proposed}” by {n.actorId}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            A pattern of large differences is a signal about the naming guidance rather than
            about whoever wrote them.
          </p>
        </section>
      )}

      {draft.unratifiedNames.length > 0 && (
        <section className="card">
          <h3>
            Unratified names <span className="muted small">— written here, not yet house style</span>
          </h3>
          <ul className="gaps">
            {draft.unratifiedNames.map((n) => (
              <li key={n.id}>
                <strong>{n.name}</strong>{' '}
                <span className="muted small">
                  for <code>{n.itemId}</code> · written by {n.actorId}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function Column({
  id, title, rows, propertyId, busy, act,
}: {
  id: string
  title: string
  rows: DraftRow[]
  propertyId: string
  busy: boolean
  act: (fn: () => Promise<unknown>) => Promise<void>
}) {
  const [adding, setAdding] = useState('')

  return (
    <section className="card">
      <h3>
        {title} <span className="muted small">({rows.filter((r) => r.included).length})</span>
      </h3>

      {/* §1d — an empty column with a heading reads as "you owe us nothing".
          Say what the column is for instead, and let somebody type into it. */}
      {rows.length === 0 && (
        <p className="muted small">
          {id === 'missing-from-you'
            ? 'Nothing has been asked of the client yet. Type what they owe — the deed, permits, the well record, prior inspections.'
            : 'Nothing here.'}
        </p>
      )}

      <ul className="gaps">
        {rows.map((row) => (
          <Row key={row.rowKey} row={row} propertyId={propertyId} busy={busy} act={act} />
        ))}
      </ul>

      <div>
        <input
          value={adding}
          placeholder={`Add a row to ${title.toLowerCase()}`}
          onChange={(e) => setAdding(e.target.value)}
          style={{ width: '60%' }}
        />{' '}
        <button
          disabled={busy || adding.trim() === ''}
          onClick={() => act(async () => {
            await api.addReportRow(propertyId, adding.trim(), id)
            setAdding('')
          })}
        >
          Add
        </button>
      </div>
    </section>
  )
}

function Row({
  row, propertyId, busy, act,
}: {
  row: DraftRow
  propertyId: string
  busy: boolean
  act: (fn: () => Promise<unknown>) => Promise<void>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [showTrail, setShowTrail] = useState(false)

  return (
    <li style={{ opacity: row.included ? 1 : 0.5 }}>
      {editing === null ? (
        <div>{row.text}</div>
      ) : (
        <div>
          <textarea value={editing} onChange={(e) => setEditing(e.target.value)} rows={2} style={{ width: '90%' }} />
          <div>
            <button
              disabled={busy || editing.trim() === ''}
              onClick={() => act(async () => {
                await api.editReportRow(propertyId, row.rowKey, 'reword', { text: editing.trim() })
                setEditing(null)
              })}
            >
              Save wording
            </button>{' '}
            <button className="ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* The source chip, and the column-and-why beside it. §5: every row shows
          which column it landed in and WHY, so a misclassified row is visible as
          misclassified rather than only as a wrong sentence. */}
      <div className="muted small">
        {row.provenance === 'human-entered' ? (
          <span className="pill">typed by hand</span>
        ) : (
          <span className="pill">
            from {row.source?.itemId} in {row.source?.where}
          </span>
        )}{' '}
        · {row.columnBecause}
        {row.reworded && <> · reworded{row.actor ? ` by ${row.actor}` : ''}</>}
        {!row.nameRatified && <> · <span className="pill warn">name not yet ratified</span></>}
      </div>

      {/* The composed original, kept beside the edit. Editing wording does not
          edit evidence — the parts are untouched, and showing what the composer
          wrote is how a reader can tell a rewording from a correction. */}
      {row.reworded && row.composed && (
        <div className="muted small">composed: “{row.composed}”</div>
      )}

      {/* THE MITIGATION. What the pin or room this row points at is actually
          holding, at the point of review. Never a filter — a pin with photographs
          can still be missing the one this row is about. */}
      {row.media && (
        <div className="muted small">
          {row.media.total === 0
            ? `nothing captured on this ${row.media.ofWhat}`
            : `this ${row.media.ofWhat} holds ${row.media.ofKind
                .map((k) => `${k.count} ${k.kind}${k.count === 1 ? '' : 's'}`)
                .join(' · ')}`}
          {row.media.total > 0 && (
            <>
              {' — '}
              <span className="muted">
                {row.media.ofWhat === 'room'
                  // A room's photographs say nothing about whether THIS item was
                  // captured, and a sentence that blurs the two would turn the
                  // affordance into false reassurance.
                  ? 'photographs of the room, not of this item — check before signing'
                  : 'check before signing that this row is not about one of them'}
              </span>
            </>
          )}
        </div>
      )}

      <div>
        <button
          className="link"
          disabled={busy}
          onClick={() => act(() => api.editReportRow(propertyId, row.rowKey, row.included ? 'exclude' : 'include'))}
        >
          {row.included ? 'hold back' : 'put in'}
        </button>{' '}
        <button className="link" disabled={busy} onClick={() => setEditing(row.text)}>reword</button>{' '}
        <button className="link" onClick={() => setShowTrail(!showTrail)}>
          {showTrail ? 'hide history' : 'history'}
        </button>
      </div>

      {showTrail && <Trail propertyId={propertyId} rowKey={row.rowKey} />}
    </li>
  )
}

/** Every edit ever made to this row. Append-only in, append-only out. */
function Trail({ propertyId, rowKey }: { propertyId: string; rowKey: string }) {
  const [trail, setTrail] = useState<{ kind: string; actorId: string; at: string }[] | null>(null)
  useEffect(() => {
    api.reportRowTrail(propertyId, rowKey).then(setTrail).catch(() => setTrail([]))
  }, [propertyId, rowKey])

  if (!trail) return <p className="muted small">…</p>
  if (trail.length === 0) return <p className="muted small">untouched since the audit produced it</p>
  return (
    <ul className="muted small">
      {trail.map((t, i) => <li key={i}>{t.kind} · {t.actorId} · {t.at}</li>)}
    </ul>
  )
}

/**
 * A row that cannot be written yet, and the box that fixes it.
 *
 * **The name goes to the company-wide table, so the box says so.** A concierge
 * typing here is not labelling this house's water heater; they are naming the
 * thing for every client. That is why it is worth the sentence, and why the
 * result is marked unratified rather than silently adopted.
 */
function NeedsName({
  row, propertyId, busy, act,
}: {
  row: DraftRow
  propertyId: string
  busy: boolean
  act: (fn: () => Promise<unknown>) => Promise<void>
}) {
  const [name, setName] = useState('')
  const itemId = row.source?.itemId

  return (
    <li>
      <div className="muted small">
        <code>{itemId}</code> in {row.source?.where} — {row.withheldBecause}
      </div>
      {/* Evidence first, the box second — §9's guard, one artifact over. What
          the field actually asked, so the person writing has something to
          TRANSLATE rather than something to invent from an id.

          Shown, never pre-filled. A suggestion sitting in the input box makes
          acceptance the default and rejection work, and these strings are
          exactly what must not be accepted: they are concierge instructions,
          four of them containing the word "issue". */}
      {row.source?.itemText && (
        <div className="muted small">the checklist asks: “{row.source.itemText}”</div>
      )}
      {itemId && (
        <div>
          <input
            value={name}
            placeholder="What a homeowner would call this"
            onChange={(e) => setName(e.target.value)}
            style={{ width: '60%' }}
          />{' '}
          <button
            disabled={busy || name.trim() === ''}
            onClick={() => act(async () => {
              await api.writeClientName(itemId, name.trim(), propertyId)
              setName('')
            })}
          >
            Name it
          </button>
        </div>
      )}
    </li>
  )
}
