/**
 * The worker that drains the queue, and the read model the screen renders.
 *
 * Every model call is a stub. §10 requires the pass to be fully usable with no
 * API key, and a suite that needed one would stop being runnable — which would
 * also mean the "no key" path, the one that has to work on the owner's machine
 * on a bad network day, was the only path never exercised.
 *
 * The cases that matter most here are the ones where nothing happens: a run
 * with no model configured, a photograph classified as not a plate, a whole
 * plate that abstains. Each of those has to end in a sentence somewhere. A
 * silent no-op and a working feature look identical from the outside, and only
 * one of them is the feature working.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { join } from 'node:path'
import { newId, now, openDb, type Db } from '../src/db/index.js'
import { loadPrompts, promptsRoot } from '../src/ai/prompts.js'
import type { ModelConfig } from '../src/ai/models.js'
import { ModelCallFailed, type RunArgs } from '../src/ai/client.js'
import { acceptReading, findGeneration, pendingProposals } from '../src/ai/accept.js'
import { enqueue, queueProgress } from '../src/ai/queue.js'
import { buildAssists } from '../src/ai/screen.js'
import { drainVisit } from '../src/ai/worker.js'
import { queueAssists, type AssistDeps } from '../src/ai/tasks/index.js'
import { OverlayRefused } from '../src/overlay/store.js'
import { repoRoot, TEST_OPERATOR, freshDb } from './helpers.js'

const FIXTURE = join(repoRoot, 'fixtures', 'nameplates', 'images', 'IMG_0004.jpeg')

const MODEL: ModelConfig = {
  tier: 'fast', id: 'a-pinned-fast-model', inputPerMTok: 1, outputPerMTok: 5, maxImageEdge: 1568, maxOutputTokens: 4096,
}

const TYPES = ['water-heater', 'water-softener', 'electrical-panel']

let db: Db
const PROPERTY = 'prop-1'
const VISIT = 'visit-1'
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
     VALUES (?, ?, ?, ?, 'manifest_only', '{}', '{}', 'ok', ?, ?)`,
  ).run(importId, VISIT, PROPERTY, now(), now(), TEST_OPERATOR)
  db.prepare(
    `INSERT INTO config_snapshots (import_id, config_id, config_version, config_hash, snapshot, created_at)
     VALUES (?, 'cfg', 'v1.5.1', 'hash', ?, ?)`,
  ).run(importId, JSON.stringify({ componentLists: [{ types: TYPES, items: [] }], naReasons: [] }), now())
  db.prepare(
    `INSERT INTO zones (zone_id, import_id, property_id, visit_id, label, created_at)
     VALUES ('zone-1', ?, ?, ?, 'Utility room', ?)`,
  ).run(importId, PROPERTY, VISIT, now())
}

function addPin(id: string, number: number, componentType?: string): void {
  db.prepare(
    `INSERT INTO pins (pin_id, import_id, property_id, visit_id, number, zone_id, type_kind,
                       component_type, freeform_label, retired_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'zone-1', ?, ?, NULL, NULL, ?)`,
  ).run(id, importId, PROPERTY, VISIT, number, componentType ? 'component' : null, componentType ?? null, now())
}

function addMedia(mediaId: string, owner: { pin?: string; zone?: string }): void {
  db.prepare(
    `INSERT INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind, owner_pin_id,
                        owner_zone_id, group_key, file, file_status, created_at)
     VALUES (?, ?, ?, ?, 'photo', ?, ?, ?, NULL, ?, 'present', ?)`,
  ).run(
    mediaId, importId, PROPERTY, VISIT, owner.pin ? 'pin' : 'zone',
    owner.pin ?? null, owner.zone ?? null, `${mediaId}.jpg`, now(),
  )
}

/**
 * A stub that answers by which prompt it was handed.
 *
 * Dispatching on the prompt rather than on call order is deliberate: the drain
 * takes jobs in queue order, and a suite whose expectations depended on that
 * order would break the first time a task was queued in a different place —
 * failing loudly about something that is not the subject of any test here.
 */
