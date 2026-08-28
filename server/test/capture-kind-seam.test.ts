/**
 * ⚑ **A capture kind nobody has met reaches no model — proved by planting one.**
 *
 * *Capture-Kind Contract Note v1.1, 2026-08-27, §3: the binder owes the proof.*
 *
 * The floorplan and the mesh are **data, not pictures** (§1). When Mac Field
 * ships them under their own `kind` — `geometry` is the proposed word — every
 * gate in this repo that reaches a model must refuse them, and the note's claim
 * is that all five already do **by construction**, because every one of them is
 * an allowlist or an equality on `'photo'` rather than a list of things to skip:
 *
 * | gate | shape | where |
 * |---|---|---|
 * | identification planning | `IMAGE_KINDS.includes(kind)` | `engine/identify.ts:52,261` |
 * | call assembly | `CONSUMED_KINDS.includes(kind)` | `engine/assembly.ts:75,218` |
 * | nameplate reading | `m.kind = 'photo'` | `ai/tasks/nameplate.ts:272` |
 * | pin typing | `m.kind = 'photo'` | `ai/tasks/pinType.ts:183` |
 * | photo routing | `m.kind = 'photo'` | `ai/tasks/routing.ts:220` |
 *
 * ⚑ **Register rule 59: the proof is a planted violation caught, never the
 * absence of one that did not arrive.** So this file plants.
 *
 * ⛑ **And every case is a PAIR, because a gate that returns nothing for an
 * unrelated reason would pass a one-sided test without ever looking at `kind`.**
 * *The verification note's first rule — a check whose two sides cannot disagree
 * has not been passing.* So each gate is run twice over the same real export,
 * identical but for the one word, and the assertion is on the **difference**.
 *
 * ---
 *
 * ## What this file does NOT prove, stated rather than left to be discovered
 *
 * ⛑ **This is a lock on the direction of five filters. It is not a live guard,
 * because the field cannot currently emit an unrecognised kind at all.**
 * `manifestV3.ts:69–70` derives kind from mime with no fallthrough —
 * `image → photo`, `video → video`, **everything else → `voice`** — so a
 * floorplan at `application/json` arrives as a voice note carrying a word this
 * repo knows. *The producer defeats the consumer's guard* (note §2).
 *
 * **What the lock is worth anyway:** the day one of these five is rewritten as
 * `kind !== 'photo'` or `kind NOT IN ('video','voice')`, this file fails. That
 * is the failure mode the note is actually guarding against, and it originates
 * here rather than in the field repo.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { latestImport, mediaForImport, zoneRoutes } from '../src/ai/tasks/identify.js'
import { pinAttachedPhotos } from '../src/ai/tasks/nameplate.js'
import { typelessPins } from '../src/ai/tasks/pinType.js'
import { loosePhotos } from '../src/ai/tasks/routing.js'
import type { Db } from '../src/db/index.js'
import { planIdentificationCalls } from '../src/engine/identify.js'
import { assembleImport } from '../src/engine/plan.js'
import { runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, readWalk, scratchDir, TEST_OPERATOR } from './helpers.js'

/**
 * The word the contract note proposes for raw floorplan and raw mesh.
 *
 * ⚑ **The word is Mac Field's to disagree with; the shape is not** (note §2).
 * Nothing below depends on which word it is — every gate refuses it for being
 * *absent from an allowlist*, which is true of any word at all.
 */
const NEW_KIND = 'geometry'

interface Planted {
  db: Db
  importId: string
  visitId: string
  /** A pin-owned capture — the input to the nameplate and pin-typing gates. */
  pinMediaId: string
  /** Its pin, stripped of its type so the pin-typing gate actually reaches it. */
  pinId: string
  /** A zone-owned capture — the input to the routing gate. */
  zoneMediaId: string
  report: string
}

interface RawMedia {
  mediaId: string
  kind: string
  owner?: { kind?: string; pinId?: string }
}

let seq = 0

/**
 * Import the real walk export with exactly one thing changed: two captures
 * carry `kind`.
 *
 * ⚑ **The same function produces the control and the planted run.** A second
 * fixture, or a hand-built row, would let the two diverge in some way other than
 * the word being tested — which is how a pair stops being a pair.
 */
