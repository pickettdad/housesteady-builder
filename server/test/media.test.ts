import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { crc32 } from 'node:zlib'

/** A minimal stored (uncompressed) zip holding one entry, filename unchecked. */
function storedZip(name: string, data: Buffer): Buffer {
  const nameBuf = Buffer.from(name, 'utf8')
  const crc = crc32(data)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt32LE(0, 42) // local header offset

  const cdOffset = local.length + nameBuf.length + data.length
  const cdSize = central.length + nameBuf.length

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdOffset, 16)

  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd])
}
import { createHash } from 'node:crypto'
import { writeFixture } from '../scripts/make-fixture.js'
import { buildReport, type ImportReport } from '../src/import/report.js'
import { safeJoin } from '../src/import/media.js'
import { runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, scratchDir } from './helpers.js'

/**
 * The synthetic fixture, imported with its media.
 *
 * This is the only coverage the untested paths get until the field app produces
 * a richer export: a measurement with a numeric value, an exterior zone, a voice
 * note, a nickname, and a whole-unit photo.
 */

async function importSynthetic(
  mutate?: (m: Record<string, any>) => void,
  opts: { corruptFirstFile?: boolean; deleteFirstFile?: boolean } = {},
): Promise<{ report: ImportReport; db: any; visitDir: string; sourceDir: string }> {
  const db = freshDb()
  const dataDir = scratchDir()
  const fixtureDir = scratchDir()
  const { manifestPath, zipPaths } = await writeFixture(fixtureDir)

  let raw = readFileSync(manifestPath, 'utf8')
  if (mutate) {
    const parsed = JSON.parse(raw)
    mutate(parsed)
    raw = JSON.stringify(parsed)
  }

  // Damage the media tree rather than the manifest, so the checksum mismatch is
  // real rather than declared.
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const first = manifest.media[0]
  if (opts.corruptFirstFile) writeFileSync(join(fixtureDir, first.file), 'not the bytes the export promised')
  if (opts.deleteFirstFile) writeFileSync(join(fixtureDir, first.file), '')

  const mediaDir = opts.corruptFirstFile || opts.deleteFirstFile ? fixtureDir : undefined
  const ids = makePropertyAndVisit(db, { label: '12 Riverside Lane', address: '12 Riverside Lane' })
  const { importId } = await runImport({
    db,
    ...ids,
    raw,
    dataDir,
    ...(mediaDir ? { mediaDir } : { mediaZips: zipPaths }),
  })

  return {
    report: buildReport(db, importId)!,
    db,
    visitDir: join(dataDir, 'properties', ids.propertyId, 'visits', ids.visitId),
    sourceDir: fixtureDir,
  }
}

describe('the synthetic fixture imports with its media', () => {
  it('verifies every checksum and reports no warnings beyond the expected', async () => {
    const { report, db } = await importSynthetic()

    const warnings = report.validation.checks.filter((c) => c.severity === 'warning')
    assert.deepEqual(warnings.map((c) => c.code), [], 'a clean synthetic export produces no warnings at all')
    assert.equal(report.import.status, 'ok')
    assert.equal(report.import.mediaMode, 'with_media')
    db.close()
  })

  it('reports every file present and verified', async () => {
    const { report, db } = await importSynthetic()
    assert.deepEqual(report.counts.media.verification, {
      verified: 11,
      failed: 0,
      absent: 0,
      presentUnverified: 0,
    })
    db.close()
  })

  it('copies the files byte-identically to the export paths', async () => {
    const { report, db, visitDir, sourceDir } = await importSynthetic()
    const media = db
      .prepare('SELECT file, sha256 FROM media WHERE import_id = ?')
      .all(report.import.id) as { file: string; sha256: string }[]

    assert.equal(media.length, 11)
    for (const m of media) {
      const dest = join(visitDir, m.file)
      assert.ok(existsSync(dest), `${m.file} landed where the export said it would`)
      assert.equal(
        createHash('sha256').update(readFileSync(dest)).digest('hex'),
        m.sha256,
        `${m.file} is byte-identical to what the export declared`,
      )
    }
    assert.ok(sourceDir)
    db.close()
  })

  it('removes the staging directory once the files are placed', async () => {
    const { db, visitDir } = await importSynthetic()
    assert.ok(!existsSync(join(visitDir, '.staging')))
    db.close()
  })
})