function deps(
  answers: Record<string, unknown>,
  opts: { throwOn?: string; error?: unknown } = {},
): AssistDeps & { asked: RunArgs[] } {
  const asked: RunArgs[] = []
  return {
    asked,
    prompts: loadPrompts(promptsRoot),
    model: MODEL,
    resolvePath: () => FIXTURE,
    run: async <T,>(args: RunArgs) => {
      asked.push(args)
      if (opts.throwOn === args.prompt.id) throw opts.error ?? new Error('the model fell over')
      const answer = answers[args.prompt.id]
      if (answer === undefined) throw new Error(`the stub has no answer for ${args.prompt.id}`)
      return { output: answer as T, inputTokens: 1000, outputTokens: 30 }
    },
  }
}

const A_PLATE = {
  fields: { make: 'Rheem', model: 'XE50M06ST45U1', serial: 'Q1373750159', capacity: '189 L', installDate: 'unknown' },
  legible: true,
  notes: 'A water heater data plate, upright and in focus.',
}

const YES = { isNameplate: 'yes', orientation: 'upright', reason: 'a data plate fills the frame' }
const NO = { isNameplate: 'no', orientation: 'unknown', reason: 'a wall and a window, no plate' }

// ---------------------------------------------------------------- the worker

describe('the worker', () => {
  beforeEach(() => {
    seed()
    addPin('pin-1', 1, 'water-heater')
    addMedia('plate-a', { pin: 'pin-1' })
  })

  it('runs what is queued and leaves the queue empty', async () => {
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    const result = await drainVisit(db, VISIT, {
      deps: deps({ nameplate_classify: YES, nameplate_extract: A_PLATE }),
    })

    assert.equal(result.stopped, 'empty')
    assert.ok(result.ran >= 2, 'the classification and the extraction both ran')
    assert.equal(result.failed, 0)
    assert.match(result.reason, /Finished/, 'the stop reason is a sentence, not a code')

    const progress = queueProgress(db, VISIT)
    assert.equal(progress.queued + progress.running, 0, 'nothing left in flight')
  })

  /**
   * §0.4, and the state the owner's machine will actually be in most often.
   *
   * The important half is not that it refuses — it is that the jobs stay
   * QUEUED. Failing them would mean setting a key later left a visit whose work
   * had already been given up on, and nobody would know to ask for it again.
   */
  it('does not run at all with no model, and says so without failing anything', async () => {
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    const before = queueProgress(db, VISIT).queued

    const result = await drainVisit(db, VISIT, {
      deps: { prompts: loadPrompts(promptsRoot), model: undefined, resolvePath: () => FIXTURE },
    })

    assert.equal(result.stopped, 'no-model')
    assert.equal(result.ran, 0)
    assert.match(result.reason, /waiting rather than running/)
    assert.equal(queueProgress(db, VISIT).queued, before, 'everything is still owed, nothing is failed')
  })

  it('stops at the ceiling with the work still queued', async () => {
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    // A generation that has already spent the visit's whole allowance.
    db.prepare(
      `INSERT INTO ai_generations (id, property_id, visit_id, task, model, output, abstained,
                                   input_tokens, output_tokens, cost_estimate, human_decision,
                                   actor_id, created_at)
       VALUES (?, ?, ?, 'nameplate_extract', 'm', '{}', 0, 0, 0, 999, 'accepted', ?, ?)`,
    ).run(newId(), PROPERTY, VISIT, TEST_OPERATOR, now())

    const result = await drainVisit(db, VISIT, { deps: deps({}) })
    assert.equal(result.stopped, 'cap')
    assert.equal(result.ran, 0)
    assert.match(result.reason, /ceiling/)
    assert.ok(queueProgress(db, VISIT).queued > 0, 'the rest is still queued, not thrown away')
  })

  /** §10: one job failing must not take the rest with it. */
  it('lets one job fail without losing the others', async () => {
    addPin('pin-2', 2, 'electrical-panel')
    addMedia('plate-b', { pin: 'pin-2' })
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)

    // Classification succeeds for both; extraction is the thing that breaks.
    const result = await drainVisit(db, VISIT, {
      deps: deps({ nameplate_classify: YES }, { throwOn: 'nameplate_extract' }),
    })

    assert.ok(result.ran >= 2, 'both classifications still ran')
    assert.ok(result.failed >= 1, 'the broken ones are recorded as failures')
    const progress = queueProgress(db, VISIT)
    assert.ok(progress.done >= 2, 'the successful jobs are done')
    assert.ok(progress.failures.every((f) => f.error), 'every failure names a reason')
  })

  /**
   * A request the API already rejected as malformed will be rejected again in
   * thirty seconds. Retrying it is not resilience, it is spending the cap three
   * times for the same answer.
   */
  it('does not retry a failure the model called permanent', async () => {
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    await drainVisit(db, VISIT, {
      deps: deps({}, {
        throwOn: 'nameplate_classify',
        error: new ModelCallFailed('that request is wrong', 'ai.http-400', false),
      }),
    })

    const row = db
      .prepare(`SELECT status, attempts FROM ai_jobs WHERE task = 'nameplate_classify'`)
      .get() as { status: string; attempts: number }
    assert.equal(row.status, 'failed', 'failed outright rather than queued for another go')
  })

  it('fails a job whose task nothing recognises rather than leaving it queued forever', async () => {
    enqueue({ actorId: TEST_OPERATOR, db, propertyId: PROPERTY, visitId: VISIT, task: 'nameplate_smell', targetKind: 'media', targetId: 'plate-a' })
    const result = await drainVisit(db, VISIT, { deps: deps({}) })

    assert.equal(result.failed, 1)
    const row = db.prepare(`SELECT status FROM ai_jobs WHERE task = 'nameplate_smell'`).get() as { status: string }
    assert.equal(row.status, 'failed')
  })

  it('stops after the limit with the rest still owed', async () => {
    addPin('pin-2', 2, 'electrical-panel')
    addMedia('plate-b', { pin: 'pin-2' })
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)

    const result = await drainVisit(db, VISIT, {
      limit: 1,
      deps: deps({ nameplate_classify: YES, nameplate_extract: A_PLATE }),
    })
    assert.equal(result.stopped, 'limit')
    assert.ok(queueProgress(db, VISIT).queued > 0)
  })
})

