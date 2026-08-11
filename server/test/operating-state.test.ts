/**
 * Operating state — Baseline Service Design v1.3 §4.1c-i.
 *
 * **Every case here is from the owner's own mechanical room.** The water heater
 * whose breaker is off on purpose, the legacy coax that is a run rather than an
 * object, and the pool heater that is off for the season and is not abandoned.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { newId, now, type Db } from '../src/db/index.js'
import {
  ATTESTORS, blocksOperation, currentState, DECLARED_STATES, doNotOperateLine,
  normaliseState, suppressesCare, type StateRecord,
} from '../src/engine/operatingState.js'
import { freshDb, TEST_OPERATOR } from './helpers.js'

const rec = (over: Partial<StateRecord> & { state: string }): StateRecord => ({
  subjectKind: 'object', subjectId: 'o1', attestedBy: 'household', because: null,
  createdAt: '2026-08-11T00:00:00Z', ...over,
})

describe('the vocabulary is open, and safely', () => {
  it('recognises every declared state', () => {
    for (const s of DECLARED_STATES) {
      assert.deepEqual(normaliseState(s), { state: s, recognised: true }, s)
    }
    assert.deepEqual([...ATTESTORS], ['household', 'observed', 'unknown'])
  })

  it('keeps a word it has not met, and that word can do nothing', () => {
    const n = normaliseState('Mothballed')
    assert.deepEqual(n, { state: 'mothballed', recognised: false })
    // The safety property: an unrecognised state cannot suppress care or reach
    // a trades brief, because both switch on the declared values.
    assert.equal(suppressesCare(n.state), false)
    assert.equal(blocksOperation(n.state), false)
  })

  it('sends an empty answer to unknown rather than to a guess', () => {
    assert.deepEqual(normaliseState(''), { state: 'unknown', recognised: true })
    assert.deepEqual(normaliseState(undefined), { state: 'unknown', recognised: true })
  })
})

describe('the water heater whose breaker is off on purpose', () => {
  it('suppresses the care package rather than proposing work on a tank that heats nothing', () => {
    assert.equal(suppressesCare('deliberately off'), true)
    assert.equal(suppressesCare('in service'), false)
  })

  it('rides the trades brief as do-not-operate, naming who says so', () => {
    const line = doNotOperateLine(rec({
      state: 'deliberately off',
      because: 'geothermal preheat store; the panel is marked to keep it off',
    }))
    assert.ok(line)
    assert.match(line!, /DO NOT OPERATE/)
    assert.match(line!, /The household reports/, 'Reported by homeowner, never rendered as observed')
    assert.match(line!, /geothermal preheat store/)
  })

  it('says who when the concierge saw it rather than the household saying it', () => {
    // A breaker in the off position is observable. That it is DELIBERATE is not.
    const line = doNotOperateLine(rec({ state: 'deliberately off', attestedBy: 'observed' }))
    assert.match(line!, /Recorded as observed/)
    assert.doesNotMatch(line!, /household/)
  })

  it('says nothing at all about a thing in service', () => {
    assert.equal(doNotOperateLine(rec({ state: 'in service' })), null)
  })
})

describe('off for the season and off for good are different facts', () => {
  it('does NOT suppress care on seasonal or standby', () => {
    // A pool heater in November is off and still needs winterising. Collapsing
    // the two values would drop that work silently.
    assert.equal(suppressesCare('seasonal or standby'), false)
  })

  it('and still blocks a visiting trade from starting it up', () => {
    assert.equal(blocksOperation('seasonal or standby'), true)
    assert.match(doNotOperateLine(rec({ state: 'seasonal or standby' }))!, /DO NOT OPERATE/)
  })

  it('suppresses care on the three that mean permanently', () => {
    for (const s of ['deliberately off', 'abandoned in place', 'decommissioned but present']) {
      assert.equal(suppressesCare(s), true, s)
      assert.equal(blocksOperation(s), true, s)
    }
  })
})

describe('the transition is the fact, so the store is a log', () => {
  it('takes the latest attestation and never merges two', () => {
    const r = currentState([
      rec({ state: 'in service', createdAt: '2026-02-01T00:00:00Z' }),
      rec({ state: 'deliberately off', createdAt: '2026-08-11T00:00:00Z' }),
    ])
    assert.equal(r!.state, 'deliberately off')
  })

  it('is order-independent, because a log arrives in whatever order it arrives', () => {
    const r = currentState([
      rec({ state: 'deliberately off', createdAt: '2026-08-11T00:00:00Z' }),
      rec({ state: 'in service', createdAt: '2026-02-01T00:00:00Z' }),
    ])
    assert.equal(r!.state, 'deliberately off')
  })

  it('has nothing to say about a subject with no attestation', () => {
    assert.equal(currentState([]), undefined)
  })
})

describe('the store', () => {
  let db: Db
  const write = (over: Partial<StateRecord> & { state: string }, actor = TEST_OPERATOR): void => {
    const r = rec(over)
    db.prepare(
      `INSERT INTO object_states (id, property_id, subject_kind, subject_id, state, attested_by, because, actor_id, created_at)
       VALUES (?, 'prop-1', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(newId(), r.subjectKind, r.subjectId, r.state, r.attestedBy, r.because, actor, r.createdAt)
  }

  beforeEach(() => {
    db = freshDb()
    db.prepare(`INSERT INTO properties (id, label, created_at, actor_id) VALUES ('prop-1', 'A house', ?, ?)`)
      .run(now(), TEST_OPERATOR)
  })

  it('holds a state against a RUN, not only an object', () => {
    // Legacy coax and legacy telephone were recorded as whole systems whose
    // entire content is *household says legacy*. They are runs, and most of what
    // an older house has abandoned is connective.
    write({ subjectKind: 'edge', subjectId: 'coax-run', state: 'abandoned in place' })
    const row = db.prepare('SELECT subject_kind AS k, state FROM object_states').get() as {
      k: string
      state: string
    }
    assert.deepEqual(row, { k: 'edge', state: 'abandoned in place' })
  })

  it('is append-only — a state history that can be edited is not a history', () => {
    write({ state: 'in service' })
    assert.throws(() => db.prepare("UPDATE object_states SET state = 'deliberately off'").run(), /append-only/)
    assert.throws(() => db.prepare('DELETE FROM object_states').run(), /append-only/)
  })

  it('refuses a row with no operator', () => {
    assert.throws(() => write({ state: 'in service' }, ''), /every row records which operator acted/)
  })

  it('has no column a model could write into, which is how "never AI" is enforced', () => {
    // State is what the household says. The way to stop a model proposing one is
    // to give it nowhere to write — the same move pass 1 makes by having no
    // `label` field. An instruction is a request; a missing column is a wall.
    const cols = (db.prepare('PRAGMA table_info(object_states)').all() as { name: string }[]).map((c) => c.name)
    assert.equal(cols.includes('generation_id'), false)
    assert.deepEqual(cols.sort(), [
      'actor_id', 'because', 'created_at', 'id', 'property_id', 'state', 'subject_id', 'subject_kind',
    ].sort().concat(['attested_by']).sort())
  })
})
