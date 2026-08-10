/**
 * The identification pass, model-call half — Increment 5 §3 and Amendment 10.
 *
 * **Every model call here is a stub**, for the reason the other assist suites
 * stub theirs: §0.4 says the pass is fully usable with no API key, and a suite
 * that needed one would stop being runnable. What is being checked is what the
 * call carries, what comes back, and what is written — none of which needs a
 * model to have an opinion.
 *
 * The cases that matter most are the three the amendment came from: a room whose
 * detail photographs crowded out its canvas frames, a deliberately framed
 * photograph whose reason lived only in the operator's head, and an answer that
 * names a class the frame does not have.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { join } from 'node:path'
import { newId, now, type Db } from '../src/db/index.js'
import { loadPrompts, promptsRoot, currentPrompt, PromptRefused } from '../src/ai/prompts.js'
import type { ModelConfig } from '../src/ai/models.js'
import type { RunArgs } from '../src/ai/client.js'
import { claimNext, completeJob } from '../src/ai/queue.js'
import { readClassFrame } from '../src/engine/classFrame.js'
import { MAX_MEDIA_PER_CALL } from '../src/engine/identify.js'
import { edgeForCall, MANY_IMAGE_MAX_EDGE, MANY_IMAGE_THRESHOLD } from '../src/ai/image.js'
import { approximateTokens, projectClasses } from '../src/engine/projection.js'
import {
  batchTargetId, IDENTIFY_TARGET_KIND, IDENTIFY_TASK, identificationFacts, mediaForImport,
  normaliseIdentification, propertyFlags, queueIdentification, runIdentify, writeProposedObjects,
  type Identification, type IdentifyDeps,
} from '../src/ai/tasks/identify.js'
import { queueAssists, runnerFor } from '../src/ai/tasks/index.js'
import { drainVisit } from '../src/ai/worker.js'
import { confirmObject } from '../src/engine/confirm.js'
import { repoRoot, TEST_OPERATOR, freshDb } from './helpers.js'

const FIXTURE = join(repoRoot, 'fixtures', 'nameplates', 'images', 'IMG_0004.jpeg')

const MODEL: ModelConfig = {
  tier: 'fast', id: 'a-pinned-fast-model', inputPerMTok: 1, outputPerMTok: 5, maxImageEdge: 1568, maxOutputTokens: 4096,
}

const PROPERTY = 'prop-1'
const VISIT = 'visit-1'
const ZONE = 'zone-mech'

let db: Db
let importId: string

function seed(opts: { flags?: string[]; declared?: string[] } = {}): void {
  db = freshDb()
  db.prepare(`INSERT INTO properties (id, label, created_at, actor_id) VALUES (?, 'A house', ?, ?)`)
    .run(PROPERTY, now(), TEST_OPERATOR)
  db.prepare(`INSERT INTO visits (id, property_id, kind, created_at, actor_id) VALUES (?, ?, 'baseline', ?, ?)`)
    .run(VISIT, PROPERTY, now(), TEST_OPERATOR)
  importId = newId()
  db.prepare(
    `INSERT INTO imports (id, visit_id, property_id, imported_at, media_mode, raw_manifest,
                          validation_report, status, created_at, actor_id)
     VALUES (?, ?, ?, ?, 'full', '{}', '{}', 'ok', ?, ?)`,
  ).run(importId, VISIT, PROPERTY, now(), now(), TEST_OPERATOR)
  db.prepare(
    `INSERT INTO config_snapshots (import_id, config_id, config_version, config_hash, snapshot, created_at)
     VALUES (?, 'cfg', 'v1.5.1', 'hash', ?, ?)`,
  ).run(
    importId,
    JSON.stringify({
      propertyFlags: (opts.declared ?? ['well', 'septic', 'gas', 'pool']).map((id) => ({ id, label: id })),
    }),
    now(),
  )
  db.prepare(
    `INSERT INTO session_meta (import_id, session_id, flags, created_at) VALUES (?, 'ses-1', ?, ?)`,
  ).run(importId, JSON.stringify(opts.flags ?? ['well', 'septic']), now())
  db.prepare(
    `INSERT INTO zones (zone_id, import_id, property_id, visit_id, type, label, level, created_at)
     VALUES (?, ?, ?, ?, 'mechanical', 'Mechanical room', 'basement', ?)`,
  ).run(ZONE, importId, PROPERTY, VISIT, now())
}

function addMedia(
  mediaId: string,
  owner: { zone?: string; canvas?: string; pin?: string; status?: string; kind?: string; file?: string },
): void {
  const ownerKind = owner.canvas ? 'canvas' : owner.pin ? 'pin' : 'zone'
  db.prepare(
    `INSERT INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind, owner_zone_id,
                        owner_pin_id, owner_canvas_id, file, file_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    mediaId, importId, PROPERTY, VISIT, owner.kind ?? 'photo', ownerKind,
    owner.canvas || owner.pin ? null : (owner.zone ?? ZONE),
    owner.pin ?? null, owner.canvas ?? null,
    owner.file ?? `${mediaId}.jpg`, owner.status ?? 'present', now(),
  )
}

function addCanvas(canvasId: string, zoneId = ZONE): void {
  db.prepare(
    `INSERT INTO canvases (canvas_id, zone_id, import_id, kind, retired, media_id, file, created_at)
     VALUES (?, ?, ?, 'photo', 0, NULL, NULL, ?)`,
  ).run(canvasId, zoneId, importId, now())
}

function addCaptureNote(mediaId: string, text: string): void {
  db.prepare(
    `INSERT INTO notes (note_id, import_id, target_kind, target_id, text, at, created_at)
     VALUES (?, ?, 'media', ?, ?, ?, ?)`,
  ).run(newId(), importId, mediaId, text, now(), now())
}

/** A stub model. Records what it was asked, answers what the test dictates. */
function stub(answers: Identification[]): IdentifyDeps & { asked: RunArgs[] } {
  const asked: RunArgs[] = []
  let i = 0
  return {
    asked,
    prompts: loadPrompts(promptsRoot),
    model: MODEL,
    resolvePath: () => FIXTURE,
    run: async <T,>(args: RunArgs) => {
      asked.push(args)
      return { output: answers[i++] as T, inputTokens: 90_000, outputTokens: 700 }
    },
  }
}

