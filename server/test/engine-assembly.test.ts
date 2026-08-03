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
  fileStatus: 'present', file: `media/z/_zone/${id}.jpg`, capturedAt: null, ...over,
})

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
      assert.equal(a.batches[0]?.media.length, 1)
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
      assert.equal(a.batches[0]?.media.length, 1)
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
      assert.equal(a.batches[0]?.media.length, 58)
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
      assert.deepEqual(a.batches.map((b) => b.media.length), [20, 20, 18])
      assert.equal(a.split?.batchCount, 3)
      // §3's accuracy claim is withdrawn in words a person reads, not only in a
      // count they would have to interpret.
      assert.match(a.split?.note ?? '', /No single call saw the whole room/)
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
      assert.equal(a.batches.reduce((t, b) => t + b.media.length, 0) + a.unconsumed.length + a.unavailable.length, 5)
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
      assert.deepEqual(a.batches[0]?.media.map((m) => m.mediaId), ['a', 'b', 'c'])
    })

    it('does not move an undated photograph to either end', () => {
      // Sorting nulls to one end would silently reorder a real export; the walk
      // has timestamps but nothing guarantees the next one will.
      const a = assembleZone(ZONE, [
        photo('x', { capturedAt: null }),
        photo('late', { capturedAt: '2026-07-31T17:20:00.000Z' }),
        photo('early', { capturedAt: '2026-07-31T17:18:00.000Z' }),
      ])
      assert.deepEqual(a.batches[0]?.media.map((m) => m.mediaId), ['x', 'early', 'late'])
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
    assert.equal(unavailable.length, 110)
    assert.ok(unavailable.every((u) => u.reason === 'absent'))
  })

  it('separates the ownership decision from the kind decision, and counts both', async () => {
    // 113 zone-owned, 38 pin-owned, 12 canvas. The pass reads the first group
    // only — a reading of §3, flagged rather than assumed, and visible here
    // rather than buried in a query.
    const { db, importId } = await walked()
    const a = assembleImport(db, importId)
    assert.deepEqual(a.notZoneOwned, [
      { ownerKind: 'pin', count: 38 },
      { ownerKind: 'canvas', count: 12 },
    ])
    assert.deepEqual(a.orphanedZoneMedia, [], 'this export has no orphaned zone media')
    assert.equal(a.zones.reduce((t, z) => t + z.receivedCount, 0), 113)
  })

  it('finds the video among the photographs and does not send it', async () => {
    // §C is not hypothetical on this export: the two busiest zone-owned streams
    // both carry a kind this pass cannot read.
    const { db, importId } = await walked()
    const a = assembleImport(db, importId)
    const byKind = new Map<string, number>()
    for (const u of a.zones.flatMap((z) => z.unconsumed)) {
      byKind.set(u.kind ?? 'untyped', (byKind.get(u.kind ?? 'untyped') ?? 0) + 1)
    }
    assert.deepEqual([...byKind.entries()], [['video', 3]])

    const mech = a.zones.find((z) => z.zoneLabel === 'mechanical room')!
    assert.match(unconsumedNote(mech) ?? '', /1 file not sent to identification: 1 video\./)
  })

  it('shows both voice notes sitting outside the pass entirely', async () => {
    // Neither voice note is zone-owned, so the unconsumed report never sees them.
    // §C1 expects that report to make the case for transcription with real
    // numbers — and on this walk it would understate it to zero. Recorded here
    // so the gap is a known fact rather than a surprise when the case is made.
    const { db, importId } = await walked()
    const a = assembleImport(db, importId)
    const voiceInZones = a.zones.flatMap((z) => z.unconsumed).filter((u) => u.kind === 'voice')
    assert.equal(voiceInZones.length, 0)
    const totalVoice = (
      db.prepare("SELECT COUNT(*) n FROM media WHERE import_id = ? AND kind = 'voice'").get(importId) as { n: number }
    ).n
    assert.equal(totalVoice, 2, 'the export has two; the zone stream has none of them')
  })

  it('reports the zone spread a call-denominated ceiling would not contain', async () => {
    // Zone-owned photographs per zone: 54, 22, 13, 12, 9, and three zones with
    // none. Six to one across the zones that have any, and a ceiling counted in
    // calls would permit six times more in one room than another.
    const { db, importId } = await walked()
    const a = assembleImport(db, importId)
    const photos = a.zones
      .map((z) => z.batches.reduce((t, b) => t + b.media.length, 0) + z.unavailable.length)
      .filter((n) => n > 0)
      .sort((x, y) => y - x)
    assert.deepEqual(photos, [54, 22, 13, 12, 9])
    assert.equal(photos.reduce((t, n) => t + n, 0), 110)
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
    assert.equal(mechWhole.batches[0]?.media.length, 54)
    assert.equal(mechWhole.split, null)

    const split = assembleImport(db, importId, { maxPhotosPerBatch: 25 })
    const mech = split.zones.find((z) => z.zoneLabel === 'mechanical room')!
    assert.equal(mech.batches.length, 3)
    assert.equal(mech.split?.batchCount, 3)
    const kitchen = split.zones.find((z) => z.zoneLabel === 'kitchen')!
    assert.equal(kitchen.batches.length, 1)
    assert.equal(kitchen.split, null, 'the same threshold leaves a nine-photograph zone whole')
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
    assert.equal(t.received, 113)
    assert.equal(t.sent, 110)
    assert.equal(t.unconsumed, 3)
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
