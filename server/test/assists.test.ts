/**
 * The two ranked-candidate assists: loose-photo routing and pin-type suggestion.
 *
 * Every model call here is a stub, for the same reason the nameplate suite stubs
 * them — §10 requires the pass to be fully usable with no API key, and a suite
 * that needed one would stop being runnable.
 *
 * The cases that matter most are the quiet ones. Six identical receptacles in
 * one room is not a contrived edge: it is the real reference visit, and a design
 * that answers it confidently is a design that files a photograph of one outlet
 * against another. Several tests below exist only to hold that silence in place.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { newId, now, openDb, type Db } from '../src/db/index.js'
import { loadPrompts, promptsRoot, currentPrompt } from '../src/ai/prompts.js'
import type { ModelConfig } from '../src/ai/models.js'
import type { RunArgs } from '../src/ai/client.js'
import { claimNext, queueProgress } from '../src/ai/queue.js'
import { acceptProposal, acceptRoute, findGeneration, pendingProposals, withdrawAcceptance } from '../src/ai/accept.js'
import { OverlayRefused, readVisitOverlays, writeOverlay } from '../src/overlay/store.js'
import { resolveState, entityKey } from '../src/overlay/model.js'
import {
  candidateFacts, candidatePins, loosePhotos, normalise, queuePhotoRouting, ROUTE_SCHEMA,
  ROUTING_TASK, routingBar, routingBatch, runRoute, speaks,
  type CandidatePin, type Routing, type RoutingDeps, type StoredRouting,
} from '../src/ai/tasks/routing.js'
import {
  normaliseType, PIN_TYPE_TASK, queuePinTypes, runPinType, TYPE_SCHEMA, typelessPins,
  type PinTypeDeps, type TypeSuggestion,
} from '../src/ai/tasks/pinType.js'
import { queueAssists, runnerFor, UnknownTask } from '../src/ai/tasks/index.js'
import {
  compareRoute, compareRoutes, contested, currentRoute, isRatified, NOTHING, offeredPins,
  summariseRoutes, type ExpectedRoute,
} from '../src/ai/golden-routing.js'
import { repoRoot } from './helpers.js'

const FIXTURE = join(repoRoot, 'fixtures', 'nameplates', 'images', 'IMG_0004.jpeg')

const MODEL: ModelConfig = {
  tier: 'fast', id: 'a-pinned-fast-model', inputPerMTok: 1, outputPerMTok: 5, maxImageEdge: 1568,
}

let db: Db
const PROPERTY = 'prop-1'
const VISIT = 'visit-1'
let importId: string

/** The component types the config declares for this import. Read, never assumed. */
const TYPES = ['water-heater', 'water-softener', 'electrical-panel', 'smoke-alarm', 'sump-pump']

function seed(types: string[] = TYPES): void {
  db = openDb(':memory:')
  db.prepare(`INSERT INTO properties (id, label, created_at) VALUES (?, 'A house', ?)`).run(PROPERTY, now())
  db.prepare(`INSERT INTO visits (id, property_id, kind, created_at) VALUES (?, ?, 'baseline', ?)`)
    .run(VISIT, PROPERTY, now())
  importId = newId()
  db.prepare(
    `INSERT INTO imports (id, visit_id, property_id, imported_at, media_mode, raw_manifest,
                          validation_report, status, created_at)
     VALUES (?, ?, ?, ?, 'manifest_only', '{}', '{}', 'ok', ?)`,
  ).run(importId, VISIT, PROPERTY, now(), now())
  db.prepare(
    `INSERT INTO config_snapshots (import_id, config_id, config_version, config_hash, snapshot, created_at)
     VALUES (?, 'cfg', 'v1.5.1', 'hash', ?, ?)`,
  ).run(importId, JSON.stringify({ componentLists: [{ types, items: [] }], naReasons: [] }), now())
  db.prepare(
    `INSERT INTO zones (zone_id, import_id, property_id, visit_id, label, created_at)
     VALUES ('zone-1', ?, ?, ?, 'Utility room', ?)`,
  ).run(importId, PROPERTY, VISIT, now())
}

interface PinSpec {
  id: string
  number: number
  componentType?: string
  freeform?: string
  retired?: boolean
  zone?: string
}

function addPin(p: PinSpec): void {
  const kind = p.componentType ? 'component' : p.freeform ? 'freeform' : null
  db.prepare(
    `INSERT INTO pins (pin_id, import_id, property_id, visit_id, number, zone_id, type_kind,
                       component_type, freeform_label, retired_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    p.id, importId, PROPERTY, VISIT, p.number, p.zone ?? 'zone-1', kind,
    p.componentType ?? null, p.freeform ?? null, p.retired ? now() : null, now(),
  )
}

function addMedia(
  mediaId: string,
  owner: { pin?: string; zone?: string; inbox?: boolean; groupKey?: string; status?: string },
): void {
  const kind = owner.inbox ? 'inbox' : owner.pin ? 'pin' : 'zone'
  db.prepare(
    `INSERT INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind, owner_pin_id,
                        owner_zone_id, group_key, file, file_status, created_at)
     VALUES (?, ?, ?, ?, 'photo', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    mediaId, importId, PROPERTY, VISIT, kind,
    owner.pin ?? null, owner.inbox ? null : (owner.zone ?? null), owner.groupKey ?? null,
    `${mediaId}.jpg`, owner.status ?? 'present', now(),
  )
}

function addNote(targetId: string, text: string): void {
  db.prepare(
    `INSERT INTO notes (note_id, import_id, target_kind, target_id, text, at, created_at)
     VALUES (?, ?, 'pin', ?, ?, ?, ?)`,
  ).run(newId(), importId, targetId, text, now(), now())
}

/** A stub model. Records what it was asked, answers what the test dictates. */
function stub(answers: unknown[]): RoutingDeps & PinTypeDeps & { asked: RunArgs[] } {
  const asked: RunArgs[] = []
  let i = 0
  return {
    asked,
    prompts: loadPrompts(promptsRoot),
    model: MODEL,
    resolvePath: () => FIXTURE,
    run: async <T,>(args: RunArgs) => {
      asked.push(args)
      return { output: answers[i++] as T, inputTokens: 1200, outputTokens: 40 }
    },
  }
}

