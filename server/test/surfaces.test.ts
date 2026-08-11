/**
 * Surfaces and who may assert a manufacturer — Amendment 11 pass 1, pure half.
 *
 * **Every case here is a measured failure from one real room**, not an invented
 * shape. The NextEnergy decal, the two pump plates in one frame, and the
 * WellMate's `N/A` cells are the three things pass 1 exists to stop losing.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  adjudicateManufacturer, AUTHORITATIVE_SURFACE, DECLARED_SURFACES, fieldKey,
  isManufacturerField, isModelField, normaliseSurface, plateModels, statesNotApplicable,
  type FieldClaim,
} from '../src/engine/surfaces.js'

const claim = (over: Partial<FieldClaim> & { field: string; value: string }): FieldClaim => ({
  readingId: 'r1',
  mediaId: 'm1',
  surface: 'nameplate',
  fieldKey: fieldKey(over.field),
  unreadable: false,
  ...over,
})

describe('the surface vocabulary fails open, and that is safe here for a reason', () => {
  it('recognises every surface Amendment 11 declares', () => {
    for (const s of DECLARED_SURFACES) {
      assert.deepEqual(normaliseSurface(s), { surface: s, recognised: true }, s)
    }
  })

  it('keeps a word it has not met rather than nulling it', () => {
    // A surface is a fact about a photograph, not a choice from our taxonomy.
    // `cast in relief on the housing` is a real surface and is on no list.
    assert.deepEqual(normaliseSurface('cast in relief'), { surface: 'cast-in-relief', recognised: false })
  })

  it('sends an empty answer to surface-unclear rather than to a guess', () => {
    assert.deepEqual(normaliseSurface(''), { surface: 'surface-unclear', recognised: true })
    assert.deepEqual(normaliseSurface(undefined), { surface: 'surface-unclear', recognised: true })
  })

  it('an UNRECOGNISED surface can never assert a manufacturer, which is why fail-open is safe', () => {
    // The usual danger of fail-open is that an unknown word acquires authority.
    // Here it cannot: authority belongs to exactly one word, and a new one is
    // by construction not that word.
    const r = adjudicateManufacturer([
      claim({ surface: 'cast-in-relief', field: 'Manufacturer', value: 'Acme' }),
    ])
    assert.equal(r.asserted, null)
    assert.equal(AUTHORITATIVE_SURFACE, 'nameplate')
  })
})

describe('the NextEnergy case — a decal beside a plate', () => {
  it('lets the nameplate win and KEEPS the decal beside it', () => {
    // Two identification runs reported the manufacturer as NextEnergy. The
    // nameplate says CLIMATEMASTER; NextEnergy is a yellow homeowner warranty
    // sticker on the same cabinet, in the same photograph.
    const r = adjudicateManufacturer([
      claim({ readingId: 'plate', surface: 'nameplate', field: 'Manufacturer', value: 'CLIMATEMASTER' }),
      claim({ readingId: 'decal', surface: 'adjacent-sticker', field: 'Manufacturer', value: 'NextEnergy' }),
    ])
    assert.equal(r.asserted, 'CLIMATEMASTER')
    assert.equal(r.supportedBy, 'nameplate')
    assert.equal(r.competing.length, 1, 'the decal is retained, not deleted')
    assert.equal(r.competing[0]!.value, 'NextEnergy')
    assert.match(r.why, /NextEnergy/)
  })

  it('asserts NOTHING when only a decal supports a manufacturer', () => {
    // The rule as written: *a label may not assert a manufacturer that only a
    // non-nameplate surface supports.* Not "the decal wins for want of a
    // better answer" — a name on a decal is the decal's, not the machine's.
    const r = adjudicateManufacturer([
      claim({ surface: 'adjacent-sticker', field: 'Manufacturer', value: 'NextEnergy' }),
    ])
    assert.equal(r.asserted, null)
    assert.equal(r.supportedBy, null)
    assert.equal(r.claims.length, 1, 'and the reading is still there as evidence')
    assert.match(r.why, /may not assert/)
  })

  it('states a conflict between two nameplates rather than picking one', () => {
    const r = adjudicateManufacturer([
      claim({ readingId: 'a', field: 'Manufacturer', value: 'Grundfos' }),
      claim({ readingId: 'b', field: 'Manufacturer', value: 'Taco' }),
    ])
    assert.equal(r.asserted, null)
    assert.match(r.why, /two objects in one photograph|different manufacturers/)
  })

  it('reports nothing read as nothing read, not as a conflict', () => {
    assert.equal(adjudicateManufacturer([]).asserted, null)
    assert.equal(adjudicateManufacturer([]).competing.length, 0)
    // A manufacturer field present and illegible is a third state again.
    const r = adjudicateManufacturer([claim({ field: 'Manufacturer', value: 'CLIM_____', unreadable: true })])
    assert.equal(r.asserted, null)
    assert.equal(r.claims.length, 1)
    assert.match(r.why, /legible/)
  })

  it('does not treat an agreeing decal as competition', () => {
    const r = adjudicateManufacturer([
      claim({ readingId: 'plate', surface: 'nameplate', field: 'Manufacturer', value: 'Grundfos' }),
      claim({ readingId: 'fascia', surface: 'fascia-brand', field: 'brand', value: 'GRUNDFOS' }),
    ])
    assert.equal(r.asserted, 'Grundfos')
    assert.equal(r.competing.length, 0, 'same answer from two surfaces is corroboration, not conflict')
  })
})

describe('model numbers for the scoring harness rule 6', () => {
  it('returns BOTH plates when one photograph holds two', () => {
    // `UP26-99F` and `UPS26-99U` are two real pumps in one frame. Collapsing
    // them to one model string is precisely what rule 6 exists to separate.
    const models = plateModels([
      claim({ readingId: 'a', field: 'Model', value: 'UP26-99F' }),
      claim({ readingId: 'b', field: 'Model', value: 'UPS26-99U' }),
    ])
    assert.deepEqual(models.map((m) => m.value), ['UP26-99F', 'UPS26-99U'])
  })

  it('takes a model only from a nameplate', () => {
    // Rule 6's claim is about a photograph of a plate. A model number on a
    // carton or in a manual is different evidence and a mismatch means
    // something else entirely.
    assert.deepEqual(
      plateModels([
        claim({ surface: 'document', field: 'Model', value: 'G9-50SDE' }),
        claim({ surface: 'adjacent-sticker', field: 'Model', value: 'WRONG-1' }),
      ]),
      [],
    )
  })

  it('skips an illegible model rather than offering a partial read as one', () => {
    assert.deepEqual(plateModels([claim({ field: 'Model', value: 'Q1373_5_9', unreadable: true })]), [])
  })

  it('knows the field names that name a model, and that serial is not one', () => {
    for (const f of ['Model', 'MODEL NO.', 'Cat. No.', 'Part Number', 'Type']) {
      assert.ok(isModelField(fieldKey(f)), f)
    }
    // A serial identifies the unit; a model identifies the product. Pass 2
    // resolves them to different things, so merging them here would be wrong
    // in a way nothing downstream could detect.
    assert.equal(isModelField(fieldKey('Serial No.')), false)
    assert.equal(isModelField(fieldKey('Tank Volume')), false)
  })

  it('knows the field names that name a maker', () => {
    for (const f of ['Manufacturer', 'Made by', 'BRAND', 'Mfr.']) {
      assert.ok(isManufacturerField(fieldKey(f)), f)
    }
    assert.equal(isManufacturerField(fieldKey('Model')), false)
  })

  it('reduces a field name for matching without deciding anything', () => {
    assert.equal(fieldKey('Model No.'), 'model no')
    assert.equal(fieldKey('  FACTORY PRECHARGE PRESSURE  '), 'factory precharge pressure')
  })
})

describe('N/A is a fact, and this is the WellMate', () => {
  it('recognises the ways a plate says not applicable', () => {
    for (const v of ['N/A', 'n/a', ' NA ', 'None', '—', '--', 'not applicable']) {
      assert.ok(statesNotApplicable(v), v)
    }
  })

  it('does not mistake a real value for an absence', () => {
    // `0` is a reading. `N/A` is a statement that the property does not exist.
    assert.equal(statesNotApplicable('0'), false)
    assert.equal(statesNotApplicable('40 psig'), false)
    assert.equal(statesNotApplicable('NA-4000'), false, 'a model number that starts with NA')
  })
})
