/**
 * §1g.1 — unverifiable provenance must survive aggregation.
 *
 * **The tests that matter here are the aggregation ones**, not the read ones.
 * Marking a value unverifiable when you look at it directly is easy. The spec's
 * actual worry is one layer down: *"if that flag is dropped when values roll into
 * a fleet or registry view, an unverifiable install year re-enters looking
 * verified — the exact failure Table I exists to prevent, reintroduced one layer
 * down where nobody is looking."*
 *
 * So the suite goes: read it right · keep it through one aggregation · keep it
 * through a merge of aggregations · and prove the module offers no way to lose
 * it.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { componentGraph } from '../src/audit/components.js'
import { naReasonsOf } from '../src/audit/completeness.js'
import { propertyEvidence } from '../src/audit/propertyEvidence.js'
import {
  aggregate, describeProvenance, mergeBreakdowns, provenanceMap, verify,
  type PinResolutions, type VerifiedValue,
} from '../src/audit/provenance.js'
import { runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, readReference, repoRoot, scratchDir, TEST_OPERATOR } from './helpers.js'

/**
 * A config that declares Table I.
 *
 * Synthetic, and honestly so: Table I arrived at master v1.9–v1.11 and the
 * reference export carries config v1.2.1, which declares none of it. Testing the
 * mechanism against a literal is the only way to exercise it at all — and a test
 * asserting the reference export has no declarations is the companion, so the
 * absence is a recorded fact rather than an untested assumption.
 */
const SNAPSHOT = {
  naReasons: [
    { id: 'none-present', feedsGapList: false, recordsFinding: true },
    { id: 'no-access', feedsGapList: true, recordsFinding: false },
  ],
  componentLists: [
    {
      types: ['water-heater'],
      items: [
        { id: 'wh.nameplate', satisfy: 'photo', attest: 'evidence' },
        { id: 'wh.serial', satisfy: 'note', attest: 'evidence', capturedBy: 'wh.nameplate' },
        { id: 'wh.age', satisfy: 'note', attest: 'evidence', capturedBy: 'wh.nameplate' },
      ],
    },
    {
      types: ['water-treatment'],
      items: [
        { id: 'wt.nameplate', satisfy: 'photo', attest: 'evidence' },
        { id: 'wt.serial', satisfy: 'note', attest: 'evidence', capturedBy: 'wt.nameplate' },
      ],
    },
    { types: ['water-softener'], inherits: 'water-treatment', items: [{ id: 'ws.salt' }] },
  ],
}

const GRAPH = componentGraph(SNAPSHOT)
const PROVENANCE = provenanceMap(SNAPSHOT)
const NA = naReasonsOf(SNAPSHOT)

const pinRes = (entries: [string, { kind: string | null; reasonId: string | null }][]): PinResolutions =>
  new Map(entries)

const check = (
  valueItem: string,
  pinResolutions: PinResolutions,
  componentType: string | null = 'water-heater',
) =>
  verify({
    valueItem,
    field: valueItem.split('.')[1] ?? valueItem,
    value: 'ABC123',
    provenance: PROVENANCE,
    pinResolutions,
    graph: GRAPH,
    componentType,
    recordsFinding: NA.recordsFinding,
  })

describe('reading Table I', () => {
  it('reads the declaration off the item, the way every other per-item rule is declared', () => {
    assert.equal(PROVENANCE.get('wh.serial'), 'wh.nameplate')
    assert.equal(PROVENANCE.get('wh.age'), 'wh.nameplate')
    assert.equal(PROVENANCE.get('wh.nameplate'), undefined, 'the photo item is not its own source')
  })

  /** Read in more than one shape, because the observable one does not exist yet. */
  it('also reads a top-level declaration, in list or map form', () => {
    assert.equal(provenanceMap({ provenance: [{ valueItem: 'a.x', photoItem: 'a.p' }] }).get('a.x'), 'a.p')
    assert.equal(provenanceMap({ tableI: { 'b.y': 'b.p' } }).get('b.y'), 'b.p')
  })

  /**
   * The recorded fact behind the synthetic fixture: the reference export's config
   * predates Table I entirely. Asserted so the absence stays a checked claim
   * rather than something a later reader assumes was tested against real data.
   */
  it('finds no declarations in the reference export config, which predates Table I', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })
    const { snapshot } = propertyEvidence(db, ids.propertyId)
    assert.equal(snapshot.configVersion, '1.2.1')
    assert.equal(provenanceMap(snapshot).size, 0, 'so every value there reads unknown-provenance, not verified')
  })
})

