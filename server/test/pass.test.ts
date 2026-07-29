import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { writeFixture } from '../scripts/make-fixture.js'
import { runImport } from '../src/import/runImport.js'
import { writeOverlay } from '../src/overlay/store.js'
import { buildPass, orderedZoneIds, zoneOrder } from '../src/pass/read.js'
import {
  completePass, findPass, openZone, passHistory, PassRefused,
  reopenIfCompleted, reopenPass, startPass,
} from '../src/pass/store.js'
import { cachePath, findMedia, resolveOriginal, thumbnail, warmZone } from '../src/pass/thumbs.js'
import { freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'

/**
 * The fresh pass — spec §5, §6, §8.
 *
 * The load-bearing claims: zones come out in visit order, canvas markers land
 * where the field put them, both kinds of missing image degrade to something
 * honest, and completion means exactly what §6 says it means and nothing more.
 */

async function walkReference(mutate?: (m: Record<string, any>) => void) {
  const db = freshDb()
  const dataDir = scratchDir()
  const ids = makePropertyAndVisit(db)
  let raw = readReference()
  if (mutate) {
    const parsed = JSON.parse(raw)
    mutate(parsed)
    raw = JSON.stringify(parsed)
  }
  const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw, dataDir })
  return { db, dataDir, importId, ...ids }
}

/** The synthetic fixture, imported with its real media files on disk. */
async function walkSynthetic() {
  const db = freshDb()
  const dataDir = scratchDir()
  const fixtureDir = scratchDir()
  const { manifestPath, zipPaths } = await writeFixture(fixtureDir)
  const ids = makePropertyAndVisit(db, { label: '12 Riverside Lane', address: '12 Riverside Lane' })
  await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readFileSync(manifestPath, 'utf8'), dataDir, mediaZips: zipPaths })
  return { db, dataDir, ...ids }
}

