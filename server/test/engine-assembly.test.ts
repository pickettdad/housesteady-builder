/**
 * The identification pass's send side — Increment 5 §3, Amendment 1 §C and §D1.
 *
 * **Everything here runs without a key, a network or a photograph.** That is the
 * point of splitting assembly from the call: what gets sent is fully decidable
 * from the manifest, so it is testable in any container, and only the response
 * needs the owner's machine.
 *
 * The walk fixture is the material. It is the only export with video and voice
 * inside otherwise photographic zones, which is the case §C exists for.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assembleZone,
  CONSUMED_KINDS,
  reconciles,
  sentDimensions,
  unconsumedNote,
  type AssemblyMedia,
} from '../src/engine/assembly.js'
import { assembleImport, importReconciles } from '../src/engine/plan.js'
import { plannedRecord, totals, usageFrom, type RunRecord } from '../src/engine/runRecord.js'
import type { Db } from '../src/db/index.js'
import { runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, readWalk, repoRoot, scratchDir, TEST_OPERATOR } from './helpers.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** `mediaId,width,height` measured on the owner's Mac. See the fixture README. */
const dimensions = (): { mediaId: string; width: number; height: number }[] =>
  readFileSync(join(repoRoot, 'fixtures', 'walk-2026-07-31', 'photo-dimensions.csv'), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => {
      const [mediaId, w, h] = line.split(',')
      return { mediaId: mediaId!, width: Number(w), height: Number(h) }
    })

async function walked(): Promise<{ db: Db; importId: string }> {
  const db = freshDb()
  const ids = makePropertyAndVisit(db, { kind: 'baseline' })
  const { importId } = await runImport({
    actorId: TEST_OPERATOR, db, ...ids, raw: readWalk(), dataDir: scratchDir(),
  })
  return { db, importId }
}

const photo = (id: string, over: Partial<AssemblyMedia> = {}): AssemblyMedia => ({
  mediaId: id, kind: 'photo', mime: 'image/jpeg', bytes: 3_000_000,
  fileStatus: 'present', file: `media/z/_zone/${id}.jpg`, capturedAt: null,
  role: 'subject', ownerKind: 'zone', ownerPinId: null, ...over,
})

/** A wide shot of the room — context, never a subject (Amendment 2 §A2). */
const wide = (id: string, over: Partial<AssemblyMedia> = {}): AssemblyMedia =>
  photo(id, { role: 'context', ownerKind: 'canvas', ...over })

const ZONE = { zoneId: 'z1', label: 'mechanical room' }