async function walkWithKind(kind: string): Promise<Planted> {
  const m = JSON.parse(readWalk()) as Record<string, unknown>
  // Migration 011 refuses the same capture event twice.
  ;(m.session as { sessionId: string }).sessionId =
    `01a02617-0000-7000-8000-00000000${String(++seq).padStart(4, '0')}`

  const media = m.media as RawMedia[]
  const pinMedia = media.find((x) => x.owner?.kind === 'pin')
  const zoneMedia = media.find((x) => x.owner?.kind === 'zone')
  assert.ok(pinMedia && zoneMedia, 'the walk export carries both pin-owned and zone-owned captures')
  const pinId = pinMedia.owner?.pinId
  assert.ok(pinId, 'a pin-owned capture names its pin')

  pinMedia.kind = kind
  zoneMedia.kind = kind

  // ⛑ The walk types every pin that owns a photograph, so `typelessPins` would
  // return nothing for this pin and the gate would look like it refused the
  // capture when it never saw it. Untyping the pin is what makes the control
  // side able to succeed — and a control that cannot succeed proves nothing.
  const pin = (m.pins as { pinId: string; type?: unknown }[]).find((p) => p.pinId === pinId)
  assert.ok(pin, 'the pin the capture names is in pins[]')
  delete pin.type

  const db = freshDb()
  const ids = makePropertyAndVisit(db)
  const r = await runImport({
    actorId: TEST_OPERATOR, db, ...ids, raw: JSON.stringify(m), dataDir: scratchDir(),
  })
  const row = db.prepare('SELECT validation_report AS v FROM imports WHERE id = ?').get(r.importId) as { v: string }

  return {
    db,
    importId: r.importId,
    visitId: ids.visitId,
    pinMediaId: pinMedia.mediaId,
    pinId,
    zoneMediaId: zoneMedia.mediaId,
    report: row.v,
  }
}

/** Run both sides of one gate over the same export, and hand back the pair. */
async function pair<T>(read: (p: Planted) => T): Promise<{ control: T; planted: T }> {
  const c = await walkWithKind('photo')
  const control = read(c)
  c.db.close()
  const p = await walkWithKind(NEW_KIND)
  const planted = read(p)
  p.db.close()
  return { control, planted }
}