/**
 * Claim one specific job, leaving the rest of the queue as it was.
 *
 * `claimNext` takes no argument by design — a worker takes whatever is next —
 * so finding a particular job means claiming past the others. Those have to go
 * back: a job claimed and abandoned sits `running` with a live lease, and the
 * next claim in the same test cannot see it until the lease expires.
 *
 * That is what made this suite flaky. Two jobs enqueued in the same millisecond
 * tie on `created_at` and fall back to a random uuid, so which one this loop met
 * first varied run to run — and any test claiming two jobs from one visit failed
 * about half the time. The attempt count is rolled back too, or a job would
 * carry attempts it never made.
 */
const claim = (task: string, targetId: string) => {
  const passedOver: string[] = []
  let job = claimNext(db, VISIT)
  while (job && !(job.task === task && job.target_id === targetId)) {
    passedOver.push(job.id)
    job = claimNext(db, VISIT)
  }
  for (const id of passedOver) {
    db.prepare(
      `UPDATE ai_jobs SET status = 'queued', leased_at = NULL, attempts = attempts - 1 WHERE id = ?`,
    ).run(id)
  }
  assert.ok(job, `expected a queued ${task} job for ${targetId}`)
  return job
}

const generationOf = (jobId: string) => {
  const row = db.prepare('SELECT generation_id FROM ai_jobs WHERE id = ?').get(jobId) as
    | { generation_id: string | null }
    | undefined
  return row?.generation_id ? findGeneration(db, row.generation_id) : undefined
}

const route = (candidates: Routing['candidates'], extra: Partial<Routing> = {}): Routing => ({
  candidates, shows: 'a white cylindrical tank with a control head on top', ...extra,
})

const suggestion = (candidates: TypeSuggestion['candidates'], extra: Partial<TypeSuggestion> = {}): TypeSuggestion => ({
  candidates, shows: 'a white cylindrical tank with a control head on top', ...extra,
})

// ---------------------------------------------------------------- the prompts

describe('the prompt library on disk', () => {
  it('carries a loadable prompt for each new task', () => {
    const library = loadPrompts(promptsRoot)
    for (const task of [ROUTING_TASK, PIN_TYPE_TASK]) {
      const p = currentPrompt(library, task)
      assert.equal(p.id, task)
      assert.match(p.version, /^v\d{3}$/)
      assert.ok(p.text.length > 200, 'a prompt this short would not be doing the job asked of it')
    }
  })

  it('tells routing that saying nothing is a complete answer', () => {
    // §1: "stay silent below a high confidence bar. Silence is a valid output
    // for the whole task." If a prompt edit ever drops this the feature starts
    // annotating 200 tiles with a guess, which is the failure the bar exists for.
    const text = currentPrompt(loadPrompts(promptsRoot), ROUTING_TASK).text.toLowerCase()
    assert.ok(text.includes('empty candidate list is a complete answer'))
    assert.ok(text.includes('never name a pin that is not in the list'))
    assert.ok(text.includes('the same kind of thing'), 'it must say alike pins cannot be told apart')
  })

  it('tells type suggestion that the list is the whole vocabulary', () => {
    const text = currentPrompt(loadPrompts(promptsRoot), PIN_TYPE_TASK).text.toLowerCase()
    assert.ok(text.includes('choose only from the types given to you'))
    assert.ok(text.includes('empty list is a correct answer'))
    assert.ok(
      text.includes('do not reach for the closest available word'),
      'the near-miss is the failure mode: wrong is worse than untyped because untyped looks unfinished',
    )
  })

  it('keeps both prompts on the identification side of the line', () => {
    // CLAUDE.md §6. Every prompt that describes a house must refuse assessment
    // explicitly — a prompt that merely omits it will produce one the first time
    // a photograph shows something alarming.
    for (const task of [ROUTING_TASK, PIN_TYPE_TASK]) {
      const text = currentPrompt(loadPrompts(promptsRoot), task).text.toLowerCase()
      assert.ok(text.includes('condition') && text.includes('safe'), `${task} must forbid assessment by name`)
      assert.ok(text.includes('specialist'), `${task} must name where a judgement actually belongs`)
    }
  })
})

// ---------------------------------------------------------------- routing

