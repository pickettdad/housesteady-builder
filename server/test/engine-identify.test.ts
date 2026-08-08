/**
 * Increment 5 §3 — call assembly, tested against the walk fixture.
 *
 * **The whole point of this file is that it needs no API key and no photographs.**
 * All 163 media in the walk export are `file_status: absent`, and every question
 * this module answers — which media, in what order, how many batches — is
 * decided without a single byte on disk. Only the response needs real media.
 *
 * So this is a rare thing in this repo: a check with real, messy, production
 * material that costs nothing to run. The fixture is used rather than constructed
 * wherever it can be, and constructed only where it cannot produce the case.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  IMAGE_KINDS,
  MAX_MEDIA_PER_CALL,
  planIdentificationCalls,
  resolveToZones,
  type MediaRow,
  type ZoneRoutes,
} from '../src/engine/identify.js'
import { readWalk, repoRoot } from './helpers.js'

interface WalkManifest {
  zones: { zoneId: string; canvases?: { canvasId: string }[] }[]
  pins: { pinId: string; zoneId?: string | null }[]
  media: {
    mediaId: string
    kind?: string | null
    file?: string | null
    owner: { kind: string; zoneId?: string; pinId?: string; canvasId?: string }
  }[]
}

const walk = (): WalkManifest => JSON.parse(readWalk()) as WalkManifest

/** The manifest's media, in the shape the reader hands over. */
const walkMedia = (): MediaRow[] =>
  walk().media.map((m) => ({
    mediaId: m.mediaId,
    kind: m.kind ?? null,
    ownerKind: m.owner.kind,
    ownerZoneId: m.owner.zoneId ?? null,
    ownerPinId: m.owner.pinId ?? null,
    ownerCanvasId: m.owner.canvasId ?? null,
    file: m.file ?? null,
  }))

const walkRoutes = (): ZoneRoutes => {
  const w = walk()
  const pinZone = new Map<string, string>()
  for (const p of w.pins) if (p.zoneId) pinZone.set(p.pinId, p.zoneId)
  const canvasZone = new Map<string, string>()
  for (const z of w.zones) for (const c of z.canvases ?? []) canvasZone.set(c.canvasId, z.zoneId)
  return { pinZone, canvasZone }
}

describe('a zone’s media is not the media a zone owns', () => {
  it('the fixture is the argument — a third of it is not zone-owned', () => {
    // §9b, and the number is the reason the resolver exists. If this ever drops
    // to zero the resolver is being tested against material that cannot exercise
    // it, and the test below would pass while proving nothing.
    const m = walkMedia()
    const zoneOwned = m.filter((x) => x.ownerZoneId).length
    assert.equal(m.length, 163, 'the walk export, unchanged')
    assert.ok(zoneOwned < m.length, 'some media reaches its zone by another route')
    assert.ok(m.length - zoneOwned >= 40, `only ${m.length - zoneOwned} non-zone-owned — too few to prove the routes`)
  })

  it('resolves every one of the walk’s media, by all three routes', () => {
    const { resolved, unresolved } = resolveToZones(walkMedia(), walkRoutes())
    assert.deepEqual(unresolved, [], 'this export leaves nothing stranded')
    assert.equal(resolved.length, 163)
    const byRoute = new Map<string, number>()
    for (const r of resolved) byRoute.set(r.route, (byRoute.get(r.route) ?? 0) + 1)
    // All three routes exercised by real data, which is what makes the resolver
    // checked rather than merely written.
    assert.deepEqual([...byRoute.keys()].sort(), ['canvas', 'pin', 'zone'])
    assert.ok((byRoute.get('pin') ?? 0) > 0 && (byRoute.get('canvas') ?? 0) > 0)
  })

  it('reports what it cannot place instead of dropping it', () => {
    // Constructed, because the walk fixture strands nothing — and a resolver
    // whose failure path never runs is the shape rule 11 exists for. Real exports
    // carry unanchored pins and inbox media; this repo has met both.
    const orphans: MediaRow[] = [
      { mediaId: 'm1', kind: 'photo', ownerKind: 'pin', ownerZoneId: null, ownerPinId: 'floating', ownerCanvasId: null, file: 'a.jpg' },
      { mediaId: 'm2', kind: 'photo', ownerKind: 'canvas', ownerZoneId: null, ownerPinId: null, ownerCanvasId: 'nowhere', file: 'b.jpg' },
      { mediaId: 'm3', kind: 'photo', ownerKind: 'inbox', ownerZoneId: null, ownerPinId: null, ownerCanvasId: null, file: 'c.jpg' },
    ]
    const { resolved, unresolved } = resolveToZones(orphans, { pinZone: new Map(), canvasZone: new Map() })
    assert.equal(resolved.length, 0)
    assert.deepEqual(unresolved.map((u) => u.mediaId), ['m1', 'm2', 'm3'])
    assert.match(unresolved[0]!.why, /unanchored pin is ordinary/)
    assert.match(unresolved[2]!.why, /Inbox media is the ordinary case/)
  })
})

