/**
 * The scoring harness — register #116.
 *
 * **The keys built here are miniature, not the real one.** The room record is
 * committed at `fixtures/room-records/mechanical-room_2026-08-10.json` by the
 * owner's ruling — it is his own house and §14 was written about other people's
 * — but a test that loaded it would be checking one basement rather than the six
 * rules. **Rules do not need a real basement to be checked**, so each test
 * builds the smallest key that exercises one.
 *
 * Where a case is drawn from the real room it says so, because a rule argued
 * from an invented example is a rule nobody has tested against a house.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mediaIdOf, nearlySameModel, scoreRun, type RoomKey, type ScoredProposal } from '../src/engine/score.js'

/** Substring matching, so the tests exercise the harness rather than a matcher. */
const matches = (expected: string, p: ScoredProposal): boolean =>
  p.label.toLowerCase().includes(expected.toLowerCase())

const proposal = (over: Partial<ScoredProposal> & { id: string }): ScoredProposal => ({
  label: '', classId: null, mediaIds: [], ...over,
})

describe('rule 2 — matching is on photograph overlap, never on names', () => {
  it('matches a proposal whose words are nothing like the key\'s', () => {
    // A real one: identification proposed `water-treatment-other` for this,
    // because it is a grey box in a mechanical room. The role shares not one
    // word with the product, and the photograph is what joins them.
    const key: RoomKey = {
      confirmed_objects: [{
        product: 'TRU-SPEC TSMS-4/8 4x8 HDTV Digital Multiswitch',
        role: 'legacy television/satellite distribution',
        photographs: ['photo-a.jpg'],
        confirmed_by: { product: 'plate', role: 'household' },
      }],
    }
    const r = scoreRun(key, [proposal({ id: 'p1', label: 'legacy television/satellite distribution', mediaIds: ['photo-a'] })], matches)
    assert.equal(r.counts.correct, 1)
    assert.equal(r.matched, 1)
  })

  it('does NOT match on a shared name when no photograph is shared', () => {
    // The two-sided version of rule 2 — rule 11b. If names could match, the
    // four-pressure-tank bug would score as four correct answers.
    const key: RoomKey = {
      confirmed_objects: [{
        product: null, role: 'water softener', photographs: ['photo-a.jpg'],
        confirmed_by: { product: null, role: 'household' },
      }],
    }
    const r = scoreRun(key, [proposal({ id: 'p1', label: 'water softener', mediaIds: ['photo-zzz'] })], matches)
    assert.equal(r.counts.correct, 0)
    assert.equal(r.missed.length, 1, 'the key object is missed')
    assert.equal(r.falsePositives.length, 1, 'and the proposal is a false positive — it answers nothing')
  })

  it('strips the download suffix, because the key names files and the database holds ids', () => {
    // `019fb96f-…(1).jpg` is one photograph downloaded twice. Not stripping it
    // would score every duplicated photograph as a miss, silently.
    assert.equal(mediaIdOf('019fb96f-014e-792c-ab36-3cfe3b09e737(1).jpg'), '019fb96f-014e-792c-ab36-3cfe3b09e737')
    assert.equal(mediaIdOf('019fb96f-014e-792c-ab36-3cfe3b09e737.jpg'), '019fb96f-014e-792c-ab36-3cfe3b09e737')
  })
})