describe('routing — what counts as a loose photo', () => {
  beforeEach(() => seed())

  it('takes zone-owned photos and leaves pin-attached ones alone', () => {
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addMedia('room-a', { zone: 'zone-1' })
    addMedia('room-b', { zone: 'zone-1' })
    addMedia('on-the-pin', { pin: 'pin-1' })

    assert.deepEqual(loosePhotos(db, VISIT).map((p) => p.mediaId), ['room-a', 'room-b'])
    assert.equal(queuePhotoRouting(db, PROPERTY, VISIT), 2)
  })

  it('takes an inbox photo whose grouping key names a real room', () => {
    // The needier case, and the owner's call to include it. A room photo is
    // already filed somewhere true; an inbox photo is filed nowhere at all.
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addMedia('room-a', { zone: 'zone-1' })
    addMedia('inbox-a', { inbox: true, groupKey: 'zone-1' })

    assert.deepEqual(loosePhotos(db, VISIT), [
      { mediaId: 'inbox-a', zoneId: 'zone-1', origin: 'inbox' },
      { mediaId: 'room-a', zoneId: 'zone-1', origin: 'room' },
    ])
  })

  it('leaves an inbox photo whose grouping key names nothing', () => {
    // The reference export's single inbox photo carries no key at all. A room
    // guessed from a photograph would be the builder deciding which room
    // somebody stood in, which is a fabrication with a plausible face on it.
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addMedia('inbox-none', { inbox: true })
    addMedia('inbox-bogus', { inbox: true, groupKey: 'a-room-that-does-not-exist' })

    assert.deepEqual(loosePhotos(db, VISIT), [])
  })

  it('skips a queued inbox photo whose room stopped resolving, saying which', async () => {
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addMedia('inbox-a', { inbox: true, groupKey: 'zone-1' })
    queuePhotoRouting(db, PROPERTY, VISIT)
    // The zone goes away — a re-import that dropped it. The job is already queued.
    db.prepare('DELETE FROM zones WHERE zone_id = ?').run('zone-1')

    const deps = stub([])
    const job = claim(ROUTING_TASK, 'inbox-a')
    assert.equal(await runRoute(db, job, deps), null)
    assert.equal(deps.asked.length, 0)
    const row = db.prepare('SELECT last_error FROM ai_jobs WHERE id = ?').get(job.id) as { last_error: string }
    assert.match(row.last_error, /in the inbox with no grouping key naming a room/)
  })

  it('tells the model when the room is a guess rather than a fact', async () => {
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addMedia('room-a', { zone: 'zone-1' })
    addMedia('inbox-a', { inbox: true, groupKey: 'zone-1' })
    queuePhotoRouting(db, PROPERTY, VISIT)

    const answer = route([{ pin: 1, confidence: 'certain', why: 'the only water heater' }])
    const roomDeps = stub([answer])
    await runRoute(db, claim(ROUTING_TASK, 'room-a'), roomDeps)
    assert.doesNotMatch(roomDeps.asked[0]!.facts!, /may be wrong/)

    const inboxDeps = stub([answer])
    await runRoute(db, claim(ROUTING_TASK, 'inbox-a'), inboxDeps)
    assert.match(inboxDeps.asked[0]!.facts!, /not filed against a room at all/)
    assert.match(inboxDeps.asked[0]!.facts!, /may be wrong/)
  })

  it('offers live pins as candidates and never retired ones', () => {
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addPin({ id: 'pin-2', number: 2, freeform: 'Receptacle', retired: true })
    addPin({ id: 'pin-3', number: 3 })

    const pins = candidatePins(db, VISIT, 'zone-1')
    assert.deepEqual(pins.map((p) => p.pinId), ['pin-1', 'pin-3'])
  })

  it('describes a never-typed pin honestly rather than omitting it', () => {
    // Leaving it out would remove the right answer from the list, and a right
    // answer missing turns a harmless silence into a confident wrong attachment
    // somewhere else.
    addPin({ id: 'pin-1', number: 1 })
    addNote('pin-1', 'No power')
    const facts = candidateFacts(candidatePins(db, VISIT, 'zone-1'))
    assert.match(facts, /never typed/)
    assert.match(facts, /No power/, 'the field note is part of what the model is shown')
  })

  it('names no pin by its uuid anywhere in what the model is shown', () => {
    // The number is session-scoped display and the uuid is a join key; the model
    // answers with a position in the list and this file resolves it. A uuid in
    // the request is a uuid the model can transcribe wrong.
    addPin({ id: '019f9a34-e419-7cba-9b86-201ae6282468', number: 1, componentType: 'water-heater' })
    const facts = candidateFacts(candidatePins(db, VISIT, 'zone-1'))
    assert.ok(!facts.includes('019f9a34-e419-7cba-9b86-201ae6282468'))
    assert.match(facts, /1\. water-heater/)
  })
})

describe('routing — the six receptacles', () => {
  beforeEach(() => seed())

  it('stays silent when several pins are the same kind of thing', async () => {
    // The reference visit, exactly: six pins in one room all labelled
    // "Receptacle". No list of words can separate them, so the honest answer is
    // a ranked list of maybes and no interruption.
    for (let n = 1; n <= 6; n++) addPin({ id: `pin-${n}`, number: n, freeform: 'Receptacle' })
    addMedia('room-a', { zone: 'zone-1' })
    queuePhotoRouting(db, PROPERTY, VISIT)

    const deps = stub([
      route(
        [
          { pin: 1, confidence: 'possible', why: 'a receptacle, and six of these are alike' },
          { pin: 3, confidence: 'possible', why: 'also a receptacle on the same wall' },
        ],
        { shows: 'a duplex receptacle in a painted wall', unsure: 'the wider shot showing the doorway would settle it' },
      ),
    ])
    const stored = (await runRoute(db, claim(ROUTING_TASK, 'room-a'), deps))!

    assert.equal(speaks(stored, 'certain'), false, 'nothing above possible must never interrupt anyone')
    assert.equal(stored.unsure, 'the wider shot showing the doorway would settle it')
    // Stored anyway. The bar is a read-time decision and the record of what the
    // model led with is not.
    assert.deepEqual(stored.proposed, { toKind: 'pin', toId: 'pin-1' })
  })

  it('speaks when one pin plainly fits', async () => {
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addPin({ id: 'pin-2', number: 2, componentType: 'electrical-panel' })
    addMedia('room-a', { zone: 'zone-1' })
    queuePhotoRouting(db, PROPERTY, VISIT)

    const deps = stub([route([{ pin: 1, confidence: 'certain', why: 'the only water heater in the room' }])])
    const stored = (await runRoute(db, claim(ROUTING_TASK, 'room-a'), deps))!

    assert.equal(speaks(stored, 'certain'), true)
    assert.equal(stored.candidates[0]!.pinId, 'pin-1')
    assert.equal(stored.candidates[0]!.label, 'water-heater')
  })
})