describe('media kind is open vocabulary, and exclusion is reported', () => {
  it('the fixture already holds a kind this pass cannot send', () => {
    // Video arrived before anything downstream asked for it — the case CLAUDE.md
    // warns about, sitting in the material rather than in a hypothetical.
    const kinds = new Set(walkMedia().map((m) => m.kind))
    assert.ok(kinds.has('video'), 'video is in the export')
    assert.ok([...kinds].some((k) => k !== null && !IMAGE_KINDS.includes(k)), 'and it is not sendable')
  })

  it('excludes by kind with the kind named, never silently', () => {
    const plan = planIdentificationCalls(walkMedia(), walkRoutes())
    assert.ok(plan.excluded.length > 0)
    for (const e of plan.excluded) {
      assert.ok(!IMAGE_KINDS.includes(e.kind ?? ''), 'only non-image kinds are excluded')
      assert.ok(e.why.length > 0 && e.zoneId.length > 0, 'and each says which room it was in')
    }
    // **The accounting rule, restated for Amendment 10 §B2's two piles.** Detail
    // media appears in exactly one batch, so it counts once. A canvas frame rides
    // EVERY batch of its zone, so counting `context` per batch would double it on
    // any room large enough to split — which is why this counts distinct ids
    // rather than array lengths. The property is unchanged: every media in the
    // export is sent, excluded by kind, or reported as reaching no zone.
    const sent = new Set([
      ...plan.batches.flatMap((b) => b.media.map((m) => m.mediaId)),
      ...plan.batches.flatMap((b) => b.context.map((m) => m.mediaId)),
    ])
    assert.equal(sent.size + plan.excluded.length + plan.unresolved.length, 163, 'nothing vanishes')
  })

  it('a kind the vocabulary has never met is excluded, not crashed on', () => {
    // Fail open. The field app renaming `voice` to audio must not break a run.
    const odd: MediaRow[] = [
      { mediaId: 'm1', kind: 'audio', ownerKind: 'zone', ownerZoneId: 'z', ownerPinId: null, ownerCanvasId: null, file: 'a' },
      { mediaId: 'm2', kind: null, ownerKind: 'zone', ownerZoneId: 'z', ownerPinId: null, ownerCanvasId: null, file: 'b' },
    ]
    const plan = planIdentificationCalls(odd, { pinZone: new Map(), canvasZone: new Map() })
    assert.equal(plan.batches.length, 0)
    assert.deepEqual(plan.excluded.map((e) => e.mediaId), ['m1', 'm2'])
    assert.match(plan.excluded[0]!.why, /vocabulary is open/)
    assert.match(plan.excluded[1]!.why, /declares no kind/)
  })
})

