import express from 'express'
import multer from 'multer'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  acceptReading, acceptRoute, discardProposal, findGeneration, withdrawAcceptance,
} from './ai/accept.js'
import { queueProgress, requeueFailed } from './ai/queue.js'
import { buildAssists } from './ai/screen.js'
import { EXTRACT_TASK, pinForMedia } from './ai/tasks/nameplate.js'
import { queueAssists } from './ai/tasks/index.js'
import { PIN_TYPE_TASK } from './ai/tasks/pinType.js'
import { ROUTING_TASK } from './ai/tasks/routing.js'
import { startDrain } from './ai/worker.js'
import type { ColumnId } from './audit/carriedItems.js'
import { latestRun, runAudit } from './audit/run.js'
import { walkedAt } from './audit/walkedAt.js'
import { addManualRow, buildDraft, rowTrail, writeEdit, type EditKind } from './report/draft.js'
import { HouseStyleRefused, rules as houseStyleRules } from './report/houseStyle.js'
import { editionHtml, editions, RenderRefused, signEdition } from './report/render.js'
import { itemSeries } from './audit/itemSeries.js'
import { deskWork, DeskWorkRefused, runningSpan, startWork, stopWork } from './desk/work.js'
import { buildSessionPlan } from './plan/sessionPlan.js'
import { describeItems, loadClientNames, naLabelMap, supersededNames, unratifiedNames, writeName } from './report/names.js'
import { SchemaRefused } from './audit/schema.js'
import { newId, now, openDb } from './db/index.js'
import {
  createOperator, currentOperator, deactivateOperator, displayNameFor, listOperators,
  OperatorRefused, resolveOperator,
} from './operators/registry.js'
import { buildReport } from './import/report.js'
import { ImportRefused, runImport } from './import/runImport.js'
import { resolveState } from './overlay/model.js'
import { latestLiveDecision, OverlayRefused, readOne, readVisitOverlays, writeOverlay } from './overlay/store.js'
import {
  acknowledgeDeskMedia,
  deskMediaPath,
  findDeskMedia,
  saveMemoryAudio,
} from './pass/memory.js'
import { buildPass, orderedZoneIds } from './pass/read.js'
import { completePass, openZone, PassRefused, reopenIfCompleted, reopenPass, startPass } from './pass/store.js'
import {
  findMedia,
  isThumbWidth,
  resolveOriginal,
  THUMB_WIDTHS,
  thumbnail,
  warmZone,
  type MediaResolution,
} from './pass/thumbs.js'

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

/**
 * Which operator is acting.
 *
 * From SERVER CONFIGURATION, never from the request body. With no authentication
 * — deliberately out of scope for Increment 2c — a client naming its own actor
 * is an unverifiable claim, and accepting one would put a name on a record on
 * the strength of whatever the browser said. Configuration is the honest source
 * until hosting brings a real answer.
 */
const acting = (): string => currentOperator(db).id

/** Refusals about who is acting are the caller's problem to fix, not a crash. */
const operatorGuard = (res: express.Response, e: unknown): boolean => {
  if (e instanceof OperatorRefused) {
    res.status(409).json({ error: e.message, code: e.code })
    return true
  }
  return false
}

app.get('/api/operators', (_req, res) => {
  res.json(listOperators(db, { includeInactive: String(_req.query.all) === 'true' }))
})

app.post('/api/operators', (req, res) => {
  try {
    res.status(201).json(createOperator(db, {
      displayName: String(req.body?.displayName ?? ''),
      shortCode: String(req.body?.shortCode ?? ''),
    }))
  } catch (e) {
    if (operatorGuard(res, e)) return
    throw e
  }
})

app.post('/api/operators/:id/deactivate', (req, res) => {
  try {
    res.json(deactivateOperator(db, resolveOperator(db, req.params.id).id))
  } catch (e) {
    if (operatorGuard(res, e)) return
    throw e
  }
})

/**
 * Run an audit — Increment 3 §1i.
 *
 * **PROPERTY-scoped.** The evaluation reads everything the property has
 * accumulated, across every import. A visit-scoped audit reads §7's systems
 * inventory as empty on the first monthly run — every component was captured at
 * the Baseline — and the gap report then announces "no components recorded" for
 * a house whose furnace has been in the binder for a year.
 *
 * A re-run is a NEW run, never an update. §3 stores results so a rendered gap
 * report stays reproducible, and overwriting the row a report was rendered from
 * would take that away for the sake of one less row.
 */
