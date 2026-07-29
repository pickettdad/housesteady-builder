import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { Db } from '../src/db/index.js'
import { buildReport, type ImportReport } from '../src/import/report.js'
import { runImport } from '../src/import/runImport.js'
import { addVisit, freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'

/**
 * The increment's primary acceptance test.
 *
 * Every number here was verified by hand against the export before any code was
 * written. If one of these changes, either the field app changed or the builder
 * broke — and either way somebody needs to look.
 */
describe('the real reference export', () => {
  let db: Db
  let report: ImportReport
  let dataDir: string
  let propertyId: string
  let visitId: string

  before(async () => {
    db = freshDb()
    dataDir = scratchDir()
    const ids = makePropertyAndVisit(db, { label: 'Test build 7 web app 1' })
    propertyId = ids.propertyId
    visitId = ids.visitId
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir })
    report = buildReport(db, importId)!
  })

  after(() => db.close())

  it('imports, with media absence the only complaint', async () => {
    assert.equal(report.import.status, 'ok_with_warnings')
    assert.equal(report.import.manifestSchemaVersion, 3)
    assert.equal(report.import.appVersion, '0.5.0')
    const warnings = report.validation.checks.filter((c) => c.severity === 'warning')
    assert.deepEqual(
      warnings.map((c) => c.code),
      ['media.absent'],
      'the reference export is structurally clean — media absence is the only legitimate warning',
    )
  })

  it('keeps the raw manifest byte-identical', async () => {
    const stored = db.prepare('SELECT raw_manifest FROM imports WHERE id = ?').get(report.import.id) as {
      raw_manifest: string
    }
    assert.equal(stored.raw_manifest, readReference())
  })

  it('writes the verbatim manifest to disk beside where its media will live', async () => {
    const path = join(dataDir, 'properties', propertyId, 'visits', visitId, 'manifest.json')
    assert.ok(existsSync(path))
    assert.equal(readFileSync(path, 'utf8'), readReference())
  })

  it('counts what is actually in the file', async () => {
    assert.equal(report.counts.zones, 2)
    assert.equal(report.counts.canvases, 3)
    assert.equal(report.counts.pins.total, 11)
    assert.equal(report.counts.media.total, 37)
    assert.equal(report.counts.media.bytes, 122_680_159)
    assert.equal(report.counts.notes, 3)
    assert.equal(report.counts.chatThreads, 1)
    assert.equal(report.counts.chatMessages, 2)
    assert.equal(report.counts.inboxTotal, 1)
    assert.equal(report.counts.events, 111)
    assert.equal(report.counts.orphanEvents, 0)
  })

  it('names the messy pins without letting the categories be added up', async () => {
    assert.equal(report.counts.pins.typeless, 2)
    assert.equal(report.counts.pins.retired, 2)
    assert.equal(report.counts.pins.unanchored, 4)
    // Pin 10 is all three at once and pin 2 is two of them, so the distinct
    // count is 4 — NOT the 8 that adding the categories would suggest.
    assert.equal(report.counts.pins.anomalousDistinct, 4)
    assert.deepEqual(
      report.counts.pins.anomalous.map((p) => [p.number, p.flags]),
      [
        [2, ['retired', 'unanchored']],
        [8, ['unanchored']],
        [10, ['typeless', 'retired', 'unanchored']],
        [11, ['typeless', 'unanchored']],
      ],
    )
  })

  it('reads media ownership from owner{}, not from the path', async () => {
    const owners = Object.fromEntries(report.counts.media.byOwner.map((o) => [o.owner_kind, o.count]))
    assert.deepEqual(owners, { zone: 28, pin: 5, canvas: 3, inbox: 1 })
  })

  it('breaks bytes out by kind — video will dwarf photos and must be visible coming', async () => {
    assert.deepEqual(report.counts.media.byKind, [{ kind: 'photo', count: 37, bytes: 122_680_159 }])
  })

  it('reports every file as absent and unverified in manifest-only mode', async () => {
    // All four states reported, zeroes included — "0 failed" is a different
    // statement from an omitted row.
    assert.deepEqual(report.counts.media.verification, {
      verified: 0,
      failed: 0,
      absent: 37,
      presentUnverified: 0,
    })
  })

  it('reconciles every declared total, so no totals warning appears', async () => {
    assert.ok(!report.validation.checks.some((c) => c.code === 'totals.mismatch'))
  })

  it('finds no dangling references anywhere in the export', async () => {
    const integrity = report.validation.checks.filter((c) => c.code.startsWith('integrity.'))
    assert.deepEqual(integrity, [], 'the reference export cross-references cleanly')
  })

  it('finds every anchor inside the 0-1 canvas range', async () => {
    assert.ok(!report.validation.checks.some((c) => c.code === 'anchor.out-of-bounds'))
    const anchors = db
      .prepare('SELECT x, y FROM anchors WHERE import_id = ?')
      .all(report.import.id) as { x: number; y: number }[]
    assert.equal(anchors.length, 7)
    for (const a of anchors) {
      assert.ok(a.x >= 0 && a.x <= 1 && a.y >= 0 && a.y <= 1)
    }
  })

  it('finds the event log contiguous from 1', async () => {
    assert.ok(!report.validation.checks.some((c) => c.code.startsWith('events.')))
  })

  it('recognises every word in the export', async () => {
    assert.deepEqual(report.validation.unrecognizedTerms, [])
    assert.equal(report.unrecognized.resolutions, 0)
    assert.equal(report.unrecognized.events, 0)
  })

  it('splits gaps from findings, and findings from problems', async () => {
    assert.equal(report.checklist.total, 20)

    // One gap: a session item deferred to visit two.
    assert.equal(report.checklist.gaps.count, 1)
    assert.deepEqual(
      report.checklist.gaps.rows.map((g) => [g.item_id, g.reason_id]),
      [['ses.termination-reconcile', 'deferred']],
    )

    // Four findings: two failed checks (defects) and two confirmed absences
    // (facts). Both belong in the binder; neither is a gap.
    assert.equal(report.checklist.findings.total, 4)
    assert.equal(report.checklist.findings.failedChecks, 2)
    assert.equal(report.checklist.findings.confirmedAbsences, 2)
    assert.deepEqual(report.checklist.findings.rows.map((f) => f.item_id).sort(), [
      'int.lighting',
      'int.moisture-suspect',
      'int.receptacles',
      'liv.fireplace',
    ])

    // The two streams share no items — a fail is never also a gap.
    const gapIds = new Set(report.checklist.gaps.rows.map((r) => r.item_id))
    assert.ok(report.checklist.findings.rows.every((f) => !gapIds.has(f.item_id)))
  })

  it('reconciles resolutions[] against the event log', async () => {
    const r = report.checklist.eventReconciliation
    assert.equal(r.itemResolved, 21)
    assert.equal(r.itemReopened, 1)
    assert.equal(r.net, 20)
    assert.equal(r.resolutionsLength, 20)
  })

  it('surfaces zone rework that the zone record alone would hide', async () => {
    const bedroom = report.zones.find((z) => z.label === 'bedroom')!
    assert.equal(bedroom.closeCount, 3)
    assert.equal(bedroom.reopenCount, 2)
    assert.deepEqual(bedroom.reopenReasons, ['Test', 'Test ai'])
    assert.equal(bedroom.closedWithNoWork, false)
  })

  it('names a zone that was closed with nothing resolved in it', async () => {
    const ensuite = report.zones.find((z) => z.label === 'ensuite')!
    assert.equal(ensuite.closedWithNoWork, true)
    assert.equal(ensuite.resolutionCount, 0)
    assert.equal(ensuite.pinCount, 0)
    assert.equal(ensuite.mediaCount, 25) // photos were taken; the checklist was never worked
    assert.equal(ensuite.coreUnresolved.length, 8)
    assert.equal(ensuite.standardUnresolved, 11)
  })

  it('stores the zone audit summary exactly as exported', async () => {
    // Recomputing it is the audit engine's job in Increment 3, not this one's.
    const row = db
      .prepare('SELECT audit_summary FROM zones WHERE import_id = ? AND label = ?')
      .get(report.import.id, 'ensuite') as { audit_summary: string }
    const audit = JSON.parse(row.audit_summary)
    assert.equal(audit.standardUnresolved, 11)
    assert.equal(audit.naCount, 0)
    assert.ok(audit.coreUnresolved.includes('bth.toilet-secure'))
  })

  it('keeps the pin-scoped evidence nested inside resolution{}', async () => {
    const row = db
      .prepare('SELECT evidence FROM resolutions WHERE import_id = ? AND item_id = ?')
      .get(report.import.id, 'int.alarms') as { evidence: string }
    assert.deepEqual(JSON.parse(row.evidence), { pinId: '019f9a3a-04e8-77d6-8ef8-979e43e8b998' })
  })

  it('numbers chat messages by position, since the export carries no seq', async () => {
    const rows = db
      .prepare('SELECT seq, role, model FROM chat_messages WHERE import_id = ? ORDER BY seq')
      .all(report.import.id) as { seq: number; role: string; model: string | null }[]
    assert.deepEqual(rows, [
      { seq: 1, role: 'user', model: null },
      { seq: 2, role: 'assistant', model: 'claude-sonnet-5' },
    ])
  })

  it('leaves typeless pins genuinely empty rather than inventing a type', async () => {
    const rows = db
      .prepare(
        'SELECT number, type_kind, component_type, freeform_label FROM pins WHERE import_id = ? AND type_kind IS NULL ORDER BY number',
      )
      .all(report.import.id) as { number: number; component_type: null; freeform_label: null }[]
    assert.equal(rows.length, 2)
    for (const r of rows) {
      assert.equal(r.component_type, null)
      assert.equal(r.freeform_label, null)
    }
  })

  it('refuses the same export twice into the same visit', async () => {
    await assert.rejects(
      () => runImport({ actorId: TEST_OPERATOR, db, propertyId, visitId, raw: readReference(), dataDir }),
      /already been imported/,
    )
  })

  it('allows the same export into a different visit — that is a re-walk, not a duplicate', async () => {
    const otherVisit = addVisit(db, propertyId)
    const { status } = await runImport({ actorId: TEST_OPERATOR, db, propertyId, visitId: otherVisit, raw: readReference(), dataDir })
    assert.equal(status, 'ok_with_warnings')
  })
})