describe('routing — silence, skipping, and never dropping anything', () => {
  beforeEach(() => seed())

  it('records an empty answer as an abstention rather than an error', async () => {
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addMedia('room-a', { zone: 'zone-1' })
    queuePhotoRouting(db, PROPERTY, VISIT)

    const job = claim(ROUTING_TASK, 'room-a')
    const stored = (await runRoute(db, job, stub([route([], { shows: 'a bare corner of a basement floor' })])))!

    assert.deepEqual(stored.candidates, [])
    assert.equal(stored.proposed, null)
    assert.equal(generationOf(job.id)!.abstained, 1)
    assert.equal(queueProgress(db, VISIT).done, 1, 'a complete answer, not a failure')
  })

  it('skips a room with no pins, with the reason on the row and no model call', async () => {
    addMedia('room-a', { zone: 'zone-1' })
    queuePhotoRouting(db, PROPERTY, VISIT)

    const deps = stub([])
    const job = claim(ROUTING_TASK, 'room-a')
    assert.equal(await runRoute(db, job, deps), null)

    assert.equal(deps.asked.length, 0, 'nothing to rank means nothing to pay for')
    const row = db.prepare('SELECT status, last_error FROM ai_jobs WHERE id = ?').get(job.id) as
      { status: string; last_error: string }
    assert.equal(row.status, 'skipped')
    assert.match(row.last_error, /no pins in this room/)
  })

  it('keeps a candidate the list did not contain rather than dropping it', () => {
    // The schema bounds this, so it should be unreachable. Doctrine 6 says the
    // unreachable case still surfaces: a suggestion pointing at nothing is
    // exactly the kind of thing that would otherwise vanish.
    const pins: CandidatePin[] = [
      { pinId: 'pin-1', number: 1, typeKind: 'component', componentType: 'water-heater', freeformLabel: null, notes: [] },
    ]
    const stored = normalise(route([{ pin: 9, confidence: 'certain', why: 'off the end' }]), pins)
    assert.deepEqual(stored.candidates, [])
    assert.deepEqual(stored.outOfRange, [9])
    assert.equal(stored.proposed, null)
  })

  it('queues a photo whose bytes never arrived, then skips it saying so', async () => {
    // A manifest-only import — which is what the reference export is — has a row
    // for every photograph and bytes for none of them. Filtering those out at
    // queue time would make the difference between "28 photos" and "22 routed" a
    // gap between two numbers nobody compares. A row with a reason is findable.
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addMedia('room-a', { zone: 'zone-1', status: 'absent' })
    assert.equal(queuePhotoRouting(db, PROPERTY, VISIT), 1)

    const deps = stub([])
    const job = claim(ROUTING_TASK, 'room-a')
    assert.equal(await runRoute(db, job, deps), null)
    assert.equal(deps.asked.length, 0)
    const row = db.prepare('SELECT status, last_error FROM ai_jobs WHERE id = ?').get(job.id) as
      { status: string; last_error: string }
    assert.equal(row.status, 'skipped')
    assert.match(row.last_error, /not on this machine \(absent\)/)
  })

  it('bounds the answer to the pins actually in the room', () => {
    const schema = ROUTE_SCHEMA(3) as {
      properties: { candidates: { items: { properties: { pin: { minimum: number; maximum: number } } } } }
    }
    assert.equal(schema.properties.candidates.items.properties.pin.minimum, 1)
    assert.equal(schema.properties.candidates.items.properties.pin.maximum, 3)
  })
})

describe('uncertainty is reported only where uncertainty exists', () => {
  const pins: CandidatePin[] = [
    { pinId: 'pin-1', number: 1, typeKind: 'component', componentType: 'water-heater', freeformLabel: null, notes: [] },
  ]

  it('drops the hedge beside a certain answer', () => {
    // A hedge printed next to a confident value teaches people to weigh the
    // hedge against the reading, and that erodes trust in every confident value
    // on the screen. Same rule the nameplate extraction follows per field.
    const stored = normalise(
      route([{ pin: 1, confidence: 'certain', why: 'the only one' }], { unsure: 'though the label is turned away' }),
      pins,
    )
    assert.equal(stored.unsure, undefined)
  })

  it('keeps it when nothing is certain', () => {
    const stored = normalise(
      route([{ pin: 1, confidence: 'likely', why: 'fits best' }], { unsure: 'the wider shot would settle it' }),
      pins,
    )
    assert.equal(stored.unsure, 'the wider shot would settle it')
  })

  it('keeps it when nothing was offered at all', () => {
    // The record abstains; the prompt does not. CLAUDE.md §9 — never summon a
    // human to a blank space, and an empty candidate list is the blankest space
    // this task can produce.
    const stored = normalise(route([], { unsure: 'nothing in this room looks like what is in the picture' }), pins)
    assert.equal(stored.unsure, 'nothing in this room looks like what is in the picture')
  })

  it('drops an empty note rather than storing a blank one', () => {
    const stored = normalise(route([{ pin: 1, confidence: 'possible', why: 'maybe' }], { unsure: '   ' }), pins)
    assert.equal(stored.unsure, undefined)
  })

  it('applies the same rule to a type suggestion', () => {
    const certain = normaliseType(
      suggestion([{ type: 'water-heater', confidence: 'certain', why: 'the drain valve and the flue' }], {
        unsure: 'though the plate is turned away',
      }),
      TYPES,
    )
    assert.equal(certain.unsure, undefined)

    const unsure = normaliseType(
      suggestion([{ type: 'water-heater', confidence: 'likely', why: 'looks like one' }], {
        unsure: 'the plate on the side would name it',
      }),
      TYPES,
    )
    assert.equal(unsure.unsure, 'the plate on the side would name it')
  })
})

