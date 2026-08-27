/**
 * Pass 3 · Match and complete — Amendment 11 §C and the ruling of 2026-08-12.
 *
 * **The cases are the four-pressure-tanks error and its two halves**: a known
 * object cannot be duplicated because it is in the question, and a room with no
 * scaffold gets a different question that says so.
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
import { queueSurfaceReading, READ_TASK, writeReadings } from '../src/ai/tasks/readSurfaces.js'
import { writeResolutions } from '../src/ai/tasks/resolveProduct.js'
import {
  ENUMERATE_TASK, MATCH_SCHEMA, MATCH_TASK, matchFacts, MODELLED_KEYS, normaliseMatch, planMatch, queueMatch,
  questionFor, runMatchComplete, type MatchOutput,
} from '../src/ai/tasks/matchComplete.js'
import { readState } from '../src/ai/tasks/readSurfaces.js'
import { freshDb, repoRoot, TEST_OPERATOR } from './helpers.js'

const FIXTURE = join(repoRoot, 'fixtures', 'nameplates', 'images', 'IMG_0004.jpeg')
const MODEL: ModelConfig = {
  tier: 'fast', id: 'a-pinned-fast-model', inputPerMTok: 1, outputPerMTok: 5,
  maxImageEdge: 1568, maxOutputTokens: 4096,
}
const PROPERTY = 'prop-1'
const VISIT = 'visit-1'
const MECH = 'zone-mech'
const BED = 'zone-bed'

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
  for (const [id, label, type] of [[MECH, 'Mechanical room', 'mechanical'], [BED, 'Bedroom', 'bedroom']]) {
    db.prepare(
      `INSERT INTO zones (zone_id, import_id, property_id, visit_id, type, label, level, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'basement', ?)`,
    ).run(id, importId, PROPERTY, VISIT, type, label, now())
  }
}

function addMedia(mediaId: string, zoneId = MECH): void {
  db.prepare(
    `INSERT INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind, owner_zone_id,
                        owner_pin_id, owner_canvas_id, file, file_status, created_at)
     VALUES (?, ?, ?, ?, 'photo', 'zone', ?, NULL, NULL, ?, 'present', ?)`,
  ).run(mediaId, importId, PROPERTY, VISIT, zoneId, `${mediaId}.jpg`, now())
}

/** A resolved product, the way passes 1 and 2 leave it. */
function knowProduct(product: string, mediaId: string, kind = 'equipment'): void {
  const [readingId] = writeReadings(db, {
    propertyId: PROPERTY, importId, zoneId: MECH, actorId: TEST_OPERATOR,
    labels: [{ mediaId, surface: 'nameplate', whereItIs: '', fields: [{ field: 'Model', value: 'X-1', unreadable: false }] }],
  })
  writeResolutions(db, {
    propertyId: PROPERTY, importId, actorId: TEST_OPERATOR,
    queries: [{ readingId: readingId!, mediaId, surface: 'nameplate', text: 'X-1', specificity: 'line', why: '', from: [] }],
    resolutions: [{ readingId: readingId!, product, kind: kind as 'equipment', recognisedFrom: 'known', resolved: true, specificity: 'line' }],
  })
}

/**
 * Pass 1 having settled, which is what the gate requires.
 *
 * The tests used to write readings straight into the table and queue a match
 * against them — which the gate now refuses, correctly: a reading with no
 * settled pass-1 job is a scaffold that arrived from nowhere.
 */
function settleRead(): void {
  queueSurfaceReading(db, PROPERTY, VISIT, TEST_OPERATOR)
  db.prepare(`UPDATE ai_jobs SET status = 'done' WHERE task = ?`).run(READ_TASK)
}

function stub(answers: MatchOutput[]): {
  asked: RunArgs[]
  prompts: ReturnType<typeof loadPrompts>
  model: ModelConfig
  resolvePath: () => string
  run: <T>(a: RunArgs) => Promise<{ output: T; inputTokens: number; outputTokens: number }>
} {
  const asked: RunArgs[] = []
  let i = 0
  return {
    asked, prompts: loadPrompts(promptsRoot), model: MODEL, resolvePath: () => FIXTURE,
    run: async <T,>(a: RunArgs) => {
      asked.push(a)
      return { output: answers[i++] as T, inputTokens: 90_000, outputTokens: 800 }
    },
  }
}

const answer = (o: Partial<MatchOutput> = {}): MatchOutput => ({
  located: [], couldNotLocate: [], additional: [], unsure: [], roomNote: '', ...o,
})

const readStateFor = (zoneId: string): ReturnType<typeof readState> =>
  readState(db, importId, VISIT, zoneId)

