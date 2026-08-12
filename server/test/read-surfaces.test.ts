/**
 * Pass 1 · Read — the call, the normalisation and the storage.
 *
 * **Every model call is a stub.** What is checked is what pass 1 sends, what it
 * refuses to lose, and what it writes — none of which needs a model to have an
 * opinion, and a suite needing an API key would stop being runnable (§0.4).
 *
 * The three cases that matter most are the three the amendment came from: a
 * plate whose empty cells are the evidence, a photograph holding two labels, and
 * a pass that must not name anything.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { join } from 'node:path'
import { newId, now, type Db } from '../src/db/index.js'
import { loadPrompts, promptsRoot } from '../src/ai/prompts.js'
import type { ModelConfig } from '../src/ai/models.js'
import type { RunArgs } from '../src/ai/client.js'
import { claimNext } from '../src/ai/queue.js'
import { runnerFor } from '../src/ai/tasks/index.js'
import { batchTargetId, mediaForImport, zoneRoutes } from '../src/ai/tasks/identify.js'
import { planIdentificationCalls } from '../src/engine/identify.js'
import {
  claimsForImport, MAX_MEDIA_PER_READ_CALL, normaliseRead, planSurfaceReads, queueSurfaceReading,
  READ_SCHEMA, READ_TASK, readingFacts, runReadSurfaces, writeReadings,
  type SurfaceRead,
} from '../src/ai/tasks/readSurfaces.js'
import { adjudicateManufacturer, plateModels } from '../src/engine/surfaces.js'
import { freshDb, repoRoot, TEST_OPERATOR } from './helpers.js'

const FIXTURE = join(repoRoot, 'fixtures', 'nameplates', 'images', 'IMG_0004.jpeg')

const MODEL: ModelConfig = {
  tier: 'fast', id: 'a-pinned-fast-model', inputPerMTok: 1, outputPerMTok: 5,
  maxImageEdge: 1568, maxOutputTokens: 4096,
}

const PROPERTY = 'prop-1'
const VISIT = 'visit-1'
const ZONE = 'zone-mech'

let db: Db
let importId: string

function seed(): void {
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
    `INSERT INTO zones (zone_id, import_id, property_id, visit_id, type, label, level, created_at)
     VALUES (?, ?, ?, ?, 'mechanical', 'Mechanical room', 'basement', ?)`,
  ).run(ZONE, importId, PROPERTY, VISIT, now())
}

function addMedia(
  mediaId: string,
  owner: { canvas?: string; status?: string; kind?: string; intent?: string } = {},
): void {
  db.prepare(
    `INSERT INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind, owner_zone_id,
                        owner_pin_id, owner_canvas_id, capture_intent, file, file_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
  ).run(
    mediaId, importId, PROPERTY, VISIT, owner.kind ?? 'photo', owner.canvas ? 'canvas' : 'zone',
    owner.canvas ? null : ZONE, owner.canvas ?? null, owner.intent ?? null,
    `${mediaId}.jpg`, owner.status ?? 'present', now(),
  )
}

function addCanvas(canvasId: string): void {
  db.prepare(
    `INSERT INTO canvases (canvas_id, zone_id, import_id, kind, retired, media_id, file, created_at)
     VALUES (?, ?, ?, 'photo', 0, NULL, NULL, ?)`,
  ).run(canvasId, ZONE, importId, now())
}

/** A stub model. Records what it was asked; answers what the test dictates. */
function stub(answers: SurfaceRead[]): {
  asked: RunArgs[]
  prompts: ReturnType<typeof loadPrompts>
  model: ModelConfig
  resolvePath: () => string
  run: <T>(args: RunArgs) => Promise<{ output: T; inputTokens: number; outputTokens: number }>
} {
  const asked: RunArgs[] = []
  let i = 0
  return {
    asked,
    prompts: loadPrompts(promptsRoot),
    model: MODEL,
    resolvePath: () => FIXTURE,
    run: async <T,>(args: RunArgs) => {
      asked.push(args)
      return { output: answers[i++] as T, inputTokens: 19_000, outputTokens: 900 }
    },
  }
}

const answer = (over: Partial<SurfaceRead> = {}): SurfaceRead => ({ labels: [], noText: [], ...over })

