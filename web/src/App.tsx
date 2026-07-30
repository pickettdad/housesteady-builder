import { useEffect, useState } from 'react'
import { AuditView } from './pages/Audit.js'
import { ImportReportView } from './pages/ImportReport.js'
import { Properties } from './pages/Properties.js'
import { PropertyPage } from './pages/Property.js'
import { PassView } from './pass/Pass.js'

export type View =
  | { name: 'properties' }
  | { name: 'property'; id: string }
  | { name: 'report'; id: string }
  | { name: 'pass'; id: string }
  // §1i — the audit is property-scoped, so its route is too. A visit-shaped URL
  // would invite a visit-shaped evaluation back in through the front door.
  | { name: 'audit'; id: string }

const parseHash = (): View => {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [what, id] = h.split('/')
  if (what === 'property' && id) return { name: 'property', id }
  if (what === 'report' && id) return { name: 'report', id }
  if (what === 'pass' && id) return { name: 'pass', id }
  if (what === 'audit' && id) return { name: 'audit', id }
  return { name: 'properties' }
}

export const go = (view: View): void => {
  window.location.hash =
    view.name === 'properties' ? '#/' : `#/${view.name}/${'id' in view ? view.id : ''}`
}

export function App() {
  const [view, setView] = useState<View>(parseHash)

  useEffect(() => {
    const onHash = () => setView(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <>
      <header className="top">
        <div className="shell">
          <h1>
            <a className="crumb" onClick={() => go({ name: 'properties' })}>
              HouseSteady
            </a>
          </h1>
          <span className="sub">binder builder · increment 3 — the audit engine</span>
        </div>
      </header>
      <div className="shell">
        {view.name === 'properties' && <Properties />}
        {view.name === 'property' && <PropertyPage id={view.id} />}
        {view.name === 'report' && <ImportReportView id={view.id} />}
        {view.name === 'pass' && <PassView visitId={view.id} />}
        {view.name === 'audit' && <AuditView propertyId={view.id} />}
      </div>
    </>
  )
}