describe(`⚑ the five gates refuse a capture kind they have never met — planted \`${NEW_KIND}\``, () => {
  it('gate 1 · identification planning sends it to no call, and names the kind that decided', async () => {
    const { control, planted } = await pair((p) => {
      const plan = planIdentificationCalls(mediaForImport(p.db, p.importId), zoneRoutes(p.db, p.importId))
      const batched = new Set(plan.batches.flatMap((b) => [...b.media, ...b.context].map((x) => x.mediaId)))
      return {
        batchedPin: batched.has(p.pinMediaId),
        batchedZone: batched.has(p.zoneMediaId),
        excludedWhy: plan.excluded
          .filter((e) => e.mediaId === p.pinMediaId || e.mediaId === p.zoneMediaId)
          .map((e) => e.why),
      }
    })

    // The control side. Without it, a gate that never saw these two rows passes.
    assert.ok(control.batchedPin && control.batchedZone,
      'as photographs both captures are planned into a call — otherwise the planted side proves nothing')
    assert.deepEqual(control.excludedWhy, [])

    assert.ok(!planted.batchedPin && !planted.batchedZone,
      `a \`${NEW_KIND}\` capture reached an identification call`)
    assert.equal(planted.excludedWhy.length, 2, 'refused is half the rule — both must be reported by name')
    for (const why of planted.excludedWhy) {
      assert.match(why, new RegExp(NEW_KIND),
        'doctrine 6 — the exclusion must name the kind that caused it, not just omit the row')
    }
  })

  it('gate 2 · assembly files it as unconsumed, and does so BEFORE it looks at the file', async () => {
    /**
     * ⚑ The order matters and this is where it is asserted.
     *
     * The walk ships no photograph bytes, so as a `photo` each capture lands in
     * `unavailable`. As a `geometry` it must land in `unconsumed` instead — the
     * kind gate firing ahead of the file check. **If the file check ran first,
     * a geometry capture that happened to be on disk would fall straight
     * through to the consumed pile.**
     */
    const { control, planted } = await pair((p) => {
      const a = assembleImport(p.db, p.importId)
      const bucket = (id: string): string => {
        for (const z of a.zones) {
          if ([...z.batches.flatMap((b) => [...b.subjects, ...b.context]), ...z.context]
            .some((x) => x.mediaId === id)) return 'consumed'
          if (z.unconsumed.some((x) => x.mediaId === id)) return 'unconsumed'
          if (z.unavailable.some((x) => x.mediaId === id)) return 'unavailable'
        }
        return 'nowhere'
      }
      return {
        pin: bucket(p.pinMediaId),
        zone: bucket(p.zoneMediaId),
        kinds: a.zones.flatMap((z) => z.unconsumed
          .filter((x) => x.mediaId === p.pinMediaId || x.mediaId === p.zoneMediaId)
          .map((x) => x.kind)),
      }
    })

    assert.deepEqual({ pin: control.pin, zone: control.zone }, { pin: 'unavailable', zone: 'unavailable' },
      'as photographs these are photographs whose bytes are absent — the file check, not the kind check')
    assert.deepEqual(control.kinds, [])

    assert.deepEqual({ pin: planted.pin, zone: planted.zone }, { pin: 'unconsumed', zone: 'unconsumed' },
      `a \`${NEW_KIND}\` capture must be refused for its kind, ahead of anything about its file`)
    assert.deepEqual(planted.kinds, [NEW_KIND, NEW_KIND], 'the unconsumed bucket carries the kind that decided')
  })

  it('gate 3 · nameplate reading never queues it', async () => {
    const { control, planted } = await pair((p) =>
      pinAttachedPhotos(p.db, p.visitId).some((x) => x.mediaId === p.pinMediaId))
    assert.equal(control, true, 'as a photograph this pin-attached capture is an input to nameplate reading')
    assert.equal(planted, false, `a \`${NEW_KIND}\` capture was queued for nameplate extraction`)
  })

  it('gate 4 · pin typing never sees it', async () => {
    /**
     * Counted as `mediaIds + missingMedia`, which is every row the gate's query
     * returned. The walk has no bytes on disk, so `mediaIds` is empty on both
     * sides and asserting on it alone would pass without the gate existing.
     */
    const { control, planted } = await pair((p) => {
      const pin = typelessPins(p.db, p.visitId).find((x) => x.pinId === p.pinId)
      assert.ok(pin, 'the untyped pin is offered for typing — the gate is reached on both sides')
      return pin.mediaIds.length + pin.missingMedia
    })
    assert.equal(control, 1, 'as a photograph it is one of the frames the typing pass would be shown')
    assert.equal(planted, 0, `a \`${NEW_KIND}\` capture was offered to the pin-typing pass`)
  })

  it('gate 5 · photo routing never offers it to a pin', async () => {
    const { control, planted } = await pair((p) =>
      loosePhotos(p.db, p.visitId).some((x) => x.mediaId === p.zoneMediaId))
    assert.equal(control, true, 'as a photograph this room capture is a routing candidate')
    assert.equal(planted, false, `a \`${NEW_KIND}\` capture was offered for routing to a pin`)
  })

  it('and the import says the word out loud — refusing quietly is the same failure as sending it', async () => {
    const { report } = await walkWithKind(NEW_KIND)
    const terms = (JSON.parse(report) as { unrecognizedTerms?: { field: string; value: string }[] })
      .unrecognizedTerms ?? []
    assert.ok(terms.some((t) => t.field === 'media.kind' && t.value === NEW_KIND),
      'five gates refusing a capture nobody is told arrived is doctrine 6 broken five times over')
  })

  it('and it is never a reason to refuse the import — fail open on vocabulary', async () => {
    const p = await walkWithKind(NEW_KIND)
    const status = (p.db.prepare('SELECT status FROM imports WHERE id = ?').get(p.importId) as { status: string })
      .status
    p.db.close()
    assert.notEqual(status, 'refused', 'a word the builder has not met never fails an import (doctrine 7)')
  })
})
