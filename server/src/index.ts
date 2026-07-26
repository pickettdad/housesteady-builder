import express from 'express'
import multer from 'multer'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { newId, now, openDb } from './db/index.js'
import { buildReport } from './import/report.js'
import { ImportRefused, runImport } from './import/runImport.js'

const db = openDb()
const app = express()
app.use(express.json({ limit: '2mb' }))

// Manifests are small (215 KB for a two-zone visit). Media zips are gigabytes and
// arrive with the checksum pass — they will stream to disk, not through memory.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024 * 1024 } })

const repoRoot = join(import.meta.dirname, '..', '..')

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// ------------------------------------------------------------------ properties

app.get('/api/properties', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM visits v WHERE v.property_id = p.id) AS visit_count,
        (SELECT COUNT(*) FROM imports i WHERE i.property_id = p.id) AS import_count
       FROM properties p ORDER BY p.created_at DESC`,
    )
    .all()
  res.json(rows)
})

app.post('/api/properties', (req, res) => {
  const label = String(req.body?.label ?? '').trim()
  if (!label) return res.status(400).json({ error: 'A property needs a label.' })
  const id = newId()
  db.prepare('INSERT INTO properties (id, label, address, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    label,
    req.body?.address ? String(req.body.address).trim() : null,
    now(),
  )
  res.status(201).json(db.prepare('SELECT * FROM properties WHERE id = ?').get(id))
})

app.get('/api/properties/:id', (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id)
  if (!property) return res.status(404).json({ error: 'No such property.' })
  const visits = db
    .prepare(
      `SELECT v.*,
        (SELECT COUNT(*) FROM imports i WHERE i.visit_id = v.id) AS import_count,
        (SELECT i.id FROM imports i WHERE i.visit_id = v.id ORDER BY i.imported_at DESC LIMIT 1) AS latest_import_id,
        (SELECT i.status FROM imports i WHERE i.visit_id = v.id ORDER BY i.imported_at DESC LIMIT 1) AS latest_status
       FROM visits v WHERE v.property_id = ? ORDER BY v.created_at DESC`,
    )
    .all(req.params.id)
  res.json({ property, visits })
})

// ---------------------------------------------------------------------- visits

app.post('/api/properties/:id/visits', (req, res) => {
  const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(req.params.id)
  if (!property) return res.status(404).json({ error: 'No such property.' })

  // The manifest does not declare which kind of visit it was — the only hint is
  // the config id. So the operator says, and the record keeps their word.
  const kind = String(req.body?.kind ?? 'baseline')
  const id = newId()
  db.prepare(
    'INSERT INTO visits (id, property_id, kind, visit_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, req.params.id, kind, req.body?.visitDate ?? null, req.body?.notes ?? null, now())
  res.status(201).json(db.prepare('SELECT * FROM visits WHERE id = ?').get(id))
})

app.get('/api/visits/:id/summary', (req, res) => {
  const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(req.params.id)
  if (!visit) return res.status(404).json({ error: 'No such visit.' })
  const imports = db
    .prepare('SELECT id, imported_at, status, app_version, media_mode FROM imports WHERE visit_id = ? ORDER BY imported_at DESC')
    .all(req.params.id)
  res.json({ visit, imports })
})

// --------------------------------------------------------------------- imports

app.post('/api/visits/:id/import', upload.single('manifest'), (req, res) => {
  const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(req.params.id) as
    | { id: string; property_id: string }
    | undefined
  if (!visit) return res.status(404).json({ error: 'No such visit.' })

  let raw: string
  if (req.file) {
    raw = req.file.buffer.toString('utf8')
  } else if (req.body?.useReferenceFixture) {
    // Dev shortcut: the reference export, one click. It is the increment's
    // primary acceptance test, so it should be trivially repeatable.
    raw = readFileSync(join(repoRoot, 'fixtures', 'reference', 'housesteady-019f9a33-manifest.json'), 'utf8')
  } else {
    return res.status(400).json({ error: 'Attach a manifest.json file.' })
  }

  try {
    const { importId, status } = runImport({
      db,
      propertyId: visit.property_id,
      visitId: visit.id,
      raw,
    })
    res.status(201).json({ importId, status })
  } catch (e) {
    if (e instanceof ImportRefused) {
      // A refused import is informative, not a stack trace. It names what is
      // wrong with the file so the operator can go and get a good one.
      return res.status(422).json({ error: e.message, checks: e.checks, refused: true })
    }
    console.error(e)
    res.status(500).json({ error: (e as Error).message })
  }
})

app.get('/api/imports/:id/report', (req, res) => {
  const report = buildReport(db, req.params.id)
  if (!report) return res.status(404).json({ error: 'No such import.' })
  res.json(report)
})

const port = Number(process.env.PORT ?? 5174)
app.listen(port, () => console.log(`[api] http://localhost:${port}`))
