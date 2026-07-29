import { TEST_OPERATOR, freshDb } from './helpers.js'
/**
 * Acceptance — how a proposal becomes a value, and what it must never do.
 *
 * Increment 2b §2 and §10.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { newId, now, openDb, type Db } from '../src/db/index.js'
import {
  acceptProposal, accuracy, discardProposal, findGeneration, goldenCandidates,
  pendingProposals, withdrawAcceptance,
} from '../src/ai/accept.js'
import { recordGeneration } from '../src/ai/queue.js'
import { entityKey, resolveState } from '../src/overlay/model.js'
import { OverlayRefused, readVisitOverlays, visitState, writeOverlay } from '../src/overlay/store.js'

let db: Db
const PROPERTY = 'prop-1'
const VISIT = 'visit-1'
const PIN = 'pin-1'

function seed(): void {
  db = freshDb()
  db.prepare(`INSERT INTO properties (id, label, created_at, actor_id) VALUES (?, 'A house', ?, ?)`)
    .run(PROPERTY, now(), TEST_OPERATOR)
  db.prepare(`INSERT INTO visits (id, property_id, kind, created_at, actor_id) VALUES (?, ?, 'baseline', ?, ?)`)
    .run(VISIT, PROPERTY, now(), TEST_OPERATOR)
  const importId = newId()
  db.prepare(
    `INSERT INTO imports (id, visit_id, property_id, imported_at, media_mode, raw_manifest,
                          validation_report, status, created_at, actor_id)
     VALUES (?, ?, ?, ?, 'manifest_only', '{}', '{}', 'ok', ?, ?)`,
  ).run(importId, VISIT, PROPERTY, now(), now(), TEST_OPERATOR)
  db.prepare(
    `INSERT INTO zones (zone_id, import_id, property_id, visit_id, label, created_at)
     VALUES ('zone-1', ?, ?, ?, 'Utility room', ?)`,
  ).run(importId, PROPERTY, VISIT, now())
  db.prepare(
    `INSERT INTO pins (pin_id, import_id, property_id, visit_id, number, zone_id, created_at)
     VALUES (?, ?, ?, ?, 1, 'zone-1', ?)`,
  ).run(PIN, importId, PROPERTY, VISIT, now())
}

const propose = (fields: Record<string, unknown>, opts: { abstained?: boolean } = {}): string =>
  recordGeneration({ actorId: TEST_OPERATOR,
    db, propertyId: PROPERTY, visitId: VISIT, task: 'nameplate_extract',
    targetKind: 'pin', targetId: PIN, model: 'a-fast-model',
    promptId: 'nameplate_extract', promptVersion: 'v001', promptHash: 'deadbeef',
    inputRefs: ['media-1'], output: { fields }, abstained: opts.abstained ?? false,
    inputTokens: 1200, outputTokens: 40,
  })

const liveValue = (field: string): unknown =>
  visitState(db, VISIT).get(entityKey('pin', PIN))?.values[field]?.newValue

describe('a proposal is not a value', () => {
  beforeEach(seed)

  // §10, first line: "a generation never becomes current state without an
  // accept overlay". This is the whole doctrine in one assertion.
  it('leaves the pin untouched while the proposal is only proposed', () => {
    propose({ model: 'TTV049BGC01ARKS', serial: 'Q13734509' })

    assert.equal(readVisitOverlays(db, VISIT).length, 0, 'proposing writes no overlay')
    assert.equal(visitState(db, VISIT).size, 0, 'and therefore no state — the pin is untouched')
    assert.equal(pendingProposals(db, VISIT).length, 1, 'it is waiting on a human, which is the point')
  })

  it('becomes the live value only once a human accepts it', () => {
    const g = propose({ model: 'TTV049BGC01ARKS' })
    assert.equal(liveValue('model'), undefined)

    acceptProposal({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: g,
      field: 'model', targetKind: 'pin', targetId: PIN, value: 'TTV049BGC01ARKS',
    })
    assert.equal(liveValue('model'), 'TTV049BGC01ARKS')
  })
})

describe('the diff is the accuracy record', () => {
  beforeEach(seed)

  it('stores what was proposed beside what was accepted, unchanged', () => {
    const g = propose({ serial: 'Q13734509' })
    const result = acceptProposal({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: g,
      field: 'serial', targetKind: 'pin', targetId: PIN, value: 'Q13734509',
    })

    assert.equal(result.decision, 'accepted')
    assert.equal(result.overlay.priorValue, 'Q13734509', 'what the model proposed')
    assert.equal(result.overlay.newValue, 'Q13734509', 'what the human accepted')
    assert.equal(result.overlay.generationId, g, 'the overlay cites its proposal')
    assert.equal(findGeneration(db, g)!.human_decision, 'accepted')
  })

  // §10: "edited acceptance stores both proposed and accepted values".
  it('keeps the wrong reading when the human corrects it', () => {
    const g = propose({ serial: 'Q13734S09' }) // model misread 5 as S
    const result = acceptProposal({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: g,
      field: 'serial', targetKind: 'pin', targetId: PIN, value: 'Q13734509',
    })

    assert.equal(result.decision, 'edited')
    assert.equal(result.overlay.priorValue, 'Q13734S09',
      'throwing the misreading away would delete the only evidence the prompt needs fixing')
    assert.equal(result.overlay.newValue, 'Q13734509')
    assert.equal(liveValue('serial'), 'Q13734509', 'the pin carries what the human said, not what the model said')
    assert.equal(findGeneration(db, g)!.human_decision, 'edited')
  })

  it('proposes null rather than "unknown" for a field the model declined', () => {
    // An extraction that read the model and left the serial unknown proposed
    // nothing for the serial. Recording the literal string would turn a
    // declined reading into a wrong one in the accuracy figures.
    const g = propose({ model: 'HTX 30', serial: 'unknown' })
    const result = acceptProposal({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: g,
      field: 'serial', targetKind: 'pin', targetId: PIN, value: '155543',
    })
    assert.equal(result.overlay.priorValue, null)
    assert.equal(result.decision, 'edited')
  })

  it('counts how often the model was right, without a metric to maintain', () => {
    const a = propose({ model: 'A' })
    const b = propose({ model: 'B' })
    const c = propose({ model: 'C' })
    propose({}, { abstained: true })

    acceptProposal({ actorId: TEST_OPERATOR, db, propertyId: PROPERTY, visitId: VISIT, generationId: a, field: 'model', targetKind: 'pin', targetId: PIN, value: 'A' })
    acceptProposal({ actorId: TEST_OPERATOR, db, propertyId: PROPERTY, visitId: VISIT, generationId: b, field: 'make', targetKind: 'pin', targetId: PIN, value: 'B-corrected' })
    discardProposal(db, c, 'that is the sticker, not the plate')

    assert.deepEqual(accuracy(db, VISIT, 'nameplate_extract'), {
      proposed: 4, acceptedAsIs: 1, edited: 1, discarded: 1, abstained: 1, pending: 1,
    })
  })
})

describe('declining a proposal', () => {
  beforeEach(seed)

  // §10: "discards are retained".
  it('keeps the discard as evidence rather than deleting it', () => {
    const g = propose({ model: 'nonsense' })
    discardProposal(db, g, 'read the warning placard, not the plate')

    const gen = findGeneration(db, g)
    assert.ok(gen, 'a discarded proposal is still in the record')
    assert.equal(gen.human_decision, 'discarded')
    assert.equal(gen.human_note, 'read the warning placard, not the plate',
      'a model repeating the same wrong thing is a prompt problem, and this is the evidence')
    assert.equal(readVisitOverlays(db, VISIT).length, 0,
      'nothing about the house changed, so nothing lands on the pin trail')
  })

  it('refuses to accept an abstention, because there is nothing to accept', () => {
    const g = propose({}, { abstained: true })
    assert.throws(
      () => acceptProposal({ actorId: TEST_OPERATOR,
        db, propertyId: PROPERTY, visitId: VISIT, generationId: g,
        field: 'serial', targetKind: 'pin', targetId: PIN, value: 'made up',
      }),
      (e: OverlayRefused) => {
        assert.equal(e.code, 'overlay.accept-abstained')
        return true
      },
    )
  })

  it('refuses to decide the same proposal twice', () => {
    const g = propose({ model: 'A' })
    acceptProposal({ actorId: TEST_OPERATOR, db, propertyId: PROPERTY, visitId: VISIT, generationId: g, field: 'model', targetKind: 'pin', targetId: PIN, value: 'A' })
    assert.throws(
      () => discardProposal(db, g),
      (e: OverlayRefused) => e.code === 'overlay.accept-already-decided',
    )
  })
})

describe('acceptance shares a slot with correction', () => {
  beforeEach(seed)

  it('lets a later correction replace an accepted value rather than sit beside it', () => {
    const g = propose({ type: 'water_heater' })
    acceptProposal({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: g,
      field: 'type', targetKind: 'pin', targetId: PIN,
      value: { kind: 'component', componentType: 'water_heater', freeformLabel: null },
    })

    writeOverlay({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, kind: 'correct',
      targetKind: 'pin', targetId: PIN, field: 'type',
      newValue: { kind: 'component', componentType: 'boiler', freeformLabel: null },
    })

    const state = visitState(db, VISIT).get(entityKey('pin', PIN))!
    assert.equal((state.values.type!.newValue as { componentType: string }).componentType, 'boiler',
      'two live answers for one field would leave the screen choosing at render time')
    assert.equal(state.values.type!.kind, 'correct')
    assert.deepEqual(state.trail.map((t) => t.verb), ['accepted', 'corrected'])
  })

  it('takes its prior value from the accepted value, not from the field', () => {
    const g = propose({ model: 'A' })
    acceptProposal({ actorId: TEST_OPERATOR, db, propertyId: PROPERTY, visitId: VISIT, generationId: g, field: 'model', targetKind: 'pin', targetId: PIN, value: 'A' })
    const corrected = writeOverlay({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, kind: 'correct',
      targetKind: 'pin', targetId: PIN, field: 'model', newValue: 'B',
    })
    assert.equal(corrected.priorValue, 'A', 'a chain of acts must read continuously')
  })
})

describe('taking an acceptance back', () => {
  beforeEach(seed)

  it('withdraws the value and returns the proposal to pending', () => {
    const g = propose({ model: 'A' })
    const { overlay } = acceptProposal({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: g,
      field: 'model', targetKind: 'pin', targetId: PIN, value: 'A',
    })
    assert.equal(liveValue('model'), 'A')

    withdrawAcceptance(db, overlay.id, { actorId: TEST_OPERATOR })

    assert.equal(liveValue('model'), undefined, 'the value is no longer current')
    assert.equal(findGeneration(db, g)!.human_decision, 'pending',
      'leaving it accepted would have the row claim a value is current that is not')
    const state = visitState(db, VISIT).get(entityKey('pin', PIN))!
    assert.deepEqual(state.trail.map((t) => t.verb), ['accepted', 'acceptance withdrawn'],
      'the history keeps what happened; only the current-state field moves')
  })

  it('lets the proposal be decided again after a withdrawal', () => {
    const g = propose({ model: 'A' })
    const { overlay } = acceptProposal({ actorId: TEST_OPERATOR, db, propertyId: PROPERTY, visitId: VISIT, generationId: g, field: 'model', targetKind: 'pin', targetId: PIN, value: 'A' })
    withdrawAcceptance(db, overlay.id, { actorId: TEST_OPERATOR })
    assert.equal(pendingProposals(db, VISIT).length, 1)
    discardProposal(db, g, 'on reflection that is the wrong plate')
    assert.equal(findGeneration(db, g)!.human_decision, 'discarded')
  })
})

describe('acceptance is not a way around the field line', () => {
  beforeEach(seed)

  it('refuses a field the desk could not have corrected either', () => {
    const g = propose({ anchor: { x: 0.5, y: 0.5 } })
    assert.throws(
      () => acceptProposal({ actorId: TEST_OPERATOR,
        db, propertyId: PROPERTY, visitId: VISIT, generationId: g,
        field: 'anchor', targetKind: 'pin', targetId: PIN, value: { x: 0.5, y: 0.5 },
      }),
      (e: OverlayRefused) => {
        assert.equal(e.code, 'overlay.uncorrectable-field')
        return true
      },
    )
  })

  it('refuses a condition or grade however it arrives', () => {
    const g = propose({ condition: 'poor' })
    assert.throws(
      () => acceptProposal({ actorId: TEST_OPERATOR,
        db, propertyId: PROPERTY, visitId: VISIT, generationId: g,
        field: 'condition', targetKind: 'pin', targetId: PIN, value: 'poor',
      }),
      (e: OverlayRefused) => {
        assert.equal(e.code, 'overlay.forbidden-field')
        return true
      },
    )
  })

  it('refuses a proposal belonging to another visit', () => {
    db.prepare(`INSERT INTO visits (id, property_id, kind, created_at, actor_id) VALUES ('visit-2', ?, 'monthly', ?, ?)`)
      .run(PROPERTY, now(), TEST_OPERATOR)
    const g = recordGeneration({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: 'visit-2', task: 'nameplate_extract',
      targetKind: 'pin', targetId: PIN, model: 'm', promptId: 'p', promptVersion: 'v001', promptHash: 'h',
      inputRefs: [], output: { fields: { model: 'A' } }, abstained: false, inputTokens: 1, outputTokens: 1,
    })
    assert.throws(
      () => acceptProposal({ actorId: TEST_OPERATOR, db, propertyId: PROPERTY, visitId: VISIT, generationId: g, field: 'model', targetKind: 'pin', targetId: PIN, value: 'A' }),
      (e: OverlayRefused) => e.code === 'overlay.accept-other-visit',
    )
  })

  it('refuses an acceptance that cites no proposal at all', () => {
    assert.throws(
      () => writeOverlay({ actorId: TEST_OPERATOR,
        db, propertyId: PROPERTY, visitId: VISIT, kind: 'accept',
        targetKind: 'pin', targetId: PIN, field: 'model', newValue: 'invented',
      }),
      (e: OverlayRefused) => {
        assert.equal(e.code, 'overlay.accept-no-generation')
        return true
      },
    )
  })
})

describe('resolveState stays pure', () => {
  it('treats accept as a value-setting decision without touching the database', () => {
    const base = {
      propertyId: 'p', visitId: 'v', targetKind: 'pin', targetId: 'pin-1',
      priorValue: null, reason: null, supersedesId: null,
      actor: 'concierge', actorContext: 'desk', createdAt: '2026-07-27T10:00:00.000Z',
    }
    const accepted = { ...base, id: 'a', seq: 1, kind: 'accept', field: 'model', newValue: 'A', generationId: 'g1' }
    const state = resolveState([accepted]).get(entityKey('pin', 'pin-1'))!
    assert.equal(state.values.model!.newValue, 'A')
    assert.ok(state.decision, 'accepting is a decision — the human made the same claim as a confirm')
  })
})

describe('the golden set grows from what the model got wrong', () => {
  beforeEach(seed)

  const proposeFor = (mediaId: string, fields: Record<string, unknown>) =>
    recordGeneration({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, task: 'nameplate_extract',
      targetKind: 'media', targetId: mediaId, model: 'a-fast-model',
      promptId: 'nameplate_extract', promptVersion: 'v001', promptHash: 'h',
      inputRefs: { mediaId }, output: { fields }, abstained: false,
      inputTokens: 1200, outputTokens: 40,
    })

  it('surfaces an edited acceptance as a photograph worth adding to the set', () => {
    const g = proposeFor('media-7', { serial: 'Q13734S09' })
    acceptProposal({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: g,
      field: 'serial', targetKind: 'pin', targetId: PIN, value: 'Q13734509',
    })

    const [candidate] = goldenCandidates(db, VISIT)
    assert.ok(candidate, 'a plate the model misread is exactly what the set is short of')
    assert.equal(candidate.mediaId, 'media-7', 'the photograph is what joins the set, not the value')
    assert.equal(candidate.proposed, 'Q13734S09')
    assert.equal(candidate.accepted, 'Q13734509')
    assert.equal(candidate.decision, 'edited')
    assert.equal(candidate.promptVersion, 'v001', 'which prompt produced it is part of the evidence')
  })

  it('surfaces a discard too, and keeps the reason', () => {
    const g = proposeFor('media-8', { model: 'DMF150' })
    discardProposal(db, g, 'that is the brand badge, not the plate')

    const [candidate] = goldenCandidates(db, VISIT)
    assert.equal(candidate!.decision, 'discarded')
    assert.equal(candidate!.note, 'that is the brand badge, not the plate')
  })

  it('leaves accepted-as-is readings alone', () => {
    const g = proposeFor('media-9', { serial: 'Q13734509' })
    acceptProposal({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: g,
      field: 'serial', targetKind: 'pin', targetId: PIN, value: 'Q13734509',
    })
    assert.deepEqual(goldenCandidates(db, VISIT), [],
      'the set grows from failures; a correct reading teaches it nothing')
  })

  it('proposes candidates without promoting any', () => {
    // Auto-promotion would let a value someone typed in a hurry become permanent
    // ground truth — the exact failure per-value approval exists to prevent.
    const g = proposeFor('media-10', { serial: 'wrong' })
    acceptProposal({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, generationId: g,
      field: 'serial', targetKind: 'pin', targetId: PIN, value: 'right',
    })
    const candidate = goldenCandidates(db, VISIT)[0]!
    assert.equal('approved' in candidate, false,
      'a candidate carries no approval — that comes from a person looking at the image again')
  })
})