/** One label's declared properties, dug out of the schema rather than restated. */
const labelProperties = (): Record<string, unknown> => {
  const props = READ_SCHEMA.properties as { labels: { items: { properties: Record<string, unknown> } } }
  return props.labels.items.properties
}

beforeEach(seed)

// ---------------------------------------------------------------------------

describe('the forbidding is structural — there is nowhere to put a name', () => {
  it('has no field in which an object could be named or classed', () => {
    // The prompt says *do not name the object*. An instruction is a request; a
    // missing field is a wall. If somebody adds `label` here later, this fails
    // and they have to argue for it.
    const label = labelProperties()
    assert.deepEqual(Object.keys(label).sort(), ['fields', 'mediaId', 'surface', 'whereItIs'])
    for (const forbidden of ['label', 'classId', 'whatItIs', 'object', 'name']) {
      assert.equal(forbidden in label, false, `pass 1 must not be able to return \`${forbidden}\``)
    }
  })

  it('leaves surface open rather than enumerating it', () => {
    const surface = labelProperties().surface as Record<string, unknown>
    assert.equal(surface.type, 'string')
    assert.equal('enum' in surface, false, 'a surface is a fact about a photograph, not a choice from our list')
  })
})

describe('pass 1 does not send the canvas, and that is its one input difference', () => {
  it('drops canvas frames and says how many', () => {
    addCanvas('cv-1')
    addMedia('c1', { canvas: 'cv-1' })
    addMedia('c2', { canvas: 'cv-1' })
    addMedia('d1')
    addMedia('d2')

    const plan = planSurfaceReads(db, importId)
    assert.equal(plan.canvasDropped, 2)
    assert.deepEqual(plan.batches.flatMap((b) => b.media.map((m) => m.mediaId)), ['d1', 'd2'])
    assert.match(plan.note, /canvas frame\(s\) deliberately not sent/)
  })

  it('plans NO call for a zone that has only canvas frames', () => {
    // Identification still runs there — *present, not identified* is a real
    // answer from a wide shot. A pass-1 call would pay for a certain nothing.
    addCanvas('cv-1')
    addMedia('c1', { canvas: 'cv-1' })
    assert.deepEqual(planSurfaceReads(db, importId).batches, [])
  })

  it('splits at its own ceiling, which is lower than identification\'s', () => {
    for (let i = 0; i < MAX_MEDIA_PER_READ_CALL + 3; i++) addMedia(`d${String(i).padStart(2, '0')}`)
    const plan = planSurfaceReads(db, importId)
    assert.equal(plan.batches.length, 2)
    assert.equal(plan.batches[0]!.media.length, MAX_MEDIA_PER_READ_CALL)
    assert.equal(plan.batches[1]!.media.length, 3)
    assert.deepEqual(plan.batches.map((b) => [b.index, b.of]), [[1, 2], [2, 2]])
  })
})

describe('a named cell is never dropped, whatever it says', () => {
  const sent = new Set(['m1'])

  it('keeps an N/A value — the WellMate, and the whole reason for fields', () => {
    // `Factory Precharge pressure: N/A` and `N/A` across all three drawdown
    // columns. Read as prose the plate says *pressure* a dozen times; read as a
    // table it says the opposite, and flattening is what destroys that.
    const r = normaliseRead(
      answer({
        labels: [{
          mediaId: 'm1', surface: 'nameplate', whereItIs: 'on the tank shoulder',
          fields: [
            { field: 'Factory Precharge pressure', value: 'N/A', unreadable: false },
            { field: 'Drawdown 20-40 psig', value: 'N/A', unreadable: false },
            { field: 'Maximum Operating Pressure', value: '75 psig', unreadable: false },
          ],
        }],
      }),
      sent,
    )
    assert.equal(r.labels[0]!.fields.length, 3)
    assert.deepEqual(r.labels[0]!.fields.map((f) => f.value), ['N/A', 'N/A', '75 psig'])
  })

  it('keeps an illegible cell WITH its partial read', () => {
    // CLAUDE.md §9 — the record abstains, the prompt does not. `unreadable`
    // says do not believe this; the characters say here is what to check.
    const r = normaliseRead(
      answer({
        labels: [{
          mediaId: 'm1', surface: 'nameplate', whereItIs: '',
          fields: [{ field: 'Serial', value: 'Q1373_5_9', unreadable: true }],
        }],
      }),
      sent,
    )
    assert.deepEqual(r.labels[0]!.fields[0], { field: 'Serial', value: 'Q1373_5_9', unreadable: true })
  })

  it('keeps a named cell with an empty value', () => {
    const r = normaliseRead(
      answer({ labels: [{ mediaId: 'm1', surface: 'nameplate', whereItIs: '', fields: [{ field: 'Volts', value: '', unreadable: false }] }] }),
      sent,
    )
    assert.equal(r.labels[0]!.fields.length, 1, 'a named cell is evidence even with nothing in it')
  })

  it('drops a cell whose NAME could not be read, because there is nothing to key it on', () => {
    const r = normaliseRead(
      answer({ labels: [{ mediaId: 'm1', surface: 'nameplate', whereItIs: '', fields: [{ field: '  ', value: '240', unreadable: false }] }] }),
      sent,
    )
    assert.equal(r.labels[0]!.fields.length, 0)
  })
})