const answer = (over: Partial<Identification> = {}): Identification => ({
  objects: [],
  unsure: [],
  roomNote: '',
  ...over,
})

// ---------------------------------------------------------------------------

describe('the projection is what identification sends, not the frame', () => {
  it('carries every class as an id and a label, and nothing else', () => {
    const frame = readClassFrame()
    const p = projectClasses(frame)
    assert.equal(p.classCount, frame.classes.length)
    for (const c of frame.classes) {
      assert.ok(p.text.includes(`${c.id} — ${c.label}`), `${c.id} is offered`)
    }
  })

  it('leaves out everything §4 would need and identification would not', () => {
    // Care, inspection, opportunity and owner-question vocabulary all carry
    // prose, and all of it answers *what does this need* — a different act with a
    // different honesty label. It is not in the block a model naming a water
    // heater is handed.
    const frame = readClassFrame()
    const p = projectClasses(frame)
    for (const term of [...frame.careCategories, ...frame.inspectionPoints]) {
      assert.ok(!p.text.includes(term.id), `${term.id} is §4's, not §3's`)
    }
  })

  it('is an order of magnitude smaller than the file, measured rather than assumed', () => {
    const p = projectClasses(readClassFrame())
    // The whole file is ~217,000 characters. Anything remotely near that means
    // somebody started attaching the frame's prose to a call.
    assert.ok(p.text.length < 20_000, `${p.text.length} characters is not a projection`)
    assert.ok(approximateTokens(p.text) < 5_000, 'and it costs well under one photograph')
  })

  it('tells the model the list is closed and that null is allowed', () => {
    // §3: an object with no matching class is proposed anyway. If the block reads
    // as *pick one of these*, the model picks the nearest — and a wrong class is
    // believed where a missing one is chased.
    const p = projectClasses(readClassFrame())
    assert.match(p.text, /exactly as written, or null/)
    assert.match(p.text, /Never invent an id/)
  })
})

describe('the prompt is a config file, like every other', () => {
  it('loads from /prompts under the task’s own name', () => {
    const prompt = currentPrompt(loadPrompts(promptsRoot), IDENTIFY_TASK)
    assert.equal(prompt.id, IDENTIFY_TASK)
    assert.equal(prompt.hash.length, 64)
    assert.ok(prompt.text.length > 500)
  })

  it('says the three things the amendment is about', () => {
    const { text } = currentPrompt(loadPrompts(promptsRoot), IDENTIFY_TASK)
    // §B — a canvas frame establishes presence and cannot name a model.
    assert.match(text, /cannot name a model, read a plate/)
    // §B1 — the finest read is the authoritative one.
    assert.match(text, /the closer one decides/)
    // §D — a capture note says why the frame exists.
    assert.match(text, /why the photograph was taken/)
  })

  it('asks for abstention in words, not just in the schema', () => {
    const { text } = currentPrompt(loadPrompts(promptsRoot), IDENTIFY_TASK)
    assert.match(text, /use `null` and describe the thing in the label/)
    assert.match(text, /Returning nothing is a valid answer/)
  })
})