beforeEach(seed)

// ---------------------------------------------------------------------------

describe('the question changes with the inventory, and the task name records which', () => {
  it('asks MATCH where there is a scaffold and ENUMERATE where there is not', () => {
    addMedia('m1', MECH); addMedia('b1', BED)
    knowProduct('Burcam Series 600 captive-air pressure tank', 'm1')

    const plan = planMatch(db, importId)
    const mech = plan.batches.find((b) => b.zoneId === MECH)!
    const bed = plan.batches.find((b) => b.zoneId === BED)!

    assert.equal(questionFor(mech), MATCH_TASK)
    assert.equal(questionFor(bed), ENUMERATE_TASK, 'a bedroom has no scaffold, so the question is different')
    assert.equal(plan.withScaffold, 1)
    assert.equal(plan.withoutScaffold, 1)
    assert.match(plan.note, /harder question/)
  })

  it('queues two different task names, so the ledger records which was asked', () => {
    // Not one task with a hidden branch. A run whose inventory happened to be
    // empty must not be indistinguishable from one where it was not.
    addMedia('m1', MECH); addMedia('b1', BED)
    knowProduct('Burcam Series 600 captive-air pressure tank', 'm1')
    settleRead()
    const q = queueMatch(db, PROPERTY, VISIT, TEST_OPERATOR)
    assert.deepEqual([q.matching, q.enumerating], [1, 1])
    const tasks = (
      db.prepare('SELECT task FROM ai_jobs WHERE target_kind = ? ORDER BY task').all('zone-batch') as { task: string }[]
    ).map((t) => t.task).filter((t) => t !== READ_TASK)
    assert.deepEqual(tasks, [ENUMERATE_TASK, MATCH_TASK])
  })

  it('scopes the inventory to the zone its label was read in', () => {
    // A plate read in the mechanical room scaffolds the mechanical room and
    // says nothing about the kitchen.
    addMedia('m1', MECH); addMedia('b1', BED)
    knowProduct('Burcam Series 600 captive-air pressure tank', 'm1')
    const bed = planMatch(db, importId).batches.find((b) => b.zoneId === BED)!
    assert.deepEqual(bed.inventory, [])
  })

  it('both tasks reach the same runner', () => {
    assert.equal(runnerFor(MATCH_TASK), runMatchComplete)
    assert.equal(runnerFor(ENUMERATE_TASK), runMatchComplete)
  })
})

