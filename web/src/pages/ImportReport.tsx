import { useEffect, useState } from 'react'
import { go } from '../App.js'
import { api, fmtBytes, fmtTime, type ImportReport } from '../api.js'

const STATUS_TEXT: Record<string, { title: string; detail: string }> = {
  ok: { title: 'Imported cleanly', detail: 'Every check passed. Nothing needs your attention.' },
  ok_with_warnings: {
    // Never "complete" — media absence is itself one of the warnings, and a
    // banner that calls an import complete while warning that its photos are
    // missing is the exact overclaim this software exists not to make.
    title: 'Imported, with things to look at',
    detail: 'The export is stored. The notes below are what did not look ordinary.',
  },
  failed: { title: 'Import failed', detail: 'Nothing was stored.' },
}

function Stat({ n, k, note }: { n: string | number; k: string; note?: string }) {
  return (
    <div className="stat">
      <div className="n">{n}</div>
      <div className="k">{k}</div>
      {note && <div className="note">{note}</div>}
    </div>
  )
}

export function ImportReportView({ id }: { id: string }) {
  const [r, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getReport(id).then(setReport).catch((e) => setError(e.message))
  }, [id])

  if (error) return <p className="empty">{error}</p>
  if (!r) return <p className="empty">Loading…</p>

  const status = STATUS_TEXT[r.import.status] ?? STATUS_TEXT.ok!
  const warnings = r.validation.checks.filter((c) => c.severity === 'warning')
  const infos = r.validation.checks.filter((c) => c.severity === 'info')
  const recon = r.checklist.eventReconciliation
  const reconAgrees = recon.net === recon.resolutionsLength

  return (
    <>
      <div className="crumbs">
        <a className="crumb" onClick={() => go({ name: 'properties' })}>Properties</a> ›{' '}
        <a className="crumb" onClick={() => go({ name: 'property', id: r.property.id })}>{r.property.label}</a> ›
        import report
      </div>

      {/*
        The count in this banner must equal the number of warning entries shown
        further down — nothing else. A headline number that does not match what
        is visible below it erodes trust in every other number on the page.
      */}
      <div className={`banner ${r.import.status}`}>
        <div className="status">{status.title}</div>
        <div className="detail">
          {status.detail}{' '}
          {warnings.length > 0 &&
            `${warnings.length} thing${warnings.length === 1 ? '' : 's'} to look at, listed at the bottom.`}
        </div>
      </div>

      <h2>Import report</h2>
      <p className="lede">
        What arrived in this export, and what the builder made of it. The original file is stored whole and
        unchanged — everything below is read from it, never instead of it.
      </p>

      {/* ------------------------------------------------------------- facts */}
      <div className="card">
        <table>
          <tbody>
            <tr>
              <th style={{ width: 220 }}>The export calls this house</th>
              <td>
                <strong>{r.session.propertyLabel ?? '—'}</strong>
                <div className="hint" style={{ marginTop: 2 }}>
                  {r.session.propertyLabel === r.property.label ? (
                    <>Free text typed in the field — the same name you filed it under.</>
                  ) : (
                    <>
                      Free text typed in the field. You filed it under <strong>{r.property.label}</strong>
                      {r.property.address ? ` (${r.property.address})` : ''}.
                    </>
                  )}
                </div>
              </td>
            </tr>
            <tr>
              <th>Visit</th>
              <td style={{ textTransform: 'capitalize' }}>
                {r.visit.kind}
                {/* Two dates, two names — and the disagreement between them is
                    exactly what an import report is for. `walked` is the
                    manifest's own session start; `planned` is what somebody
                    typed. Neither is shown as the other. */}
                {r.visit.walkedDate ? ` · walked ${r.visit.walkedDate}` : ''}
                {r.visit.plannedDate && r.visit.plannedDate !== r.visit.walkedDate
                  ? ` · planned ${r.visit.plannedDate}`
                  : ''}
              </td>
            </tr>
            <tr>
              <th>Imported</th>
              <td>{fmtTime(r.import.importedAt)}</td>
            </tr>
            <tr>
              <th>Exported from the field</th>
              <td>{fmtTime(r.session.exportedAt)} · field app {r.import.appVersion ?? '—'}</td>
            </tr>
            <tr>
              <th>Manifest schema</th>
              <td>version {r.import.manifestSchemaVersion}</td>
            </tr>
            <tr>
              <th>Checklist config</th>
              <td>
                {r.import.config.id} · v{r.import.config.version}
                <div className="mono hint" style={{ marginTop: 2 }}>{r.import.config.hash}</div>
              </td>
            </tr>
            <tr>
              <th>Property flags</th>
              <td>
                {r.session.flags.length === 0
                  ? <span className="muted">none set</span>
                  : r.session.flags.map((f) => <span key={f} className="pill">{f}</span>)}
              </td>
            </tr>
            <tr>
              <th>Photos and files</th>
              <td>
                {r.import.mediaMode === 'manifest_only' ? (
                  <>
                    <span className="pill warn">manifest only</span>
                    <div className="hint" style={{ marginTop: 4 }}>
                      The manifest was imported without its media. Every file below is listed and accounted for,
                      but the images themselves are not on this machine and no checksum has been verified.
                    </div>
                  </>
                ) : (
                  <span className="pill ok">media included</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* --------------------------------------------------------- lifecycle */}
      <h3>How the visit went</h3>
      <div className="card">
        <ul className="timeline">
          <li>
            <div>Started</div>
            <div className="when">{fmtTime(r.session.startedAt)}</div>
          </li>
          {r.session.lifecycle.map((l, i) => (
            <li key={i} className={l.type === 'reopened' ? 'reopened' : ''}>
              <div style={{ textTransform: 'capitalize' }}>
                {l.type}
                {l.reason && <span className="muted"> — “{l.reason}”</span>}
              </div>
              <div className="when">{fmtTime(l.at)}</div>
            </li>
          ))}
          <li>
            <div>Exported</div>
            <div className="when">{fmtTime(r.session.exportedAt)}</div>
          </li>
        </ul>
        {r.session.lifecycle.filter((l) => l.type === 'reopened').length > 0 && (
          <div className="hint">
            This visit was reopened after being marked complete. That is normal and fully recorded — the reason is
            shown above exactly as it was typed.
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ counts */}
      <h3>What arrived</h3>
      <div className="grid">
        <Stat n={r.counts.zones} k="zones" />
        <Stat n={r.counts.canvases} k="canvases" note="floor plans or wide photos pins are placed on" />
        <Stat n={r.counts.pins.total} k="pins" note={`${r.counts.pins.anomalousDistinct} need a look — below`} />
        <Stat n={r.counts.media.total} k="files" note={fmtBytes(r.counts.media.bytes)} />
        <Stat n={r.counts.notes} k="notes" />
        <Stat
          n={r.counts.chatThreads}
          k="chat threads"
          note={`${r.counts.chatMessages} message${r.counts.chatMessages === 1 ? '' : 's'}`}
        />
        <Stat
          n={r.counts.inboxTotal}
          k="unassigned"
          note={r.counts.inboxTotal > 0 ? 'captured but not filed to anything yet' : undefined}
        />
        <Stat n={r.counts.events} k="events" note={`${r.counts.orphanEvents} orphaned`} />
      </div>

      {/* -------------------------------------------------------------- pins */}
      <h3>Pins</h3>
      <div className="card">
        <div className="row" style={{ gap: 18, marginBottom: 12 }}>
          <div><strong>{r.counts.pins.total}</strong> pins</div>
          {r.counts.pins.flagged.map((f) => (
            <div key={f.flag}>
              <strong>{f.n}</strong> flagged <span className="pill">{f.flag}</span>
            </div>
          ))}
        </div>
        {r.counts.pins.anomalous.length === 0 ? (
          <p className="empty">Every pin is typed, live, and placed on a canvas.</p>
        ) : (
          <>
            <p className="small">
              <strong>{r.counts.pins.anomalousDistinct}</strong> of {r.counts.pins.total} pins carry something
              worth noticing: {r.counts.pins.typeless} typeless, {r.counts.pins.retired} retired,{' '}
              {r.counts.pins.unanchored} unanchored. Those categories overlap — the pins are listed individually
              so the numbers cannot be added up into something that is not true.
            </p>
            <table>
              <thead>
                <tr>
                  <th className="num" style={{ width: 60 }}>Pin</th>
                  <th>What is unusual about it</th>
                </tr>
              </thead>
              <tbody>
                {r.counts.pins.anomalous.map((p) => (
                  <tr key={p.pinId}>
                    <td className="num"><strong>{p.number}</strong></td>
                    <td>
                      {p.flags.map((f) => <span key={f} className="pill">{f}</span>)}
                      <span className="muted small">
                        {p.flags.includes('typeless') && ' created but never given a type. '}
                        {p.flags.includes('retired') && ' retired — the number is kept forever, never reused. '}
                        {p.flags.includes('unanchored') && ' never placed on a canvas. '}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hint">
              None of this is an error. A pin dropped and abandoned, or placed off-plan, is a normal thing to find
              in a real visit. It is listed so nothing is quietly lost.
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------- media */}
      <h3>Photos and files</h3>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Kind</th>
              <th className="num">Files</th>
              <th className="num">Size</th>
            </tr>
          </thead>
          <tbody>
            {r.counts.media.byKind.map((m) => (
              <tr key={m.kind ?? 'unknown'}>
                <td>{m.kind ?? <span className="pill warn">no kind recorded</span>}</td>
                <td className="num">{m.count}</td>
                <td className="num">{fmtBytes(m.bytes)}</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td>
              <td className="num"><strong>{r.counts.media.total}</strong></td>
              <td className="num"><strong>{fmtBytes(r.counts.media.bytes)}</strong></td>
            </tr>
          </tbody>
        </table>

        <h4>What each file is of</h4>
        <table>
          <thead>
            <tr>
              <th>Belongs to</th>
              <th className="num">Files</th>
              <th className="num">Size</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {r.counts.media.byOwner.map((m) => (
              <tr key={m.owner_kind ?? 'unknown'}>
                <td>{m.owner_kind ?? '—'}</td>
                <td className="num">{m.count}</td>
                <td className="num">{fmtBytes(m.bytes)}</td>
                <td className="muted small">
                  {m.owner_kind === 'zone' && 'loose room photos — nothing points at them yet'}
                  {m.owner_kind === 'pin' && 'attached to a specific thing in the house'}
                  {m.owner_kind === 'canvas' && 'the floor plan or wide shot pins sit on'}
                  {m.owner_kind === 'inbox' && 'captured with nowhere to file it yet'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4>File verification</h4>
        {/* All three states shown always, zeroes included. "0 failed" is a
            different statement from an omitted row, and the difference matters. */}
        <table style={{ maxWidth: 460 }}>
          <tbody>
            <tr>
              <td>Checksum verified</td>
              <td className="num">
                <strong>{r.counts.media.verification.verified}</strong>
              </td>
              <td className="muted small">the file is here and matches the export</td>
            </tr>
            <tr>
              <td>Checksum failed</td>
              <td className="num">
                {r.counts.media.verification.failed > 0 ? (
                  <span className="pill error">{r.counts.media.verification.failed}</span>
                ) : (
                  <strong>0</strong>
                )}
              </td>
              <td className="muted small">arrived corrupted — quarantined, not imported as evidence</td>
            </tr>
            <tr>
              <td>Absent</td>
              <td className="num">
                {r.counts.media.verification.absent > 0 ? (
                  <span className="pill warn">{r.counts.media.verification.absent}</span>
                ) : (
                  <strong>0</strong>
                )}
              </td>
              <td className="muted small">listed in the export but not on this machine</td>
            </tr>
            {r.counts.media.verification.presentUnverified > 0 && (
              <tr>
                <td>Here but unchecked</td>
                <td className="num">
                  <span className="pill warn">{r.counts.media.verification.presentUnverified}</span>
                </td>
                <td className="muted small">file present, checksum not yet run</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="hint">
          Sizes are what the export declares, in decimal MB so they match the manifest's own byte count. Checksum
          verification runs when the media arrives alongside the manifest.
        </div>
      </div>

      {/* --------------------------------------------------------- checklist */}
      <h3>The checklist</h3>
      <div className="card">
        <div className="grid" style={{ marginBottom: 6 }}>
          <Stat n={r.checklist.total} k="items resolved" />
          <Stat
            n={r.checklist.gaps.count}
            k="feed the gap list"
            note="things the visit could not reach — these become “missing from us”"
          />
          <Stat
            n={r.checklist.findings.total}
            k="recorded findings"
            note={
              `${r.checklist.findings.failedChecks} failed check${r.checklist.findings.failedChecks === 1 ? '' : 's'}, ` +
              `${r.checklist.findings.confirmedAbsences} confirmed absence${r.checklist.findings.confirmedAbsences === 1 ? '' : 's'}`
            }
          />
        </div>
        <div className="hint" style={{ marginBottom: 18 }}>
          A <strong>finding</strong> is a substantive fact for the binder, not necessarily a problem: a failed
          check is a defect, a confirmed absence (no fireplace; no moisture suspected) is simply true and worth
          recording. A <strong>gap</strong> is different — a hole, something still owed. They never merge.
        </div>

        <h4>Resolved how</h4>
        <table>
          <thead>
            <tr><th>Kind</th><th className="num">Count</th></tr>
          </thead>
          <tbody>
            {r.checklist.byKind.map((k) => (
              <tr key={k.kind ?? 'null'}><td>{k.kind ?? '—'}</td><td className="num">{k.n}</td></tr>
            ))}
            {r.checklist.byResult.map((k) => (
              <tr key={`res-${k.result}`}>
                <td className="muted">…of which result: {k.result}</td>
                <td className="num">{k.n}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4>Resolved where</h4>
        <div className="row">
          {r.checklist.byScope.map((s) => (
            <span key={s.scope_kind ?? 'null'} className="pill">{s.scope_kind}: {s.n}</span>
          ))}
        </div>

        {r.checklist.gaps.rows.length > 0 && (
          <>
            <h4>Feeding the gap list</h4>
            <table>
              <thead>
                <tr><th>Item</th><th>Why</th><th>Scope</th></tr>
              </thead>
              <tbody>
                {r.checklist.gaps.rows.map((g) => (
                  <tr key={g.item_id}>
                    <td className="mono">{g.item_id}</td>
                    <td>{g.reason_id}</td>
                    <td className="muted">{g.scope_kind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hint">
              Which reasons feed the gap list is decided by the checklist config that shipped with this export,
              not by the builder. If the field app adds a reason, this stays correct.
            </div>
          </>
        )}

        {r.checklist.findings.rows.length > 0 && (
          <>
            <h4>Recorded findings</h4>
            <table>
              <thead>
                <tr><th>Item</th><th>What it records</th><th>Scope</th></tr>
              </thead>
              <tbody>
                {r.checklist.findings.rows.map((f) => (
                  <tr key={f.item_id}>
                    <td className="mono">{f.item_id}</td>
                    <td>
                      {f.result === 'fail'
                        ? <><span className="pill warn">failed check</span> a defect to write up</>
                        : <><span className="pill">confirmed absent</span> {f.reason_id}</>}
                    </td>
                    <td className="muted">{f.scope_kind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h4>State against history</h4>
        <p className="small">
          The event log records <strong>{recon.itemResolved}</strong> items resolved and{' '}
          <strong>{recon.itemReopened}</strong> reopened, so <strong>{recon.net}</strong> should currently stand.
          The export lists <strong>{recon.resolutionsLength}</strong>.{' '}
          {reconAgrees ? (
            <span className="pill ok">agrees</span>
          ) : (
            <span className="pill warn">does not agree</span>
          )}
        </p>
      </div>

      {/* ------------------------------------------------------------- zones */}
      <h3>Zones</h3>
      <table>
        <thead>
          <tr>
            <th>Zone</th>
            <th className="num">Pins</th>
            <th className="num">Files</th>
            <th className="num">Resolved</th>
            <th className="num">Core left</th>
            <th className="num">Standard left</th>
            <th>Rework</th>
          </tr>
        </thead>
        <tbody>
          {r.zones.map((z) => (
            <tr key={z.zoneId}>
              <td>
                <strong>{z.label}</strong> <span className="muted small">{z.type}{z.level ? ` · ${z.level}` : ''}</span>
                {z.closedWithNoWork && (
                  <div style={{ marginTop: 4 }}>
                    <span className="pill warn">closed with nothing resolved</span>
                  </div>
                )}
              </td>
              <td className="num">{z.pinCount}</td>
              <td className="num">{z.mediaCount}</td>
              <td className="num">{z.resolutionCount}</td>
              <td className="num">{z.coreUnresolved.length > 0 ? <strong>{z.coreUnresolved.length}</strong> : 0}</td>
              <td className="num">{z.standardUnresolved}</td>
              <td className="small">
                {z.reopenCount === 0 ? (
                  <span className="muted">—</span>
                ) : (
                  <>
                    <span className="pill warn">reopened {z.reopenCount}×</span>
                    {z.reopenReasons.length > 0 && (
                      <div className="muted" style={{ marginTop: 2 }}>“{z.reopenReasons.join('”, “')}”</div>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.zones.some((z) => z.closedWithNoWork) && (
        <div className="hint">
          A zone closed with nothing resolved in it is what a rushed visit produces. The photos may well be
          there; the checklist was never worked. It is called out here rather than left to be inferred from a
          column of zeroes.
        </div>
      )}
      <div className="hint">
        Core and standard counts are the field app's own tally, stored exactly as it sent them. The builder does
        not yet recompute them — that is the audit engine's job, later.
      </div>

      {/* ------------------------------------------------------- vocabulary */}
      <h3>Words the builder does not know</h3>
      {r.validation.unrecognizedTerms.length === 0 ? (
        <p className="empty">
          Every word in this export is one the builder recognises, from its own config or by name.
        </p>
      ) : (
        <div className="card">
          <p className="small" style={{ marginTop: 0 }}>
            The field app is still adding vocabulary. Everything below was imported and stored exactly as it
            arrived — this is the field app moving ahead of the builder, which is expected and not a fault.{' '}
            {r.unrecognized.resolutions + r.unrecognized.events > 0 && (
              <>
                <strong>{r.unrecognized.resolutions}</strong> checklist item
                {r.unrecognized.resolutions === 1 ? '' : 's'} and <strong>{r.unrecognized.events}</strong> event
                {r.unrecognized.events === 1 ? '' : 's'} are marked unrecognised.
              </>
            )}
          </p>
          <table>
            <thead>
              <tr>
                <th>Where</th>
                <th>Word</th>
                <th className="num">Times</th>
                <th>Seen on</th>
              </tr>
            </thead>
            <tbody>
              {r.validation.unrecognizedTerms.map((t) => (
                <tr key={`${t.field}-${t.value}`}>
                  <td className="mono small">{t.field}</td>
                  <td>
                    <strong>{t.value}</strong>
                  </td>
                  <td className="num">{t.count}</td>
                  <td className="muted small">
                    {t.examples.join(', ')}
                    {t.count > t.examples.length && ' …'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------ checks */}
      <h3>What the builder checked</h3>
      {warnings.length === 0 ? (
        <p className="empty">Nothing unexpected. Every check that ran came back clean.</p>
      ) : (
        <>
          <h4>
            {warnings.length} thing{warnings.length === 1 ? '' : 's'} to look at
          </h4>
          <ul className="checks">
            {warnings.map((c, i) => (
              <li key={i} className={c.severity}>
                <div>{c.message}</div>
                <div className="code">{c.code}</div>
              </li>
            ))}
          </ul>
        </>
      )}
      {infos.length > 0 && (
        <>
          {/* Kept visually separate from warnings so the banner's count is never
              contradicted by what appears to be an extra unexplained entry. */}
          <h4>Also recorded — nothing needed</h4>
          <ul className="checks">
            {infos.map((c, i) => (
              <li key={i} className="info">
                <div className="muted">{c.message}</div>
                <div className="code">{c.code}</div>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="card" style={{ marginTop: 14 }}>
        <h4 style={{ marginTop: 0 }}>Checks that ran on this import</h4>
        <div className="row">
          {r.validation.checksRun.map((c) => <span key={c} className="pill ok">{c}</span>)}
        </div>
        <div className="hint">
          Listed so it is clear what has been verified and what has not. Still to come: copying the media files
          and verifying each one's checksum.
        </div>
      </div>
    </>
  )
}