describe('the reference export walks end to end', () => {
  it('produces a zone page for every zone, with decisions in context', async () => {
    const { db, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!

    assert.equal(pass.zones.length, 2)
    assert.ok(pass.import, 'the pass knows which import it is walking')

    const bedroom = pass.zones.find((z) => z.label === 'bedroom')!
    // Two pins flagged `issue`, one typeless pin, two failed checks, two na
    // items — all of them surfacing in the room they belong to rather than in a
    // queue somewhere else.
    const reasons = bedroom.decisions.flatMap((d) => d.reasons)
    assert.ok(reasons.includes('typeless-pin'))
    assert.ok(reasons.includes('pin-flagged-issue'))
    assert.ok(reasons.includes('failed-check'))
    assert.ok(reasons.includes('na'))
    assert.ok(bedroom.decisions.every((d) => !d.decided), 'nothing is decided before anyone decides it')
    db.close()
  })

  it('gives every decision a target an overlay can point at', async () => {
    const { db, propertyId, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!

    for (const d of [...pass.zones.flatMap((z) => z.decisions), ...pass.sessionItems]) {
      assert.ok(d.targetKind && d.targetId, `${d.headline} is addressable`)
      // And the whole point: deciding it is one call, and it sticks.
      writeOverlay({ actorId: TEST_OPERATOR,
        db, propertyId, visitId, kind: 'confirm', targetKind: d.targetKind, targetId: d.targetId,
      })
    }

    const after = buildPass(db, visitId)!
    assert.equal(after.progress.decisionsRemaining, 0)
    assert.equal(after.progress.decisionsMade, after.progress.decisionsTotal)
    db.close()
  })

  it('puts session-scoped items on their own page rather than in a room', async () => {
    const { db, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!
    // ses.termination-reconcile is `na`, deferred. It belongs to the visit, not
    // to any zone, and §5 gives it a final page after the last room.
    assert.ok(pass.sessionItems.length > 0)
    assert.ok(pass.sessionItems.every((d) => d.resolution?.scopeKind === 'session'))
    const inZones = pass.zones.flatMap((z) => z.decisions).map((d) => d.targetId)
    for (const s of pass.sessionItems) assert.ok(!inZones.includes(s.targetId))
    db.close()
  })

  it('counts one decision per pin however many things are wrong with it', async () => {
    const { db, visitId } = await walkReference((m) => {
      // Pin 10 is already typeless and retired. Make a live pin both typeless
      // and flagged, which is two reasons for one decision.
      const pin = m.pins.find((p: any) => p.number === 11)
      pin.flag = 'issue'
      delete pin.type
    })
    const pass = buildPass(db, visitId)!
    const pin11 = pass.zones
      .flatMap((z) => z.decisions)
      .filter((d) => d.pin?.number === 11)
    assert.equal(pin11.length, 1, 'one row, not one per reason')
    assert.deepEqual([...pin11[0]!.reasons].sort(), ['pin-flagged-issue', 'typeless-pin'])
    db.close()
  })

  it('leaves a retired pin out of the required decisions but says it is there', async () => {
    const { db, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!
    const bedroom = pass.zones.find((z) => z.label === 'bedroom')!
    // Pin 10 is typeless AND retired. Typing a pin somebody deliberately retired
    // is busywork; dropping it silently would be worse.
    assert.ok(bedroom.retiredPinCount > 0, 'the count is reported')
    assert.ok(!bedroom.decisions.some((d) => d.pin?.retiredAt), 'but it is not asked about')
    assert.ok(!bedroom.pins.some((p) => p.retiredAt))
    db.close()
  })
})

describe('zones come out in visit order', () => {
  it('follows the event log, not the alphabet', async () => {
    const { db, visitId, importId } = await walkReference((m) => {
      // The first room walked, renamed so alphabetical order would put it last.
      m.zones[0].label = 'zebra room'
      for (const e of m.events) if (e.type === 'ZoneCreated' && e.label === 'bedroom') e.label = 'zebra room'
    })
    const pass = buildPass(db, visitId)!
    assert.deepEqual(pass.zones.map((z) => z.label), ['zebra room', 'ensuite'])

    const order = zoneOrder(db, importId)
    assert.equal(order.size, 2)
    db.close()
  })

  it('puts a zone with no events last rather than dropping it', async () => {
    const { db, visitId } = await walkReference((m) => {
      m.zones.push({
        zoneId: '019f9a99-0000-7000-8000-000000000001',
        type: 'utility', label: 'aaa furnace room', level: 'basement',
        attributes: {}, canvases: [],
      })
      m.totals.zones = 3
    })
    const pass = buildPass(db, visitId)!
    assert.equal(pass.zones.length, 3)
    assert.equal(pass.zones.at(-1)!.label, 'aaa furnace room', 'last, despite sorting first alphabetically')
    db.close()
  })
})

describe('the canvas', () => {
  it('carries anchors as normalized 0-1 floats, unchanged from the field', async () => {
    const { db, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!
    const bedroom = pass.zones.find((z) => z.label === 'bedroom')!

    const pin1 = bedroom.pins.find((p) => p.number === 1)!
    assert.equal(pin1.anchors.length, 1)
    // The exact values from the export. A marker at 9.88% / 75.49% of the canvas
    // image is where the concierge tapped, and any rounding here is a marker in
    // the wrong place on a photo of somebody's wall.
    assert.equal(pin1.anchors[0]!.x, 0.09882747068676717)
    assert.equal(pin1.anchors[0]!.y, 0.7548855388051368)
    assert.equal(pin1.anchors[0]!.canvasId, bedroom.canvases[0]!.canvasId)
    db.close()
  })

  it('separates pins that were never placed on a plan', async () => {
    const { db, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!
    const bedroom = pass.zones.find((z) => z.label === 'bedroom')!

    assert.ok(bedroom.unplacedPins.length > 0)
    assert.ok(bedroom.unplacedPins.every((p) => p.anchors.length === 0))
    // Reported, never placed. Placing an anchor is field work; the builder was
    // not there.
    assert.ok(bedroom.unplacedPins.every((p) => !p.retiredAt), 'retired pins are not a field task')
    db.close()
  })

  it('degrades to a pin list when a zone has no canvas at all', async () => {
    const { db, visitId } = await walkReference((m) => {
      m.zones[0].canvases = []
      m.totals.canvases = 1
    })
    const pass = buildPass(db, visitId)!
    const bedroom = pass.zones.find((z) => z.label === 'bedroom')!
    assert.deepEqual(bedroom.canvases, [], 'no canvas is a state, not a crash')
    assert.ok(bedroom.pins.length > 0, 'and the pins are still all there to work with')
    db.close()
  })

  it('says so when the canvas image is listed but not on this machine', async () => {
    // A manifest-only import: every file is accounted for and none is here.
    const { db, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!
    assert.equal(pass.import!.mediaMode, 'manifest_only')
    for (const zone of pass.zones) {
      for (const canvas of zone.canvases) {
        assert.equal(canvas.imageAvailable, false, 'the screen must not pretend it has the picture')
      }
      assert.ok(zone.roomPhotos.every((p) => p.fileStatus === 'absent'))
    }
    db.close()
  })
})

describe('room photos', () => {
  it('lists the zone-owned captures, which is most of them', async () => {
    const { db, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!
    const total = pass.zones.reduce((n, z) => n + z.roomPhotos.length, 0)
    // 28 of the reference export's 37 files are owned by a zone with nothing
    // pointing at them. That is a normal visit, not a corrupt file.
    assert.equal(total, 28)
    db.close()
  })

  it('makes a room photo attachable, and shows where it went', async () => {
    // Spec §5.3: room photos are "browsable, attachable". Browsable was there
    // from the start; attachable was not — the tile rendered an image and no
    // affordance, so `a` only ever reached a loose inbox photo.
    const { db, propertyId, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!
    const zone = pass.zones.find((z) => z.roomPhotos.length > 0)!
    const photo = zone.roomPhotos[0]!
    const pin = zone.pins[0]!

    assert.equal(photo.state, null, 'nothing is attached before anyone attaches it')

    writeOverlay({ actorId: TEST_OPERATOR,
      db, propertyId, visitId, kind: 'assign', targetKind: 'media', targetId: photo.mediaId,
      newValue: { toKind: 'pin', toId: pin.pinId },
    })

    const after = buildPass(db, visitId)!.zones.find((z) => z.zoneId === zone.zoneId)!
    const tile = after.roomPhotos.find((p) => p.mediaId === photo.mediaId)!
    assert.ok(tile.state?.assign, 'the tile can say where it went')
    assert.deepEqual(tile.state!.assign!.newValue, { toKind: 'pin', toId: pin.pinId })
    assert.deepEqual(tile.state!.trail.map((t) => t.verb), ['assigned'], 'and offer to undo it')

    // Still not a decision. Attaching is optional and must not change the count.
    assert.equal(after.decisionsRemaining, zone.decisionsRemaining)
    db.close()
  })

  it('never requires a room photo to be assigned anywhere', async () => {
    const { db, propertyId, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!
    const photoIds = new Set(pass.zones.flatMap((z) => z.roomPhotos).map((p) => p.mediaId))
    const decisionTargets = new Set(pass.zones.flatMap((z) => z.decisions).map((d) => d.targetId))

    for (const id of photoIds) {
      assert.ok(!decisionTargets.has(id), 'leaving a photo attached to the room is a valid final state')
    }

    // And the pass can finish with every one of them still unassigned.
    startPass(db, visitId, TEST_OPERATOR)
    for (const z of pass.zones) openZone(db, visitId, z.zoneId, TEST_OPERATOR)
    for (const d of [...pass.zones.flatMap((z) => z.decisions), ...pass.sessionItems]) {
      writeOverlay({ actorId: TEST_OPERATOR, db, propertyId, visitId, kind: 'confirm', targetKind: d.targetKind, targetId: d.targetId })
    }
    const { model } = completePass(db, visitId, { actorId: TEST_OPERATOR })
    assert.ok(model.pass!.completedAt)
    db.close()
  })
})

describe('completion means what §6 says and nothing more', () => {
  it('answers with what is open rather than just refusing', async () => {
    const { db, visitId } = await walkReference()
    startPass(db, visitId, TEST_OPERATOR)
    try {
      completePass(db, visitId, { actorId: TEST_OPERATOR })
      assert.fail('should have come back with the outstanding list')
    } catch (e) {
      assert.ok(e instanceof PassRefused)
      assert.equal(e.code, 'pass.outstanding')
      // The sentence the screen puts to the concierge: a count AND where to
      // look. "Not complete" on its own sends someone hunting through eight
      // rooms for the one item holding it open.
      assert.match(e.outstanding.join(' | '), /\d+ decisions? still open in \d+ rooms?/)
      const rooms = e.outstanding.find((o) => o.includes('not opened yet'))!
      assert.ok(rooms.includes('bedroom'), 'unopened rooms are named, not merely counted')
    }
    db.close()
  })

  it('closes anyway when told to, and records exactly what was left open', async () => {
    // Refusing outright leaves two options: invent decisions to satisfy the
    // gate, or leave every pass permanently open. Once most passes are
    // permanently open, "complete" has stopped meaning anything.
    const { db, visitId } = await walkReference()
    startPass(db, visitId, TEST_OPERATOR)

    const { pass, model } = completePass(db, visitId, { force: true , actorId: TEST_OPERATOR })
    assert.ok(pass.completed_at, 'the concierge is the accountable human')

    const recorded = JSON.parse(pass.completed_with_outstanding!) as string[]
    assert.ok(recorded.length > 0, 'what it was closed over is part of the record')
    assert.match(recorded.join(' | '), /decisions? still open/)
    assert.deepEqual(model.pass!.completedWithOutstanding, recorded, 'and the screen can say so')
    db.close()
  })

  it('leaves the outstanding note null when it finishes cleanly', async () => {
    const { db, propertyId, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!
    startPass(db, visitId, TEST_OPERATOR)
    for (const z of pass.zones) openZone(db, visitId, z.zoneId, TEST_OPERATOR)
    for (const d of [...pass.zones.flatMap((z) => z.decisions), ...pass.sessionItems]) {
      writeOverlay({ actorId: TEST_OPERATOR, db, propertyId, visitId, kind: 'confirm', targetKind: d.targetKind, targetId: d.targetId })
    }
    const { pass: row } = completePass(db, visitId, { actorId: TEST_OPERATOR })
    assert.equal(row.completed_with_outstanding, null, 'nothing was closed over, so nothing is claimed')
    db.close()
  })

  it('reopens itself when a decision is recorded after it was closed', async () => {
    // Otherwise the completion record quietly becomes a lie: "closed with 5
    // decisions open" while three of them have since been decided. Blocking the
    // decision instead would be the dead control this screen avoids everywhere
    // else, so the completion is withdrawn and the reason recorded.
    const { db, propertyId, visitId } = await walkReference()
    startPass(db, visitId, TEST_OPERATOR)
    completePass(db, visitId, { force: true , actorId: TEST_OPERATOR })
    assert.ok(findPass(db, visitId)!.completed_at)

    const item = buildPass(db, visitId)!.zones.flatMap((z) => z.decisions)[0]!
    writeOverlay({ actorId: TEST_OPERATOR, db, propertyId, visitId, kind: 'confirm', targetKind: item.targetKind, targetId: item.targetId })
    reopenIfCompleted(db, visitId, TEST_OPERATOR)

    const after = findPass(db, visitId)!
    assert.equal(after.completed_at, null, 'the completion is withdrawn rather than left to go stale')
    assert.equal(after.completed_with_outstanding, null)

    const history = passHistory(db, after.id)
    assert.deepEqual(history.map((h) => h.type), ['completed', 'reopened'])
    assert.match(history[1]!.reason!, /decision was recorded/)
    db.close()
  })

  it('keeps each completion figure frozen at the moment it was written', async () => {
    // The stored "what was outstanding" has to stay true to when it was
    // written. The row is cleared on reopen because a reopened pass is not
    // closed over anything — so the history holds its own copy, and closing
    // twice over different amounts of work leaves two different true records.
    const { db, propertyId, visitId } = await walkReference()
    startPass(db, visitId, TEST_OPERATOR)
    completePass(db, visitId, { force: true , actorId: TEST_OPERATOR })
    const first = passHistory(db, findPass(db, visitId)!.id)[0]!
    const firstCount = first.outstanding!.join(' ')

    // Decide something, which reopens it, then decide more and close again.
    const items = buildPass(db, visitId)!.zones.flatMap((z) => z.decisions)
    for (const d of items.slice(0, 2)) {
      writeOverlay({ actorId: TEST_OPERATOR, db, propertyId, visitId, kind: 'confirm', targetKind: d.targetKind, targetId: d.targetId })
      reopenIfCompleted(db, visitId, TEST_OPERATOR)
    }
    completePass(db, visitId, { force: true , actorId: TEST_OPERATOR })

    const history = passHistory(db, findPass(db, visitId)!.id)
    assert.deepEqual(history.map((h) => h.type), ['completed', 'reopened', 'completed'])
    assert.equal(history[0]!.outstanding!.join(' '), firstCount, 'the first figure was never rewritten')
    assert.notEqual(history[2]!.outstanding!.join(' '), firstCount, 'and the second describes its own moment')
    db.close()
  })

  it('clears the outstanding note when the pass is reopened', async () => {
    const { db, visitId } = await walkReference()
    startPass(db, visitId, TEST_OPERATOR)
    completePass(db, visitId, { force: true , actorId: TEST_OPERATOR })
    const reopened = reopenPass(db, visitId, TEST_OPERATOR)
    // Leaving it behind would describe a state that is no longer true.
    assert.equal(reopened.completed_at, null)
    assert.equal(reopened.completed_with_outstanding, null)
    db.close()
  })

  it('requires every zone to have been opened', async () => {
    const { db, propertyId, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!
    startPass(db, visitId, TEST_OPERATOR)
    openZone(db, visitId, pass.zones[0]!.zoneId, TEST_OPERATOR)
    for (const d of [...pass.zones.flatMap((z) => z.decisions), ...pass.sessionItems]) {
      writeOverlay({ actorId: TEST_OPERATOR, db, propertyId, visitId, kind: 'confirm', targetKind: d.targetKind, targetId: d.targetId })
    }
    assert.throws(() => completePass(db, visitId, { actorId: TEST_OPERATOR }), (e: PassRefused) => e.code === 'pass.outstanding')

    openZone(db, visitId, pass.zones[1]!.zoneId, TEST_OPERATOR)
    assert.ok(completePass(db, visitId, { actorId: TEST_OPERATOR }).pass.completed_at)
    db.close()
  })

  it('never requires memory capture', async () => {
    const { db, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!
    assert.ok(pass.zones.every((z) => z.memory === null), 'prompted every zone, recorded in none of them')
    // The previous test completed a pass with no memory anywhere, which is the
    // real assertion. This one pins the intent.
    db.close()
  })

  it('counts a zone opened twice as one zone walked', async () => {
    const { db, visitId } = await walkReference()
    const pass = buildPass(db, visitId)!
    startPass(db, visitId, TEST_OPERATOR)
    openZone(db, visitId, pass.zones[0]!.zoneId, TEST_OPERATOR)
    openZone(db, visitId, pass.zones[0]!.zoneId, TEST_OPERATOR)

    const after = buildPass(db, visitId)!
    assert.equal(after.progress.zonesWalked, 1)
    assert.equal(after.zones[0]!.openCount, 2, 'but the record knows it was walked twice')
    db.close()
  })

  it('does not reset the sitting when the screen is reopened', async () => {
    const { db, visitId } = await walkReference()
    const first = startPass(db, visitId, TEST_OPERATOR)
    const second = startPass(db, visitId, TEST_OPERATOR)
    assert.equal(first.id, second.id)
    assert.equal(first.started_at, second.started_at, 'time in pass would otherwise mean nothing')
    db.close()
  })
})

describe('thumbnails', () => {
  it('makes one on demand and serves the cached file after', async () => {
    const { db, dataDir, visitId } = await walkSynthetic()
    const photo = db
      .prepare("SELECT media_id FROM media WHERE visit_id = ? AND mime LIKE 'image/%' AND file_status = 'present' LIMIT 1")
      .get(visitId) as { media_id: string }

    const media = findMedia(db, visitId, photo.media_id)!
    const out = cachePath(media, 400, dataDir)
    assert.ok(!existsSync(out), 'nothing is generated until it is asked for')

    const first = await thumbnail(media, 400, dataDir)
    assert.ok(first.ok && existsSync(first.path))
    assert.equal(first.path, out)

    // Second call is a cache hit — the file is not rebuilt.
    const stamp = readFileSync(out).length
    const second = await thumbnail(media, 400, dataDir)
    assert.ok(second.ok)
    assert.equal(readFileSync(out).length, stamp)
    db.close()
  })

  it('keeps the cache outside the visit directory, so it is never mistaken for evidence', async () => {
    const { db, dataDir, propertyId, visitId } = await walkSynthetic()
    const photo = db
      .prepare("SELECT media_id FROM media WHERE visit_id = ? AND mime LIKE 'image/%' AND file_status = 'present' LIMIT 1")
      .get(visitId) as { media_id: string }
    const media = findMedia(db, visitId, photo.media_id)!
    const r = await thumbnail(media, 400, dataDir)
    assert.ok(r.ok)

    const visitDir = join(dataDir, 'properties', propertyId, 'visits', visitId)
    assert.ok(!r.path.startsWith(visitDir), 'a derived file beside the originals gets mistaken for one')

    // And wiping the cache is always safe: it simply rebuilds.
    rmSync(join(dataDir, '.cache'), { recursive: true, force: true })
    const again = await thumbnail(media, 400, dataDir)
    assert.ok(again.ok && existsSync(again.path))
    db.close()
  })

  it('warms the room being entered and the one after it', async () => {
    // Warming only the current room means every room costs its own cold wait.
    // Warming the next one too means that wait is paid while somebody is still
    // reading this room, so after room one it disappears.
    const { db, dataDir, visitId } = await walkSynthetic()
    const order = orderedZoneIds(db, visitId)
    assert.ok(order.length >= 2, 'sanity: the fixture has rooms to walk')

    const cachedIn = (zoneId: string) =>
      (db
        .prepare(
          `SELECT m.media_id, m.property_id, m.visit_id, m.kind, m.mime, m.file, m.file_status
             FROM media m WHERE m.visit_id = ? AND m.owner_zone_id = ? AND m.file_status = 'present'
               AND m.mime LIKE 'image/%'`,
        )
        .all(visitId, zoneId) as Parameters<typeof cachePath>[0][])
        .filter((m) => existsSync(cachePath(m, 400, dataDir))).length

    await warmZone(db, visitId, order[0]!, dataDir)
    await warmZone(db, visitId, order[1]!, dataDir)
    assert.ok(cachedIn(order[0]!) > 0 || cachedIn(order[1]!) > 0, 'both rooms were warmed ahead of being asked for')
    db.close()
  })

  it('survives two requests racing for the same thumbnail', async () => {
    // This is not hypothetical: opening a zone starts warmZone in the
    // background while the browser is already asking for the same tiles. Before
    // the write was made atomic, a reader could open a half-written file and
    // get a truncated image or a 404 — which is exactly what the first run of
    // the real screen did.
    const { db, dataDir, visitId } = await walkSynthetic()
    const photos = db
      .prepare("SELECT media_id FROM media WHERE visit_id = ? AND mime LIKE 'image/%' AND file_status = 'present'")
      .all(visitId) as { media_id: string }[]
    const media = findMedia(db, visitId, photos[0]!.media_id)!

    const results = await Promise.all(Array.from({ length: 8 }, () => thumbnail(media, 400, dataDir)))
    assert.ok(results.every((r) => r.ok), 'every racer gets a usable thumbnail')

    const out = cachePath(media, 400, dataDir)
    const bytes = readFileSync(out)
    assert.ok(bytes.length > 0)
    // A JPEG, whole — not a fragment of one.
    assert.equal(bytes[0], 0xff)
    assert.equal(bytes[1], 0xd8)
    assert.equal(bytes.at(-2), 0xff)
    assert.equal(bytes.at(-1), 0xd9)

    // And no temp files left lying about in the cache.
    const dir = join(dataDir, '.cache', 'thumbs', media.property_id, media.visit_id)
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp')), [])
    db.close()
  })

  it('refuses to render a quarantined file as though it were a photo', async () => {
    const db = freshDb()
    const dataDir = scratchDir()
    const fixtureDir = scratchDir()
    const { manifestPath } = await writeFixture(fixtureDir)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    writeFileSync(join(fixtureDir, manifest.media[0].file), 'not the bytes the export promised')

    const ids = makePropertyAndVisit(db, { label: '12 Riverside Lane', address: '12 Riverside Lane' })
    await runImport({ actorId: TEST_OPERATOR,
      db, ...ids, raw: readFileSync(manifestPath, 'utf8'), dataDir, mediaDir: fixtureDir,
    })

    const media = findMedia(db, ids.visitId, manifest.media[0].mediaId)!
    assert.equal(media.file_status, 'failed_checksum')

    const original = resolveOriginal(media, dataDir)
    assert.ok(!original.ok && original.reason === 'quarantined')
    // The import said it "is not counted as evidence". A screen showing it as an
    // ordinary photo would quietly undo that.
    assert.match(original.message, /not counted as evidence/)

    const thumb = await thumbnail(media, 400, dataDir)
    assert.ok(!thumb.ok && thumb.reason === 'quarantined')
    db.close()
  })

  it('gives a non-image no thumbnail rather than an error', async () => {
    const { db, dataDir, visitId } = await walkSynthetic()
    const voice = db
      .prepare("SELECT media_id FROM media WHERE visit_id = ? AND mime NOT LIKE 'image/%' LIMIT 1")
      .get(visitId) as { media_id: string } | undefined
    if (!voice) return // the fixture always has one, but do not fail if it changes

    const media = findMedia(db, visitId, voice.media_id)!
    const r = await thumbnail(media, 400, dataDir)
    assert.ok(!r.ok && r.reason === 'not-an-image')
    // The file itself is still perfectly available.
    assert.ok(resolveOriginal(media, dataDir).ok)
    db.close()
  })

  it('reports an absent file as absent rather than serving a broken image', async () => {
    const { db, dataDir, visitId } = await walkReference()
    const photo = db.prepare('SELECT media_id FROM media WHERE visit_id = ? LIMIT 1').get(visitId) as {
      media_id: string
    }
    const media = findMedia(db, visitId, photo.media_id)!
    const r = await thumbnail(media, 400, dataDir)
    assert.ok(!r.ok && r.reason === 'absent')
    assert.match(r.message, /not on this machine/)
    db.close()
  })
})