describe('the paths the real export never exercises', () => {
  it('carries a measure resolution with a numeric value', async () => {
    const { report, db } = await importSynthetic()
    const measures = db
      .prepare("SELECT item_id, note FROM resolutions WHERE import_id = ? AND via = 'measure' ORDER BY item_id")
      .all(report.import.id) as { item_id: string }[]
    assert.deepEqual(measures.map((m) => m.item_id), ['cmp.width', 'ext.grade', 'int.moisture-suspect', 'utl.pressure'])

    // The reading itself lives in the raw manifest, which is the record of truth.
    const raw = JSON.parse(
      (db.prepare('SELECT raw_manifest FROM imports WHERE id = ?').get(report.import.id) as { raw_manifest: string })
        .raw_manifest,
    )
    const pressure = raw.resolutions.find((r: any) => r.itemId === 'utl.pressure')
    assert.equal(pressure.resolution.value, 52)
    assert.equal(pressure.resolution.unit, 'psi')
    db.close()
  })

  it('carries an exterior zone', async () => {
    const { report, db } = await importSynthetic()
    const elevation = report.zones.find((z) => z.type === 'elevation')!
    assert.ok(elevation, 'the elevation zone imported')
    assert.equal(elevation.label, 'north side')
    assert.equal(elevation.level, 'exterior')
    assert.equal(elevation.canvasCount, 1, 'photo-only canvas model')
    db.close()
  })

  it('carries a voice note, counted and sized separately from photos', async () => {
    const { report, db } = await importSynthetic()
    const voice = report.counts.media.byKind.find((k) => k.kind === 'voice')!
    assert.ok(voice, 'voice is its own kind, not folded into photos')
    assert.equal(voice.count, 1)
    assert.ok(voice.bytes > 0)

    const row = db
      .prepare("SELECT duration_ms, mime FROM media WHERE import_id = ? AND kind = 'voice'")
      .get(report.import.id) as { duration_ms: number; mime: string }
    assert.equal(row.duration_ms, 1000)
    assert.equal(row.mime, 'audio/wav')
    db.close()
  })

  it('carries a nickname, kept separate from the type', async () => {
    const { report, db } = await importSynthetic()
    const pin = db
      .prepare('SELECT number, nickname, component_type, freeform_label FROM pins WHERE import_id = ? AND nickname IS NOT NULL')
      .get(report.import.id) as { number: number; nickname: string; component_type: string; freeform_label: string | null }
    assert.equal(pin.nickname, 'the old beast')
    assert.equal(pin.component_type, 'water-heater', 'the nickname never contaminates the type')
    assert.equal(pin.freeform_label, null)
    db.close()
  })

  it('carries whole-unit photo items, satisfied via photo', async () => {
    const { report, db } = await importSynthetic()
    const unitItems = db
      .prepare("SELECT item_id, via, scope_kind FROM resolutions WHERE import_id = ? AND item_id LIKE '%.unit' ORDER BY item_id")
      .all(report.import.id) as { item_id: string; via: string; scope_kind: string }[]

    assert.deepEqual(unitItems.map((i) => i.item_id), ['cmp.unit', 'pnl.unit', 'wh.unit'])
    for (const item of unitItems) {
      assert.equal(item.via, 'photo', 'a unit item is satisfied by a photograph, nothing else')
      assert.equal(item.scope_kind, 'pin', 'and it belongs to the object, not the room')
    }
    db.close()
  })

  it('keeps the unit photo and the nameplate photo as separate evidence', async () => {
    // Two canonical photos per object doing different jobs: condition over time,
    // and identity. Never conflated.
    const { report, db } = await importSynthetic()
    const raw = JSON.parse(
      (db.prepare('SELECT raw_manifest FROM imports WHERE id = ?').get(report.import.id) as { raw_manifest: string })
        .raw_manifest,
    )
    const unit = raw.resolutions.find((r: any) => r.itemId === 'wh.unit').resolution.evidence.mediaId
    const nameplate = raw.resolutions.find((r: any) => r.itemId === 'wh.nameplate').resolution.evidence.mediaId
    assert.notEqual(unit, nameplate)
    db.close()
  })

  it('carries a monitor flag, which the real export defines but never uses', async () => {
    const { report, db } = await importSynthetic()
    const flags = Object.fromEntries(report.counts.pins.flagged.map((f) => [f.flag, f.n]))
    assert.deepEqual(flags, { issue: 1, monitor: 1 })
    db.close()
  })

  it('reconciles resolutions against a log containing a genuine reopen', async () => {
    const { report, db } = await importSynthetic()
    const r = report.checklist.eventReconciliation
    assert.equal(r.itemReopened, 1)
    assert.equal(r.net, r.resolutionsLength, 'resolutions[] is the projection, and it lines up')
    db.close()
  })
})

