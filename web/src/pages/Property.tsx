import { useEffect, useRef, useState } from 'react'
import { go } from '../App.js'
import { api, fmtTime, type Check, type Property, type Visit } from '../api.js'

export function PropertyPage({ id }: { id: string }) {
  const [property, setProperty] = useState<Property | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [kind, setKind] = useState('baseline')
  const [visitDate, setVisitDate] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<Check[] | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const load = () =>
    api
      .getProperty(id)
      .then((d) => {
        setProperty(d.property)
        setVisits(d.visits)
      })
      .catch((e) => setError(e.message))

  useEffect(() => { void load() }, [id])

  const addVisit = async () => {
    setError(null)
    try {
      await api.createVisit(id, kind, visitDate)
      setVisitDate('')
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const doImport = async (visitId: string, run: () => Promise<{ importId: string }>) => {
    setBusy(visitId)
    setError(null)
    setRefusal(null)
    try {
      const { importId } = await run()
      go({ name: 'report', id: importId })
    } catch (e) {
      setError((e as Error).message)
      const checks = (e as unknown as { checks?: Check[] }).checks
      if (checks?.length) setRefusal(checks)
    } finally {
      setBusy(null)
    }
  }

  if (!property) return <p className="empty">{error ?? 'Loading…'}</p>

  return (
    <>
      <div className="crumbs">
        <a className="crumb" onClick={() => go({ name: 'properties' })}>Properties</a> › {property.label}
      </div>

      <h2>{property.label}</h2>
      <p className="lede">{property.address ?? <span className="muted">No address recorded.</span>}</p>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Add a visit</h4>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="baseline">Baseline</option>
            <option value="monthly">Monthly</option>
            <option value="other">Other</option>
          </select>
          <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
          <button onClick={addVisit}>Add visit</button>
        </div>
        <div className="hint">
          The export does not say which kind of visit it was — the checklist config hints at it, but the record
          keeps what you say here.
        </div>
      </div>

      {error && (
        <div className="banner failed">
          <div className="status">Import refused</div>
          <div className="detail">{error}</div>
          {refusal && (
            <ul className="checks" style={{ marginTop: 12 }}>
              {refusal.map((c, i) => (
                <li key={i} className={c.severity}>
                  <div>{c.message}</div>
                  <div className="code">{c.code}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h3>Visits</h3>
      {visits.length === 0 ? (
        <p className="empty">No visits yet. Add one above, then import its export into it.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Visit</th>
              <th>Date</th>
              <th>Created</th>
              <th>Import</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id}>
                <td style={{ textTransform: 'capitalize' }}><strong>{v.kind}</strong></td>
                <td className="muted">{v.visit_date ?? '—'}</td>
                <td className="muted small">{fmtTime(v.created_at)}</td>
                <td>
                  {v.latest_import_id ? (
                    <div className="row">
                      <span className={`pill ${v.latest_status === 'ok' ? 'ok' : 'warn'}`}>
                        {v.latest_status === 'ok_with_warnings' ? 'imported with warnings' : 'imported'}
                      </span>
                      <button className="ghost" onClick={() => go({ name: 'report', id: v.latest_import_id! })}>
                        View report
                      </button>
                    </div>
                  ) : (
                    <div className="stack">
                      <div className="row">
                        <input
                          type="file"
                          multiple
                          accept=".json,.zip,application/json,application/zip"
                          ref={(el) => { fileInputs.current[v.id] = el }}
                          onChange={(e) => {
                            const files = e.target.files
                            if (files?.length) void doImport(v.id, () => api.importFiles(v.id, files))
                          }}
                        />
                      </div>
                      <div className="hint" style={{ marginTop: 0 }}>
                        Pick the <code>manifest.json</code> on its own, or select it together with the visit's
                        media archives — the order does not matter.
                      </div>
                      <div className="row">
                        <button
                          className="ghost"
                          disabled={busy === v.id}
                          onClick={() => void doImport(v.id, () => api.importReferenceFixture(v.id))}
                        >
                          {busy === v.id ? 'Importing…' : 'Import the reference export'}
                        </button>
                        <span className="hint" style={{ marginTop: 0 }}>
                          dev shortcut — loads /fixtures/reference straight from disk
                        </span>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