describe('call assembly — what would be sent, decided without sending it', () => {
  describe('the consumed/unconsumed rule', () => {
    it('declares what it consumes rather than what it skips', () => {
      // The direction of this list IS the rule (§C). A skip list would go stale
      // the first time the field app ships a kind nobody has met.
      assert.deepEqual([...CONSUMED_KINDS], ['photo'])
    })

    it('sends an unknown kind nowhere and reports it, rather than failing', () => {
      // Fail open on vocabulary. `thermal` is not a kind this build has met.
      const a = assembleZone(ZONE, [
        photo('p1'),
        photo('t1', { kind: 'thermal', mime: 'image/tiff' }),
      ])
      assert.equal(a.batches[0]?.subjects.length, 1)
      assert.deepEqual(a.unconsumed.map((u) => u.kind), ['thermal'])
      assert.match(unconsumedNote(a) ?? "", /1 thermal/)
    })

    it('treats a null kind as unconsumed rather than assuming it is a photograph', () => {
      const a = assembleZone(ZONE, [photo('u1', { kind: null })])
      assert.equal(a.batches.length, 0)
      assert.equal(a.unconsumed.length, 1)
      assert.match(unconsumedNote(a) ?? "", /1 untyped/)
    })

    it('keeps a missing photograph apart from a deliberately unread kind', () => {
      // The most damaging collapse available here: a video not being read is the
      // pass working; an absent photograph is a hole in the record.
      const a = assembleZone(ZONE, [
        photo('p1'),
        photo('v1', { kind: 'video', mime: 'video/quicktime' }),
        photo('p2', { fileStatus: 'absent' }),
        photo('p3', { fileStatus: 'failed_checksum' }),
        photo('p4', { file: null }),
      ])
      assert.equal(a.batches[0]?.subjects.length, 1)
      assert.deepEqual(a.unconsumed.map((u) => u.mediaId), ['v1'])
      assert.deepEqual(
        a.unavailable.map((u) => `${u.mediaId}:${u.reason}`),
        ['p2:absent', 'p3:failed_checksum', 'p4:no-path'],
      )
    })
  })

  describe('the threshold, which is deliberately unset', () => {
    it('makes one call for a whole zone when no threshold is configured', () => {
      const a = assembleZone(ZONE, Array.from({ length: 58 }, (_, i) => photo(`p${i}`)))
      assert.equal(a.batches.length, 1)
      assert.equal(a.batches[0]?.subjects.length, 58)
      assert.equal(a.split, null)
    })

    it('records that no threshold was in force, distinct from one not reached', () => {
      // Ninth instance of declared-vs-absent. A reader who cannot tell these
      // apart cannot tell a deliberate single call from an unconfigured one.
      const none = assembleZone(ZONE, [photo('p1')])
      const set = assembleZone(ZONE, [photo('p1')], { maxPhotosPerBatch: 20 })
      assert.equal(none.thresholdInForce, false)
      assert.equal(set.thresholdInForce, true)
      assert.equal(none.split, null)
      assert.equal(set.split, null, 'configured but not reached is still no split')
    })

    it('splits when configured, and the split says the room was not seen whole', () => {
      const a = assembleZone(ZONE, Array.from({ length: 58 }, (_, i) => photo(`p${i}`)), {
        maxPhotosPerBatch: 20,
      })
      assert.equal(a.batches.length, 3)
      assert.deepEqual(a.batches.map((b) => b.subjects.length), [20, 20, 18])
      assert.equal(a.split?.batchCount, 3)
      // §3's accuracy claim is withdrawn in words a person reads, not only in a
      // count they would have to interpret.
      assert.match(a.split?.note ?? '', /No single call saw the whole room/)
    })
  })

  describe('room context — the wide shot (Amendment 2 §A2)', () => {
    it('sends the room shot but never asks what it is', () => {
      const a = assembleZone(ZONE, [wide('w1'), photo('p1'), photo('p2')])
      assert.deepEqual(a.batches[0]?.subjects.map((m) => m.mediaId), ['p1', 'p2'])
      assert.deepEqual(a.batches[0]?.context.map((m) => m.mediaId), ['w1'])
      assert.equal(a.subjectCount, 2, 'context is not a subject')
      // A floorplan sketch returning "a drawing of a room" is what this prevents.
      assert.ok(a.batches.every((b) => b.subjects.every((s) => s.role === 'subject')))
    })

    it('repeats the room shot into every batch, and counts the repetition', () => {
      // A split batch needs the room shot most: without it, batch 2 of 3 loses
      // exactly what makes batching by room better than batching by photograph.
      const a = assembleZone(
        ZONE,
        [wide('w1'), ...Array.from({ length: 6 }, (_, i) => photo(`p${i}`))],
        { maxPhotosPerBatch: 2 },
      )
      assert.equal(a.batches.length, 3)
      assert.ok(a.batches.every((b) => b.context.length === 1))
      assert.equal(a.context.length, 1, 'one file, however many times it was sent')
      assert.match(a.split?.note ?? '', /3 context sends were made for 1 file\./)
    })

    it('counts the threshold in subjects, so context cannot force a split', () => {
      // Otherwise a room with two wide shots splits earlier than an identical
      // room with one — a storage decision changing what the model sees.
      const a = assembleZone(ZONE, [wide('w1'), wide('w2'), photo('p1'), photo('p2')], {
        maxPhotosPerBatch: 2,
      })
      assert.equal(a.batches.length, 1)
      assert.equal(a.split, null)
    })

    it('makes no call for a room with a wide shot and nothing in it', () => {
      const a = assembleZone(ZONE, [wide('w1')])
      assert.equal(a.batches.length, 0)
      assert.equal(a.context.length, 1, 'the frame is kept, not discarded with the call')
      assert.ok(reconciles(a))
    })

    it('counts context bytes into the batch that carries them', () => {
      const a = assembleZone(ZONE, [wide('w1', { bytes: 1000 }), photo('p1', { bytes: 500 })])
      assert.equal(a.batches[0]?.declaredBytes, 1500)
    })
  })

  describe('nothing is dropped', () => {
    it('places every input row in exactly one bucket', () => {
      const a = assembleZone(ZONE, [
        photo('p1'), photo('v1', { kind: 'video' }), photo('a1', { kind: 'voice' }),
        photo('x1', { fileStatus: 'absent' }), photo('t1', { kind: 'thermal' }),
      ])
      assert.equal(a.receivedCount, 5)
      assert.ok(reconciles(a))
      assert.equal(a.subjectCount + a.unconsumed.length + a.unavailable.length, 5)
    })

    it('keeps a zone with no media at all, rather than omitting it', () => {
      // §E turns on telling this apart from a zone whose photographs have not
      // been loaded. A zone that vanishes cannot be told apart from anything.
      const a = assembleZone(ZONE, [])
      assert.equal(a.batches.length, 0)
      assert.equal(a.receivedCount, 0)
      assert.ok(reconciles(a))
    })
  })

  describe('capture order', () => {
    it('sends photographs in the order the room was walked', () => {
      const a = assembleZone(ZONE, [
        photo('c', { capturedAt: '2026-07-31T17:20:00.000Z' }),
        photo('a', { capturedAt: '2026-07-31T17:18:00.000Z' }),
        photo('b', { capturedAt: '2026-07-31T17:19:00.000Z' }),
      ])
      assert.deepEqual(a.batches[0]?.subjects.map((m) => m.mediaId), ['a', 'b', 'c'])
    })

    it('does not move an undated photograph to either end', () => {
      // Sorting nulls to one end would silently reorder a real export; the walk
      // has timestamps but nothing guarantees the next one will.
      const a = assembleZone(ZONE, [
        photo('x', { capturedAt: null }),
        photo('late', { capturedAt: '2026-07-31T17:20:00.000Z' }),
        photo('early', { capturedAt: '2026-07-31T17:18:00.000Z' }),
      ])
      assert.deepEqual(a.batches[0]?.subjects.map((m) => m.mediaId), ['x', 'early', 'late'])
    })
  })

  describe('what gets sent, in pixels', () => {
    it('downscales to the model’s limit and says it did', () => {
      // Every photograph on the walk is 4032 on the long edge — measured from
      // the Mac, not assumed. 143 landscape, 14 portrait, zero variation.
      const land = sentDimensions({ width: 4032, height: 3024 }, { maxImageEdge: 1568 })
      assert.deepEqual(land, { width: 1568, height: 1176, downscaled: true })
      const port = sentDimensions({ width: 3024, height: 4032 }, { maxImageEdge: 1568 })
      assert.deepEqual(port, { width: 1176, height: 1568, downscaled: true })
    })

    it('leaves an image inside the limit alone', () => {
      const d = sentDimensions({ width: 1200, height: 900 }, { maxImageEdge: 1568 })
      assert.deepEqual(d, { width: 1200, height: 900, downscaled: false })
    })

    it('reads the limit from the model config rather than a constant', () => {
      const hi = sentDimensions({ width: 4032, height: 3024 }, { maxImageEdge: 2576 })
      assert.equal(hi.width, 2576)
      assert.notEqual(hi.width, sentDimensions({ width: 4032, height: 3024 }, { maxImageEdge: 1568 }).width)
    })
  })
})