describe('a file that does not match its checksum', () => {
  it('is quarantined rather than deleted, and named', async () => {
    const { report, db, visitDir } = await importSynthetic(undefined, { corruptFirstFile: true })

    const failed = report.validation.checks.filter((c) => c.code === 'media.checksum-failed')
    assert.equal(failed.length, 1)
    assert.match(failed[0]!.message, /does not match the checksum/)
    assert.match(failed[0]!.message, /moved to media\/_failed/)
    assert.match(failed[0]!.message, /Every other file imported normally/)

    // The bytes survive — they are evidence of what went wrong.
    const quarantined = readdirSync(join(visitDir, 'media', '_failed'))
    assert.equal(quarantined.length, 1)

    assert.equal(report.counts.media.verification.failed, 1)
    assert.equal(report.counts.media.verification.verified, 10, 'the other ten imported normally')
    db.close()
  })

  it('is not counted as evidence', async () => {
    const { report, db } = await importSynthetic(undefined, { corruptFirstFile: true })
    const row = db
      .prepare("SELECT file_status, sha_verified FROM media WHERE import_id = ? AND file_status = 'failed_checksum'")
      .get(report.import.id) as { file_status: string; sha_verified: number }
    assert.equal(row.sha_verified, 0)
    db.close()
  })
})

describe('path safety', () => {
  it('refuses a path that would escape the destination', () => {
    assert.equal(safeJoin('/data/visit', '../../etc/passwd'), null)
    assert.equal(safeJoin('/data/visit', '/etc/passwd'), null)
    assert.equal(safeJoin('/data/visit', 'media/zone/pin-1/a.jpg'), '/data/visit/media/zone/pin-1/a.jpg')
  })

  it('does not write an archive entry that points outside the visit', async () => {
    const db = freshDb()
    const dataDir = scratchDir()
    const fixtureDir = scratchDir()
    const { manifestPath, zipPaths } = await writeFixture(fixtureDir)

    // A hostile archive alongside the legitimate ones. Hand-built, because a
    // well-behaved zip writer refuses to produce a traversal entry — which is
    // exactly why the reader cannot assume one never arrives.
    const evilPath = join(fixtureDir, 'zips', 'evil.zip')
    writeFileSync(evilPath, storedZip('../../../escaped.txt', Buffer.from('pwned')))

    const ids = makePropertyAndVisit(db, { label: '12 Riverside Lane' })
    const { importId } = await runImport({
      db,
      ...ids,
      raw: readFileSync(manifestPath, 'utf8'),
      dataDir,
      mediaZips: [...zipPaths, evilPath],
    })
    const report = buildReport(db, importId)!

    const warning = report.validation.checks.find(
      (c) => c.code === 'media.unsafe-archive-entry' || c.code === 'media.archive-unreadable',
    )
    assert.ok(warning, 'the attempt is surfaced, not silently ignored')
    assert.match(warning!.message, /escaped\.txt|skipped/)

    // Nothing escaped, anywhere up the tree.
    assert.ok(!existsSync(join(dataDir, 'escaped.txt')))
    assert.ok(!existsSync(join(dataDir, '..', 'escaped.txt')))
    assert.ok(!existsSync(join(dataDir, 'properties', 'escaped.txt')))

    // And the legitimate archives still imported — one hostile file does not
    // cost the operator the rest of the visit.
    assert.equal(report.counts.media.verification.verified, 11)
    db.close()
  })
})