describe('the batch a person is actually shown', () => {
  const stored = (confidence: string, pinId = 'pin-1'): StoredRouting => ({
    candidates: [{ pinId, number: 1, label: 'water-heater', confidence: confidence as 'certain', why: 'because' }],
    shows: 'a tank',
    origin: 'room',
    proposed: { toKind: 'pin', toId: pinId },
  })

  const proposals = [
    { generationId: 'g1', task: ROUTING_TASK, targetId: 'a', output: stored('certain') },
    { generationId: 'g2', task: ROUTING_TASK, targetId: 'b', output: stored('likely') },
    { generationId: 'g3', task: ROUTING_TASK, targetId: 'c', output: stored('possible') },
    { generationId: 'g4', task: ROUTING_TASK, targetId: 'd', output: { candidates: [], shows: 'a floor', proposed: null } },
    { generationId: 'g5', task: 'nameplate_extract', targetId: 'e', output: {} },
  ]

  it('shows only what clears the bar and counts everything that did not', () => {
    const batch = routingBatch(proposals, 'certain')
    assert.deepEqual(batch.suggestions.map((s) => s.generationId), ['g1'])
    assert.equal(batch.belowBar, 2)
    assert.equal(batch.silent, 1)
    assert.equal(batch.bar, 'certain')
  })

  it('moves with the bar without anything being re-run', () => {
    // The whole reason every candidate is stored: re-running a visit costs real
    // money, and a bar chosen before anyone has seen a real baseline is a guess.
    const batch = routingBatch(proposals, 'likely')
    assert.deepEqual(batch.suggestions.map((s) => s.generationId), ['g1', 'g2'])
    assert.equal(batch.belowBar, 1)
  })

  it('leaves other tasks alone', () => {
    assert.equal(routingBatch(proposals, 'possible').suggestions.length, 3)
  })

  it('hands over the weaker candidates too, once it has decided to interrupt', () => {
    // CLAUDE.md §9: the bar decides whether to summon; it does not decide what
    // somebody is handed once summoned. A single confident line with the
    // alternatives hidden is the framing that makes acceptance the default.
    const two: StoredRouting = {
      candidates: [
        { pinId: 'pin-1', number: 1, label: 'water-heater', confidence: 'certain', why: 'the flue' },
        { pinId: 'pin-2', number: 2, label: 'boiler', confidence: 'possible', why: 'also a tank' },
      ],
      shows: 'a tank',
      origin: 'room',
      proposed: { toKind: 'pin', toId: 'pin-1' },
    }
    const batch = routingBatch([{ generationId: 'g', task: ROUTING_TASK, targetId: 'a', output: two }], 'certain')
    assert.equal(batch.suggestions[0]!.candidates.length, 2)
  })

  it('always offers an answer that is not a pin, and a second one for the inbox', () => {
    // CLAUDE.md §9's second guard, and the condition the owner put on extending
    // to the inbox. For a room photo the room is a fact and the only non-answer
    // is "not one of these pins". For an inbox photo the room came from a
    // grouping key that can be wrong, so "not this room at all" is a separate
    // and equally real answer — and without it the only way to say so would be
    // the option that blames the pins, filing a true statement about the wrong
    // thing.
    const inbox: StoredRouting = { ...stored('certain'), origin: 'inbox' }
    const batch = routingBatch(
      [
        { generationId: 'g1', task: ROUTING_TASK, targetId: 'a', output: stored('certain') },
        { generationId: 'g2', task: ROUTING_TASK, targetId: 'b', output: inbox },
      ],
      'certain',
    )
    assert.deepEqual(batch.suggestions[0]!.dismissals, ['none-of-these'])
    assert.deepEqual(batch.suggestions[1]!.dismissals, ['none-of-these', 'belongs-elsewhere'])
    for (const s of batch.suggestions) {
      assert.ok(s.dismissals.includes('none-of-these'), 'never absent, on any suggestion')
    }
  })

  it('carries where the photo came from, so the two land on different desks', () => {
    // Agreeing about a room photo moves it from the room to a pin; agreeing
    // about an inbox photo files something that was filed nowhere. Different
    // acts, and the screen needs to be able to tell them apart from the data.
    const batch = routingBatch(
      [
        { generationId: 'g1', task: ROUTING_TASK, targetId: 'a', output: stored('certain') },
        { generationId: 'g2', task: ROUTING_TASK, targetId: 'b', output: { ...stored('certain'), origin: 'inbox' } },
      ],
      'certain',
    )
    assert.deepEqual(batch.suggestions.map((s) => s.origin), ['room', 'inbox'])
  })

  it('refuses a bar it does not recognise', () => {
    const before = process.env.HOUSESTEADY_ROUTING_BAR
    process.env.HOUSESTEADY_ROUTING_BAR = 'quite-sure'
    try {
      assert.throws(() => routingBar(), /must be one of/)
    } finally {
      if (before === undefined) delete process.env.HOUSESTEADY_ROUTING_BAR
      else process.env.HOUSESTEADY_ROUTING_BAR = before
    }
  })

  it('defaults to the strictest level', () => {
    const before = process.env.HOUSESTEADY_ROUTING_BAR
    delete process.env.HOUSESTEADY_ROUTING_BAR
    try {
      assert.equal(routingBar(), 'certain')
    } finally {
      if (before !== undefined) process.env.HOUSESTEADY_ROUTING_BAR = before
    }
  })
})

// ------------------------------------------------- answering a routing suggestion

describe('answering a routing suggestion', () => {
  beforeEach(() => seed())

  async function propose(candidates: Routing['candidates']) {
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addPin({ id: 'pin-2', number: 2, componentType: 'water-softener' })
    addMedia('room-a', { zone: 'zone-1' })
    queuePhotoRouting(db, PROPERTY, VISIT)
    const job = claim(ROUTING_TASK, 'room-a')
    await runRoute(db, job, stub([route(candidates)]))
    return generationOf(job.id)!.id
  }

  it('attaches the photo as an ordinary assignment, carrying the proposal', async () => {
    const generationId = await propose([{ pin: 1, confidence: 'certain', why: 'the only water heater' }])
    const { overlay, decision } = acceptRoute({
      db, propertyId: PROPERTY, visitId: VISIT, generationId, mediaId: 'room-a', pinId: 'pin-1',
    })

    assert.equal(overlay.kind, 'assign', 'one fact, one kind — a photo on a pin is a photo on a pin')
    assert.equal(overlay.generationId, generationId)
    assert.deepEqual(overlay.newValue, { toKind: 'pin', toId: 'pin-1' })
    assert.deepEqual(overlay.priorValue, { toKind: 'pin', toId: 'pin-1' })
    assert.equal(decision, 'accepted')
    assert.equal(findGeneration(db, generationId)!.human_decision, 'accepted')
  })

  it('reads as edited when the concierge picks a different pin', async () => {
    const generationId = await propose([
      { pin: 1, confidence: 'certain', why: 'a tank' },
      { pin: 2, confidence: 'possible', why: 'also a tank' },
    ])
    const { overlay, decision } = acceptRoute({
      db, propertyId: PROPERTY, visitId: VISIT, generationId, mediaId: 'room-a', pinId: 'pin-2',
    })

    assert.equal(decision, 'edited')
    assert.deepEqual(overlay.priorValue, { toKind: 'pin', toId: 'pin-1' })
    assert.deepEqual(overlay.newValue, { toKind: 'pin', toId: 'pin-2' })
  })

  it('leaves a hand-made attachment with no proposal and no prior', () => {
    // The other route to the same fact — the pass's own attach path. It must not
    // start claiming a proposal it never answered, which would put a model in
    // the provenance of work a person did unaided.
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addMedia('room-a', { zone: 'zone-1' })

    const written = writeOverlay({
      db, propertyId: PROPERTY, visitId: VISIT, kind: 'assign', targetKind: 'media', targetId: 'room-a',
      newValue: { toKind: 'pin', toId: 'pin-1' },
    })
    assert.equal(written.generationId, null)
    assert.equal(written.priorValue, null)
  })

  it('refuses to attach anything on the strength of an abstention', async () => {
    const generationId = await propose([])
    assert.throws(
      () => acceptRoute({ db, propertyId: PROPERTY, visitId: VISIT, generationId, mediaId: 'room-a', pinId: 'pin-1' }),
      (e: unknown) => e instanceof OverlayRefused && e.code === 'overlay.accept-abstained',
    )
  })

  it('refuses a second answer to the same proposal', async () => {
    const generationId = await propose([{ pin: 1, confidence: 'certain', why: 'the only one' }])
    acceptRoute({ db, propertyId: PROPERTY, visitId: VISIT, generationId, mediaId: 'room-a', pinId: 'pin-1' })
    assert.throws(
      () => acceptRoute({ db, propertyId: PROPERTY, visitId: VISIT, generationId, mediaId: 'room-a', pinId: 'pin-2' }),
      (e: unknown) => e instanceof OverlayRefused && e.code === 'overlay.accept-already-decided',
    )
  })

  it('puts the proposal back in front of a person when the attachment is withdrawn', async () => {
    const generationId = await propose([{ pin: 1, confidence: 'certain', why: 'the only one' }])
    const { overlay } = acceptRoute({
      db, propertyId: PROPERTY, visitId: VISIT, generationId, mediaId: 'room-a', pinId: 'pin-1',
    })
    withdrawAcceptance(db, overlay.id, 'wrong outlet')

    assert.equal(findGeneration(db, generationId)!.human_decision, 'pending')
    const state = resolveState(readVisitOverlays(db, VISIT)).get(entityKey('media', 'room-a'))!
    assert.deepEqual(state.trail.map((t) => t.verb), ['assigned', 'unassigned'])
    assert.equal(state.assign, null, 'the photo is loose again, and the trail says how it got there')
    assert.equal(pendingProposals(db, VISIT).length, 1)
  })

})