describe('nothing is dropped silently — doctrine 6', () => {
  it('reports a surface word this build has not met, and keeps it', () => {
    const r = normaliseRead(
      answer({ labels: [{ mediaId: 'm1', surface: 'Cast in relief', whereItIs: '', fields: [] }] }),
      new Set(['m1']),
    )
    assert.equal(r.labels[0]!.surface, 'cast-in-relief')
    assert.deepEqual(r.unknownSurfaces, [{ mediaId: 'm1', surface: 'cast-in-relief' }])
  })

  it('reports a label naming a photograph this call never sent', () => {
    const r = normaliseRead(
      answer({ labels: [{ mediaId: 'never-sent', surface: 'nameplate', whereItIs: '', fields: [] }] }),
      new Set(['m1']),
    )
    assert.equal(r.labels.length, 0)
    assert.deepEqual(r.strayLabels, [{ mediaId: 'never-sent', surface: 'nameplate' }])
  })

  it('separates a photograph nobody mentioned from one declared empty', () => {
    // These are opposite facts. `noText` is an answer; unaccounted is a hole.
    const r = normaliseRead(answer({ noText: ['m1'] }), new Set(['m1', 'm2']))
    assert.deepEqual(r.noText, ['m1'])
    assert.deepEqual(r.unaccounted, ['m2'])
  })

  it('keeps a label that carries no readable field at all', () => {
    // *There is a plate here and I cannot read it* is a capture finding — it
    // says reshoot this — and it only exists because a label is separate from
    // its fields.
    const r = normaliseRead(
      answer({ labels: [{ mediaId: 'm1', surface: 'nameplate', whereItIs: 'behind the pipe, at an angle', fields: [] }] }),
      new Set(['m1']),
    )
    assert.equal(r.labels.length, 1)
    assert.equal(r.labels[0]!.fields.length, 0)
  })
})

describe('storage keeps two labels in one photograph as two labels', () => {
  it('round-trips through readings and reading_fields', () => {
    addMedia('m1')
    const ids = writeReadings(db, {
      propertyId: PROPERTY, importId, zoneId: ZONE, actorId: TEST_OPERATOR,
      labels: [
        { mediaId: 'm1', surface: 'nameplate', whereItIs: 'left pump', fields: [{ field: 'Model', value: 'UP26-99F', unreadable: false }] },
        { mediaId: 'm1', surface: 'nameplate', whereItIs: 'right pump', fields: [{ field: 'Model', value: 'UPS26-99U', unreadable: false }] },
      ],
    })
    assert.equal(ids.length, 2)

    const claims = claimsForImport(db, importId)
    assert.equal(claims.length, 2)
    assert.equal(new Set(claims.map((c) => c.readingId)).size, 2, 'two plates, not one plate read twice')
    // And this is the whole point: rule 6 gets both, so it can tell a legibility
    // slip from a second pump.
    assert.deepEqual(plateModels(claims).map((m) => m.value), ['UP26-99F', 'UPS26-99U'])
  })

  it('stores a label with no fields, and the field key beside the printed name', () => {
    addMedia('m1')
    writeReadings(db, {
      propertyId: PROPERTY, importId, zoneId: ZONE, actorId: TEST_OPERATOR,
      labels: [
        { mediaId: 'm1', surface: 'nameplate', whereItIs: 'illegible', fields: [] },
        { mediaId: 'm1', surface: 'nameplate', whereItIs: '', fields: [{ field: 'Cat. No.', value: 'X-1', unreadable: false }] },
      ],
    })
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM readings').get() as { n: number }).n, 2)
    const f = db.prepare('SELECT field, field_key AS key FROM reading_fields').get() as { field: string; key: string }
    assert.deepEqual(f, { field: 'Cat. No.', key: 'cat no' }, 'the plate\'s own wording is kept beside the key')
  })

  it('refuses a reading with no operator', () => {
    addMedia('m1')
    assert.throws(
      () =>
        writeReadings(db, {
          propertyId: PROPERTY, importId, zoneId: ZONE, actorId: '',
          labels: [{ mediaId: 'm1', surface: 'nameplate', whereItIs: '', fields: [] }],
        }),
      /every row records which operator acted/,
    )
  })
})

