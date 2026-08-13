/**
 * Stage 1 of the comparison pass.
 *
 * **The fixture is the mechanical room's real duplicate classes**, because the
 * measurement this file exists to defend is a claim about that room: five of
 * eight dissolve at binding and three remain, and none of the three is an
 * identity problem.
 *
 * Nothing here calls a model. Stage 1 is free by construction and a test that
 * needed a key would be testing something else.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compareProposals, labelWords, type Binding, type Proposal } from '../src/engine/compare.js'

const ZONE = 'zone-mech'
let n = 0
const p = (label: string, classId: string | null, mediaIds: string[] = [`m${n++}`]): Proposal => ({
  id: `o-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${n}`,
  zoneId: ZONE,
  classId,
  label,
  mediaIds,
  derivedFrom: null,
  modelRead: null,
  generationId: null,
})

describe('the derivation runs both ways, and the second way is the one that matters', () => {
  it('two objects bound to one product are the same, with no model call', () => {
    const a = p('Captive air pressure tank', 'well-pressure-tank')
    const b = p('Well pressure tank', 'well-pressure-tank')
    const bindings: Binding[] = [
      { objectId: a.id, productKey: 'burcam-600545b' },
      { objectId: b.id, productKey: 'burcam-600545b' },
    ]
    const r = compareProposals([a, b], bindings)

    assert.equal(r.derivedSame.length, 1)
    assert.equal(r.derivedSame[0]!.productKey, 'burcam-600545b')
    assert.equal(r.derivedDifferent.length, 0)
    assert.deepEqual(r.candidates, [], 'a settled question is not put back in front of a human')
    assert.deepEqual(r.residue, [])
  })

  it('two objects bound to DIFFERENT products are different — the case a merge pass gets wrong', () => {
    /**
     * The Burcam 600545B and the WellMate UT-450 are both grey vertical tanks in
     * the same room, both proposed as `well-pressure-tank`. **Every signal stage
     * 1 has says "same".** Only the binding says otherwise.
     *
     * A comparison built only to merge would have merged them — and a merge is
     * the invisible half: a duplicate shows in a list, a wrong merge shows
     * nowhere.
     */
    const a = p('Water pressure tank assembly', 'well-pressure-tank', ['shared-photo'])
    const b = p('Water pressure tank — well system', 'well-pressure-tank', ['shared-photo'])
    const r = compareProposals([a, b], [
      { objectId: a.id, productKey: 'burcam-600545b' },
      { objectId: b.id, productKey: 'wellmate-ut-450' },
    ])

    assert.equal(r.derivedDifferent.length, 1)
    assert.deepEqual(r.derivedDifferent[0]!.keys, ['burcam-600545b', 'wellmate-ut-450'])
    assert.equal(r.derivedSame.length, 0)
    assert.deepEqual(r.candidates, [], 'and it is not offered as a candidate either — it is answered')
  })

  it('says the derivation did not run, rather than reporting zero as a result', () => {
    // A report reading `bound: 0` is indistinguishable from a derivation that
    // ran and found nothing. Pass 2 is unbuilt; the note has to carry that.
    const r = compareProposals([p('Water softener', 'water-softener')])
    assert.equal(r.bound, 0)
    assert.match(r.note, /PRE-binding state/)
    assert.match(r.note, /not a derivation that found nothing/)
  })
})

describe('candidates, strongest signal first, each object claimed once', () => {
  it('a shared photograph outranks a shared class', () => {
    const a = p('Electrical panel', 'electrical-panel', ['photo-7'])
    const b = p('Electrical service panel', 'electrical-panel', ['photo-7'])
    const r = compareProposals([a, b])

    assert.equal(r.candidates.length, 1, 'one group, not two — the same pair under two headings is two rows for one question')
    assert.equal(r.candidates[0]!.signal, 'shared-photograph')
    assert.match(r.candidates[0]!.detail, /photo-7/)
  })

  it('catches a duplicate that landed under two different classes', () => {
    // The Vanée: proposed once as `hrv-erv` and once as `dehumidifier-whole-home`.
    // No shared class and no shared photograph — only the words agree.
    const a = p('Whole-home dehumidifier — Vanee 100H', 'dehumidifier-whole-home')
    const b = p('Water treatment system — Vanee 100H ERV', 'hrv-erv')
    const r = compareProposals([a, b])

    assert.equal(r.candidates.length, 1)
    assert.equal(r.candidates[0]!.signal, 'shared-label-words')
    assert.match(r.candidates[0]!.detail, /vanee/)
  })

  it('leaves a genuinely unrelated object in the residue', () => {
    const r = compareProposals([
      p('Fire extinguisher', 'fire-extinguisher'),
      p('Floor drain', 'floor-drain'),
    ])
    assert.deepEqual(r.candidates, [])
    assert.equal(r.residue.length, 2, 'the residue is the measurement, so it must not absorb everything')
  })

  it('never groups across zones', () => {
    const a = p('Water softener', 'water-softener')
    const b = { ...p('Water softener', 'water-softener'), zoneId: 'zone-kitchen' }
    const r = compareProposals([a, b])
    assert.deepEqual(r.candidates, [], 'v1 is zone-scoped — the same object in two rooms is a harder problem')
  })
})