describe('verification is co-visibility on the same pin', () => {
  it('verifies a value whose capturing photo was satisfied on this pin', () => {
    const v = check('wh.serial', pinRes([['wh.nameplate', { kind: 'satisfied', reasonId: null }]]))
    assert.equal(v.verification, 'verified')
    assert.equal(v.capturedBy, 'wh.nameplate')
  })

  /** The case Table I is written for. */
  it('marks a value unverifiable when its nameplate was recorded absent on this pin', () => {
    const v = check('wh.serial', pinRes([['wh.nameplate', { kind: 'na', reasonId: 'none-present' }]]))
    assert.equal(v.verification, 'unverifiable')
    assert.match(v.because, /no photograph backs this value/)
  })

  /**
   * **Not global existence of the item somewhere in the config.**
   *
   * `wh.nameplate` is declared, and satisfied on a different pin. This pin's
   * nameplate was recorded absent. The two differ on exactly the pin where it
   * matters, and a config-level check would call this verified.
   */
  it('does not let another pin\'s nameplate verify this pin\'s value', () => {
    const thisPin = pinRes([['wh.nameplate', { kind: 'na', reasonId: 'none-present' }]])
    const otherPin = pinRes([['wh.nameplate', { kind: 'satisfied', reasonId: null }]])

    assert.equal(check('wh.serial', thisPin).verification, 'unverifiable')
    assert.equal(check('wh.serial', otherPin).verification, 'verified')
    assert.ok(PROVENANCE.has('wh.serial'), 'the item is declared config-wide either way')
  })

  /** §1b — resolved across component inheritance. */
  it('resolves the capturing item through an inherited type', () => {
    const softener = pinRes([['wt.nameplate', { kind: 'na', reasonId: 'none-present' }]])
    const v = verify({
      valueItem: 'ws.serial', field: 'serial', value: 'X',
      provenance: PROVENANCE, pinResolutions: softener, graph: GRAPH,
      componentType: 'water-softener', recordsFinding: NA.recordsFinding,
    })
    assert.equal(v.capturedBy, 'wt.nameplate', 'a softener inherits water-treatment\'s provenance')
    assert.equal(v.verification, 'unverifiable')
  })

  /**
   * The third state, and the reason there is one.
   *
   * A config declaring no capturing item cannot tell us a value is verified.
   * Reporting `verified` here would be §1g.1's failure committed by omission —
   * a value with no provenance declaration looking exactly like one with a
   * photograph behind it.
   */
  it('reports unknown provenance rather than verified when nothing declares a source', () => {
    const v = check('wh.model', pinRes([['wh.nameplate', { kind: 'satisfied', reasonId: null }]]))
    assert.equal(v.verification, 'unknown-provenance')
    assert.notEqual(v.verification, 'verified')
    assert.match(v.because, /not the same as it being verified/)
  })

  it('reports unknown when the capturing item was never answered on this pin', () => {
    const v = check('wh.serial', pinRes([]))
    assert.equal(v.verification, 'unknown-provenance')
    assert.match(v.because, /neither confirmed nor ruled out/)
  })

  /** A failure to reach is not a confirmed absence, and both are unverifiable. */
  it('treats no-access as unverifiable too, with its own wording', () => {
    const v = check('wh.serial', pinRes([['wh.nameplate', { kind: 'na', reasonId: 'no-access' }]]))
    assert.equal(v.verification, 'unverifiable')
    assert.match(v.because, /no-access/)
  })
})

