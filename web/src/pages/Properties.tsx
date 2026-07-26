import { useEffect, useState } from 'react'
import { go } from '../App.js'
import { api, type Property } from '../api.js'

export function Properties() {
  const [properties, setProperties] = useState<Property[]>([])
  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = () => api.listProperties().then(setProperties).catch((e) => setError(e.message))
  useEffect(() => { void load() }, [])

  const create = async () => {
    setError(null)
    try {
      const p = await api.createProperty(label.trim(), address.trim())
      setLabel('')
      setAddress('')
      go({ name: 'property', id: p.id })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <h2>Properties</h2>
      <p className="lede">Every house the builder holds a record for. One property, many visits, forever.</p>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Add a property</h4>
        <div className="row">
          <input
            type="text"
            placeholder="Label — how you refer to it"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            type="text"
            placeholder="Address (optional)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <button onClick={create} disabled={!label.trim()}>
            Add property
          </button>
        </div>
        <div className="hint">
          The address is worth filling in. A field export identifies the house only by a free-text label the
          operator typed, so the address is what the builder compares against to catch a visit filed under the
          wrong house.
        </div>
        {error && <p style={{ color: 'var(--error)' }}>{error}</p>}
      </div>

      {properties.length === 0 ? (
        <p className="empty">No properties yet. Add one above, then import a visit into it.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Property</th>
              <th>Address</th>
              <th className="num">Visits</th>
              <th className="num">Imports</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => go({ name: 'property', id: p.id })}>
                <td><strong>{p.label}</strong></td>
                <td className="muted">{p.address ?? '—'}</td>
                <td className="num">{p.visit_count ?? 0}</td>
                <td className="num">{p.import_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