describe('the run record — the run’s account of itself', () => {
  it('reports a planned run with no calls made', () => {
    const a = assembleZone(ZONE, [photo('p1'), photo('v1', { kind: 'video' })])
    const r = plannedRecord(a)
    assert.equal(r.received, 2)
    assert.equal(r.sent, 1)
    assert.equal(r.unconsumed, 1)
    assert.equal(r.calls[0]?.usage, null)
    assert.equal(r.calls[0]?.returned, 'not yet run')
    assert.ok(r.reconciled)
  })

  it('prices a call from reported tokens, and refuses to price without rates', () => {
    const priced = usageFrom(
      { tier: 'fast', id: 'x', inputPerMTok: 5, outputPerMTok: 25, maxImageEdge: 1568 },
      1_000_000, 1_000_000,
    )
    assert.equal(priced.costUsd, 30)
    // Rates unset is not a free call. A confident $0.00 in a budget is a lie.
    const unpriced = usageFrom(
      { tier: 'fast', id: 'x', inputPerMTok: 0, outputPerMTok: 0, maxImageEdge: 1568 },
      1000, 100,
    )
    assert.equal(unpriced.costUsd, null)
    assert.equal(unpriced.tokensIn, 1000, 'tokens are still measured')
  })

  it('has no route from an image count to a cost', () => {
    // Cost enters only through tokens the API reported. On this walk every photo
    // is identical in size, so a per-image constant would look exact and still
    // be a guess. The absence of that door is the guard.
    assert.equal(usageFrom.length, 3)
    const record: RunRecord = {
      importId: 'i', modelId: null, maxImageEdge: null, ratesConfigured: false,
      zones: [plannedRecord(assembleZone(ZONE, [photo('p1'), photo('p2')]))],
    }
    const t = totals(record)
    assert.equal(t.sent, 2)
    assert.equal(t.tokensIn, null, 'two photographs planned is not two photographs’ worth of tokens')
    assert.equal(t.costUsd, null)
  })

  it('withholds a cost total when any run call was unpriced', () => {
    const model = { tier: 'fast' as const, id: 'x', inputPerMTok: 5, outputPerMTok: 25, maxImageEdge: 1568 }
    const free = { tier: 'fast' as const, id: 'x', inputPerMTok: 0, outputPerMTok: 0, maxImageEdge: 1568 }
    const z = plannedRecord(assembleZone(ZONE, [photo('p1'), photo('p2')], { maxPhotosPerBatch: 1 }))
    z.calls[0]!.usage = usageFrom(model, 1000, 10)
    z.calls[1]!.usage = usageFrom(free, 1000, 10)
    const t = totals({ importId: 'i', modelId: 'x', maxImageEdge: 1568, ratesConfigured: true, zones: [z] })
    assert.equal(t.tokensIn, 2000, 'tokens still total')
    assert.equal(t.costUsd, null, 'a partial cost total understates the bill and looks authoritative')
  })

  it('counts split zones so a weakened claim is visible in the totals', () => {
    const split = plannedRecord(assembleZone(ZONE, [photo('a'), photo('b')], { maxPhotosPerBatch: 1 }))
    const whole = plannedRecord(assembleZone({ zoneId: 'z2', label: 'entry' }, [photo('c')]))
    const t = totals({ importId: 'i', modelId: null, maxImageEdge: null, ratesConfigured: false, zones: [split, whole] })
    assert.equal(t.splitZones, 1)
  })
})