describe('queueing identification is a deliberate act', () => {
  beforeEach(() => seed())

  it('is not something an import does', () => {
    // The addendum's §A: nameplate reading sends a data plate, routing sends
    // loose photographs, **identification sends the room**. §C gates a client's
    // property behind a disclosure that does not exist. Nothing here can check
    // whose house it is; what it can do is refuse to start on its own.
    addMedia('m1', {})
    const queued = queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    const rows = db
      .prepare('SELECT COUNT(*) AS n FROM ai_jobs WHERE task = ?')
      .get(IDENTIFY_TASK) as { n: number }
    assert.equal(rows.n, 0, 'an import must not send the interior of a house')
    assert.ok(queued.total >= 0)
  })

  it('plans one job per batch when it is asked to', () => {
    for (let i = 0; i < 3; i++) addMedia(`m${i}`, {})
    addCanvas('cv1')
    addMedia('c1', { canvas: 'cv1' })

    const q = queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    assert.equal(q.jobs, 1)
    assert.equal(q.zones, 1)
    const job = db
      .prepare('SELECT target_kind, target_id FROM ai_jobs WHERE task = ?')
      .get(IDENTIFY_TASK) as { target_kind: string; target_id: string }
    assert.equal(job.target_kind, IDENTIFY_TARGET_KIND)
    assert.equal(job.target_id, batchTargetId(ZONE, 1))
  })

  it('is idempotent, so a second press costs nothing', () => {
    for (let i = 0; i < 3; i++) addMedia(`m${i}`, {})
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM ai_jobs WHERE task = ?').get(IDENTIFY_TASK) as { n: number }
    assert.equal(n, 1)
  })

  it('says so rather than throwing when a visit has no import', () => {
    const q = queueIdentification(db, PROPERTY, 'visit-that-does-not-exist', TEST_OPERATOR)
    assert.equal(q.jobs, 0)
    assert.match(q.note, /No import for visit/)
  })

  describe('one room rather than a house', () => {
    /**
     * **The first real run wants the mechanical room specifically**, because it
     * is the one room whose right answer is already known — so it can be graded
     * rather than only read. `--limit` bounds how many calls drain, in queue
     * order, and cannot say which room. This is the other question.
     */
    const secondZone = (): string => {
      const other = 'zone-kitchen'
      db.prepare(
        `INSERT INTO zones (zone_id, import_id, property_id, visit_id, type, label, level, created_at)
         VALUES (?, ?, ?, ?, 'kitchen', 'Kitchen', 'main', ?)`,
      ).run(other, importId, PROPERTY, VISIT, now())
      for (let i = 0; i < 3; i++) addMedia(`k${i}`, { zone: other })
      return other
    }

    it('queues only the zones the filter accepts', () => {
      for (let i = 0; i < 3; i++) addMedia(`m${i}`, {})
      secondZone()

      const q = queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR, (zoneId) => zoneId === ZONE)
      assert.equal(q.zones, 1)
      assert.equal(q.jobs, 1)
      const targets = (
        db.prepare('SELECT target_id FROM ai_jobs WHERE task = ?').all(IDENTIFY_TASK) as { target_id: string }[]
      ).map((r) => r.target_id)
      assert.deepEqual(targets, [batchTargetId(ZONE, 1)])
    })

    it('queues every zone when no filter is given, so the filter is opt-in', () => {
      // The two sides of the same call must be able to disagree, or the test
      // above proves nothing — rule 11b.
      for (let i = 0; i < 3; i++) addMedia(`m${i}`, {})
      secondZone()

      const q = queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
      assert.equal(q.zones, 2)
      assert.equal(q.jobs, 2)
    })

    it('queues nothing when the filter matches nothing, rather than falling back to all', () => {
      // A filter that silently widened to the whole house would send the interior
      // of seven rooms to a model when one was asked for.
      for (let i = 0; i < 3; i++) addMedia(`m${i}`, {})
      secondZone()

      const q = queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR, () => false)
      assert.equal(q.jobs, 0)
      assert.equal(q.zones, 0)
      const { n } = db.prepare('SELECT COUNT(*) AS n FROM ai_jobs WHERE task = ?').get(IDENTIFY_TASK) as { n: number }
      assert.equal(n, 0)
    })

    it('a second queue of a finished batch does nothing without --again', () => {
      /**
       * **The default is right and this pins it.** `enqueue` is
       * `ON CONFLICT DO NOTHING`, so a person unsure whether their first press
       * landed does not pay twice.
       */
      for (let i = 0; i < 3; i++) addMedia(`m${i}`, {})
      queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
      const job = claimNext(db, VISIT)!
      completeJob(db, job.id, null)

      queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
      assert.equal(claimNext(db, VISIT), undefined, 'nothing became runnable again')
    })

    it('--again puts a finished batch back, because a comparison run is a different intention', () => {
      // Two passes over one room at two tiers is the only way to answer "did the
      // reverse osmosis persist", and the container is ephemeral — so both
      // passes have to land in one database or the ledger holds neither.
      for (let i = 0; i < 3; i++) addMedia(`m${i}`, {})
      queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
      const first = claimNext(db, VISIT)!
      completeJob(db, first.id, null)

      queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR, undefined, true)
      const second = claimNext(db, VISIT)
      assert.ok(second, 'the batch is runnable again')
      assert.equal(second.id, first.id, 'the same job row — its history stays one row, not two')

      const { n } = db.prepare('SELECT COUNT(*) AS n FROM ai_jobs WHERE task = ?').get(IDENTIFY_TASK) as { n: number }
      assert.equal(n, 1, 'and no duplicate job was created')
    })

    it('keeps the note describing the whole export, not the filtered slice', () => {
      // A filtered run must not read as though the rest of the house went
      // missing. The note is the export's shape; the filter is this run's scope.
      for (let i = 0; i < 3; i++) addMedia(`m${i}`, {})
      secondZone()

      const q = queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR, (zoneId) => zoneId === ZONE)
      assert.match(q.note, /2 calls over 2 zones/)
      assert.equal(q.jobs, 1)
    })
  })
})