describe('the reason the key has two fields — scoring uses ROLE', () => {
  it('scores the GSW heater wrong, which a product-only key would have scored right', () => {
    /**
     * **The case the whole harness exists for.** *Automatic storage water
     * heater* is exactly what the plate says and exactly what a lookup on
     * `G9-50SDE-30 250` returns, so a proposal calling it an electric water
     * heater is **right about the product** — a product-only key marks it
     * CORRECT and stops.
     *
     * Its role in this house is a geothermal preheat store whose breaker is off
     * **on purpose**. That is the fact worth having: an intentional state that
     * reads as a defect, which a well-meaning technician would "fix". Only the
     * household knew it, and scoring the product loses it.
     */
    const key: RoomKey = {
      confirmed_objects: [{
        product: 'GSW automatic storage water heater',
        role: 'geothermal preheat store; breaker intentionally off',
        model: 'G9-50SDE-30 250',
        photographs: ['photo-heater.jpg'],
        confirmed_by: { product: 'plate', role: 'household' },
      }],
    }
    const r = scoreRun(key, [proposal({ id: 'p1', label: 'Electric storage water heater', mediaIds: ['photo-heater'] })], matches)

    assert.equal(r.counts.wrong, 1, 'wrong on role')
    assert.equal(r.judged[0]!.expected, 'geothermal preheat store; breaker intentionally off')

    // And the counter-check: the same proposal against the PRODUCT would pass.
    assert.ok(matches('storage water heater', proposal({ id: 'p1', label: 'Electric storage water heater' })),
      'which is precisely why product must not be the thing scored')
  })

  it('no longer uses the WellMate for that, because a correct product scores it wrong too', () => {
    /**
     * **The premise this test used to carry was false, and the correction is the
     * test.** The UT-450 is a *universal retention tank* — a contact tank by
     * default, a pressure tank only when adapted — not a pressure vessel that
     * happens to be used as a contact tank.
     *
     * So `well-pressure-tank` is wrong against the role **and wrong against the
     * product**, and this case never discriminated the two fields. What it
     * proves instead is worth more: **plate, lookup and household agree.** The
     * plate's `Precharge: N/A` and `N/A` drawdown at all three ranges say what
     * it is not, the lookup says what it is, and the household says what it is
     * for — three independent sources, no disagreement.
     */
    const key: RoomKey = {
      confirmed_objects: [{
        product: 'Pentair WellMate UT-450 universal retention tank',
        role: 'chlorine contact tank',
        model: 'UT-450 CE',
        photographs: ['photo-tank.jpg'],
        confirmed_by: { product: 'plate', role: 'household' },
      }],
    }
    const p = proposal({ id: 'p1', label: 'Well pressure tank', mediaIds: ['photo-tank'] })
    const r = scoreRun(key, [p], matches)

    assert.equal(r.counts.wrong, 1, 'wrong on role, as before')
    assert.equal(
      matches(key.confirmed_objects[0]!.product!, p), false,
      'and wrong on the product too — which is why this case cannot prove the split',
    )
  })

  it('carries confirmed_by as the weight rather than averaging it away', () => {
    const key: RoomKey = {
      confirmed_objects: [{
        product: 'Burcam Series 600', role: 'well-water pressure tank', photographs: ['a.jpg'],
        confirmed_by: { product: 'plate', role: 'household' },
      }],
    }
    const r = scoreRun(key, [proposal({ id: 'p1', label: 'well-water pressure tank', mediaIds: ['a'] })], matches)
    assert.deepEqual(r.judged[0]!.weight, { product: 'plate', role: 'household' })
  })
})

describe('rule 3 — role: null lands in key-uncertain automatically', () => {
  it('does not mark the engine wrong about something the key has not settled', () => {
    // Two of the real room's objects are confirmed vessels with unresolved
    // function. The key does not know what they are for; the engine cannot be
    // wrong about it.
    const key: RoomKey = {
      confirmed_objects: [{
        product: 'Waterite treatment vessel', role: null, photographs: ['a.jpg'],
        confirmed_by: { product: 'plate', role: null },
      }],
    }
    const r = scoreRun(key, [proposal({ id: 'p1', label: 'iron filter', mediaIds: ['a'] })], matches)
    assert.equal(r.counts['key-uncertain'], 1)
    assert.equal(r.counts.wrong, 0)
    assert.match(r.judged[0]!.why, /no role/)
  })
})