describe('⚑ the gate — pass 3 refuses a zone whose read has not settled', () => {
  it('does not queue a zone at all, and names it rather than dropping it', () => {
    // A warning is a sentence. An unscaffolded run and a scaffolded one produce
    // different answers and look identical afterwards, so the refusal happens
    // before the money is spent.
    addMedia('m1', MECH)
    const q = queueMatch(db, PROPERTY, VISIT, TEST_OPERATOR)
    assert.equal(q.jobs, 0)
    assert.equal(q.blocked.length, 1)
    assert.equal(q.blocked[0]!.zoneId, MECH)
    assert.match(q.blocked[0]!.why, /look identical afterwards/)
    assert.match(q.note, /npm run passes/)
  })

  it('queues once the read has settled', () => {
    addMedia('m1', MECH)
    settleRead()
    const q = queueMatch(db, PROPERTY, VISIT, TEST_OPERATOR)
    assert.equal(q.jobs, 1)
    assert.deepEqual(q.blocked, [])
  })

  it('refuses at RUN time too, for a job queued before a re-import', async () => {
    // A job queued when pass 1 had settled can be drained after the plan
    // changed underneath it.
    addMedia('m1', MECH)
    settleRead()
    queueMatch(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    db.prepare(`UPDATE ai_jobs SET status = 'queued' WHERE task = ?`).run(READ_TASK)

    assert.equal(await runMatchComplete(db, job, stub([])), null)
    const row = db.prepare('SELECT status, last_error AS why FROM ai_jobs WHERE id = ?').get(job.id) as {
      status: string; why: string
    }
    assert.equal(row.status, 'skipped')
    assert.match(row.why, /Pass 1 has settled 0 of this zone's 1 batches/)
  })

  it('treats a zone with nothing to read as complete, not as pending', () => {
    // A canvas-only zone plans no pass-1 call and never will. Refusing it
    // forever would block a room on work that is not coming.
    const s = readStateFor(BED)
    assert.equal(s.complete, true)
    assert.match(s.why, /nothing to read/)
  })
})

describe('the known object is in the question, so it cannot come back as a duplicate', () => {
  const known = new Set(['Burcam Series 600 captive-air pressure tank'])
  const base: Parameters<typeof normaliseMatch>[1] =
    { question: MATCH_TASK, products: known, classIds: new Set(['well-pressure-tank']), mediaIds: new Set(['m1']) }

  it('refuses a LOCATED entry naming a product that is not on the list', () => {
    // ⚑ The one thing that would silently merge the two lanes: an appearance
    // guess wearing the plate lane's badge.
    const r = normaliseMatch(answer({
      located: [{ product: 'Well pressure tank', mediaIds: ['m1'], whereItIs: 'by the wall' }],
    }), base)
    assert.equal(r.located.length, 0)
    assert.deepEqual(r.unknownProducts, ['Well pressure tank'])
  })

  it('keeps a duplicate proposed in ADDITIONAL, because that lane is a guess and says so', () => {
    // It is not deleted — a person reads `whatMakesItDifferent` and decides.
    // Deleting it here would be the builder quietly settling an identity.
    const r = normaliseMatch(answer({
      located: [{ product: 'Burcam Series 600 captive-air pressure tank', mediaIds: ['m1'], whereItIs: 'left' }],
      additional: [{ label: 'Second pressure tank', classId: 'well-pressure-tank', mediaIds: ['m1'], whatYouCanSee: 'grey cylinder', whatMakesItDifferent: 'shorter' }],
    }), base)
    assert.equal(r.located.length, 1)
    assert.equal(r.additional.length, 1)
    assert.equal(r.additional[0]!.whatMakesItDifferent, 'shorter')
  })

  it('keeps could-not-locate, which is a finding about the capture', () => {
    const r = normaliseMatch(answer({
      couldNotLocate: [{ product: 'Burcam Series 600 captive-air pressure tank', whereExpected: 'behind the softener' }],
    }), base)
    assert.equal(r.couldNotLocate.length, 1)
    assert.match(r.couldNotLocate[0]!.whereExpected, /softener/)
  })

  it('drops a could-not-locate for a product that was never known', () => {
    const r = normaliseMatch(answer({ couldNotLocate: [{ product: 'A thing nobody listed', whereExpected: 'x' }] }), base)
    assert.equal(r.couldNotLocate.length, 0)
  })

  it('nulls a class the frame does not declare, and reports it', () => {
    const r = normaliseMatch(answer({
      additional: [{ label: 'A box', classId: 'invented-class', mediaIds: ['m1'], whatYouCanSee: 'a box', whatMakesItDifferent: 'boxy' }],
    }), base)
    assert.equal(r.additional[0]!.classId, null, 'the object survives; the class does not')
    assert.deepEqual(r.unknownClasses, [{ label: 'A box', classId: 'invented-class' }])
  })

  it('reports evidence naming a photograph the call never carried', () => {
    const r = normaliseMatch(answer({
      additional: [{ label: 'A box', classId: null, mediaIds: ['m1', 'never'], whatYouCanSee: '', whatMakesItDifferent: '' }],
    }), base)
    assert.deepEqual(r.additional[0]!.mediaIds, ['m1'])
    assert.deepEqual(r.strayEvidence, [{ label: 'A box', mediaId: 'never' }])
  })

  it('records which question was asked, on the stored answer itself', () => {
    const r = normaliseMatch(answer(), { ...base, question: ENUMERATE_TASK })
    assert.equal(r.question, ENUMERATE_TASK)
  })
})

describe('the parent relation is populated here, and never guessed', () => {
  const base: Parameters<typeof normaliseMatch>[1] =
    { question: MATCH_TASK, products: new Set(['Waterite treatment vessel']), classIds: new Set<string>(), mediaIds: new Set(['m1']) }

  it('keeps a partOf naming something else in the same answer', () => {
    const r = normaliseMatch(answer({
      located: [{ product: 'Waterite treatment vessel', mediaIds: ['m1'], whereItIs: 'left' }],
      additional: [{ label: 'Control head', classId: null, mediaIds: ['m1'], whatYouCanSee: 'black head', whatMakesItDifferent: 'on top of the vessel', partOf: 'Waterite treatment vessel' }],
    }), base)
    assert.equal(r.additional[0]!.partOf, 'Waterite treatment vessel')
    assert.deepEqual(r.danglingParents, [])
  })

  it('reports a partOf naming nothing, rather than resolving it to the nearest thing', () => {
    // Guessing a parent is how a part joins the wrong system, which renders as
    // a fact.
    const r = normaliseMatch(answer({
      additional: [{ label: 'Control head', classId: null, mediaIds: ['m1'], whatYouCanSee: '', whatMakesItDifferent: '', partOf: 'Something absent' }],
    }), base)
    assert.deepEqual(r.danglingParents, [{ child: 'Control head', named: 'Something absent' }])
  })
})

describe('the call and the two lanes', () => {
  it('writes plate-derived and appearance-derived apart, with the resolution behind the first', async () => {
    addMedia('m1', MECH)
    knowProduct('Burcam Series 600 captive-air pressure tank', 'm1')

    const deps = stub([answer({
      located: [{ product: 'Burcam Series 600 captive-air pressure tank', mediaIds: ['m1'], whereItIs: 'against the wall' }],
      additional: [{ label: 'Floor drain', classId: null, mediaIds: ['m1'], whatYouCanSee: 'a grate', whatMakesItDifferent: 'in the floor, not a vessel' }],
    })])

    settleRead()
    queueMatch(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    assert.equal(job.task, MATCH_TASK)
    const r = await runMatchComplete(db, job, deps)
    assert.ok(r)

    const rows = db
      .prepare('SELECT label, derived_from AS lane, resolution_id AS res FROM objects ORDER BY derived_from DESC')
      .all() as { label: string; lane: string; res: string | null }[]
    assert.equal(rows.length, 2)
    assert.equal(rows[0]!.lane, 'plate')
    assert.ok(rows[0]!.res, 'a plate-derived object carries the resolution behind it')
    assert.equal(rows[1]!.lane, 'appearance')
    assert.equal(rows[1]!.res, null)

    // And the scaffold is on the generation, so "why did this room read
    // differently" is answerable from the ledger.
    const gen = db.prepare('SELECT task, input_refs AS refs FROM ai_generations').get() as { task: string; refs: string }
    assert.equal(gen.task, MATCH_TASK)
    const refs = JSON.parse(gen.refs)
    assert.equal(refs.scaffolded, true)
    assert.equal(refs.inventory.length, 1)
  })

  it('runs the enumeration question where a room has no scaffold, and records that', async () => {
    addMedia('b1', BED)
    const deps = stub([answer({
      additional: [{ label: 'Smoke alarm', classId: null, mediaIds: ['b1'], whatYouCanSee: 'ceiling disc', whatMakesItDifferent: 'only thing here' }],
      unsure: ['possibly a thermostat on the far wall'],
    })])
    settleRead()
    queueMatch(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    assert.equal(job.task, ENUMERATE_TASK)
    const r = await runMatchComplete(db, job, deps)

    assert.equal(r!.question, ENUMERATE_TASK)
    assert.equal(r!.plateObjectIds.length, 0)
    assert.equal(r!.appearanceObjectIds.length, 1)
    const refs = JSON.parse((db.prepare('SELECT input_refs AS r FROM ai_generations').get() as { r: string }).r)
    assert.equal(refs.scaffolded, false)
  })

  it('joins a part to its system inside one transaction, whichever order they arrive', async () => {
    addMedia('m1', MECH)
    knowProduct('Waterite treatment vessel', 'm1')
    // The child is written BEFORE its parent in the answer, which is why the
    // relation is a second pass and not a foreign key.
    const deps = stub([answer({
      additional: [{ label: 'Control head', classId: null, mediaIds: ['m1'], whatYouCanSee: 'black head', whatMakesItDifferent: 'sits on the vessel', partOf: 'Waterite treatment vessel' }],
      located: [{ product: 'Waterite treatment vessel', mediaIds: ['m1'], whereItIs: 'left' }],
    })])
    settleRead()
    queueMatch(db, PROPERTY, VISIT, TEST_OPERATOR)
    await runMatchComplete(db, claimNext(db, VISIT)!, deps)

    const child = db.prepare(`SELECT parent_object_id AS p FROM objects WHERE label = 'Control head'`).get() as { p: string | null }
    const parent = db.prepare(`SELECT id FROM objects WHERE label = 'Waterite treatment vessel'`).get() as { id: string }
    assert.equal(child.p, parent.id)
  })

  it('puts the known list in the facts block, and says so in words when there is none', () => {
    const withList = matchFacts({
      zoneLabel: 'Mechanical room', batchIndex: 1, batchOf: 1, context: [], detail: ['m1'],
      inventory: [{ product: 'Burcam Series 600', kind: 'equipment', specificity: 'line' }], projection: 'CLASSES',
    })
    assert.match(withList, /KNOWN PRODUCTS IN THIS ROOM — 1/)
    assert.match(withList, /Burcam Series 600/)

    const without = matchFacts({
      zoneLabel: 'Bedroom', batchIndex: 1, batchOf: 1, context: [], detail: ['b1'], inventory: [], projection: 'CLASSES',
    })
    // An empty list and a list nobody built are different facts.
    assert.match(without, /KNOWN PRODUCTS IN THIS ROOM — none/)
    assert.match(without, /recognised from appearance/)
  })

  it('requires whatMakesItDifferent on every additional object', () => {
    // The duplicate guard is in the schema, not only in the prose.
    const props = (MATCH_SCHEMA.properties as { additional: { items: { required: string[] } } }).additional.items.required
    assert.ok(props.includes('whatMakesItDifferent'))
  })

  it('is not queued by an import', async () => {
    const { queueAssists } = await import('../src/ai/tasks/index.js')
    addMedia('m1', MECH)
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    for (const t of [MATCH_TASK, ENUMERATE_TASK]) {
      assert.equal((db.prepare('SELECT COUNT(*) AS n FROM ai_jobs WHERE task = ?').get(t) as { n: number }).n, 0, t)
    }
  })
})

describe('⚑ stop discarding — an answer key with no home is reported, not dropped', () => {
  it('records a top-level key this build does not model', () => {
    // Ruled 2026-08-13. Until now anything outside the four modelled keys was
    // read past and gone. ⚑ This is where a hypothesis lands first: every wall
    // in this repo constrains ASSERTION, so the model has one output shape — a
    // claim about an object — and "these two are probably one thing" has
    // nowhere to go. The channel's opening content is already sitting in runs
    // that have been paid for.
    const out = {
      located: [], couldNotLocate: [], additional: [], unsure: [],
      possibleDuplicates: [{ a: 'the Vanée', b: 'the ventilator', why: 'same unit, two angles' }],
      note: 'two vessels and one pressure switch, so something may be missing',
    } as unknown as MatchOutput

    const stored = normaliseMatch(out, {
      question: MATCH_TASK, products: new Set<string>(), classIds: new Set<string>(), mediaIds: new Set<string>(),
    })

    assert.deepEqual(stored.unmodelledKeys.map((u) => u.key).sort(), ['note', 'possibleDuplicates'])
    assert.match(stored.unmodelledKeys.find((u) => u.key === 'note')!.preview, /pressure switch/)
    assert.equal(stored.located.length, 0, 'and nothing it said became an object')
    assert.equal(stored.additional.length, 0)
  })

  it('reports nothing when the answer carries only modelled keys', () => {
    // The half that lets the check fail: a reporter that always fires is noise.
    const stored = normaliseMatch(
      { located: [], couldNotLocate: [], additional: [], unsure: [] } as unknown as MatchOutput,
      { question: MATCH_TASK, products: new Set<string>(), classIds: new Set<string>(), mediaIds: new Set<string>() },
    )
    assert.deepEqual(stored.unmodelledKeys, [])
  })
})

// ------------------------- Band 2 · the un-modelled bucket, and what it holds

describe('⚑ the un-modelled key set is the schema, not a copy of it', () => {
  /**
   * **The hand-written list said four keys; the schema requires five.**
   * `roomNote` was missing, so every real call recorded a false entry in
   * `unmodelledKeys` — the bucket documented as *where a hypothesis lands first*
   * firing on a fully modelled field, on every generation.
   */
  it('covers every property the schema declares, including roomNote', () => {
    const declared = Object.keys((MATCH_SCHEMA.properties ?? {}) as Record<string, unknown>)
    assert.ok(declared.includes('roomNote'), 'the schema declares it')
    for (const k of declared) {
      assert.ok(MODELLED_KEYS.has(k), `${k} is declared by MATCH_SCHEMA and must not read as un-modelled`)
    }
  })

  it('records nothing un-modelled for an answer carrying only declared keys', () => {
    // The regression: this returned [{ key: 'roomNote', ... }] on every call.
    const stored = normaliseMatch(
      { located: [], couldNotLocate: [], additional: [], unsure: [], roomNote: 'a tidy mechanical room' },
      { question: MATCH_TASK, products: new Set<string>(), classIds: new Set<string>(), mediaIds: new Set<string>() },
    )
    assert.deepEqual(stored.unmodelledKeys, [],
      'a fully modelled answer has nothing the build has no home for')
  })

  it('still records a key the schema does not declare', () => {
    // And the guard discriminates: it must not have been silenced.
    const stored = normaliseMatch(
      {
        located: [], couldNotLocate: [], additional: [], unsure: [], roomNote: '',
        possibleDuplicates: ['proposals 3 and 7 are probably one unit'],
      } as never,
      { question: MATCH_TASK, products: new Set<string>(), classIds: new Set<string>(), mediaIds: new Set<string>() },
    )
    assert.deepEqual(stored.unmodelledKeys.map((u) => u.key), ['possibleDuplicates'])
  })
})