describe('what the call carries', () => {
  beforeEach(() => seed())

  const runOne = async (deps: IdentifyDeps & { asked: RunArgs[] }): Promise<void> => {
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    assert.equal(job.task, IDENTIFY_TASK)
    await runIdentify(db, job, deps)
  }

  it('sends the canvas frames first — Amendment 10 §B1', async () => {
    // *The finest read of an object is the authoritative one*, and coarse-to-fine
    // is the only ordering in which the finest read touches an object last. The
    // mechanical-room reading went the other way and a forty-pixel dark circle in
    // a wide shot overwrote a nameplate that had already been read properly.
    addCanvas('cv1')
    addMedia('canvas-1', { canvas: 'cv1' })
    addMedia('detail-1', {})
    addMedia('detail-2', {})

    const deps = stub([answer()])
    await runOne(deps)

    const facts = deps.asked[0]!.facts!
    assert.ok(
      facts.indexOf('ROOM CONTEXT') < facts.indexOf('DETAIL PHOTOGRAPHS'),
      'the context block is announced before the detail block',
    )
    assert.equal(deps.asked[0]!.images.length, 3, 'and all three images went')
  })

  it('carries a capture note beside the photograph it describes — Amendment 10 §D', async () => {
    // *The capture moment is the only time intent is free.* The injection-point
    // shot was framed on purpose and read as a corner of a room, because the
    // purpose lived in the operator's head and nowhere in the file.
    addMedia('m1', {})
    addMedia('m2', {})
    addCaptureNote('m2', 'the chlorine injects into the line right here')

    const deps = stub([answer()])
    await runOne(deps)

    const facts = deps.asked[0]!.facts!
    assert.match(facts, /m2 — note written at capture: "the chlorine injects into the line right here"/)
    assert.ok(!/m1 — note/.test(facts), 'and a photograph with no note gets no invented one')
  })

  it('sends the flags that are true and the ones that were answered no', async () => {
    // A declared flag that is not set is a confident no; a flag the config never
    // declared is a word the builder has not met. Merging them turns the second
    // into the first.
    addMedia('m1', {})
    const deps = stub([answer()])
    await runOne(deps)

    const facts = deps.asked[0]!.facts!
    assert.match(facts, /Recorded about this property: well, septic\./)
    assert.match(facts, /Asked and answered no: gas, pool\./)
  })

  it('sends the projection and never the frame', async () => {
    addMedia('m1', {})
    const deps = stub([answer()])
    await runOne(deps)

    const facts = deps.asked[0]!.facts!
    assert.match(facts, /The class list, version .* — 176 classes/)
    assert.ok(facts.length < 30_000, `${facts.length} characters means the file went, not the projection`)
    // A care category id in the block would mean §4's vocabulary reached §3's call.
    assert.ok(!facts.includes('tank-flush'), 'no care vocabulary rides an identification call')
  })

  it('warns the model when it is seeing part of a room', async () => {
    // §D1 already requires a split to be recorded. This is the other half: the
    // model must not conclude anything from what is absent in batch two.
    for (let i = 0; i < 5; i++) addMedia(`m${i}`, {})
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    // Default ceiling is 24, so force the split by planning a smaller room twice
    // over — one job is enough to prove the sentence appears when `of > 1`.
    const facts = identificationFacts({
      zone: { zoneId: ZONE, type: 'mechanical', label: 'Mechanical room', level: 'basement' },
      zoneId: ZONE, batchIndex: 2, batchOf: 3,
      context: [], detail: [{ mediaId: 'm1', captureNote: null }],
      flags: { set: [], declared: [] },
      projection: 'CLASSES',
    })
    assert.match(facts, /part 2 of 3 for this room/)
    assert.match(facts, /Do not conclude anything from what is absent/)
  })

  it('says out loud when a room has no context frame at all', () => {
    const facts = identificationFacts({
      zone: undefined, zoneId: ZONE, batchIndex: 1, batchOf: 1,
      context: [], detail: [{ mediaId: 'm1', captureNote: null }],
      flags: { set: [], declared: [] }, projection: 'CLASSES',
    })
    assert.match(facts, /ROOM CONTEXT — none/)
    assert.match(facts, /Say less rather than more/)
    assert.match(facts, /no recorded label or type/)
  })

  it('tells a canvas-only room that everything it sees is context-only', () => {
    const facts = identificationFacts({
      zone: undefined, zoneId: ZONE, batchIndex: 1, batchOf: 1,
      context: [{ mediaId: 'c1', captureNote: null }], detail: [],
      flags: { set: [], declared: [] }, projection: 'CLASSES',
    })
    assert.match(facts, /every object you report is context-only/)
  })
})