// ------------------------------------------------------------ the read model

describe('what the screen is given', () => {
  beforeEach(() => {
    seed()
    addPin('pin-1', 1, 'water-heater')
    addMedia('plate-a', { pin: 'pin-1' })
  })

  it('offers a reading as a proposal, with the model and prompt it came from', async () => {
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    await drainVisit(db, VISIT, { deps: deps({ nameplate_classify: YES, nameplate_extract: A_PLATE }) })

    const model = buildAssists(db, VISIT)
    assert.equal(model.nameplates.length, 1)
    const n = model.nameplates[0]!
    assert.equal(n.pinId, 'pin-1', 'the reading belongs to the pin, not to the image')
    assert.equal(n.fields.find((f) => f.field === 'make')?.value, 'Rheem')
    assert.equal(n.fields.find((f) => f.field === 'installDate')?.value, null, 'unknown is null, not the word')
    assert.equal(n.abstained, false)
    assert.equal(n.provenance?.model, MODEL.id)
    assert.ok(n.provenance?.promptVersion, 'the prompt version travels with it')
  })

  /**
   * A classification is the gate, never a value. Nobody accepts one, so putting
   * it in front of a person as a proposal would be a question with no answer.
   */
  it('keeps classifications out of the proposal list and beside the reading instead', async () => {
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    await drainVisit(db, VISIT, { deps: deps({ nameplate_classify: YES, nameplate_extract: A_PLATE }) })

    const model = buildAssists(db, VISIT)
    assert.equal(model.nameplates[0]?.classifiedAs?.isNameplate, 'yes')
    assert.ok(
      pendingProposals(db, VISIT).some((p) => p.task === 'nameplate_classify'),
      'the classification is still on the record',
    )
    assert.equal(model.notRead.length, 0)
  })

  /** §11: the non-nameplate is not extracted at all — and that is SAID. */
  it('names the photographs it deliberately did not read', async () => {
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    await drainVisit(db, VISIT, { deps: deps({ nameplate_classify: NO }) })

    const model = buildAssists(db, VISIT)
    assert.equal(model.nameplates.length, 0, 'nothing was read off it')
    assert.equal(model.notRead.length, 1)
    assert.equal(model.notRead[0]?.mediaId, 'plate-a')
    assert.match(model.notRead[0]!.classifiedAs.reason, /no plate/)
  })

  it('marks a whole-plate abstention as an abstention, not as an empty reading', async () => {
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    await drainVisit(db, VISIT, {
      deps: deps({
        nameplate_classify: YES,
        nameplate_extract: {
          fields: { make: 'unknown', model: 'unknown', serial: 'unknown', capacity: 'unknown', installDate: 'unknown' },
          legible: false,
          notes: 'The plate is there but the lettering has worn away.',
          uncertain: {
            serial: {
              partial: 'Q1373_5_9', obscured: 'the third and seventh characters are under glare',
              lookElsewhere: 'there may be a barcode below the plate', alternatives: [],
            },
          },
        },
      }),
    })

    const model = buildAssists(db, VISIT)
    const n = model.nameplates[0]!
    assert.equal(n.abstained, true)
    assert.equal(n.legible, false)
    assert.equal(n.fields.every((f) => f.value === null), true, 'no field carries a guess')

    // CLAUDE.md §9: the record abstains, the prompt does not. The person is
    // told what was visible; nothing false enters the data.
    const serial = n.fields.find((f) => f.field === 'serial')!
    assert.equal(serial.value, null)
    assert.equal(serial.uncertain?.partial, 'Q1373_5_9')
  })

  it('keeps a suggestion for a pin somebody has already typed, but marks it answered', async () => {
    addPin('pin-2', 2)
    addMedia('shot', { pin: 'pin-2' })
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    await drainVisit(db, VISIT, {
      deps: deps({
        nameplate_classify: NO,
        pin_type: {
          candidates: [{ type: 'water-softener', confidence: 'likely', why: 'a brine tank beside a cylinder' }],
          shows: 'a squat tank', unsure: '',
        },
      }),
    })

    assert.equal(buildAssists(db, VISIT).types[0]?.alreadyAnswered, false)

    // The concierge types it by hand afterwards.
    const gen = pendingProposals(db, VISIT).find((p) => p.task === 'pin_type')!
    void gen
    db.prepare(
      `INSERT INTO overlays (id, property_id, visit_id, seq, kind, target_kind, target_id, field,
                             prior_value, new_value, actor, actor_context, actor_id, created_at)
       VALUES (?, ?, ?, 999, 'correct', 'pin', 'pin-2', 'type', NULL, ?, 'concierge', 'desk', ?, ?)`,
    ).run(newId(), PROPERTY, VISIT, JSON.stringify({ kind: 'component', componentType: 'sump-pump' }),
          TEST_OPERATOR, now())

    const after = buildAssists(db, VISIT)
    assert.equal(after.types[0]?.alreadyAnswered, true, 'quiet, but never dropped')
  })

  /**
   * Doctrine 6, on the case that actually happens.
   *
   * On the reference export 32 of 34 jobs skip, and 28 of those skip because
   * the photograph is not on this machine. "32 needed nothing" would report an
   * import worth chasing as a feature working quietly.
   */
  it('says why every skipped job was skipped, grouped and counted', async () => {
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    await drainVisit(db, VISIT, { deps: deps({ nameplate_classify: NO }) })

    const { queue } = buildAssists(db, VISIT)
    assert.ok(queue.skipped > 0)
    assert.equal(
      queue.skips.reduce((n, s) => n + s.n, 0),
      queue.skipped,
      'every skipped job is accounted for in the reasons',
    )
    assert.ok(queue.skips.every((s) => s.reason && s.reason !== 'no reason recorded'))
    assert.match(queue.skips[0]!.reason, /not a nameplate/)
  })

  /**
   * **These two describe the UNCONFIGURED machine, so they have to own the
   * environment rather than inherit it.**
   *
   * Both read ambient `process.env`, and the old comment here said *"the suite
   * runs with no key and no pinned model"* — an assumption, not a fact. Anyone
   * following the runner brief's §2 sets those variables, and then a sound repo
   * reports **992/994**. That happened on 2026-08-09 and cost the runner a
   * diagnosis before they could start.
   *
   * **A test that a correctly-configured machine cannot pass is worse than a
   * missing test**, because it teaches people that red is normal here. Second
   * instance of this class after `operators.test.ts`; the fix is the same, and
   * the sweep is why it is written out rather than just applied.
   */
  describe('the unconfigured machine', () => {
    const VARS = [
      'HOUSESTEADY_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY',
      'HOUSESTEADY_MODEL_FAST', 'HOUSESTEADY_MODEL_STRONG',
      'HOUSESTEADY_FAST_INPUT_PER_MTOK', 'HOUSESTEADY_FAST_OUTPUT_PER_MTOK',
      'HOUSESTEADY_STRONG_INPUT_PER_MTOK', 'HOUSESTEADY_STRONG_OUTPUT_PER_MTOK',
    ]
    let saved: Record<string, string | undefined> = {}
    beforeEach(() => {
      saved = Object.fromEntries(VARS.map((v) => [v, process.env[v]]))
      for (const v of VARS) delete process.env[v]
    })
    afterEach(() => {
      for (const v of VARS) {
        if (saved[v] === undefined) delete process.env[v]
        else process.env[v] = saved[v]!
      }
    })

    it('says why nothing can run, before anybody presses anything', () => {
      const model = buildAssists(db, VISIT)
      assert.ok(model.blocked, 'there is a sentence for it')
      assert.match(model.blocked!, /waiting rather than running/)
    })

    it('reports cost as unknown rather than as zero when no rates are configured', () => {
      const model = buildAssists(db, VISIT)
      assert.equal(model.spend.ratesKnown, false, 'an unmeasured cost and a zero cost are different facts')
    })

    it('and is NOT blocked once a key and a model are set — so the clearing above is load-bearing', () => {
      // Rule 11b. Without this, the clearing could be deleted and both tests
      // above would still pass on an unconfigured machine.
      process.env.HOUSESTEADY_ANTHROPIC_API_KEY = 'sk-ant-test'
      process.env.HOUSESTEADY_MODEL_FAST = 'a-model'
      process.env.HOUSESTEADY_FAST_INPUT_PER_MTOK = '1'
      const model = buildAssists(db, VISIT)
      assert.equal(model.blocked, null, 'a configured machine has nothing to explain')
      assert.equal(model.spend.ratesKnown, true)
    })
  })
})