describe('against the real walk — 163 rows, and what is actually readable', () => {
  it('assembles every zone and loses nothing', async () => {
    const { db, importId } = await walked()
    const a = assembleImport(db, importId)
    assert.equal(a.zones.length, 8, 'all eight zones appear, including those with no media')
    assert.ok(importReconciles(db, a), 'every media row is accounted for')
    for (const z of a.zones) assert.ok(reconciles(z), `${z.zoneLabel} reconciles`)
  })

  it('sends nothing at all, because the fixture carries no media files', async () => {
    // **The fixture imports `manifest_only`.** Every one of the 163 rows is
    // file_status `absent`, so the honest assembly is: nothing sendable, 110
    // photographs unavailable, and the reason recorded per file.
    //
    // This is the exact state Amendment §E's completeness check must refuse to
    // run a property pass against — a house whose photographs are declared and
    // not present. It reads identically to a house nobody photographed unless
    // something says which, which is why §E cannot derive completeness from an
    // empty work queue.
    const { db, importId } = await walked()
    const a = assembleImport(db, importId)
    assert.equal(a.zones.reduce((t, z) => t + z.batches.length, 0), 0, 'no call is assembled')
    const unavailable = a.zones.flatMap((z) => z.unavailable)
    assert.equal(unavailable.length, 157, 'every photograph the export declares')
    assert.ok(unavailable.every((u) => u.reason === 'absent'))
    assert.equal(a.zones.reduce((t, z) => t + z.subjectCount, 0), 0)
  })

  it('reads everything that resolves to a zone, by any owner', async () => {
    // Amendment 2 §A. All three owner kinds reach the pass; the census stays
    // reported because a large pin-owned count on a capture-first export means
    // the field workflow is not what the process says it is.
    const { db, importId } = await walked()
    const a = assembleImport(db, importId)
    assert.deepEqual(a.byOwnerKind, [
      { ownerKind: 'zone', count: 113 },
      { ownerKind: 'pin', count: 38 },
      { ownerKind: 'canvas', count: 12 },
    ])
    assert.equal(a.zones.reduce((t, z) => t + z.receivedCount, 0), 163, 'all of it lands in a zone')
    assert.deepEqual(a.unassigned, [], 'this export has no capture without a room')
    assert.ok(importReconciles(db, a))
  })

  it('resolves a pin’s media through the pin, not through the file path', async () => {
    // The two agree on this export by coincidence — the contract stores a pin's
    // media under its zone's directory. Proving the method rather than the
    // number means breaking the coincidence: move a pin to another zone and the
    // media has to follow the pin, not the path it is still stored under.
    const { db, importId } = await walked()
    const before = assembleImport(db, importId)
    const pin = db
      .prepare("SELECT pin_id, zone_id FROM pins WHERE import_id = ? AND zone_id IS NOT NULL LIMIT 1")
      .get(importId) as { pin_id: string; zone_id: string }
    const other = db
      .prepare('SELECT zone_id FROM zones WHERE import_id = ? AND zone_id != ? LIMIT 1')
      .get(importId, pin.zone_id) as { zone_id: string }
    const moved = (
      db.prepare("SELECT COUNT(*) n FROM media WHERE import_id = ? AND owner_kind = 'pin' AND owner_pin_id = ?")
        .get(importId, pin.pin_id) as { n: number }
    ).n
    assert.ok(moved > 0, 'the chosen pin owns media')

    db.prepare('UPDATE pins SET zone_id = ? WHERE import_id = ? AND pin_id = ?').run(other.zone_id, importId, pin.pin_id)
    const after = assembleImport(db, importId)

    const count = (a: typeof before, zoneId: string) => a.zones.find((z) => z.zoneId === zoneId)!.receivedCount
    assert.equal(count(after, pin.zone_id), count(before, pin.zone_id) - moved)
    assert.equal(count(after, other.zone_id), count(before, other.zone_id) + moved)
  })

  it('surfaces a capture that resolves to no room, rather than dropping it', async () => {
    // Amendment 2 §B1. An unanchored pin's photograph is unassigned, not
    // missing — a real capture with no room, and the two want different actions.
    const { db, importId } = await walked()
    const pin = db
      .prepare("SELECT pin_id FROM pins WHERE import_id = ? AND zone_id IS NOT NULL LIMIT 1")
      .get(importId) as { pin_id: string }
    db.prepare('UPDATE pins SET zone_id = NULL WHERE import_id = ? AND pin_id = ?').run(importId, pin.pin_id)

    const a = assembleImport(db, importId)
    assert.ok(a.unassigned.length > 0)
    assert.ok(a.unassigned.every((u) => u.reason === 'pin-is-unanchored'))
    assert.ok(a.unassigned.every((u) => u.ownerKind === 'pin'))
    assert.ok(importReconciles(db, a), 'unassigned still reconciles against the media total')
    // Not folded into unavailable, which means something else entirely.
    assert.equal(a.zones.flatMap((z) => z.unavailable).length, 157 - a.unassigned.length)
  })

  it('carries the canvas in as room context, never as a subject', async () => {
    const { db, importId } = await walked()
    db.prepare("UPDATE media SET file_status = 'present' WHERE import_id = ?").run(importId)
    const a = assembleImport(db, importId)
    const context = a.zones.flatMap((z) => z.context)
    assert.equal(context.length, 12, 'every canvas image resolved to its zone')
    assert.ok(context.every((c) => c.role === 'context' && c.ownerKind === 'canvas'))
    // A floorplan sketch must never come back as a proposed object.
    assert.equal(a.zones.flatMap((z) => z.batches).flatMap((b) => b.subjects).filter((s) => s.role === 'context').length, 0)
  })

  it('keeps pin ownership on the row as evidence', async () => {
    // Ownership travels as evidence, never as a filter: an object proposed from
    // a pinned photograph can reference the pin the concierge placed.
    const { db, importId } = await walked()
    db.prepare("UPDATE media SET file_status = 'present' WHERE import_id = ?").run(importId)
    const a = assembleImport(db, importId)
    const pinned = a.zones.flatMap((z) => z.batches).flatMap((b) => b.subjects).filter((s) => s.ownerKind === 'pin')
    assert.ok(pinned.length > 0)
    assert.ok(pinned.every((s) => s.ownerPinId !== null), 'the pin is on the row, not inferred later')
  })

  it('reports every unconsumed kind, including both voice notes', async () => {
    // §C1 expects this report to make the transcription case with real numbers.
    // Under the ownership reading it would have said zero, because both voice
    // notes are pin-owned. It now says two — a small number honestly arrived at
    // rather than a zero that misleads.
    const { db, importId } = await walked()
    const a = assembleImport(db, importId)
    const byKind = new Map<string, number>()
    for (const u of a.zones.flatMap((z) => z.unconsumed)) {
      byKind.set(u.kind ?? 'untyped', (byKind.get(u.kind ?? 'untyped') ?? 0) + 1)
    }
    assert.deepEqual([...byKind.entries()].sort(), [['video', 4], ['voice', 2]])

    const mech = a.zones.find((z) => z.zoneLabel === 'mechanical room')!
    assert.match(unconsumedNote(mech) ?? '', /1 file not sent to identification: 1 video\./)
    const entry = a.zones.find((z) => z.zoneLabel === 'entry')!
    assert.match(unconsumedNote(entry) ?? '', /1 voice/)
  })

  it('reports the zone spread a call-denominated ceiling would not contain', async () => {
    // Subjects per zone: 54, 37, 26, 14, 12, 2 — and two zones with none to
    // identify. Twenty-seven to one across the zones that have any, so a ceiling
    // counted in calls would permit 27× more in one room than another.
    const { db, importId } = await walked()
    db.prepare("UPDATE media SET file_status = 'present' WHERE import_id = ?").run(importId)
    const a = assembleImport(db, importId)
    const subjects = a.zones.map((z) => z.subjectCount).filter((n) => n > 0).sort((x, y) => y - x)
    assert.deepEqual(subjects, [54, 37, 26, 14, 12, 2])
    assert.equal(subjects.reduce((t, n) => t + n, 0), 145)
  })

  it('makes no call for a room photographed only from the doorway', async () => {
    // The bedroom has one wide shot and nothing else. There is nothing to
    // identify, so there is no call — but the context is not lost, and the zone
    // still reconciles. A room with a frame and no subjects is a real state.
    const { db, importId } = await walked()
    db.prepare("UPDATE media SET file_status = 'present' WHERE import_id = ?").run(importId)
    const a = assembleImport(db, importId)
    const bedroom = a.zones.find((z) => z.zoneLabel === 'bedroom')!
    assert.equal(bedroom.subjectCount, 0)
    assert.equal(bedroom.context.length, 1)
    assert.equal(bedroom.batches.length, 0)
    assert.ok(reconciles(bedroom))

    // And a zone with no media at all is a different state again — §E turns on
    // telling these two apart.
    const attic = a.zones.find((z) => z.zoneLabel === 'attic')!
    assert.equal(attic.receivedCount, 0)
    assert.equal(attic.context.length, 0)
  })

  it('would split the mechanical room and say so, once a threshold exists', async () => {
    // Threshold behaviour cannot be shown on absent files, so this asserts on
    // the same rows marked present — which is the state the owner's machine is
    // in, and the only difference between the two.
    const { db, importId } = await walked()
    db.prepare("UPDATE media SET file_status = 'present' WHERE import_id = ?").run(importId)

    const whole = assembleImport(db, importId)
    const mechWhole = whole.zones.find((z) => z.zoneLabel === 'mechanical room')!
    assert.equal(mechWhole.batches.length, 1)
    assert.equal(mechWhole.batches[0]?.subjects.length, 54)
    assert.equal(mechWhole.split, null)

    const split = assembleImport(db, importId, { maxPhotosPerBatch: 25 })
    const mech = split.zones.find((z) => z.zoneLabel === 'mechanical room')!
    assert.equal(mech.batches.length, 3)
    assert.equal(mech.split?.batchCount, 3)
    // The four room shots ride in every batch, so splitting costs twelve context
    // sends for four files — stated in the note rather than left to be inferred.
    assert.match(mech.split?.note ?? '', /12 context sends were made for 4 files/)
    const entry = split.zones.find((z) => z.zoneLabel === 'entry')!
    assert.equal(entry.batches.length, 1)
    assert.equal(entry.split, null, 'the same threshold leaves a two-photograph zone whole')
  })

  it('produces a run record a person can read, before any call is made', async () => {
    const { db, importId } = await walked()
    db.prepare("UPDATE media SET file_status = 'present' WHERE import_id = ?").run(importId)
    const a = assembleImport(db, importId)
    const record: RunRecord = {
      importId, modelId: null, maxImageEdge: null, ratesConfigured: false,
      zones: a.zones.map(plannedRecord),
    }
    const t = totals(record)
    assert.equal(t.zones, 8)
    assert.equal(t.received, 163)
    assert.equal(t.sent, 145)
    assert.equal(t.context, 12)
    assert.equal(t.contextSends, 11, 'the bedroom’s wide shot rides in no call, having no subjects')
    assert.equal(t.unconsumed, 6)
    assert.equal(t.unavailable, 0)
    assert.equal(t.unreconciled, 0)
    assert.equal(t.tokensIn, null, 'nothing has run, so there is no token count to report')
    assert.equal(t.costUsd, null)
  })
})