describe('the declaration survives aggregation', () => {
  const values: VerifiedValue[] = [
    check('wh.serial', pinRes([['wh.nameplate', { kind: 'satisfied', reasonId: null }]])),
    check('wh.age', pinRes([['wh.nameplate', { kind: 'satisfied', reasonId: null }]])),
    check('wh.serial', pinRes([['wh.nameplate', { kind: 'na', reasonId: 'none-present' }]])),
    check('wh.model', pinRes([['wh.nameplate', { kind: 'satisfied', reasonId: null }]])),
  ]

  /** §1g.1's actual subject. */
  it('keeps every unverifiable value named through one aggregation', () => {
    const b = aggregate(values)
    assert.deepEqual(
      [b.verified, b.unverifiable, b.unknownProvenance, b.total],
      [2, 1, 1, 4],
    )
    assert.equal(b.unverifiableValues.length, 1, 'named, not counted')
    assert.match(b.unverifiableValues[0]!.because, /none-present/)
  })

  /** The fleet or registry view, which is where the spec says it gets lost. */
  it('keeps them named through a merge of aggregations', () => {
    const merged = mergeBreakdowns([aggregate(values), aggregate(values)])
    assert.deepEqual([merged.verified, merged.unverifiable, merged.total], [4, 2, 8])
    assert.equal(merged.unverifiableValues.length, 2,
      'an unverifiable install year must not re-enter a fleet view looking verified')
  })

  /**
   * The structural half. A behavioural test proves today's aggregation carries
   * the flag; this proves the module offers no way NOT to.
   *
   * The failure §1g.1 describes does not arrive as somebody deciding to drop the
   * flag — it arrives as somebody reaching for the convenient function that
   * returns a number. So there is no such function.
   */
  it('offers no way to reduce a value set to a single number', () => {
    const source = readFileSync(join(repoRoot, 'server', 'src', 'audit', 'provenance.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

    // Every exported function's return type, so a bare-number aggregate cannot
    // be added without this failing.
    for (const m of source.matchAll(/export (?:function|const) (\w+)[^\n]*?:\s*([^={\n]+)/g)) {
      const [, name, returns] = m
      if (name === 'verify' || name === 'provenanceMap' || name === 'aggregate') continue
      assert.ok(
        !/^\s*number\s*$/.test(returns ?? ''),
        `${name} returns a bare number — §1g.1's failure is somebody calling exactly that`,
      )
    }

    // And the breakdown always carries the list beside the counts.
    const b = aggregate(values)
    assert.ok(Array.isArray(b.unverifiableValues) && Array.isArray(b.unknownValues))
  })

  it('never renders a bare count of transcribed values', () => {
    const lines = describeProvenance(aggregate(values)).join('\n')
    assert.match(lines, /2 of 4 value\(s\) backed by a photograph/)
    assert.match(lines, /1 unverifiable/)
    assert.match(lines, /unverifiable — serial/, 'and names it')
    assert.doesNotMatch(lines, /^\d+ serials recorded/m,
      'Table I exists because that sentence is a lie when one has no photograph')
  })

  it('says so plainly when there is nothing transcribed', () => {
    assert.deepEqual(describeProvenance(aggregate([])), ['no transcribed values'])
  })
})

describe('pin-scoped resolutions', () => {
  /**
   * Co-visibility needs them, and the item-keyed map cannot answer it: that map
   * says whether `wh.nameplate` was satisfied *somewhere*.
   */
  it('are read from the import and kept against the pin', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })

    const evidence = propertyEvidence(db, ids.propertyId)
    assert.ok(evidence.pinResolutions.size > 0, 'the reference export has pin-scoped resolutions')

    const pinScoped = db.prepare(
      `SELECT COUNT(DISTINCT scope_pin_id) AS n FROM resolutions
        WHERE property_id = ? AND scope_kind = 'pin' AND scope_pin_id IS NOT NULL`,
    ).get(ids.propertyId) as { n: number }
    assert.equal(evidence.pinResolutions.size, pinScoped.n, 'one entry per pin that has any')

    // And zone-scoped answers do not leak into a pin's map, which would make a
    // room's canvas look like a pin's nameplate.
    for (const [, forPin] of evidence.pinResolutions) {
      assert.ok(forPin.size > 0)
    }
  })
})