describe('the call', () => {
  it('sends the detail photographs, names each id, and writes what comes back', async () => {
    addCanvas('cv-1')
    addMedia('c1', { canvas: 'cv-1' })
    addMedia('d1')
    addMedia('d2')

    const deps = stub([
      answer({
        labels: [
          { mediaId: 'd1', surface: 'nameplate', whereItIs: 'front of the tank', fields: [{ field: 'Model', value: 'UT-450 CE', unreadable: false }, { field: 'Factory Precharge pressure', value: 'N/A', unreadable: false }] },
          { mediaId: 'd1', surface: 'adjacent-sticker', whereItIs: 'yellow decal beside it', fields: [{ field: 'Manufacturer', value: 'NextEnergy', unreadable: false }] },
        ],
        noText: ['d2'],
      }),
    ])

    const q = queueSurfaceReading(db, PROPERTY, VISIT, TEST_OPERATOR)
    assert.equal(q.jobs, 1)
    assert.equal(q.photographs, 2, 'the canvas frame is not counted, because it is not sent')

    const job = claimNext(db, VISIT)!
    assert.equal(job.task, READ_TASK)
    const r = await runReadSurfaces(db, job, deps)

    assert.ok(r)
    assert.equal(deps.asked.length, 1)
    assert.equal(deps.asked[0]!.images.length, 2, 'two detail photographs, no canvas')
    const facts = deps.asked[0]!.facts ?? ''
    assert.match(facts, /d1/)
    assert.match(facts, /d2/)
    assert.doesNotMatch(facts, /c1/, 'the canvas is not even named')

    assert.equal(r.labels.length, 2)
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM readings').get() as { n: number }).n, 2)
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM reading_fields').get() as { n: number }).n, 3)

    // And the adjudication over what was stored: the plate has no manufacturer,
    // so the decal's name is kept and asserted by nothing.
    const a = adjudicateManufacturer(claimsForImport(db, importId))
    assert.equal(a.asserted, null)
    assert.match(a.why, /may not assert/)
  })

  it('records the generation with the canvas count stated rather than implied', async () => {
    addMedia('d1')
    const job = (queueSurfaceReading(db, PROPERTY, VISIT, TEST_OPERATOR), claimNext(db, VISIT)!)
    await runReadSurfaces(db, job, stub([answer({ noText: ['d1'] })]))

    const gen = db.prepare('SELECT task, input_refs AS refs, abstained FROM ai_generations').get() as {
      task: string
      refs: string
      abstained: number
    }
    assert.equal(gen.task, READ_TASK)
    assert.equal(gen.abstained, 1, 'no label read anywhere is an abstention, not an error')
    assert.equal(JSON.parse(gen.refs).canvasSent, 0, 'a reader should not have to infer this from a count')
  })

  it('skips with a reason when no photograph is on this machine', async () => {
    addMedia('d1', { status: 'absent' })
    queueSurfaceReading(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    assert.equal(await runReadSurfaces(db, job, stub([])), null)
    const row = db.prepare('SELECT status, last_error AS why FROM ai_jobs WHERE id = ?').get(job.id) as {
      status: string
      why: string
    }
    assert.equal(row.status, 'skipped')
    assert.match(row.why, /none of this batch's 1 photographs are on this machine/)
  })

  it('is registered with the worker like any other task', () => {
    assert.equal(runnerFor(READ_TASK), runReadSurfaces)
  })

  it('does not run as a side effect of an import', async () => {
    // Same gate as identification: this sends detail photographs of the inside
    // of a house, and a person starts it.
    const { queueAssists } = await import('../src/ai/tasks/index.js')
    addMedia('d1')
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    const queued = db.prepare('SELECT COUNT(*) AS n FROM ai_jobs WHERE task = ?').get(READ_TASK) as { n: number }
    assert.equal(queued.n, 0)
  })
})

describe('the facts block', () => {
  it('names every photograph and requires each to be accounted for', () => {
    const facts = readingFacts({
      zoneLabel: 'Mechanical room',
      batchIndex: 1,
      batchOf: 1,
      media: [{ mediaId: 'a', captureNote: null }, { mediaId: 'b', captureNote: 'the injection point' }],
    })
    assert.match(facts, /Mechanical room/)
    assert.match(facts, /b — note written at capture: "the injection point"/)
    assert.match(facts, /must appear exactly once/)
  })

  it('says when a room is split, so nothing is concluded from what is absent', () => {
    const facts = readingFacts({ zoneLabel: null, batchIndex: 2, batchOf: 3, media: [] })
    assert.match(facts, /Part 2 of 3/)
  })

  it('carries the batch id shape identification uses, so one zone\'s passes line up', () => {
    assert.equal(batchTargetId(ZONE, 1), `${ZONE}#1`)
  })
})

describe('#132 and #133 — the capture-intent seam', () => {
  it('routes a room-shot to CONTEXT even with no canvas, which is every Discovery export', () => {
    // `zones[].canvases[]` is empty on every Discovery export by design, so the
    // room shot travels the ordinary photo path. Without this, EVERY Discovery
    // batch is contextless — the exact defect Amendment 10 §B2 closed, restored
    // by a seam neither repo could see from inside itself.
    addMedia('room', { intent: 'room-shot' })
    addMedia('d1')
    addMedia('d2')

    const plan = planIdentificationCalls(mediaForImport(db, importId), zoneRoutes(db, importId))
    assert.deepEqual(plan.batches[0]!.context.map((m) => m.mediaId), ['room'])
    assert.deepEqual(plan.batches[0]!.media.map((m) => m.mediaId), ['d1', 'd2'])

    // And pass 1 therefore does not pay to read text off a wide frame of a room.
    const read = planSurfaceReads(db, importId)
    assert.equal(read.canvasDropped, 1)
    assert.deepEqual(read.batches.flatMap((b) => b.media.map((m) => m.mediaId)), ['d1', 'd2'])
  })

  it('keeps the canvas route as well — a union, not a replacement', () => {
    addCanvas('cv-1')
    addMedia('c1', { canvas: 'cv-1' })
    addMedia('room', { intent: 'room-shot' })
    addMedia('d1')
    const plan = planIdentificationCalls(mediaForImport(db, importId), zoneRoutes(db, importId))
    assert.deepEqual(plan.batches[0]!.context.map((m) => m.mediaId).sort(), ['c1', 'room'])
  })

  it('excludes a run-trace from zone batching, and NAMES why', () => {
    // A trace files to the zone it started in — true, and the only locational
    // fact available. Room batching assumes every frame is in that room.
    addMedia('trace', { intent: 'run-trace' })
    addMedia('d1')
    const plan = planIdentificationCalls(mediaForImport(db, importId), zoneRoutes(db, importId))
    assert.deepEqual(plan.batches[0]!.media.map((m) => m.mediaId), ['d1'])
    assert.equal(plan.batches[0]!.context.length, 0)
    const ex = plan.excluded.find((e) => e.mediaId === 'trace')
    assert.ok(ex, 'excluded, never silently dropped — doctrine 6')
    assert.match(ex!.why, /across rooms/)
  })

  it('treats an intent this build has not met as ordinary capture', () => {
    // Fail open, and safely: an unrecognised word is neither `room-shot` nor
    // `run-trace`, so it can neither claim context authority nor remove a
    // photograph from a call.
    addMedia('odd', { intent: 'macro-detail' })
    const plan = planIdentificationCalls(mediaForImport(db, importId), zoneRoutes(db, importId))
    assert.deepEqual(plan.batches[0]!.media.map((m) => m.mediaId), ['odd'])
    assert.equal(plan.excluded.length, 0)
  })
})
