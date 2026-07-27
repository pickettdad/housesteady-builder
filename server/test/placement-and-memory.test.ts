import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { runImport } from '../src/import/runImport.js'
import { OverlayRefused, writeOverlay } from '../src/overlay/store.js'
import {
  acknowledgeDeskMedia,
  deskMediaPath,
  saveMemoryAudio,
  unacknowledgedSilent,
} from '../src/pass/memory.js'
import { buildPass } from '../src/pass/read.js'
import { completePass, openZone, PassRefused, startPass } from '../src/pass/store.js'
import { freshDb, makePropertyAndVisit, readReference, repoRoot, scratchDir } from './helpers.js'

/**
 * Anchor placement at the desk, and memory capture with its assurance.
 *
 * Spec v2 §2 revised the placement rule: the requirement is that a desk
 * placement never be INDISTINGUISHABLE from a field one, not that it be
 * prevented. The governing line is evidence versus recall.
 */

async function walk(mutate?: (m: Record<string, any>) => void) {
  const db = freshDb()
  const dataDir = scratchDir()
  const ids = makePropertyAndVisit(db)
  let raw = readReference()
  if (mutate) {
    const parsed = JSON.parse(raw)
    mutate(parsed)
    raw = JSON.stringify(parsed)
  }
  await runImport({ db, ...ids, raw, dataDir })
  return { db, dataDir, ...ids }
}

/** A pin with a photo on it, so placements have evidence to point at. */
function pinWithEvidence(db: ReturnType<typeof freshDb>, visitId: string) {
  const pass = buildPass(db, visitId)!
  for (const zone of pass.zones) {
    const pin = zone.pins.find((p) => p.mediaIds.length > 0 || p.notes.length > 0)
    if (pin && zone.canvases[0]) {
      return {
        zone,
        pin,
        canvasId: zone.canvases[0].canvasId,
        evidence: pin.mediaIds.length > 0
          ? { kind: 'media', id: pin.mediaIds[0]! }
          : { kind: 'note', id: pin.notes[0]!.noteId },
      }
    }
  }
  throw new Error('fixture has no pin with evidence')
}