// -------------------------------------------------------------- pin types

describe('pin-type suggestion', () => {
  beforeEach(() => seed())

  it('queues only pins that were never typed, and never retired ones', () => {
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addPin({ id: 'pin-2', number: 2 })
    addPin({ id: 'pin-3', number: 3, retired: true })
    addPin({ id: 'pin-4', number: 4, freeform: 'Receptacle' })

    assert.deepEqual(typelessPins(db, VISIT).map((p) => p.pinId), ['pin-2'])
    assert.equal(queuePinTypes(db, PROPERTY, VISIT), 1)
  })

  it('offers exactly the types this import declares, and nothing else', () => {
    const schema = TYPE_SCHEMA(TYPES) as {
      properties: { candidates: { items: { properties: { type: { enum: string[] } } } } }
    }
    assert.deepEqual(schema.properties.candidates.items.properties.type.enum, TYPES)
  })

  it('picks up a config that grew without a line changing here', async () => {
    // The field master went 48 types → 73 while this was being built. Nothing in
    // the builder knows the number.
    seed([...TYPES, 'heat-pump', 'backwater-valve'])
    addPin({ id: 'pin-2', number: 2 })
    addMedia('photo-1', { pin: 'pin-2' })
    queuePinTypes(db, PROPERTY, VISIT)

    const deps = stub([suggestion([{ type: 'heat-pump', confidence: 'certain', why: 'the outdoor unit' }])])
    const stored = (await runPinType(db, claim(PIN_TYPE_TASK, 'pin-2'), deps))!

    const schema = deps.asked[0]!.schema as {
      properties: { candidates: { items: { properties: { type: { enum: string[] } } } } }
    }
    assert.equal(schema.properties.candidates.items.properties.type.enum.length, 7)
    assert.equal(stored.candidates[0]!.type, 'heat-pump')
  })

  it('proposes the lead as the pin type an acceptance would set', async () => {
    addPin({ id: 'pin-2', number: 2 })
    addMedia('photo-1', { pin: 'pin-2' })
    queuePinTypes(db, PROPERTY, VISIT)

    const stored = (await runPinType(
      db,
      claim(PIN_TYPE_TASK, 'pin-2'),
      stub([suggestion([{ type: 'water-softener', confidence: 'likely', why: 'a brine tank beside it' }])]),
    ))!

    assert.deepEqual(stored.fields.type, {
      kind: 'component', componentType: 'water-softener', freeformLabel: null,
    })
  })

  it('never proposes a freeform label, however little fits', () => {
    // Picking from a closed list is choosing; writing a label is inventing
    // vocabulary, and the concierge does that themselves.
    const stored = normaliseType(suggestion([], { shows: 'a crack running across the ceiling' }), TYPES)
    assert.deepEqual(stored.candidates, [])
    assert.equal(stored.fields.type, null)
    assert.equal(stored.shows, 'a crack running across the ceiling')
  })

  it('records a type the config does not declare instead of swallowing it', () => {
    const stored = normaliseType(
      suggestion([{ type: 'flux-capacitor', confidence: 'certain', why: 'unreachable through the schema' }]),
      TYPES,
    )
    assert.deepEqual(stored.candidates, [])
    assert.deepEqual(stored.offList, ['flux-capacitor'])
  })

  it('skips a pin with nothing captured for it, rather than guessing from nothing', async () => {
    // §9 pointed at the model rather than at a person. Asking for a reading with
    // no photograph and no note produces a plausible statement about somebody's
    // house made out of nothing at all.
    addPin({ id: 'pin-2', number: 2 })
    queuePinTypes(db, PROPERTY, VISIT)

    const deps = stub([])
    const job = claim(PIN_TYPE_TASK, 'pin-2')
    assert.equal(await runPinType(db, job, deps), null)
    assert.equal(deps.asked.length, 0)
    const row = db.prepare('SELECT status, last_error FROM ai_jobs WHERE id = ?').get(job.id) as
      { status: string; last_error: string }
    assert.equal(row.status, 'skipped')
    assert.match(row.last_error, /no photograph and no note/)
  })

  it('tells a missing photograph apart from a photograph never taken', async () => {
    // Sending a concierge back to photograph something they already photographed
    // is an error that costs an afternoon, so the two reasons are not one reason.
    addPin({ id: 'pin-2', number: 2 })
    addMedia('photo-1', { pin: 'pin-2', status: 'absent' })
    queuePinTypes(db, PROPERTY, VISIT)

    const job = claim(PIN_TYPE_TASK, 'pin-2')
    assert.equal(await runPinType(db, job, stub([])), null)
    const row = db.prepare('SELECT last_error FROM ai_jobs WHERE id = ?').get(job.id) as { last_error: string }
    assert.match(row.last_error, /not on this machine/)
    assert.doesNotMatch(row.last_error, /nothing was captured/)
  })

  it('reads the note when the photographs did not arrive, and says they are missing', async () => {
    addPin({ id: 'pin-2', number: 2 })
    addMedia('photo-1', { pin: 'pin-2', status: 'absent' })
    addNote('pin-2', 'softener, salt bridge')
    queuePinTypes(db, PROPERTY, VISIT)

    const deps = stub([suggestion([{ type: 'water-softener', confidence: 'likely', why: 'the note names it' }])])
    await runPinType(db, claim(PIN_TYPE_TASK, 'pin-2'), deps)
    assert.equal(deps.asked[0]!.images.length, 0)
    assert.match(deps.asked[0]!.facts!, /none of them is available here/)
  })

  it('runs on a note alone when there is no photograph', async () => {
    addPin({ id: 'pin-2', number: 2 })
    addNote('pin-2', 'water softener, no salt in it')
    queuePinTypes(db, PROPERTY, VISIT)

    const deps = stub([suggestion([{ type: 'water-softener', confidence: 'likely', why: 'the note names it' }])])
    const stored = (await runPinType(db, claim(PIN_TYPE_TASK, 'pin-2'), deps))!
    assert.equal(deps.asked[0]!.images.length, 0)
    assert.match(deps.asked[0]!.facts!, /water softener, no salt in it/)
    assert.equal(stored.candidates[0]!.type, 'water-softener')
  })

  it('skips when the config declares no component types at all', async () => {
    seed([])
    addPin({ id: 'pin-2', number: 2 })
    addMedia('photo-1', { pin: 'pin-2' })
    queuePinTypes(db, PROPERTY, VISIT)

    const deps = stub([])
    const job = claim(PIN_TYPE_TASK, 'pin-2')
    assert.equal(await runPinType(db, job, deps), null)
    assert.equal(deps.asked.length, 0)
    const row = db.prepare('SELECT last_error FROM ai_jobs WHERE id = ?').get(job.id) as { last_error: string }
    assert.match(row.last_error, /no component types/)
  })

  it('records how many photographs it actually looked at', async () => {
    // A suggestion made from four of seven photographs is a weaker thing than
    // one made from all seven, and that has to be visible rather than inferred
    // from a cap buried in the source.
    addPin({ id: 'pin-2', number: 2 })
    for (let n = 1; n <= 6; n++) addMedia(`photo-${n}`, { pin: 'pin-2' })
    queuePinTypes(db, PROPERTY, VISIT)

    const job = claim(PIN_TYPE_TASK, 'pin-2')
    const deps = stub([suggestion([{ type: 'water-heater', confidence: 'likely', why: 'a tank' }])])
    await runPinType(db, job, deps)

    const refs = JSON.parse(generationOf(job.id)!.input_refs!) as { mediaIds: string[]; photosAvailable: number }
    assert.equal(refs.mediaIds.length, 4)
    assert.equal(refs.photosAvailable, 6)
    assert.equal(deps.asked[0]!.images.length, 4)
    assert.match(deps.asked[0]!.facts!, /6 were taken; the rest are not shown/)
  })

  it('accepts into the pin type slot the pass already corrects', async () => {
    addPin({ id: 'pin-2', number: 2 })
    addMedia('photo-1', { pin: 'pin-2' })
    queuePinTypes(db, PROPERTY, VISIT)
    const job = claim(PIN_TYPE_TASK, 'pin-2')
    await runPinType(
      db, job,
      stub([suggestion([{ type: 'water-heater', confidence: 'certain', why: 'the flue and the drain valve' }])]),
    )
    const generationId = generationOf(job.id)!.id

    const { overlay, decision } = acceptProposal({
      db, propertyId: PROPERTY, visitId: VISIT, generationId,
      field: 'type', targetKind: 'pin', targetId: 'pin-2',
      value: { kind: 'component', componentType: 'water-heater', freeformLabel: null },
    })

    assert.equal(decision, 'accepted')
    assert.deepEqual(overlay.priorValue, {
      kind: 'component', componentType: 'water-heater', freeformLabel: null,
    })
    const state = resolveState(readVisitOverlays(db, VISIT)).get(entityKey('pin', 'pin-2'))!
    assert.equal(state.values.type!.kind, 'accept')
  })

  it('reads as edited when the concierge picks a different type', async () => {
    addPin({ id: 'pin-2', number: 2 })
    addMedia('photo-1', { pin: 'pin-2' })
    queuePinTypes(db, PROPERTY, VISIT)
    const job = claim(PIN_TYPE_TASK, 'pin-2')
    await runPinType(
      db, job,
      stub([suggestion([{ type: 'water-heater', confidence: 'likely', why: 'a tank' }])]),
    )

    const { decision } = acceptProposal({
      db, propertyId: PROPERTY, visitId: VISIT, generationId: generationOf(job.id)!.id,
      field: 'type', targetKind: 'pin', targetId: 'pin-2',
      value: { kind: 'component', componentType: 'water-softener', freeformLabel: null },
    })
    assert.equal(decision, 'edited')
  })
})