describe('the mechanical room, before and after binding', () => {
  /**
   * **The claim under test:** five of the eight duplicate classes dissolve at
   * binding, and the three that remain are `sediment-filter`,
   * `appliance-water-connector` and `security-panel` — **none of which is an
   * identity problem.** One is a consumable in the object channel (#95), one is
   * a connective (#93), one is a class error.
   */
  const room = (): Proposal[] => [
    p('Captive air pressure tank', 'well-pressure-tank'),
    p('Well pressure tank', 'well-pressure-tank'),
    p('Water softener', 'water-softener'),
    p('Water Depot softener system — Platinum', 'water-softener'),
    p('Gas water heater', 'water-heater-gas'),
    p('Gas water heater (additional unit)', 'water-heater-gas'),
    p('Propane tank', 'fuel-tank-propane'),
    p('Propane tank — blue', 'fuel-tank-propane'),
    p('Electrical panel', 'electrical-panel'),
    p('Electrical service panel', 'electrical-panel'),
    // The residue — unplated, and each a different kind of not-an-identity-problem.
    p('Sediment filter cartridge housing', 'sediment-filter'),
    p('Water filter cartridges', 'sediment-filter'),
    p('Water line from pump', 'appliance-water-connector'),
    p('Supply line to appliance', 'appliance-water-connector'),
    p('Septic system control interface', 'security-panel'),
    p('Control panel', 'security-panel'),
  ]

  it('before binding, every pair is only a candidate — nothing is settled', () => {
    const r = compareProposals(room())
    assert.equal(r.bound, 0)
    assert.equal(r.derivedSame.length + r.derivedDifferent.length, 0)
    assert.equal(r.candidates.length, 8, 'eight duplicate classes, eight groups')
    assert.deepEqual(r.residue, [], 'all sixteen are grouped, so none is loose — but none is answered either')
  })

  it('after binding the five plated classes, only the three unplated remain', () => {
    const objects = room()
    const plated = objects.slice(0, 10)
    // Two products per class — which is what makes five of these DERIVED
    // DIFFERENT rather than merged, and is the whole of §B's argument.
    const bindings: Binding[] = plated.map((o, i) => ({
      objectId: o.id,
      productKey: `product-${Math.floor(i / 2)}-${i % 2}`,
    }))

    const r = compareProposals(objects, bindings)

    assert.equal(r.bound, 10, 'the plated half is answered')
    assert.equal(r.derivedDifferent.length, 5, 'five pairs settled as different, free and certain')
    assert.equal(r.derivedSame.length, 0)

    const remaining = new Set(r.candidates.flatMap((c) => c.objectIds).concat(r.residue))
    assert.equal(remaining.size, 6, 'exactly the six unplated objects are left')
    for (const o of plated) assert.ok(!remaining.has(o.id), `${o.label} is settled, not re-asked`)

    assert.equal(r.candidates.length, 3, 'sediment-filter, appliance-water-connector, security-panel')
    assert.match(r.note, /decides whether stage 2 is worth building/)
  })
})

describe('label words', () => {
  it('drops the words that would group everything with everything', () => {
    // `system`, `unit` and `assembly` appear in a third of the room's labels.
    // Without them in the stop list the weakest signal becomes the loudest.
    assert.deepEqual([...labelWords('Water treatment system assembly')].sort(), ['treatment', 'water'])
  })
})