describe('the many-image threshold — over twenty, images are rejected outright', () => {
  /**
   * **The one failure here is not a poor read, it is a 400.** Above twenty image
   * blocks a stricter per-image dimension limit applies and anything over it is
   * rejected with an `invalid_request_error`. Amendment 10 §B2 puts a full room
   * over that line **by design** — 24 details plus the zone's canvas frames — so
   * this stopped being an edge case the moment the canvas started riding along.
   */
  it('leaves the edge alone at or below the threshold', () => {
    assert.equal(edgeForCall(1, 2576), 2576)
    assert.equal(edgeForCall(MANY_IMAGE_THRESHOLD, 2576), 2576, 'twenty is inside the limit')
  })

  it('caps the edge the moment a call goes over twenty', () => {
    assert.equal(edgeForCall(MANY_IMAGE_THRESHOLD + 1, 2576), MANY_IMAGE_MAX_EDGE)
    assert.equal(edgeForCall(28, 2576), 2000)
  })

  it('never raises an edge the model already keeps below the limit', () => {
    // The default is 1568 and is already inside the stricter limit. Capping must
    // not become an instruction to send BIGGER images than the model accepts.
    assert.equal(edgeForCall(28, 1568), 1568)
  })

  it('closes the configuration trap, which is the dangerous half', async () => {
    // `maxImageEdge` is an environment variable, and the reason somebody raises
    // it is to read nameplates better. At 2576 a full room's call would fail
    // outright, with an error naming a limit nobody had read.
    seed()
    addCanvas('cv1')
    addMedia('c1', { canvas: 'cv1' })
    for (let i = 0; i < 24; i++) addMedia(`d${i}`, {})

    const highRes: ModelConfig = { ...MODEL, maxImageEdge: 2576 }
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    const deps = { ...stub([answer()]), model: highRes }
    const result = await runIdentify(db, job, deps)

    assert.equal(deps.asked[0]!.images.length, 25, '24 details plus the canvas — over the threshold')
    const refs = JSON.parse(
      (db.prepare('SELECT input_refs FROM ai_generations WHERE id = ?').get(result!.generationId) as {
        input_refs: string
      }).input_refs,
    ) as { imageEdge: { sent: number; modelLimit: number; imageCount: number } }
    assert.deepEqual(refs.imageEdge, { sent: 2000, modelLimit: 2576, imageCount: 25 })
  })

  it('records the edge even when nothing was capped, so a read is explicable', async () => {
    seed()
    addMedia('m1', {})
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    const result = await runIdentify(db, job, stub([answer()]))

    const refs = JSON.parse(
      (db.prepare('SELECT input_refs FROM ai_generations WHERE id = ?').get(result!.generationId) as {
        input_refs: string
      }).input_refs,
    ) as { imageEdge: { sent: number; imageCount: number } }
    assert.deepEqual(refs.imageEdge.sent, MODEL.maxImageEdge)
    assert.equal(refs.imageEdge.imageCount, 1)
  })

  it('the default ceiling and the walk together are the case this protects', () => {
    // `MAX_MEDIA_PER_CALL` is 24 and the mechanical room carries four canvas
    // frames, so its full batches are 28 images. Recorded as a test rather than
    // a comment because the ceiling is a number somebody will change.
    assert.ok(
      MAX_MEDIA_PER_CALL > MANY_IMAGE_THRESHOLD,
      'the detail ceiling alone already exceeds the threshold, before any canvas rides along',
    )
  })
})