describe('rule 6 — a model number off by a character is the plate, not the engine', () => {
  it('separates a one-character misread from a wrong identification', () => {
    const key: RoomKey = {
      confirmed_objects: [{
        product: 'Grundfos circulator', role: 'left circulator', model: 'UP26-99F',
        photographs: ['a.jpg'], confirmed_by: { product: 'plate', role: 'household' },
      }],
    }
    const r = scoreRun(key, [proposal({ id: 'p1', label: 'circulation pump', modelRead: 'UP26-99U', mediaIds: ['a'] })], matches)
    assert.equal(r.counts['plate-legibility'], 1)
    assert.equal(r.counts.wrong, 0)
    assert.match(r.judged[0]!.why, /one character/)
  })

  it('⚑ ignores a model number read off something else in the same photograph', () => {
    // The bleed, as a test. `models` is photograph-level: in the first real run
    // the proposal "Fire extinguisher (red cylinder)" carried the geothermal
    // unit's `TTV049BGC01ARKS` because both were in the frame. Rule 6 asks a
    // question about THIS object's plate, so the photograph's list must not
    // answer it — a legibility verdict earned by someone else's plate excuses an
    // identification that was simply wrong.
    const key: RoomKey = {
      confirmed_objects: [{
        product: 'Grundfos circulator', role: 'left circulator', model: 'UP26-99F',
        photographs: ['a.jpg'], confirmed_by: { product: 'plate', role: 'household' },
      }],
    }
    const r = scoreRun(
      key,
      [proposal({ id: 'p1', label: 'fire extinguisher', models: ['UP26-99U'], mediaIds: ['a'] })],
      matches,
    )
    assert.equal(r.counts['plate-legibility'], 0, 'the photograph-level list is not this object\'s plate')
    assert.equal(r.counts.wrong, 1)
  })

  it('does not swallow two genuinely different pumps', () => {
    // `UP26-99F` and `UPS26-99U` are two edits apart and two real objects in
    // that room. A tolerant matcher would merge them and hide a real duplicate.
    assert.equal(nearlySameModel('UP26-99F', 'UPS26-99U'), false)
    assert.equal(nearlySameModel('UP26-99U', 'UPS26-99U'), true, 'one insertion')
    assert.equal(nearlySameModel('600545B', '600545C'), true, 'one substitution')
    assert.equal(nearlySameModel('AB1', 'AB2'), false, 'too short to mean anything')
  })

  it('a correct role wins over the legibility bucket', () => {
    // Getting the object right with a mistyped model is a correct answer, not a
    // legibility note — the bucket is for the case where the misread is the only
    // thing that went wrong.
    const key: RoomKey = {
      confirmed_objects: [{
        product: 'Grundfos circulator', role: 'left circulator', model: 'UP26-99F',
        photographs: ['a.jpg'], confirmed_by: { product: 'plate', role: 'household' },
      }],
    }
    const r = scoreRun(key, [proposal({ id: 'p1', label: 'left circulator', models: ['UP26-99U'], mediaIds: ['a'] })], matches)
    assert.equal(r.counts.correct, 1)
    assert.equal(r.counts['plate-legibility'], 0)
  })
})