app.post('/api/properties/:id/audit', (req, res) => {
  const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(req.params.id) as
    | { id: string }
    | undefined
  if (!property) return res.status(404).json({ error: 'No such property.' })

  const imports = db
    .prepare('SELECT COUNT(*) AS n FROM imports WHERE property_id = ?')
    .get(property.id) as { n: number }
  if (imports.n === 0) {
    return res.status(409).json({ error: 'Nothing has been imported for this property yet.', code: 'audit.no-import' })
  }

  // Which visit TRIGGERED the run, optionally. Never a filter on what is
  // evaluated — and §1j allows an import with no visit at all, so a run may have
  // no triggering visit.
  const triggering = req.body?.visitId
    ? visitOr404(String(req.body.visitId), res)
    : (db.prepare(
        `SELECT id, property_id, kind FROM visits WHERE property_id = ? ORDER BY created_at DESC LIMIT 1`,
      ).get(property.id) as { id: string; property_id: string; kind: string } | undefined)
  if (req.body?.visitId && !triggering) return

  try {
    const result = runAudit({
      db,
      propertyId: property.id,
      visitId: triggering?.id ?? null,
      // The visit kind decides which checklist items were ever in scope, and the
      // manifest does not declare it. With no triggering visit — a property-scoped
      // artifact — a baseline is the widest reading and therefore the safe one.
      visitKind: triggering?.kind ?? 'baseline',
      actorId: acting(),
    })
    res.status(201).json({ ...result, contributions: Object.fromEntries(result.contributions) })
  } catch (e) {
    if (operatorGuard(res, e)) return
    if (e instanceof SchemaRefused) return res.status(422).json({ error: e.message, code: e.code })
    throw e
  }
})