describe('an answer becomes proposals, and nothing is tidied away', () => {
  beforeEach(() => seed())

  const known = { classIds: new Set(['water-heater-gas']), mediaIds: new Set(['m1', 'm2']) }

  it('keeps an object whose class the frame does not declare, and nulls the class', () => {
    // Doctrine 7 fails open on vocabulary — but a class id is this repo's own
    // file, so an id the frame does not declare was invented or is from another
    // frame version. The object survives with its label; the class does not.
    const stored = normaliseIdentification(
      answer({
        objects: [
          { label: 'A tankless coil', classId: 'water-heater-tankless-coil', evidenceMediaIds: ['m1'], basis: 'detail', whatYouCanSee: 'copper coil', readable: '' },
        ],
      }),
      known,
    )
    assert.equal(stored.objects.length, 1)
    assert.equal(stored.objects[0]!.classId, null)
    assert.equal(stored.objects[0]!.label, 'A tankless coil')
    assert.deepEqual(stored.unknownClasses, [{ label: 'A tankless coil', classId: 'water-heater-tankless-coil' }])
  })

  it('reports evidence pointing at a photograph the call never sent', () => {
    const stored = normaliseIdentification(
      answer({
        objects: [
          { label: 'Water heater', classId: 'water-heater-gas', evidenceMediaIds: ['m1', 'm99'], basis: 'detail', whatYouCanSee: 'tank', readable: '' },
        ],
      }),
      known,
    )
    assert.deepEqual(stored.objects[0]!.evidenceMediaIds, ['m1'])
    assert.deepEqual(stored.strayEvidence, [{ label: 'Water heater', mediaId: 'm99' }])
  })

  it('keeps an object with no usable evidence rather than deleting it', () => {
    // It has no photograph to sit beside, which makes it exactly the thing a
    // person should see and reject. Deleting it here would be the builder
    // quietly deciding an outcome the review would never know happened.
    const stored = normaliseIdentification(
      answer({
        objects: [
          { label: 'Sump pump', classId: null, evidenceMediaIds: ['m99'], basis: 'detail', whatYouCanSee: '', readable: '' },
        ],
      }),
      known,
    )
    assert.equal(stored.objects.length, 1)
    assert.deepEqual(stored.unevidenced, ['Sump pump'])
  })

  it('turns a nameless object into a line somebody reads, never a silent drop', () => {
    const stored = normaliseIdentification(
      answer({
        objects: [
          { label: '   ', classId: 'water-heater-gas', evidenceMediaIds: ['m1'], basis: 'detail', whatYouCanSee: '', readable: '' },
        ],
      }),
      known,
    )
    assert.equal(stored.objects.length, 0)
    assert.match(stored.unsure.join(' '), /came back with no name and could not be stored/)
  })

  it('defaults an unrecognised basis to detail rather than inventing certainty', () => {
    const stored = normaliseIdentification(
      answer({
        objects: [
          { label: 'Panel', classId: null, evidenceMediaIds: ['m1'], basis: 'guess' as never, whatYouCanSee: '', readable: '' },
        ],
      }),
      known,
    )
    // `context-only` is the narrower claim, so defaulting TO it would be the
    // safe-looking choice — and it would silently downgrade a real detail read.
    // The recorded value is what the schema constrains; anything else is detail.
    assert.equal(stored.objects[0]!.basis, 'detail')
  })
})