// ------------------------------------------------------------ the dispatch

describe('the task dispatch', () => {
  beforeEach(() => seed())

  it('queues everything an imported visit owes, once', () => {
    addPin({ id: 'pin-1', number: 1, componentType: 'water-heater' })
    addPin({ id: 'pin-2', number: 2 })
    addMedia('on-the-pin', { pin: 'pin-1' })
    addMedia('room-a', { zone: 'zone-1' })
    addMedia('room-b', { zone: 'zone-1' })

    const first = queueAssists(db, PROPERTY, VISIT)
    assert.deepEqual(first, { nameplates: 1, routing: 2, pinTypes: 1, total: 4 })
    assert.equal(queueProgress(db, VISIT).queued, 4)

    // §4: re-triggerable by hand, and pressing it twice must not pay twice.
    queueAssists(db, PROPERTY, VISIT)
    assert.equal(queueProgress(db, VISIT).queued, 4)
  })

  it('has a runner for every task it queues', () => {
    for (const task of [ROUTING_TASK, PIN_TYPE_TASK]) assert.ok(runnerFor(task))
  })

  it('refuses a task name nothing recognises', () => {
    // Task names are ours, not the field app's, so fail-open does not cover
    // them. A job nothing can run would sit queued forever while the progress
    // figures said work was still coming.
    assert.throws(() => runnerFor('nameplate_smell'), UnknownTask)
  })
})

// ------------------------------------------------- routing's golden comparator

