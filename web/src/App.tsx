import { useEffect, useState } from 'react'
import { ImportReportView } from './pages/ImportReport.js'
import { Properties } from './pages/Properties.js'
import { PropertyPage } from './pages/Property.js'

export type View =
  | { name: 'properties' }
  | { name: 'property'; id: string }
  | { name: 'report'; id: string }

const parseHash = (): View => {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [what, id] = h.split('/')
  if (what === 'property' && id) return { name: 'property', id }
  if (what === 'report' && id) return { name: 'report', id }
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
          <span className="sub">binder builder · increment 1 — import</span>
        </div>
      </header>
      <div className="shell">
        {view.name === 'properties' && <Properties />}
        {view.name === 'property' && <PropertyPage id={view.id} />}
        {view.name === 'report' && <ImportReportView id={view.id} />}
      </div>
    </>
  )
}