describe('placing an anchor at the desk', () => {
  it('records a placement without touching the anchors the field sent', async () => {
    const { db, propertyId, visitId } = await walk()
    const { pin, canvasId, evidence } = pinWithEvidence(db, visitId)
    const before = JSON.stringify(db.prepare('SELECT * FROM anchors').all())

    const o = writeOverlay({
      db, propertyId, visitId, kind: 'place', targetKind: 'pin', targetId: pin.pinId,
      newValue: { canvasId, x: 0.42, y: 0.17, evidence },
    })

    assert.equal(o.kind, 'place')
    assert.equal(o.actorContext, 'desk')
    assert.deepEqual(o.newValue, { canvasId, x: 0.42, y: 0.17, evidence })
    // The manifest still says what it said.
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM anchors').all()), before)
    db.close()
  })

  it('keeps the prior position when a placed pin is moved', async () => {
    const { db, propertyId, visitId } = await walk()
    const { pin, canvasId, evidence } = pinWithEvidence(db, visitId)

    // This pin already has a field anchor, so the first desk placement is a
    // move and must record where it was.
    const first = writeOverlay({
      db, propertyId, visitId, kind: 'place', targetKind: 'pin', targetId: pin.pinId,
      newValue: { canvasId, x: 0.4, y: 0.4, evidence },
    })
    assert.ok(first.priorValue, 'a move records the position it moved from')
    assert.equal((first.priorValue as { x: number }).x, pin.anchors[0]!.x)

    const second = writeOverlay({
      db, propertyId, visitId, kind: 'place', targetKind: 'pin', targetId: pin.pinId,
      newValue: { canvasId, x: 0.6, y: 0.6, evidence },
    })
    assert.equal(second.supersedesId, first.id)
    assert.deepEqual(second.priorValue, first.newValue, 'the second move replaced the first, not the original')
    db.close()
  })

  it('records a null prior position when the pin was never placed at all', async () => {
    const { db, propertyId, visitId } = await walk()
    const pass = buildPass(db, visitId)!
    const zone = pass.zones.find((z) => z.unplacedPins.length > 0 && z.canvases[0])!
    const pin = zone.unplacedPins[0]!
    const roomPhoto = zone.roomPhotos[0]!

    const o = writeOverlay({
      db, propertyId, visitId, kind: 'place', targetKind: 'pin', targetId: pin.pinId,
      newValue: { canvasId: zone.canvases[0]!.canvasId, x: 0.5, y: 0.5, evidence: { kind: 'media', id: roomPhoto.mediaId } },
    })
    // Never placed and moved-from-somewhere are different facts.
    assert.equal(o.priorValue, null)
    db.close()
  })

  it('is distinguishable from a field anchor, structurally and in the read model', async () => {
    const { db, propertyId, visitId } = await walk()
    const pass0 = buildPass(db, visitId)!
    const zone0 = pass0.zones.find((z) => z.unplacedPins.length > 0 && z.canvases[0])!
    const pin = zone0.unplacedPins[0]!

    writeOverlay({
      db, propertyId, visitId, kind: 'place', targetKind: 'pin', targetId: pin.pinId,
      newValue: {
        canvasId: zone0.canvases[0]!.canvasId, x: 0.5, y: 0.5,
        evidence: { kind: 'media', id: zone0.roomPhotos[0]!.mediaId },
      },
    })

    const zone = buildPass(db, visitId)!.zones.find((z) => z.zoneId === zone0.zoneId)!
    const placed = zone.pins.find((p) => p.pinId === pin.pinId)!

    // Its own field, not merged into `anchors`. Merging would make the two the
    // same shape and leave the distinction to every consumer's memory.
    assert.ok(placed.deskPlacement, 'the desk placement is its own thing')
    assert.deepEqual(placed.anchors, [], 'and the field anchors stay as they were — empty')
    assert.equal(placed.deskPlacement!.evidence!.kind, 'media', 'carrying what it was read from')
    // No longer in the tray of pins that cannot be positioned.
    assert.ok(!zone.unplacedPins.some((p) => p.pinId === pin.pinId))
    db.close()
  })

  it('refuses a placement with no evidence behind it', async () => {
    const { db, propertyId, visitId } = await walk()
    const { pin, canvasId } = pinWithEvidence(db, visitId)

    // The whole point of the revised rule: recall is not a position. A shutoff
    // somebody remembers being behind the furnace belongs in the next visit.
    assert.throws(
      () =>
        writeOverlay({
          db, propertyId, visitId, kind: 'place', targetKind: 'pin', targetId: pin.pinId,
          newValue: { canvasId, x: 0.5, y: 0.5 },
        }),
      (e: OverlayRefused) => e.code === 'overlay.place-no-evidence',
    )
    db.close()
  })

  it('refuses evidence that is not in hand for this pin', async () => {
    const { db, propertyId, visitId } = await walk()
    const pass = buildPass(db, visitId)!
    const [first, second] = pass.zones
    const pin = first!.pins.find((p) => p.mediaIds.length > 0)!
    const otherRoomPhoto = second!.roomPhotos[0]

    assert.throws(
      () =>
        writeOverlay({
          db, propertyId, visitId, kind: 'place', targetKind: 'pin', targetId: pin.pinId,
          newValue: {
            canvasId: first!.canvases[0]!.canvasId, x: 0.5, y: 0.5,
            evidence: { kind: 'media', id: otherRoomPhoto?.mediaId ?? 'nope' },
          },
        }),
      (e: OverlayRefused) => e.code === 'overlay.place-evidence-not-in-hand',
      'a photo of a different room cannot be what this position was read from',
    )
    db.close()
  })

  it('refuses a position that is not on the canvas', async () => {
    const { db, propertyId, visitId } = await walk()
    const { pin, canvasId, evidence } = pinWithEvidence(db, visitId)
    for (const [x, y] of [[1.4, 0.5], [-0.1, 0.5], [0.5, 2]]) {
      assert.throws(
        () =>
          writeOverlay({
            db, propertyId, visitId, kind: 'place', targetKind: 'pin', targetId: pin.pinId,
            newValue: { canvasId, x, y, evidence },
          }),
        (e: OverlayRefused) => e.code === 'overlay.place-out-of-bounds',
      )
    }
    db.close()
  })

  it('reads as placed, moved, unplaced in the trail', async () => {
    const { db, propertyId, visitId } = await walk()
    const { pin, canvasId, evidence } = pinWithEvidence(db, visitId)
    writeOverlay({
      db, propertyId, visitId, kind: 'place', targetKind: 'pin', targetId: pin.pinId,
      newValue: { canvasId, x: 0.3, y: 0.3, evidence },
    })
    const moved = writeOverlay({
      db, propertyId, visitId, kind: 'place', targetKind: 'pin', targetId: pin.pinId,
      newValue: { canvasId, x: 0.7, y: 0.7, evidence },
    })
    writeOverlay({
      db, propertyId, visitId, kind: 'undo', targetKind: 'overlay', targetId: moved.id, supersedesId: moved.id,
    })

    const placed = buildPass(db, visitId)!.zones.flatMap((z) => z.pins).find((p) => p.pinId === pin.pinId)!
    // Undone, so the field's own anchor is what stands again.
    assert.equal(placed.deskPlacement, null)
    db.close()
  })
})