describe('batching is by room, and the ceiling is a relief valve', () => {
  it('plans one call per zone on the real export', () => {
    const plan = planIdentificationCalls(walkMedia(), walkRoutes())
    const zones = new Set(plan.batches.map((b) => b.zoneId))
    assert.ok(plan.batches.length >= zones.size)
    // The spec's own arithmetic: five to ten calls on a five-zone house. This is
    // an eight-zone export and the number should stay in that register.
    assert.ok(plan.batches.length <= 16, `${plan.batches.length} calls is per-photograph territory`)
    assert.ok(zones.size >= 5, 'and it really is spanning rooms')
  })

  it('splits a zone too large for one call, and every batch knows its place', () => {
    const many: MediaRow[] = Array.from({ length: 5 }, (_, i) => ({
      mediaId: `m${i}`, kind: 'photo', ownerKind: 'zone', ownerZoneId: 'z',
      ownerPinId: null, ownerCanvasId: null, file: `f${i}.jpg`,
    }))
    const plan = planIdentificationCalls(many, { pinZone: new Map(), canvasZone: new Map() }, { maxPerCall: 2 })
    assert.deepEqual(plan.batches.map((b) => `${b.index}/${b.of}`), ['1/3', '2/3', '3/3'])
    assert.deepEqual(plan.batches.map((b) => b.media.length), [2, 2, 1])
    assert.match(plan.note, /too large for one/)
  })

  it('is deterministic — the same import plans the same calls', () => {
    // A cached run has to be comparable against a fresh one, which needs the
    // order to come from the data rather than from map insertion.
    const a = planIdentificationCalls(walkMedia(), walkRoutes())
    const shuffled = [...walkMedia()].reverse()
    const b = planIdentificationCalls(shuffled, walkRoutes())
    assert.deepEqual(
      a.batches.map((x) => [x.zoneId, x.index, x.media.map((m) => m.mediaId)]),
      b.batches.map((x) => [x.zoneId, x.index, x.media.map((m) => m.mediaId)]),
    )
  })

  it('an empty plan says so rather than reading like a pass', () => {
    // Rule 11 in the module's own output — nothing to send and a clean run look
    // identical to a caller checking `batches.length`.
    const plan = planIdentificationCalls([], { pinZone: new Map(), canvasZone: new Map() })
    assert.deepEqual(plan.batches, [])
    assert.match(plan.note, /That is a state, not a pass/)
    const real = planIdentificationCalls(walkMedia(), walkRoutes())
    assert.doesNotMatch(real.note, /not a pass/)
  })

  it('refuses a ceiling that cannot batch anything', () => {
    for (const bad of [0, -1, 1.5]) {
      assert.throws(
        () => planIdentificationCalls(walkMedia(), walkRoutes(), { maxPerCall: bad }),
        /positive integer/,
      )
    }
    assert.ok(MAX_MEDIA_PER_CALL > 1)
  })
})

describe('Amendment 10 §B2 — the canvas rides every batch, outside the budget', () => {
  /**
   * **This is the defect that produced the amendment.** A call that pulled 24
   * nameplates and no room shot *produces a good parts list with no system in
   * it*, which is precisely what the first mechanical-room reading produced.
   */
  const roomOf = (details: number, canvases: number): MediaRow[] => [
    ...Array.from({ length: details }, (_, i) => ({
      mediaId: `d${i}`, kind: 'photo', ownerKind: 'zone', ownerZoneId: 'z',
      ownerPinId: null, ownerCanvasId: null, file: `d${i}.jpg`,
    })),
    ...Array.from({ length: canvases }, (_, i) => ({
      mediaId: `c${i}`, kind: 'photo', ownerKind: 'canvas', ownerZoneId: null,
      ownerPinId: null, ownerCanvasId: `cv${i}`, file: `c${i}.jpg`,
    })),
  ]
  const routes = (canvases: number): ZoneRoutes => ({
    pinZone: new Map(),
    canvasZone: new Map(Array.from({ length: canvases }, (_, i) => [`cv${i}`, 'z'])),
  })

  it('puts the canvas on every batch when a room splits', () => {
    const plan = planIdentificationCalls(roomOf(5, 2), routes(2), { maxPerCall: 2 })
    assert.equal(plan.batches.length, 3, 'five details at two per call is three batches')
    for (const b of plan.batches) {
      assert.deepEqual(b.context.map((m) => m.mediaId), ['c0', 'c1'], 'every batch sees the room')
    }
  })

  it('does not let the canvas eat the detail budget', () => {
    // The failure this closes exactly: before, two canvas frames and 24 details
    // meant two of the details fell off the end of the first call.
    const plan = planIdentificationCalls(roomOf(4, 2), routes(2), { maxPerCall: 4 })
    assert.equal(plan.batches.length, 1, 'six media, ceiling of four, and still one call')
    assert.equal(plan.batches[0]!.media.length, 4, 'all four details ride it')
    assert.equal(plan.batches[0]!.context.length, 2, 'and both canvas frames as well')
  })

  it('gives a canvas-only room one call rather than silence', () => {
    // §B: *where a canvas frame is the only evidence for something, the honest
    // output is present, not identified* — which is a gap, and gaps are cheap to
    // raise. Planning nothing at all would make it silence instead.
    const plan = planIdentificationCalls(roomOf(0, 1), routes(1))
    assert.equal(plan.batches.length, 1)
    assert.deepEqual(plan.batches[0]!.media, [], 'no detail photographs')
    assert.equal(plan.batches[0]!.context.length, 1, 'and the canvas is why there is a call at all')
  })

  it('says out loud when a call carries no room shot', () => {
    // Rule 11's shape: the whole point of §B2 is that a parts list with no room
    // in it looks exactly like a good answer. If it happens, the note says so.
    const blind = planIdentificationCalls(roomOf(3, 0), routes(0))
    assert.match(blind.note, /carry no canvas frame at all, so they see parts and no room/)

    const sighted = planIdentificationCalls(roomOf(3, 1), routes(1))
    assert.doesNotMatch(sighted.note, /no canvas frame at all/)
    assert.match(sighted.note, /canvas sends ride alongside them, outside the ceiling/)
  })

  it('the real export is the case the amendment was written for', () => {
    // **Measured, and it corrected an assumption made writing this test.** Every
    // room the walk reached carries a canvas, so no call on this export is blind
    // — the defect was never that the canvas was missing, it was that the canvas
    // COMPETED WITH THE DETAILS for the same 24 places. The mechanical room is
    // the proof: 54 detail photographs across three batches, and its four canvas
    // frames now ride all three instead of consuming slots in the first.
    const plan = planIdentificationCalls(walkMedia(), walkRoutes())
    assert.ok(
      plan.batches.every((b) => b.context.length > 0),
      'every room the walk reached was photographed whole as well as in detail',
    )

    const split = plan.batches.filter((b) => b.of > 1)
    assert.ok(split.length > 0, 'and rooms did split, which is when the riding matters')
    for (const b of split) {
      assert.ok(b.media.length <= MAX_MEDIA_PER_CALL, 'the ceiling still bounds the details')
      const twin = plan.batches.find((o) => o.zoneId === b.zoneId && o.index !== b.index)!
      assert.deepEqual(
        b.context.map((m) => m.mediaId),
        twin.context.map((m) => m.mediaId),
        'and every batch of a split room sees the same room',
      )
    }
  })
})