// ---------------------------------------------------------- accepting a plate

describe('accepting a whole reading', () => {
  beforeEach(async () => {
    seed()
    addPin('pin-1', 1, 'water-heater')
    addMedia('plate-a', { pin: 'pin-1' })
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    await drainVisit(db, VISIT, { deps: deps({ nameplate_classify: YES, nameplate_extract: A_PLATE }) })
  })

  const reading = () => buildAssists(db, VISIT).nameplates[0]!

  /**
   * One photograph, one signature. CLAUDE.md §6: signing means *I observed this
   * and this description matches what I saw* — one claim about one plate, not
   * five claims a person is asked for five times.
   */
  it('writes every field in one act and settles the proposal once', () => {
    const n = reading()
    const result = acceptReading({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: n.generationId,
      targetKind: 'pin', targetId: 'pin-1',
      values: { make: 'Rheem', model: 'XE50M06ST45U1', serial: 'Q1373750159', capacity: '189 L' },
    })

    assert.equal(result.overlays.length, 4)
    assert.equal(result.decision, 'accepted', 'every field went in exactly as proposed')
    assert.equal(findGeneration(db, n.generationId)?.human_decision, 'accepted')
    assert.equal(buildAssists(db, VISIT).nameplates.length, 0, 'it is no longer waiting on anybody')
  })

  /**
   * The accuracy record has to mean the plate, not four fifths of it. A single
   * corrected character makes the whole reading an edit.
   */
  it('calls the whole reading edited when one character changed', () => {
    const n = reading()
    const result = acceptReading({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: n.generationId,
      targetKind: 'pin', targetId: 'pin-1',
      values: { make: 'Rheem', serial: 'Q1373750158' },
    })

    assert.equal(result.decision, 'edited')
    const serial = result.overlays.find((o) => o.field === 'serial')!
    assert.equal(serial.priorValue, 'Q1373750159', 'what the model proposed')
    assert.equal(serial.newValue, 'Q1373750158', 'what the human accepted')
  })

  it('leaves a field the concierge did not touch entirely unwritten', () => {
    const n = reading()
    acceptReading({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: n.generationId,
      targetKind: 'pin', targetId: 'pin-1', values: { make: 'Rheem' },
    })
    const rows = db
      .prepare(`SELECT field FROM overlays WHERE visit_id = ? AND kind = 'accept'`)
      .all(VISIT) as { field: string }[]
    assert.deepEqual(rows.map((r) => r.field), ['make'], 'an explicit unknown stays unknown')
  })

  /**
   * The pin-type path takes the same route as a plate — one value, one field —
   * so the "accepted vs edited" arithmetic has to work on a structured value
   * and not only on a string. A concierge picking the second candidate is an
   * edit, and that is the whole signal the golden set reads.
   */
  it('tells picking the lead candidate apart from picking a lower one', async () => {
    addPin('pin-9', 9)
    addMedia('shot-9', { pin: 'pin-9' })
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    await drainVisit(db, VISIT, {
      deps: deps({
        nameplate_classify: NO,
        pin_type: {
          candidates: [
            { type: 'water-heater', confidence: 'certain', why: 'a flue and a drain valve' },
            { type: 'water-softener', confidence: 'possible', why: 'a brine tank looks similar' },
          ],
          shows: 'a tall cylinder', unsure: '',
        },
      }),
    })

    const t = buildAssists(db, VISIT).types.find((x) => x.pinId === 'pin-9')!
    const lower = acceptReading({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: t.generationId,
      targetKind: 'pin', targetId: 'pin-9',
      values: { type: { kind: 'component', componentType: 'water-softener', freeformLabel: null } },
    })
    assert.equal(lower.decision, 'edited', 'the model was not wrong, but it was not leading with the answer')
    assert.deepEqual(
      (lower.overlay.priorValue as { componentType: string }).componentType,
      'water-heater',
      'what the model led with is on the act itself',
    )
  })

  it('refuses an acceptance with nothing in it', () => {
    const n = reading()
    assert.throws(
      () =>
        acceptReading({ actorId: TEST_OPERATOR,
          db, propertyId: PROPERTY, visitId: VISIT, generationId: n.generationId,
          targetKind: 'pin', targetId: 'pin-1', values: {},
        }),
      OverlayRefused,
    )
  })
})