describe('rules 1 and 5 — it gates nothing, and every disagreement resolves both ways', () => {
  it('returns a report on total failure rather than throwing', () => {
    const key: RoomKey = {
      confirmed_objects: [{ product: 'x', role: 'y', photographs: ['a.jpg'], confirmed_by: { product: 'plate', role: 'household' } }],
    }
    const r = scoreRun(key, [], matches)
    assert.equal(r.counts.wrong, 1)
    assert.ok(r.note.length > 0, 'a report, not an exception')
  })

  it('offers key-wrong on every disagreement, so the key cannot outrank the house', () => {
    const key: RoomKey = {
      confirmed_objects: [{ product: 'x', role: 'a water softener', photographs: ['a.jpg'], confirmed_by: { product: 'plate', role: 'household' } }],
    }
    const r = scoreRun(key, [proposal({ id: 'p1', label: 'iron filter', mediaIds: ['a'] })], matches)
    assert.deepEqual(r.judged[0]!.resolvableAs, ['engine-wrong', 'key-wrong'])
    // And on a miss too — the key can be wrong about a thing existing.
    const miss = scoreRun(key, [], matches)
    assert.deepEqual(miss.missed[0]!.resolvableAs, ['engine-wrong', 'key-wrong'])
  })

  it('reports false positives, which only the completeness attestation makes scoreable', () => {
    const key: RoomKey = {
      confirmed_objects: [{ product: 'x', role: 'y', photographs: ['a.jpg'], confirmed_by: { product: 'plate', role: 'household' } }],
    }
    const r = scoreRun(key, [
      proposal({ id: 'p1', label: 'y', mediaIds: ['a'] }),
      proposal({ id: 'p2', label: 'reverse osmosis system', classId: 'reverse-osmosis', mediaIds: ['b'] }),
    ], matches)
    assert.equal(r.counts.correct, 1)
    assert.deepEqual(r.falsePositives.map((f) => f.classId), ['reverse-osmosis'])
    assert.match(r.note, /complete for existence/)
  })
})

describe('⚑ rule 8 — the key has two fields and both are read', () => {
  const key: RoomKey = {
    confirmed_objects: [{
      product: 'automatic storage water heater',
      role: 'geothermal preheat store with its breaker off',
      photographs: ['a.jpg'],
      confirmed_by: { product: 'plate', role: 'household' },
    }],
  }

  it('scores a proposal naming the PRODUCT correct, and says it was the product', () => {
    // The plate lane's whole job. On the first real run it read three model
    // numbers exactly and scored 0, because only `role` was ever compared.
    const r = scoreRun(key, [proposal({ id: 'p1', label: 'automatic storage water heater', mediaIds: ['a'], lane: 'plate' })], matches)
    assert.equal(r.counts.correct, 1)
    assert.equal(r.judged[0]!.matchedOn, 'product')
    assert.match(r.judged[0]!.why, /PRODUCT agrees/)
    assert.equal(r.byLane.plate!.correctOnProduct, 1)
    assert.equal(r.byLane.plate!.correctOnRole, 0)
  })

  it('prefers role when both would match, because role is the stronger statement', () => {
    const r = scoreRun(
      key,
      [proposal({ id: 'p1', label: 'geothermal preheat store with its breaker off — automatic storage water heater', mediaIds: ['a'], lane: 'appearance' })],
      matches,
    )
    assert.equal(r.judged[0]!.matchedOn, 'role')
    assert.equal(r.byLane.appearance!.correctOnRole, 1)
    assert.equal(r.byLane.appearance!.correctOnProduct, 0)
  })

  it('is still wrong when neither field matches, and names both in the reason', () => {
    // The half that lets this fail. Without it, reading a second field would
    // look like an improvement while simply making everything correct.
    const r = scoreRun(key, [proposal({ id: 'p1', label: 'a cardboard box', mediaIds: ['a'] })], matches)
    assert.equal(r.counts.wrong, 1)
    assert.equal(r.judged[0]!.matchedOn, undefined)
    assert.match(r.judged[0]!.why, /or the product/)
  })

  it('records a product match on a key object whose role is unresolved, without changing rule 3', () => {
    // Rule 3 is ratified: the key does not know what this is for, so the engine
    // cannot be marked wrong about it. That outcome is untouched — what is new
    // is noticing that a proposal did name the product.
    const noRole: RoomKey = {
      confirmed_objects: [{ product: 'universal retention tank', role: null, photographs: ['a.jpg'] }],
    }
    const r = scoreRun(noRole, [proposal({ id: 'p1', label: 'universal retention tank', mediaIds: ['a'] })], matches)
    assert.equal(r.counts['key-uncertain'], 1, 'rule 3 outcome is unchanged')
    assert.equal(r.counts.correct, 0)
    assert.equal(r.judged[0]!.matchedOn, 'product')
    assert.match(r.judged[0]!.why, /does name its product/)
  })
})