/**
 * The measured photograph dimensions — `fixtures/walk-2026-07-31/photo-dimensions.csv`.
 *
 * The redacted manifest has no media, so without this the cost arithmetic would
 * be reasoning about an image size nobody measured. These tests are what make
 * the file trustworthy: it is checked against the manifest rather than believed.
 */
describe('the measured dimensions, checked rather than carried', () => {
  it('covers exactly the manifest’s photographs — no extras, none missing', async () => {
    const { db, importId } = await walked()
    const declared = new Set(
      (db.prepare("SELECT media_id FROM media WHERE import_id = ? AND kind = 'photo'").all(importId) as {
        media_id: string
      }[]).map((r) => r.media_id),
    )
    const measured = new Set(dimensions().map((d) => d.mediaId))
    assert.equal(measured.size, 157, 'every row is a distinct id')
    assert.deepEqual([...measured].filter((id) => !declared.has(id)), [], 'nothing measured that the export does not declare')
    assert.deepEqual([...declared].filter((id) => !measured.has(id)), [], 'nothing declared that was not measured')
  })

  it('is uniform on this export, which is a fact about one device and not the data model', () => {
    const d = dimensions()
    assert.deepEqual([...new Set(d.map((x) => Math.max(x.width, x.height)))], [4032])
    assert.equal(d.filter((x) => x.width > x.height).length, 143)
    assert.equal(d.filter((x) => x.height > x.width).length, 14)
  })

  it('gives one downscaled size for every photograph on this walk', () => {
    // The payoff of the uniformity: one `count_tokens` call on the owner's
    // machine settles the send-side cost for all 157, because they all arrive at
    // the model as the same two shapes.
    const sent = new Set(
      dimensions().map((d) => {
        const s = sentDimensions(d, { maxImageEdge: 1568 })
        return `${s.width}x${s.height}`
      }),
    )
    assert.deepEqual([...sent].sort(), ['1176x1568', '1568x1176'])
  })
})