describe('Amendment 10 §D — a capture note travels with its media', () => {
  it('carries the note through resolution rather than dropping it', () => {
    // *The capture moment is the only time intent is free.* The field is optional
    // and most media will not have one; what matters is that the ones that do
    // still have it by the time the call is assembled.
    const withNote: MediaRow[] = [
      {
        mediaId: 'm1', kind: 'photo', ownerKind: 'zone', ownerZoneId: 'z',
        ownerPinId: null, ownerCanvasId: null, file: 'a.jpg',
        note: 'this is where the chlorine injects into the line',
      },
      {
        mediaId: 'm2', kind: 'photo', ownerKind: 'zone', ownerZoneId: 'z',
        ownerPinId: null, ownerCanvasId: null, file: 'b.jpg',
      },
    ]
    const plan = planIdentificationCalls(withNote, { pinZone: new Map(), canvasZone: new Map() })
    const sent = plan.batches[0]!.media
    assert.equal(sent.find((m) => m.mediaId === 'm1')?.note, 'this is where the chlorine injects into the line')
    assert.equal(sent.find((m) => m.mediaId === 'm2')?.note, undefined, 'and an absent note stays absent')
  })
})

describe('objects are not pins — Increment 5 §2', () => {
  const schema = (): string =>
    readFileSync(join(repoRoot, 'server', 'src', 'db', 'migrations', '017_objects.sql'), 'utf8')

  it('the objects table holds no reference to a pin', () => {
    // **The named failure, as a scan.** A desk-side confirmed identification must
    // never become indistinguishable from a field-side marker, and the cheapest
    // way that happens is a foreign key added because it looked convenient.
    const s = schema()
    const objectsTable = s.slice(s.indexOf('CREATE TABLE objects'), s.indexOf('CREATE INDEX idx_objects_property'))
    assert.doesNotMatch(objectsTable, /REFERENCES\s+pins/i)
    assert.doesNotMatch(objectsTable, /pin_id/i)
  })

  it('confirmation is an actor and a time together, or neither', () => {
    // A time with no actor is an unsigned signature. Doctrine 5.
    assert.match(schema(), /CHECK \(\(confirmed_by IS NULL\) = \(confirmed_at IS NULL\)\)/)
  })

  it('class_id is nullable and unconstrained, because an unclassed object is real', () => {
    const s = schema()
    const line = s.split('\n').find((l) => l.trim().startsWith('class_id'))
    assert.ok(line, 'the column exists')
    assert.doesNotMatch(line, /NOT NULL/)
    assert.doesNotMatch(line, /REFERENCES|CHECK/)
  })

  it('media is joined by its field-minted id, not a per-import row id', () => {
    // The uuid carries across visits; the row id does not, and would break the
    // moment the same photograph arrived in a second export.
    const s = schema()
    const join = s.slice(s.indexOf('CREATE TABLE object_media'))
    assert.match(join, /media_id\s+TEXT NOT NULL/)
    assert.doesNotMatch(join, /REFERENCES\s+media/i)
  })
})