describe('the accidental-placement path', () => {
  it('cannot place a pin without one being chosen first', () => {
    // The canvas click handler returns immediately unless a pin has been
    // selected from the tray, so a stray click on the photograph does nothing.
    // Pinned here because it is a property of one early return, and an early
    // return is easy to delete while refactoring.
    const canvas = readFileSync(join(repoRoot, 'web', 'src', 'pass', 'Canvas.tsx'), 'utf8')
    const handler = canvas.slice(canvas.indexOf('const clickToPlace'), canvas.indexOf('return (\n    <div className="canvas-wrap"'))
    assert.match(handler, /if \(!placing\) return/, 'a canvas click with no pin chosen must do nothing')

    // And `placing` is only ever set from the tray, never from the canvas.
    const setters = [...canvas.matchAll(/setPlacing\(([^)]*)\)/g)].map((m) => m[1]!.trim())
    const nonNull = setters.filter((v) => v !== 'null')
    assert.deepEqual(nonNull, ['p'], 'exactly one place chooses a pin: the tray button')
  })
})

describe('memory capture', () => {
  const record = (
    db: ReturnType<typeof freshDb>,
    ids: { propertyId: string; visitId: string },
    zoneId: string,
    dataDir: string,
    opts: { peak: number; bytes?: number; durationMs?: number },
  ) => {
    const tmp = join(scratchDir(), 'clip.webm')
    writeFileSync(tmp, Buffer.alloc(opts.bytes ?? 4096, 7))
    return saveMemoryAudio({
      db, ...ids, zoneId, tempPath: tmp, mime: 'audio/webm',
      durationMs: opts.durationMs ?? 4200, peakLevel: opts.peak, dataDir,
    })
  }

  it('stores the audio, the overlay, and the assurance figures together', async () => {
    const { db, dataDir, propertyId, visitId } = await walk()
    const zone = buildPass(db, visitId)!.zones[0]!

    const { media } = record(db, { propertyId, visitId }, zone.zoneId, dataDir, { peak: 0.6 })

    assert.equal(media.origin, 'desk', 'never mistakable for something the field captured')
    assert.equal(media.silent, 0)
    assert.equal(media.peak_level, 0.6)
    assert.ok(existsSync(deskMediaPath(media, dataDir)), 'the audio is on disk')
    // Relative path, so a restore onto another machine still finds it.
    assert.ok(!media.file.startsWith('/'))

    const after = buildPass(db, visitId)!.zones.find((z) => z.zoneId === zone.zoneId)!
    assert.equal(after.memoryAudio.length, 1)
    assert.equal(after.memoryAudio[0]!.peakLevel, 0.6)

    // And it is in `desk_media`, not in the captured media table.
    const captured = db.prepare('SELECT COUNT(*) AS n FROM media WHERE media_id = ?').get(media.id) as { n: number }
    assert.equal(captured.n, 0, 'a desk capture never lands in the field app’s table')
    db.close()
  })

  it('detects a silent recording — the muted-microphone case', async () => {
    const { db, dataDir, propertyId, visitId } = await walk()
    const zone = buildPass(db, visitId)!.zones[0]!

    // A muted mic yields a file of exactly the right length full of nothing.
    // Size alone cannot catch it; the peak level is the only thing that can.
    const { media } = record(db, { propertyId, visitId }, zone.zoneId, dataDir, { peak: 0.001, bytes: 40_000 })
    assert.equal(media.silent, 1)
    assert.ok(media.bytes! > 0, 'a plausible-looking file, and still silent')
    db.close()
  })

  it('treats an empty recording as silent too', async () => {
    const { db, dataDir, propertyId, visitId } = await walk()
    const zone = buildPass(db, visitId)!.zones[0]!
    const { media } = record(db, { propertyId, visitId }, zone.zoneId, dataDir, { peak: 0.9, bytes: 0 })
    assert.equal(media.silent, 1, 'a dead recorder and a muted mic are the same outcome')
    db.close()
  })

  it('keeps both a spoken and a typed note for the same room', async () => {
    const { db, dataDir, propertyId, visitId } = await walk()
    const zone = buildPass(db, visitId)!.zones[0]!
    record(db, { propertyId, visitId }, zone.zoneId, dataDir, { peak: 0.5 })
    writeOverlay({
      db, propertyId, visitId, kind: 'memory', targetKind: 'zone', targetId: zone.zoneId,
      field: 'text', newValue: { text: 'Owner mentioned the sump ran twice in June.' },
    })

    const after = buildPass(db, visitId)!.zones.find((z) => z.zoneId === zone.zoneId)!
    const live = after.memory!.trail.filter((t) => t.live)
    assert.equal(live.length, 2, 'spec §4 says free text AND/OR audio — neither supersedes the other')
    assert.deepEqual(live.map((t) => t.overlay.field).sort(), ['audio', 'text'])
    db.close()
  })

  it('carries the from-recall provenance on every memory overlay', async () => {
    const { db, dataDir, propertyId, visitId } = await walk()
    const zone = buildPass(db, visitId)!.zones[0]!
    const { overlayId } = record(db, { propertyId, visitId }, zone.zoneId, dataDir, { peak: 0.5 })
    const o = db.prepare('SELECT reason, actor_context FROM overlays WHERE id = ?').get(overlayId) as {
      reason: string
      actor_context: string
    }
    // The honesty label stays Observed — the concierge did see the room. The
    // provenance says when it was written down. Collapsing the two would either
    // overclaim or underclaim.
    assert.match(o.reason, /from recall/)
    assert.equal(o.actor_context, 'desk')
    db.close()
  })
})