describe("routing's golden set", () => {
  it('names each of the six outcomes', () => {
    assert.equal(compareRoute('pin-1', ['pin-1', 'pin-2']), 'led-right')
    assert.equal(compareRoute('pin-2', ['pin-1', 'pin-2']), 'offered-lower')
    assert.equal(compareRoute(null, []), 'stayed-silent')
    assert.equal(compareRoute('pin-1', []), 'missed')
    assert.equal(compareRoute(null, ['pin-1']), 'invented')
    assert.equal(compareRoute('pin-3', ['pin-1', 'pin-2']), 'misrouted')
  })

  it('applies the bar exactly as production does', () => {
    const candidates = [{ pinId: 'pin-1', confidence: 'likely' }, { pinId: 'pin-2', confidence: 'possible' }]
    assert.deepEqual(offeredPins(candidates, 'certain'), [], 'below the bar is silence at the desk')
    assert.deepEqual(offeredPins(candidates, 'likely'), ['pin-1', 'pin-2'])
    assert.deepEqual(offeredPins([], 'possible'), [])
  })

  it('gates on the two cardinal errors and on nothing else', () => {
    const ratifiedTo = (pin: string | null): ExpectedRoute['ratifications'] => [
      { key: 'pin', act: 'ratify', value: pin ?? NOTHING, by: 'david', at: '2026-07-27T12:00:00.000Z' },
    ]
    const entries: ExpectedRoute[] = [
      { file: 'a.jpeg', pin: 'pin-1', ratifications: ratifiedTo('pin-1') },
      { file: 'b.jpeg', pin: 'pin-1', ratifications: ratifiedTo('pin-1') },
      { file: 'c.jpeg', pin: null, ratifications: ratifiedTo(null) },
      { file: 'd.jpeg', pin: 'pin-1', ratifications: ratifiedTo('pin-1') },
    ]
    const results = [
      compareRoutes(entries[0]!, { offered: ['pin-1'] }),        // led-right
      compareRoutes(entries[1]!, { offered: [] }),               // missed — never penalised
      compareRoutes(entries[2]!, { offered: ['pin-9'] }),        // invented — cardinal
      compareRoutes(entries[3]!, { offered: ['pin-2', 'pin-1'] }), // offered-lower — not wrong
    ]
    const report = summariseRoutes(results, 'certain')

    assert.equal(report.regressions, 1, 'only the invention gates')
    assert.equal(report.totals.missed, 1)
    assert.equal(report.totals.offeredLower, 1)
    assert.equal(report.clean, false)
    assert.equal(report.bar, 'certain', 'the bar is part of what produced the result, so it is recorded')
  })

  it('never gates on an unratified answer, and summons it instead', () => {
    const entry: ExpectedRoute = { file: 'a.jpeg', pin: null }
    const report = summariseRoutes([compareRoutes(entry, { offered: ['pin-9'] })], 'certain')

    assert.equal(report.regressions, 0)
    assert.equal(report.clean, true)
    assert.deepEqual(report.pendingRatification, [
      { file: 'a.jpeg', key: 'pin', expected: NOTHING, actual: 'pin-9' },
    ])
  })

  it('summons nobody when the answer was right or correctly silent', () => {
    const report = summariseRoutes(
      [
        compareRoutes({ file: 'a.jpeg', pin: 'pin-1' }, { offered: ['pin-1'] }),
        compareRoutes({ file: 'b.jpeg', pin: null }, { offered: [] }),
      ],
      'certain',
    )
    assert.deepEqual(report.pendingRatification, [])
  })

  it('lapses a ratification when the approved pin is edited', () => {
    // The same rule the nameplate set follows: the act carries a copy, so a
    // ratification can never drift onto something nobody looked at.
    const entry: ExpectedRoute = {
      file: 'a.jpeg',
      pin: 'pin-1',
      ratifications: [{ key: 'pin', act: 'ratify', value: 'pin-1', by: 'david', at: '2026-07-27T12:00:00.000Z' }],
    }
    assert.equal(isRatified(entry, 'pin'), true)
    entry.pin = 'pin-2'
    assert.equal(isRatified(entry, 'pin'), false)
  })

  it('writes "none" for an approved answer of nothing, so silence can be ratified too', () => {
    // Otherwise the commonest correct answer would be the one nobody can approve.
    const entry: ExpectedRoute = {
      file: 'a.jpeg',
      pin: null,
      ratifications: [{ key: 'pin', act: 'ratify', value: NOTHING, by: 'david', at: '2026-07-27T12:00:00.000Z' }],
    }
    assert.equal(currentRoute(entry, 'pin'), NOTHING)
    assert.equal(isRatified(entry, 'pin'), true)
  })

  it('shares the drift signal with the nameplate set rather than forking it', () => {
    const set = {
      version: 1,
      routes: [
        {
          file: 'a.jpeg',
          pin: 'pin-2',
          ratifications: [
            { key: 'pin', act: 'ratify' as const, value: 'pin-1', by: 'david', at: '2026-07-27T12:00:00.000Z' },
            { key: 'pin', act: 'ratify' as const, value: 'pin-2', by: 'sam', at: '2026-08-01T12:00:00.000Z' },
          ],
        },
      ],
    }
    assert.deepEqual(contested(set), [
      { file: 'a.jpeg', key: 'pin', values: ['pin-1', 'pin-2'], by: ['david', 'sam'] },
    ])
  })
})

// ------------------------------------------------------------------ doctrine

describe('doctrine — the config decides, not the builder', () => {
  it('hardcodes no component type anywhere in the suggestion path', () => {
    // The field master went 48 types → 73 and eleven sub-types now inherit from
    // another type. None of that is knowable from here, which is the point: the
    // list is read from each import's own config snapshot. A literal in this
    // file is a list that goes stale the next time the field app ships.
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, 'fixtures', 'reference', 'housesteady-019f9a33-manifest.json'), 'utf8'),
    ) as { config: { snapshot: { componentLists: { types?: string[] }[] } } }
    const declared = new Set(manifest.config.snapshot.componentLists.flatMap((l) => l.types ?? []))
    assert.ok(declared.size > 40, 'sanity: the reference config declares its component types')

    const source = readFileSync(join(repoRoot, 'server', 'src', 'ai', 'tasks', 'pinType.ts'), 'utf8')
    const offenders = [...declared].filter((t) => source.includes(`'${t}'`) || source.includes(`"${t}"`))
    assert.deepEqual(offenders, [], 'a component type named in source is a vocabulary the builder invented')
  })
})