/** The most recent run for a property, read back from storage rather than recomputed. */
app.get('/api/properties/:id/audit', (req, res) => {
  const stored = latestRun(db, req.params.id)
  if (!stored) return res.status(404).json({ error: 'This property has not been audited yet.' })
  res.json(stored)
})

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
  db.prepare(
    'INSERT INTO properties (id, label, address, created_at, actor_id) VALUES (?, ?, ?, ?, ?)',
  ).run(
    id,
    label,
    req.body?.address ? String(req.body.address).trim() : null,
    now(),
    acting(),
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
  // `performed_by` is who was in the house — the client-facing "visited by"
  // line — and it is left null when not yet known rather than defaulting to
  // whoever created the row. Doctrine 4: an explicit unknown is information, and
  // a visit booked in advance genuinely has no answer yet. `actor_id` still
  // records who booked it.
  const performedBy = req.body?.performedBy ? resolveOperator(db, String(req.body.performedBy)).id : null
  db.prepare(
    `INSERT INTO visits (id, property_id, kind, planned_date, notes, created_at, actor_id, performed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, req.params.id, kind, req.body?.plannedDate ?? null, req.body?.notes ?? null, now(),
        acting(), performedBy)
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
      actorId: acting(),
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

// -------------------------------------------------------------------- overlays
//
// Everything the desk says about what the field captured. Four acts plus recall
// plus retraction, all one insert-only table — see migration 003.

const visitOr404 = (
  visitId: string,
  res: express.Response,
): { id: string; property_id: string; kind: string } | undefined => {
  // `kind` travels with the visit because the audit needs it and the manifest
  // does not declare it — see the audit route.
  const visit = db.prepare('SELECT id, property_id, kind FROM visits WHERE id = ?').get(visitId) as
    | { id: string; property_id: string; kind: string }
    | undefined
  if (!visit) {
    res.status(404).json({ error: 'No such visit.' })
    return undefined
  }
  return visit
}

/**
 * The whole overlay record for a visit: current state per entity, and the trail.
 *
 * Both come from the same rows. State is a filter over history rather than a
 * second copy of it, so the two can never disagree — which is the reason there
 * is no derived-state table to keep in step.
 */
app.get('/api/visits/:id/overlays', (req, res) => {
  const visit = visitOr404(req.params.id, res)
  if (!visit) return

  const overlays = readVisitOverlays(db, visit.id)
  const states = resolveState(overlays)
  res.json({
    overlays,
    entities: [...states.values()],
    latestLive: latestLiveDecision(db, visit.id) ?? null,
  })
})

app.post('/api/visits/:id/overlays', (req, res) => {
  const visit = visitOr404(req.params.id, res)
  if (!visit) return

  try {
    const overlay = writeOverlay({
      db,
      propertyId: visit.property_id,
      visitId: visit.id,
      kind: req.body?.kind,
      targetKind: req.body?.targetKind,
      targetId: req.body?.targetId,
      field: req.body?.field ?? null,
      newValue: req.body?.newValue,
      reason: req.body?.reason ?? null,
      supersedesId: req.body?.supersedesId ?? null,
      actor: req.body?.actor,
      actorId: acting(),
    })
    reopenIfCompleted(db, visit.id, acting())
    res.status(201).json(overlay)
  } catch (e) {
    if (e instanceof OverlayRefused) return res.status(422).json({ error: e.message, code: e.code })
    console.error(e)
    res.status(500).json({ error: (e as Error).message })
  }
})

/**
 * Undo. With no body it takes back the most recent live act in the visit, which
 * is what the `u` keystroke sends and what a person means by the word.
 */
app.post('/api/visits/:id/overlays/undo', (req, res) => {
  const visit = visitOr404(req.params.id, res)
  if (!visit) return

  const targetId = req.body?.overlayId ?? latestLiveDecision(db, visit.id)?.id
  if (!targetId) return res.status(404).json({ error: 'Nothing to undo.' })

  try {
    // An act that answered a proposal is taken back through the acceptance
    // path, not the plain one — the overlay is superseded either way, but the
    // generation has to return to `pending` too. Leaving it `accepted` while
    // the value it set has been withdrawn would make the row claim a value is
    // current that is not, and the same `u` keystroke reaches both.
    const target = readOne(db, targetId)
    if (target?.generationId) {
      const undone = withdrawAcceptance(db, targetId, { actorId: acting(), reason: req.body?.reason ?? undefined })
      reopenIfCompleted(db, visit.id, acting())
      return res.status(201).json(undone)
    }

    const overlay = writeOverlay({
      db,
      propertyId: visit.property_id,
      visitId: visit.id,
      kind: 'undo',
      // Ignored — an undo adopts the target of the decision it retracts.
      targetKind: 'overlay',
      targetId,
      supersedesId: targetId,
      reason: req.body?.reason ?? null,
      actor: req.body?.actor,
      actorId: acting(),
    })
    reopenIfCompleted(db, visit.id, acting())
    res.status(201).json(overlay)
  } catch (e) {
    if (e instanceof OverlayRefused) return res.status(422).json({ error: e.message, code: e.code })
    console.error(e)
    res.status(500).json({ error: (e as Error).message })
  }
})

// ------------------------------------------------------------------ the pass
//
// The desk-side walk, zone by zone, in visit order. Spec §5.

app.get('/api/visits/:id/pass', (req, res) => {
  const model = buildPass(db, req.params.id)
  if (!model) return res.status(404).json({ error: 'No such visit.' })
  res.json(model)
})

app.post('/api/visits/:id/pass/start', (req, res) => {
  try {
    res.json(startPass(db, req.params.id, acting()))
  } catch (e) {
    if (e instanceof PassRefused) return res.status(422).json({ error: e.message, code: e.code })
    throw e
  }
})

app.post('/api/visits/:id/pass/zones/:zoneId/open', async (req, res) => {
  try {
    const pass = openZone(db, req.params.id, req.params.zoneId, acting())
    res.json(pass)

    // Thumbnails start being made now, after the response has gone, and nothing
    // waits on them — see the note at the top of thumbs.ts.
    //
    // This room AND the one after it. Warming only the current room means every
    // room costs its own cold wait; warming the next one too means that wait is
    // paid while somebody is still reading this room, so after room one it
    // disappears. Sequential rather than parallel, because the room being looked
    // at right now should finish first.
    void (async () => {
      const order = orderedZoneIds(db, req.params.id)
      const next = order[order.indexOf(req.params.zoneId) + 1]
      await warmZone(db, req.params.id, req.params.zoneId).catch(() => 0)
      if (next) await warmZone(db, req.params.id, next).catch(() => 0)
    })()
  } catch (e) {
    if (e instanceof PassRefused) return res.status(422).json({ error: e.message, code: e.code })
    throw e
  }
})

app.post('/api/visits/:id/pass/complete', (req, res) => {
  try {
    // force = the concierge was shown what is outstanding and said yes anyway.
    res.json(completePass(db, req.params.id, { force: Boolean(req.body?.force), actorId: acting() }))
  } catch (e) {
    if (e instanceof PassRefused) {
      return res.status(422).json({ error: e.message, code: e.code, outstanding: e.outstanding })
    }
    throw e
  }
})

app.post('/api/visits/:id/pass/reopen', (req, res) => {
  try {
    res.json(reopenPass(db, req.params.id, acting()))
  } catch (e) {
    if (e instanceof PassRefused) return res.status(422).json({ error: e.message, code: e.code })
    throw e
  }
})

// ------------------------------------------------------------------ memory
//
// What the concierge remembers about a room, recorded at the desk. Spec §4-5.
// The audio is the evidence; transcription is 2b and never replaces it.

app.post('/api/visits/:id/memory/audio', upload.single('audio'), (req, res) => {
  const visit = visitOr404(String(req.params.id), res)
  const file = req.file
  if (!visit) {
    if (file) rmSync(file.path, { force: true })
    return
  }
  if (!file) return res.status(400).json({ error: 'No recording arrived.' })

  const zoneId = String(req.body?.zoneId ?? '')
  if (!zoneId) {
    rmSync(file.path, { force: true })
    return res.status(400).json({ error: 'A recording belongs to a room.' })
  }

  try {
    const num = (v: unknown): number | null => {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const { media } = saveMemoryAudio({
      db,
      propertyId: visit.property_id,
      visitId: visit.id,
      zoneId,
      tempPath: file.path,
      actorId: acting(),
      mime: file.mimetype ?? null,
      durationMs: num(req.body?.durationMs),
      // Measured in the browser while recording. A muted microphone yields a
      // file of the right length full of near-silence, so length alone cannot
      // catch it — this number is what can.
      peakLevel: num(req.body?.peakLevel),
    })
    reopenIfCompleted(db, visit.id, acting())
    res.status(201).json({
      id: media.id,
      durationMs: media.duration_ms,
      bytes: media.bytes,
      peakLevel: media.peak_level,
      silent: media.silent === 1,
    })
  } catch (e) {
    rmSync(file.path, { force: true })
    console.error(e)
    res.status(500).json({ error: (e as Error).message })
  }
})

/** Typed recall, for when speaking aloud is not on. Same overlay, other field. */
app.post('/api/visits/:id/memory/text', (req, res) => {
  const visit = visitOr404(req.params.id, res)
  if (!visit) return
  const zoneId = String(req.body?.zoneId ?? '')
  const text = String(req.body?.text ?? '').trim()
  if (!zoneId || !text) return res.status(400).json({ error: 'A note needs a room and some words.' })

  try {
    const overlay = writeOverlay({
      db, propertyId: visit.property_id, visitId: visit.id,
      kind: 'memory', targetKind: 'zone', targetId: zoneId, field: 'text',
      newValue: { text },
      actorId: acting(),
      // The provenance, verbatim from spec §4. The honesty label stays
      // Observed — the concierge did see the room; this says when it was
      // written down, which is the honest distinction.
      reason: 'human-entered, desk, from recall',
    })
    reopenIfCompleted(db, visit.id, acting())
    res.status(201).json(overlay)
  } catch (e) {
    if (e instanceof OverlayRefused) return res.status(422).json({ error: e.message, code: e.code })
    throw e
  }
})

/** "I know it is silent, keep it." A recorded act, never an assumption. */
app.post('/api/visits/:id/memory/:mediaId/acknowledge', (req, res) => {
  const visit = visitOr404(req.params.id, res)
  if (!visit) return
  const media = findDeskMedia(db, req.params.mediaId)
  if (!media || media.visit_id !== visit.id) return res.status(404).json({ error: 'No such recording.' })
  res.json(acknowledgeDeskMedia(db, media.id))
})

app.get('/api/visits/:id/memory/:mediaId/audio', (req, res) => {
  const visit = visitOr404(req.params.id, res)
  if (!visit) return
  const media = findDeskMedia(db, req.params.mediaId)
  if (!media || media.visit_id !== visit.id) return res.status(404).json({ error: 'No such recording.' })
  res.setHeader('Content-Type', media.mime ?? 'audio/webm')
  res.sendFile(deskMediaPath(media))
})

// ----------------------------------------------------------------- assists
//
// Increment 2b. Proposals sit beside the record and never in it; an acceptance
// is an ordinary overlay and the pass reads it back through the same state
// resolution as a correction typed by hand.
//
// NO ROUTE HERE WAITS ON A MODEL CALL. §0.4 — the pass is fully usable with no
// API key, no network, or a failed job. `run` starts a drain and returns; the
// screen finds out what happened by reading the job rows, which is also what it
// does after a restart.

app.get('/api/visits/:id/assists', (req, res) => {
  const visit = visitOr404(req.params.id, res)
  if (!visit) return
  res.json(buildAssists(db, visit.id))
})

app.post('/api/visits/:id/assists/run', (req, res) => {
  const visit = visitOr404(req.params.id, res)
  if (!visit) return

  // Re-queueing is idempotent, so pressing this twice costs nothing. Failed
  // jobs come back only when asked for — §4's deliberate opt-in, because a
  // retry loop that runs by itself is how a cap gets spent on a bad file.
  const requeued = req.body?.retryFailed ? requeueFailed(db, visit.id) : 0
  const queued = queueAssists(db, visit.property_id, visit.id, acting())

  void startDrain(db, visit.id)
  res.status(202).json({ queued, requeued, progress: queueProgress(db, visit.id) })
})

/**
 * Accept a proposal, possibly after editing it.
 *
 * Dispatched on the generation's own task rather than on a body field: the
 * caller says which value it is accepting, never which machinery to use, so a
 * mislabelled request cannot write a routing answer into a nameplate field.
 */
app.post('/api/visits/:id/assists/:generationId/accept', (req, res) => {
  const visit = visitOr404(req.params.id, res)
  if (!visit) return

  const gen = findGeneration(db, req.params.generationId)
  if (!gen || gen.visit_id !== visit.id) return res.status(404).json({ error: 'No such proposal in this visit.' })

  try {
    const common = {
      db,
      propertyId: visit.property_id,
      visitId: visit.id,
      generationId: gen.id,
      actor: req.body?.actor,
      actorId: acting(),
    }

    // A routing suggestion is answered by attaching the photograph, which is an
    // ordinary assignment. See acceptRoute for why it is not its own kind.
    if (gen.task === ROUTING_TASK) {
      const pinId = String(req.body?.pinId ?? '')
      if (!pinId) return res.status(400).json({ error: 'Say which pin the photograph belongs to.' })
      const result = acceptRoute({ ...common, mediaId: gen.target_id ?? '', pinId })
      reopenIfCompleted(db, visit.id, acting())
      return res.status(201).json(result)
    }

    // A nameplate reading is about the photograph but belongs to the pin the
    // photograph is on — the plate is a fact about the water heater, not about
    // the image of it.
    const targetId =
      gen.task === EXTRACT_TASK ? (pinForMedia(db, visit.id, gen.target_id ?? '') ?? '') : (gen.target_id ?? '')
    if (!targetId) {
      return res.status(422).json({
        error: 'That photograph is not attached to a pin, so there is nothing for the reading to belong to.',
        code: 'assist.no-pin',
      })
    }

    // A whole plate goes in as one act — see acceptReading. A pin type is one
    // field and arrives as one value, so it is spelled the same way here.
    const values: Record<string, unknown> =
      gen.task === PIN_TYPE_TASK
        ? { type: req.body?.value }
        : ((req.body?.values ?? {}) as Record<string, unknown>)

    if (Object.keys(values).length === 0 || Object.values(values).some((v) => v === undefined)) {
      return res.status(400).json({ error: 'There is no value to accept.' })
    }

    const result = acceptReading({ ...common, targetKind: 'pin', targetId, values })
    reopenIfCompleted(db, visit.id, acting())
    res.status(201).json(result)
  } catch (e) {
    if (e instanceof OverlayRefused) return res.status(422).json({ error: e.message, code: e.code })
    console.error(e)
    res.status(500).json({ error: (e as Error).message })
  }
})

app.post('/api/visits/:id/assists/:generationId/discard', (req, res) => {
  const visit = visitOr404(req.params.id, res)
  if (!visit) return

  const gen = findGeneration(db, req.params.generationId)
  if (!gen || gen.visit_id !== visit.id) return res.status(404).json({ error: 'No such proposal in this visit.' })

  try {
    // Recorded, never deleted. A model that keeps proposing the same wrong
    // thing is a prompt problem and the discards are the evidence.
    res.json(discardProposal(db, gen.id, {
      actorId: acting(),
      note: req.body?.note ? String(req.body.note) : undefined,
    }))
  } catch (e) {
    if (e instanceof OverlayRefused) return res.status(422).json({ error: e.message, code: e.code })
    throw e
  }
})

// ------------------------------------------------------------------- media
//
// Files are served by media id, never by path. The path is storage location;
// ownership and identity live in the row, and a URL built from a path would
// break the moment the data directory moved.

const sendResolution = (res: express.Response, r: MediaResolution) => {
  if (r.ok) {
    // The bytes for a given media id never change — the import refuses to
    // overwrite one — so this can be cached hard.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
    res.setHeader('Content-Type', r.mime)
    return res.sendFile(r.path)
  }
  // 404 with the reason in it, rather than a broken image. A quarantined file
  // and a file that never arrived are different facts and the tile says which.
  return res.status(404).json({ error: r.message, reason: r.reason })
}

app.get('/api/visits/:id/media/:mediaId', (req, res) => {
  const media = findMedia(db, req.params.id, req.params.mediaId)
  sendResolution(res, resolveOriginal(media))
})

app.get('/api/visits/:id/media/:mediaId/thumb', async (req, res) => {
  const width = Number(req.query.w ?? 400)
  if (!isThumbWidth(width)) {
    return res.status(400).json({ error: `Thumbnails come in ${THUMB_WIDTHS.join(' and ')} pixels.` })
  }
  const media = findMedia(db, req.params.id, req.params.mediaId)
  sendResolution(res, await thumbnail(media, width))
})

// ---------------------------------------------------------- the gap report

/**
 * The gap report as an editable draft — Increment 4 §1d and §5.
 *
 * **Read is a projection, never a stored document.** The rows come from the
 * latest audit run plus the append-only edit log, resolved on read. A stored
 * draft would be a second copy of the audit's answer, free to drift from it the
 * moment the audit re-runs — and the whole reason edits key on the row rather
 * than on the run is that an editorial decision survives a re-run.
 */
app.get('/api/properties/:id/report', (req, res) => {
  const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(req.params.id) as
    | { id: string }
    | undefined
  if (!property) return res.status(404).json({ error: 'No such property.' })

  const draft = buildDraft({
    db, propertyId: property.id, describe: describeItems(db), labels: naLabelMap(),
  })
  res.json({ ...draft, unratifiedNames: unratifiedNames(db), supersededNames: supersededNames(db) })
})

/** One editorial decision. Append-only — nothing here updates or deletes a row. */
app.post('/api/properties/:id/report/rows/:rowKey/:kind', (req, res) => {
  const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(req.params.id) as
    | { id: string }
    | undefined
  if (!property) return res.status(404).json({ error: 'No such property.' })

  const kind = req.params.kind
  if (!['include', 'exclude', 'reword', 'retire', 'column'].includes(kind)) {
    return res.status(400).json({ error: `${kind} is not an edit this build makes.` })
  }
  if (kind === 'reword' && !String(req.body?.text ?? '').trim()) {
    // An empty rewording would silently blank a row that had a sentence. The
    // way to remove a row is to exclude it, which says so in the record.
    return res.status(400).json({ error: 'A rewording needs words. To remove a row, exclude it.' })
  }

  try {
    const id = writeEdit({
      db, propertyId: property.id, rowKey: req.params.rowKey,
      kind: kind as EditKind, payload: req.body ?? {}, actorId: acting(),
    })
    res.status(201).json({ id })
  } catch (e) {
    if (operatorGuard(res, e)) return
    throw e
  }
})

/** §1d — a row the concierge types. Provenance `human-entered`, always. */
app.post('/api/properties/:id/report/rows', (req, res) => {
  const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(req.params.id) as
    | { id: string }
    | undefined
  if (!property) return res.status(404).json({ error: 'No such property.' })

  const text = String(req.body?.text ?? '').trim()
  if (!text) return res.status(400).json({ error: 'A row needs words.' })

  try {
    const rowKey = addManualRow({
      db, propertyId: property.id, text,
      column: (req.body?.column as ColumnId) ?? 'missing-from-you',
      actorId: acting(),
    })
    res.status(201).json({ rowKey })
  } catch (e) {
    if (operatorGuard(res, e)) return
    throw e
  }
})

/** Every edit made to one row, oldest first — §5's trace-back. */
app.get('/api/properties/:id/report/rows/:rowKey/trail', (req, res) => {
  res.json(rowTrail(db, req.params.id, req.params.rowKey))
})

/**
 * A client-facing name, written inline — Amendment 1 §C plus the ratification gate.
 *
 * **Unratified by construction.** This route cannot set `ratified_at`; the
 * insert hardcodes NULL. A name is company-wide the moment it is written, so it
 * is usable here and marked everywhere until the design session confirms it —
 * and confirming is deliberately not a route this app offers, because the
 * person confirming is not the person at the editor.
 */
app.post('/api/client-names', (req, res) => {
  const itemId = String(req.body?.itemId ?? '').trim()
  const name = String(req.body?.name ?? '').trim()
  if (!itemId || !name) return res.status(400).json({ error: 'A name needs an item and words.' })

  try {
    const id = writeName({
      db, itemId, name, actorId: acting(),
      propertyId: req.body?.propertyId ? String(req.body.propertyId) : null,
    })
    res.status(201).json({ id, ratified: false })
  } catch (e) {
    if (operatorGuard(res, e)) return
    throw e
  }
})

// ------------------------------------------------- signing and rendering (§6)

/**
 * Sign the gap report, which is the only way client-facing HTML comes to exist.
 *
 * **The signature is the render gate, not a step after it.** There is no
 * `POST /render` beside this — a render that could happen without a signer is a
 * render that will, and §0.1 makes that a non-negotiable rather than a habit.
 *
 * The House Style lint runs inside the composition and REFUSES on violation, so
 * the response can carry the reasons back to the person who typed them.
 */
app.post('/api/properties/:id/report/sign', (req, res) => {
  const property = db.prepare('SELECT id, label, address FROM properties WHERE id = ?').get(req.params.id) as
    | { id: string; label: string; address: string | null }
    | undefined
  if (!property) return res.status(404).json({ error: 'No such property.' })

  const names = loadClientNames()
  // The id is what the foreign key stores; the name is what a homeowner reads.
  // Two facts about the same person, and the first render conflated them.
  const signer = acting()
  const signerName = (db.prepare('SELECT display_name FROM operators WHERE id = ?').get(signer) as
    | { display_name: string }
    | undefined)?.display_name
  /**
   * When the house was walked, **from the manifest** — not the hand-typed
   * `visits.planned_date`.
   *
   * That column is filled from a request body and no import path writes it, so
   * it can disagree with the evidence. It did: the first signed edition rendered
   * *"visited 2026-07-24"* against a session that began 2026-07-25T16:55Z. A
   * client-facing document must not carry an unchecked claim about when we were
   * in their house.
   *
   * Migration 015 renamed the column so the two facts have two names, and the
   * render parameter is `walkedDate` for the same reason — a parameter called
   * `visitDate` invites exactly the value that must never reach it.
   */
  const visit = db
    .prepare('SELECT id FROM visits WHERE property_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(property.id) as { id: string } | undefined
  const walked = visit ? walkedAt(db, visit.id) : null

  try {
    const edition = signEdition({
      db,
      propertyId: property.id,
      draft: buildDraft({ db, propertyId: property.id, describe: describeItems(db, names), labels: naLabelMap() }),
      describe: describeItems(db, names),
      labels: naLabelMap(),
      frames: names.frames,
      // Who is putting their name to it. From server configuration like every
      // other actor — a browser naming its own signer is an unverifiable claim,
      // and a signature on an unverifiable claim is not a signature.
      signedBy: signer,
      signedByName: signerName ?? signer,
      clientNames: { version: names.version, hash: names.hash },
      houseStyleVersion: 'house-style/v001',
      property: { label: property.label, address: property.address },
      walkedDate: walked?.date ?? null,
    })
    // The bytes are not in the response. They are the deliverable and they live
    // in the record; this says what was signed and where to read it.
    res.status(201).json({ ...edition, html: undefined })
  } catch (e) {
    if (operatorGuard(res, e)) return
    if (e instanceof HouseStyleRefused) {
      return res.status(422).json({ error: e.message, code: 'house-style', violations: e.violations })
    }
    if (e instanceof RenderRefused) return res.status(409).json({ error: e.message, code: e.code })
    throw e
  }
})

/** Every edition, newest first. Nothing is ever replaced — Design v1 §6. */
app.get('/api/properties/:id/report/editions', (req, res) => {
  res.json(editions(db, req.params.id))
})

/** One edition's stored bytes. What was actually sent, never a re-render. */
app.get('/api/report/editions/:id.html', (req, res) => {
  const html = editionHtml(db, req.params.id)
  if (!html) return res.status(404).send('No such edition.')
  res.type('html').send(html)
})

/** What the lint enforces, so a refusal can be read against the rules. */
app.get('/api/house-style/rules', (_req, res) => res.json(houseStyleRules()))

// -------------------------------------------------------- session plan (§3)

/**
 * The return leg — what this repo sends back into the field app.
 *
 * **No receiver exists yet.** `PLAN-STAGE-1` §7a scopes the import but it is
 * not built, so this emits as though nothing is listening, which is the correct
 * sequencing: the import cannot be built until something emits an artifact to
 * build against.
 *
 * Session data, never config — §3. It never touches the generated config or its
 * hash, and its provenance says `system`.
 */
app.get('/api/properties/:id/session-plan', (req, res) => {
  const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(req.params.id) as
    | { id: string }
    | undefined
  if (!property) return res.status(404).json({ error: 'No such property.' })

  try {
    const plan = buildSessionPlan({ db, propertyId: property.id, generatedBy: acting() })
    // Served as a file, because that is what it is: an import artifact the field
    // app will read, not a view this app renders.
    if (req.query.download !== undefined) {
      res.setHeader('Content-Disposition', `attachment; filename="session-plan-${property.id}.json"`)
    }
    res.type('json').send(JSON.stringify(plan, null, 2))
  } catch (e) {
    if (operatorGuard(res, e)) return
    throw e
  }
})

// ------------------------------------------------------------- §4 · §1d
//
// The cross-visit series, with its discontinuities. **Internal only** — a
// retired item id is a break in OUR record, not something the client did, and a
// doctrine scan keeps this module out of the report path.
app.get('/api/properties/:id/item-series', (req, res) => {
  const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(req.params.id) as
    | { id: string }
    | undefined
  if (!property) return res.status(404).json({ error: 'No such property.' })

  res.json(itemSeries({
    db,
    propertyId: property.id,
    includeSingletons: req.query.all !== undefined,
  }))
})

// ------------------------------------------------------------------ §7
//
// Desk-work timing. A pair of timestamps, per the spec — and deliberately no
// aggregate: *"Recorded, not specced: what gets reported from it. Collect
// first."*
app.get('/api/properties/:id/desk-work', (req, res) => {
  const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(req.params.id) as
    | { id: string }
    | undefined
  if (!property) return res.status(404).json({ error: 'No such property.' })

  try {
    res.json({ ...deskWork(db, property.id), mine: runningSpan(db, property.id, acting()) })
  } catch (e) {
    if (operatorGuard(res, e)) return
    throw e
  }
})

app.post('/api/properties/:id/desk-work/start', (req, res) => {
  try {
    const { span, alreadyRunning } = startWork({
      db,
      propertyId: req.params.id,
      sectionId: String(req.body?.sectionId ?? ''),
      actorId: acting(),
      visitId: req.body?.visitId ?? null,
      workClass: req.body?.workClass ?? null,
    })
    // 200 rather than 201 when it was already running: nothing was created, and
    // a double-click must not read as a second span.
    res.status(alreadyRunning ? 200 : 201).json({ span, alreadyRunning })
  } catch (e) {
    if (operatorGuard(res, e)) return
    if (e instanceof DeskWorkRefused) {
      return res.status(e.code === 'desk-work.no-property' ? 404 : 400).json({ error: e.message, code: e.code })
    }
    throw e
  }
})

app.post('/api/desk-work/:spanId/stop', (req, res) => {
  try {
    res.json(stopWork({
      db,
      spanId: req.params.spanId,
      note: req.body?.note ?? null,
      workClass: req.body?.workClass ?? null,
    }))
  } catch (e) {
    if (operatorGuard(res, e)) return
    if (e instanceof DeskWorkRefused) {
      return res.status(e.code === 'desk-work.no-span' ? 404 : 409).json({ error: e.message, code: e.code })
    }
    throw e
  }
})

const port = Number(process.env.PORT ?? 5174)
app.listen(port, () => console.log(`[api] http://localhost:${port}`))