describe('the capture-assurance backstop', () => {
  it('will not complete a pass with a silent recording sitting unacknowledged', async () => {
    const { db, dataDir, propertyId, visitId } = await walk()
    const pass = buildPass(db, visitId)!
    startPass(db, visitId)
    for (const z of pass.zones) openZone(db, visitId, z.zoneId)
    for (const d of [...pass.zones.flatMap((z) => z.decisions), ...pass.sessionItems]) {
      writeOverlay({ db, propertyId, visitId, kind: 'confirm', targetKind: d.targetKind, targetId: d.targetId })
    }
    // Everything else is done — only the silent recording stands in the way.
    assert.ok(buildPass(db, visitId)!.progress.complete)

    const tmp = join(scratchDir(), 'silent.webm')
    writeFileSync(tmp, Buffer.alloc(30_000))
    saveMemoryAudio({
      db, propertyId, visitId, zoneId: pass.zones[0]!.zoneId, tempPath: tmp,
      mime: 'audio/webm', durationMs: 5000, peakLevel: 0.0005, dataDir,
    })

    try {
      completePass(db, visitId)
      assert.fail('should have refused')
    } catch (e) {
      assert.ok(e instanceof PassRefused)
      assert.equal(e.code, 'pass.silent-recording')
      // Named, not merely counted. Otherwise the button fails for a reason
      // living somewhere else on the page and the concierge has to hunt.
      assert.ok(
        e.outstanding[0]!.includes(pass.zones[0]!.label!),
        `"${e.outstanding[0]}" should name the room it is in`,
      )
    }
    db.close()
  })

  it('cannot be forced past — unlike the open-decision gate', async () => {
    const { db, dataDir, propertyId, visitId } = await walk()
    const zone = buildPass(db, visitId)!.zones[0]!
    startPass(db, visitId)
    const tmp = join(scratchDir(), 'silent.webm')
    writeFileSync(tmp, Buffer.alloc(30_000))
    saveMemoryAudio({
      db, propertyId, visitId, zoneId: zone.zoneId, tempPath: tmp,
      mime: 'audio/webm', durationMs: 5000, peakLevel: 0, dataDir,
    })

    // A lock is bad when routing around it is the only sensible response. Here
    // the exit is one click — re-record, or say you know — so forcing past it
    // would remove the only thing catching a muted microphone.
    assert.throws(
      () => completePass(db, visitId, { force: true }),
      (e: PassRefused) => e.code === 'pass.silent-recording',
    )
    db.close()
  })

  it('lets the pass finish once the recording is acknowledged', async () => {
    const { db, dataDir, propertyId, visitId } = await walk()
    const pass = buildPass(db, visitId)!
    startPass(db, visitId)
    for (const z of pass.zones) openZone(db, visitId, z.zoneId)
    for (const d of [...pass.zones.flatMap((z) => z.decisions), ...pass.sessionItems]) {
      writeOverlay({ db, propertyId, visitId, kind: 'confirm', targetKind: d.targetKind, targetId: d.targetId })
    }
    const tmp = join(scratchDir(), 'silent.webm')
    writeFileSync(tmp, Buffer.alloc(30_000))
    const { media } = saveMemoryAudio({
      db, propertyId, visitId, zoneId: pass.zones[0]!.zoneId, tempPath: tmp,
      mime: 'audio/webm', durationMs: 5000, peakLevel: 0, dataDir,
    })

    assert.equal(unacknowledgedSilent(db, visitId).length, 1)
    acknowledgeDeskMedia(db, media.id)
    assert.equal(unacknowledgedSilent(db, visitId).length, 0)

    // Acknowledged, not deleted. The silence is still in the record, and so is
    // the fact that somebody looked at it and kept it.
    const kept = db.prepare('SELECT silent, acknowledged_at FROM desk_media WHERE id = ?').get(media.id) as {
      silent: number
      acknowledged_at: string
    }
    assert.equal(kept.silent, 1)
    assert.ok(kept.acknowledged_at)
    assert.ok(completePass(db, visitId).pass.completed_at)
    db.close()
  })

  it('does not stand in the way of a good recording', async () => {
    const { db, dataDir, propertyId, visitId } = await walk()
    const pass = buildPass(db, visitId)!
    startPass(db, visitId)
    for (const z of pass.zones) openZone(db, visitId, z.zoneId)
    for (const d of [...pass.zones.flatMap((z) => z.decisions), ...pass.sessionItems]) {
      writeOverlay({ db, propertyId, visitId, kind: 'confirm', targetKind: d.targetKind, targetId: d.targetId })
    }
    const tmp = join(scratchDir(), 'good.webm')
    writeFileSync(tmp, Buffer.alloc(30_000, 3))
    saveMemoryAudio({
      db, propertyId, visitId, zoneId: pass.zones[0]!.zoneId, tempPath: tmp,
      mime: 'audio/webm', durationMs: 5000, peakLevel: 0.7, dataDir,
    })
    assert.ok(completePass(db, visitId).pass.completed_at)
    db.close()
  })
})
