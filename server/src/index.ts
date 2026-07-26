import express from 'express'
import multer from 'multer'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newId, now, openDb } from './db/index.js'
import { buildReport } from './import/report.js'
import { ImportRefused, runImport } from './import/runImport.js'

const db = openDb()
const app = express()
app.use(express.json({ limit: '2mb' }))

// Media archives are gigabytes — a baseline visit is 1.5-2 GB — so uploads
// stream to disk rather than through memory. The manifest is read back off disk
// afterwards; it is only a few hundred kilobytes.
const uploadRoot = join(tmpdir(), 'housesteady-uploads')
mkdirSync(uploadRoot, { recursive: true })
const upload = multer({ dest: uploadRoot, limits: { fileSize: 8 * 1024 * 1024 * 1024 } })

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

/**
 * Three upload shapes all work, per the build spec: a manifest on its own
 * (manifest-only mode), a manifest plus per-zone media archives, or one combined
 * archive. Files are sorted by what they are rather than by which form field
 * they arrived in, so the operator does not have to get that right.
 */
app.post('/api/visits/:id/import', upload.any(), async (req, res) => {
  const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(req.params.id) as
    | { id: string; property_id: string }
    | undefined
  const uploaded = (req.files as Express.Multer.File[] | undefined) ?? []
  const cleanUp = () => {
    for (const f of uploaded) rmSync(f.path, { force: true })
  }

  if (!visit) {
    cleanUp()
    return res.status(404).json({ error: 'No such visit.' })
  }

  const isZip = (f: Express.Multer.File) =>
    f.originalname.toLowerCase().endsWith('.zip') || f.mimetype === 'application/zip'
  const manifestFile = uploaded.find((f) => !isZip(f))
  const mediaZips = uploaded.filter(isZip).map((f) => f.path)

  let raw: string
  if (manifestFile) {
    raw = readFileSync(manifestFile.path, 'utf8')
  } else if (req.body?.useReferenceFixture) {
    // Dev shortcut: the reference export, one click. It is the increment's
    // primary acceptance test, so it should be trivially repeatable.
    raw = readFileSync(join(repoRoot, 'fixtures', 'reference', 'housesteady-019f9a33-manifest.json'), 'utf8')
  } else if (req.body?.useSyntheticFixture) {
    raw = readFileSync(join(repoRoot, 'fixtures', 'synthetic', 'manifest.json'), 'utf8')
  } else {
    cleanUp()
    return res.status(400).json({ error: 'Attach a manifest.json file.' })
  }

  try {
    const { importId, status } = await runImport({
      db,
      propertyId: visit.property_id,
      visitId: visit.id,
      raw,
      mediaZips,
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
  } finally {
    cleanUp()
  }
})

app.get('/api/imports/:id/report', (req, res) => {
  const report = buildReport(db, req.params.id)
  if (!report) return res.status(404).json({ error: 'No such import.' })
  res.json(report)
})

const port = Number(process.env.PORT ?? 5174)
app.listen(port, () => console.log(`[api] http://localhost:${port}`))