describe('the run writes proposals, and a proposal is not a confirmation', () => {
  beforeEach(() => seed())

  it('writes objects nobody has confirmed, attributed to whoever ran it', async () => {
    addMedia('m1', {})
    addMedia('m2', {})
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!

    const result = await runIdentify(
      db,
      job,
      stub([
        answer({
          objects: [
            { label: 'Gas water heater', classId: 'water-heater-gas', evidenceMediaIds: ['m1', 'm2'], basis: 'detail', whatYouCanSee: 'white cylinder with a flue', readable: 'A.O. Smith' },
          ],
          roomNote: 'A mechanical room.',
        }),
      ]),
    )

    assert.ok(result)
    assert.equal(result.objectIds.length, 1)
    const row = db.prepare('SELECT * FROM objects WHERE id = ?').get(result.objectIds[0]!) as Record<string, unknown>
    assert.equal(row.class_id, 'water-heater-gas')
    assert.equal(row.label, 'Gas water heater')
    assert.equal(row.zone_id, ZONE)
    assert.equal(row.import_id, importId)
    assert.equal(row.actor_id, TEST_OPERATOR, 'the person who ran it, never the model')
    assert.equal(row.confirmed_by, null)
    assert.equal(row.confirmed_at, null)

    const media = db
      .prepare('SELECT media_id FROM object_media WHERE object_id = ? ORDER BY media_id')
      .all(result.objectIds[0]!) as { media_id: string }[]
    assert.deepEqual(media.map((m) => m.media_id), ['m1', 'm2'])
  })

  it('hands the confirmation surface something it can act on', async () => {
    // §6 is built and this is the first thing that feeds it. Confirming a
    // proposal is `confirmed`/`Observed` — the photograph is right there.
    addMedia('m1', {})
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    const result = await runIdentify(
      db, job,
      stub([answer({ objects: [{ label: 'Electrical panel', classId: 'electrical-panel-main', evidenceMediaIds: ['m1'], basis: 'detail', whatYouCanSee: 'grey door', readable: '' }] })]),
    )

    const outcome = confirmObject(db, {
      objectId: result!.objectIds[0]!,
      operatorId: TEST_OPERATOR,
      decision: 'confirmed',
    })
    assert.equal(outcome.records.length, 1)
    assert.equal(outcome.records[0]!.act, 'confirmed')
    assert.equal(outcome.records[0]!.honestyLabel, 'Observed')
  })

  it('records the generation with everything that produced it', async () => {
    addCanvas('cv1')
    addMedia('c1', { canvas: 'cv1' })
    addMedia('m1', {})
    addCaptureNote('m1', 'the injection point')
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    const result = await runIdentify(db, job, stub([answer()]))

    const gen = db.prepare('SELECT * FROM ai_generations WHERE id = ?').get(result!.generationId) as {
      task: string
      prompt_id: string
      import_id: string
      actor_id: string
      human_decision: string
      input_refs: string
    }
    assert.equal(gen.task, IDENTIFY_TASK)
    assert.equal(gen.prompt_id, IDENTIFY_TASK)
    assert.equal(gen.import_id, importId)
    assert.equal(gen.actor_id, TEST_OPERATOR)
    assert.equal(gen.human_decision, 'pending')

    const refs = JSON.parse(gen.input_refs) as Record<string, unknown>
    assert.deepEqual(refs.context, ['c1'])
    assert.deepEqual(refs.detail, ['m1'])
    assert.equal(refs.classFrameVersion, readClassFrame().version)
    assert.equal(refs.classCount, 176)
    assert.deepEqual(refs.captureNotes, [{ mediaId: 'm1', captureNote: 'the injection point' }])
  })

  it('an empty room is an abstention, not a failure', async () => {
    addMedia('m1', {})
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    const result = await runIdentify(db, job, stub([answer({ roomNote: 'A hallway of closed doors.' })]))

    const gen = db.prepare('SELECT abstained FROM ai_generations WHERE id = ?').get(result!.generationId) as {
      abstained: number
    }
    assert.equal(gen.abstained, 1)
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM objects').get() as { n: number }
    assert.equal(n, 0)
    const jobRow = db.prepare('SELECT status FROM ai_jobs WHERE id = ?').get(job.id) as { status: string }
    assert.equal(jobRow.status, 'done', 'a room with nothing in it is a complete answer')
  })

  it('skips with a reason when the photographs are not on this machine', async () => {
    // The ordinary state of a manifest-only import: every row here and no bytes.
    addMedia('m1', { status: 'absent' })
    addMedia('m2', { status: 'absent' })
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    const result = await runIdentify(db, job, stub([answer()]))

    assert.equal(result, null)
    const row = db.prepare('SELECT status, last_error FROM ai_jobs WHERE id = ?').get(job.id) as {
      status: string
      last_error: string
    }
    assert.equal(row.status, 'skipped')
    assert.match(row.last_error, /none of this room's 2 photographs are on this machine/)
  })

  it('runs on a room whose photographs are only partly present', async () => {
    // Half a room is still a room. What matters is that the absent ones are not
    // silently counted as looked at — they are simply not sent.
    addMedia('here', {})
    addMedia('gone', { status: 'absent' })
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    const deps = stub([answer()])
    const result = await runIdentify(db, job, deps)

    assert.ok(result)
    assert.equal(deps.asked[0]!.images.length, 1)
    const refs = JSON.parse(
      (db.prepare('SELECT input_refs FROM ai_generations WHERE id = ?').get(result!.generationId) as {
        input_refs: string
      }).input_refs,
    ) as { detail: string[] }
    assert.deepEqual(refs.detail, ['here'])
  })

  it('skips rather than guessing when the import changed under a queued job', async () => {
    addMedia('m1', {})
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    // A second import lands. The plan is now a different plan.
    db.prepare('DELETE FROM media WHERE import_id = ?').run(importId)
    const result = await runIdentify(db, job, stub([answer()]))

    assert.equal(result, null)
    const row = db.prepare('SELECT last_error FROM ai_jobs WHERE id = ?').get(job.id) as { last_error: string }
    assert.match(row.last_error, /the import has changed since this job was queued/)
  })

  it('is the runner the worker reaches for', () => {
    assert.equal(runnerFor(IDENTIFY_TASK), runIdentify as unknown)
  })

  it('drains through the ordinary worker, not a path of its own', async () => {
    // The queueing is deliberate and separate; the RUNNING is not. A second
    // drain loop would be a second place the spend cap is checked, and the cap
    // is only a limit if nothing else is in flight spending against it.
    addMedia('m1', {})
    queueIdentification(db, PROPERTY, VISIT, TEST_OPERATOR)
    const deps = stub([
      answer({ objects: [{ label: 'Sump pump', classId: null, evidenceMediaIds: ['m1'], basis: 'detail', whatYouCanSee: 'pit lid', readable: '' }] }),
    ])
    const result = await drainVisit(db, VISIT, { deps })

    assert.equal(result.ran, 1)
    assert.equal(result.failed, 0)
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM objects').get() as { n: number }
    assert.equal(n, 1)
  })
})

describe('writing proposals is attributed, like every other write', () => {
  beforeEach(() => seed())

  it('refuses an object with no actor', () => {
    // Increment 2c's rule, enforced by a trigger rather than by remembering.
    assert.throws(
      () =>
        writeProposedObjects(db, {
          propertyId: PROPERTY, importId, zoneId: ZONE, actorId: '',
          objects: [{ label: 'A thing', classId: null, evidenceMediaIds: [], basis: 'detail', whatYouCanSee: '', readable: '' }],
        }),
      /every row records which operator acted/,
    )
  })

  it('writes nothing at all when one object in a set cannot be written', () => {
    // One transaction, so a half-written room never reaches the review.
    assert.throws(() =>
      writeProposedObjects(db, {
        propertyId: PROPERTY, importId, zoneId: ZONE, actorId: 'nobody-by-that-name',
        objects: [
          { label: 'First', classId: null, evidenceMediaIds: [], basis: 'detail', whatYouCanSee: '', readable: '' },
          { label: 'Second', classId: null, evidenceMediaIds: [], basis: 'detail', whatYouCanSee: '', readable: '' },
        ],
      }),
    )
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM objects').get() as { n: number }
    assert.equal(n, 0)
  })
})

describe('reading the rows the call is assembled from', () => {
  beforeEach(() => seed())

  it('attaches a capture note to its media and leaves the rest alone', () => {
    addMedia('m1', {})
    addMedia('m2', {})
    addCaptureNote('m1', 'why this frame exists')
    const rows = mediaForImport(db, importId)
    assert.equal(rows.find((r) => r.mediaId === 'm1')?.captureNote, 'why this frame exists')
    assert.equal(rows.find((r) => r.mediaId === 'm2')?.captureNote, null)
  })

  it('does not mistake a note about a pin for a note about a photograph', () => {
    // The walk export's eight notes all target pins. A join that ignored
    // `target_kind` would attach a pin's note to a photograph with the same id
    // space and hand the model somebody else's sentence.
    addMedia('m1', {})
    db.prepare(
      `INSERT INTO notes (note_id, import_id, target_kind, target_id, text, at, created_at)
       VALUES (?, ?, 'pin', 'm1', 'a note about a pin', ?, ?)`,
    ).run(newId(), importId, now(), now())
    assert.equal(mediaForImport(db, importId)[0]!.captureNote, null)
  })

  it('separates flags that are set from flags that merely exist', () => {
    const flags = propertyFlags(db, importId)
    assert.deepEqual(flags.set, ['well', 'septic'])
    assert.deepEqual(flags.declared, ['well', 'septic', 'gas', 'pool'])
  })

  it('survives a config that declares no flags at all', () => {
    db.prepare('UPDATE config_snapshots SET snapshot = ? WHERE import_id = ?').run('{}', importId)
    const flags = propertyFlags(db, importId)
    assert.deepEqual(flags.declared, [])
    assert.deepEqual(flags.set, ['well', 'septic'])
  })
})

describe('the prompt library refuses what it should', () => {
  it('has no prompt for a task nobody wrote one for', () => {
    assert.throws(() => currentPrompt(loadPrompts(promptsRoot), 'identify_nothing'), PromptRefused)
  })
})
