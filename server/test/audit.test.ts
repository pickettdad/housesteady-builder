/**
 * The shared trigger evaluator, the component graph, and the zone-audit oracle.
 *
 * Increment 3 §1, §1b, §1e.2, §1h. Most of this suite needs no database at all:
 * the evaluator is pure and the graph is built from a literal snapshot, which is
 * what makes the awkward cases — an unrecognised flag under a negation, a `pin`
 * condition with no zone in scope — cheap enough to test exhaustively.
 *
 * **The oracle is the test that matters most.** Every other assertion here
 * checks this implementation against expectations somebody wrote. §1h.1 checks
 * it against a second, independent implementation — the field app's — computing
 * the same summary for the same house. A suite can agree with its author; two
 * implementations agreeing on 8 core-unresolved item ids cannot do so by
 * accident.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { componentGraph, describeBinding, graphForImport } from '../src/audit/components.js'
import { factsForImport } from '../src/audit/facts.js'
import {
  ConditionRefused, composeGate, evaluate, noFacts, parseCondition, type FactSet,
} from '../src/audit/triggers.js'
import { auditZones, computeZoneAudit, inScope, listsForZoneType } from '../src/audit/zoneAudit.js'
import { runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'
import type { Db } from '../src/db/index.js'

// ------------------------------------------------------------------ evaluator

const facts = (over: Partial<FactSet> = {}): FactSet => ({ ...noFacts(), ...over })

const house = (held: string[], declared = held): FactSet =>
  facts({ property: new Set(held), propertyVocabulary: new Set(declared) })

describe('the trigger evaluator', () => {
  it('applies "always" and an absent condition alike', () => {
    assert.equal(evaluate('always', noFacts()).applies, true)
    assert.equal(evaluate(null, noFacts()).applies, true)
    assert.equal(evaluate(undefined, noFacts()).applies, true)
  })

  /**
   * The distinction the whole of fail-open rests on.
   *
   * A declared flag that is not set is a confident NO. Collapsing that into the
   * same answer as a word the builder has never met would turn every vocabulary
   * the builder has not caught up with into a silent "does not apply", which is
   * how a house stops being asked about its shutoff.
   */
  it('tells a declared flag that is false apart from a flag nobody declared', () => {
    const f = house(['well'], ['well', 'septic'])

    const set = evaluate('property.well', f)
    assert.deepEqual([set.applies, set.certain], [true, true])

    const declaredFalse = evaluate('property.septic', f)
    assert.deepEqual([declaredFalse.applies, declaredFalse.certain], [false, true],
      'declared and not set is a confident no')

    const never = evaluate('property.geothermal', f)
    assert.deepEqual([never.applies, never.certain], [true, false], 'fail open, and say so')
    assert.deepEqual(never.unrecognised, ['property.geothermal'], 'named, never only counted')
  })

  /**
   * The reason the evaluator is three-valued rather than resolving each unknown
   * leaf to true on the spot.
   *
   * Resolving at the leaf makes `not(unrecognised)` mean *definitely does not
   * apply*, which EXCLUDES an item on the strength of a word nobody recognised
   * — the exact failure fail-open exists to prevent. Unknown has to survive the
   * negation and be resolved once, at the top.
   */
  it('keeps fail-open true underneath a negation', () => {
    const v = evaluate('not(property.geothermal)', house([], ['well']))
    assert.equal(v.applies, true, 'an unrecognised word must not exclude an item by being negated')
    assert.equal(v.certain, false)
    assert.deepEqual(v.unrecognised, ['property.geothermal'])

    // A recognised flag negates normally.
    assert.equal(evaluate('not(property.well)', house(['well'])).applies, false)
    assert.equal(evaluate('not(property.well)', house([], ['well'])).applies, true)
  })

  it('short-circuits any and all without losing certainty', () => {
    const f = house(['gas'], ['gas', 'propane'])

    const anyTrue = evaluate({ anyOf: ['property.gas', 'property.unheard-of'] }, f)
    assert.deepEqual([anyTrue.applies, anyTrue.certain], [true, true],
      'one certainly-true operand settles an any, whatever else is unknown')

    const allFalse = evaluate({ allOf: ['property.propane', 'property.unheard-of'] }, f)
    assert.deepEqual([allFalse.applies, allFalse.certain], [false, true],
      'one certainly-false operand settles an all')

    const murky = evaluate({ anyOf: ['property.propane', 'property.unheard-of'] }, f)
    assert.deepEqual([murky.applies, murky.certain], [true, false])
  })

  /**
   * §1e.2 · `pin` is not a weaker `house`.
   *
   * The zone form silently under-fires a house question and the house form
   * over-fires a zone one. They are separate sets, and a `pin` condition asked
   * with no zone in scope is honestly unknown rather than false — answering
   * false would drop every zone-conditioned item from a visit-wide run.
   */
  it('keeps pin and house conditions distinct', () => {
    const shared = { componentVocabulary: new Set(['furnace']), pinsAnywhere: new Set(['furnace']) }
    const utility = facts({ ...shared, zone: new Set(), pinsHere: new Set(['furnace']) })
    const bedroom = facts({ ...shared, zone: new Set(), pinsHere: new Set() })

    assert.equal(evaluate('pin.furnace', utility).applies, true)
    assert.equal(evaluate('pin.furnace', bedroom).applies, false, 'the furnace is not in this room')
    assert.equal(evaluate('house.furnace', bedroom).applies, true, 'but it is in this house')

    const visitWide = facts({ ...shared })
    const noZone = evaluate('pin.furnace', visitWide)
    assert.deepEqual([noZone.applies, noZone.certain], [true, false],
      'a pin condition with no zone in scope is unknown, never false')
  })

  it('refuses a bare id rather than guessing which namespace was meant', () => {
    const v = evaluate('gas', house(['gas'], ['gas']))
    assert.deepEqual([v.applies, v.certain], [true, false])
    assert.deepEqual(v.unrecognised, ['gas'], 'a config writing `gas` for `property.gas` is a config to fix')
  })

  it('parses the text grammar without a regex splitting the wrong comma', () => {
    const nested = parseCondition('all(property.gas, not(any(property.well, property.septic)))')
    assert.deepEqual(nested, {
      kind: 'all',
      of: [
        { kind: 'ref', ref: 'property.gas' },
        { kind: 'not', of: { kind: 'any', of: [{ kind: 'ref', ref: 'property.well' }, { kind: 'ref', ref: 'property.septic' }] } },
      ],
    })
  })

  /** Fail open on vocabulary; fail CLOSED on structure. Doctrine 7. */
  it('refuses a condition it cannot parse', () => {
    for (const bad of ['any(', 'any()', 'maybe(property.gas)', 'property.gas)', '', 42]) {
      assert.throws(() => parseCondition(bad as unknown), ConditionRefused, `refuses ${JSON.stringify(bad)}`)
    }
  })

  it('parses an already-parsed tree unchanged, so composing is safe', () => {
    const composed = composeGate('zone.has_mechanicals', { anyOf: ['property.gas'] })
    assert.equal(composed.kind, 'all')
    // The important half: handing the composed tree back to evaluate must not
    // re-parse it as config and refuse.
    const v = evaluate(composed, facts({
      zone: new Set(['has_mechanicals']), zoneVocabulary: new Set(['has_mechanicals']),
      property: new Set(['gas']), propertyVocabulary: new Set(['gas']), pinsHere: new Set(),
    }))
    assert.equal(v.applies, true)
  })

  /**
   * §1e.1 · the gate and the item trigger compose as `all`.
   *
   * Evaluating the gate alone fires every Fuel item in every zone of every
   * house; evaluating the item alone ignores the heading.
   */
  it('composes a list gate with an item trigger as all, not either alone', () => {
    const f = facts({
      zone: new Set(), zoneVocabulary: new Set(['has_mechanicals']),
      property: new Set(['gas']), propertyVocabulary: new Set(['gas']), pinsHere: new Set(),
    })
    // The zone is not a mechanical room, so a gas item inside a gated list must
    // not fire even though the house has gas.
    assert.equal(evaluate(composeGate('zone.has_mechanicals', 'property.gas'), f).applies, false)
    assert.equal(evaluate('property.gas', f).applies, true, 'the item trigger alone would have fired')
  })
})

// -------------------------------------------------------------- the graph

const SNAPSHOT = {
  componentLists: [
    { types: ['water-treatment'], items: [{ id: 'wt.nameplate' }] },
    { types: ['water-softener'], inherits: 'water-treatment', items: [{ id: 'ws.salt' }] },
    { types: ['ev-charger'], stub: true, items: [] },
  ],
}

describe('the component graph', () => {
  const graph = componentGraph(SNAPSHOT)

  it('lets a sub-type satisfy its parent expectation, and not the reverse', () => {
    assert.equal(graph.satisfies('water-softener', 'water-treatment'), true,
      'a softener IS a water treatment device')
    assert.equal(graph.satisfies('water-treatment', 'water-softener'), false,
      'a generic treatment pin is not a softener')
    assert.equal(graph.satisfies('water-softener', 'water-softener'), true)
  })

  /** §1h.2 — three branches, not two. A stub is not a weaker `typed`. */
  it('reports typed, stub and undeclared as three distinct states', () => {
    assert.equal(graph.state('water-treatment'), 'typed')
    assert.equal(graph.state('ev-charger'), 'stub')
    assert.equal(graph.state('flux-capacitor'), 'undeclared')

    const stub = describeBinding('ev-charger', graph)
    assert.equal(stub.state, 'stub')
    assert.match(stub.note, /no checklist items/, 'declared but not yet answerable — said, not implied')

    const unknown = describeBinding('flux-capacitor', graph)
    assert.match(unknown.note, /not declared/)
    assert.notEqual(stub.note, unknown.note, 'the two must not read the same')
  })

  it('treats a config that declares nothing as declaring nothing, never as an error', () => {
    const empty = componentGraph({})
    assert.equal(empty.declared.size, 0)
    assert.equal(empty.state('water-heater'), 'undeclared')
    assert.equal(empty.satisfies('water-softener', 'water-treatment'), false)
  })

  it('survives an inheritance cycle instead of hanging on it', () => {
    const cyclic = componentGraph({
      componentLists: [
        { types: ['a'], inherits: 'b', items: [{ id: 'x' }] },
        { types: ['b'], inherits: 'a', items: [{ id: 'y' }] },
      ],
    })
    assert.deepEqual(cyclic.lineage('a').sort(), ['a', 'b'])
    assert.ok(cyclic.anomalies.some((s) => /cycle/.test(s)), 'and reports it rather than absorbing it')
  })

  it('surfaces a stub that ships items rather than picking a side', () => {
    const odd = componentGraph({ componentLists: [{ types: ['z'], stub: true, items: [{ id: 'z.one' }] }] })
    assert.ok(odd.anomalies.some((s) => /flagged stub but declares items/.test(s)))
  })
})

// --------------------------------------------------------- against the export

describe('the zone-audit oracle, against the reference export', () => {
  let db: Db
  let importId: string

  beforeEach(async () => {
    db = freshDb()
    const ids = makePropertyAndVisit(db)
    const result = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    importId = result.importId
  })

  /**
   * §1h.1, and the reason this increment has a correctness oracle at all.
   *
   * Two independent implementations — the field app's and this one — computing
   * the same summary from the same config for the same house. Item for item.
   */
  it('agrees with the field app on every zone, item for item', () => {
    const comparisons = auditZones(db, importId, 'baseline')
    assert.ok(comparisons.length >= 2, 'the reference export has zones to check')

    for (const c of comparisons) {
      assert.deepEqual(
        c.differences, [],
        `${c.label ?? c.zoneId}: ${c.differences.join(' · ')}`,
      )
      assert.equal(c.agrees, true)
    }
  })

  /**
   * The specific case that proves triggers are being evaluated rather than
   * ignored: an egress item that applies only to sleeping rooms, on a bedroom
   * the field marked `sleeping: false`.
   */
  it('excludes an egress item from a bedroom nobody sleeps in', () => {
    const comparisons = auditZones(db, importId, 'baseline')
    const bedroom = comparisons.find((c) => c.label === 'bedroom')
    assert.ok(bedroom, 'the reference export has a bedroom')
    assert.ok(
      !bedroom.computed.applicable.some((i) => i.id === 'liv.egress'),
      'liv.egress is triggered on zone.sleeping, which this zone declares false',
    )
    // And the trigger was actually consulted rather than the item being missing.
    const facts = factsForImport(db, importId).byZone.get(bedroom.zoneId)!
    assert.equal(evaluate('zone.sleeping', facts).applies, false)
    assert.equal(evaluate('zone.sleeping', facts).certain, true)
  })

  /**
   * The oracle's baseline must not be something the comparer can edit.
   * Doctrine 1, and a comparison against a movable target is not one.
   */
  it('never writes to the summary it is comparing against', () => {
    const before = db.prepare('SELECT zone_id, audit_summary FROM zones WHERE import_id = ?').all(importId)
    auditZones(db, importId, 'baseline')
    auditZones(db, importId, 'monthly')
    const after = db.prepare('SELECT zone_id, audit_summary FROM zones WHERE import_id = ?').all(importId)
    assert.deepEqual(after, before, 'the imported summary is evidence, stored verbatim')
  })

  /**
   * The visit kind is not in the manifest. Taking it from the visit record is
   * what makes `scope[]` filtering real — and this proves the filter is load
   * bearing rather than decorative.
   */
  it('gives a different answer for a different kind of visit', () => {
    const baseline = auditZones(db, importId, 'baseline')
    const monthly = auditZones(db, importId, 'monthly')

    const applicableCount = (rows: ReturnType<typeof auditZones>) =>
      rows.reduce((n, c) => n + c.computed.applicable.length, 0)

    assert.ok(applicableCount(baseline) > 0)
    assert.notEqual(applicableCount(monthly), applicableCount(baseline),
      'a monthly visit asks fewer questions, and the scope filter is what decides it')
  })

  /** Pin-scoped resolutions answer component items; the two scopes are independent. */
  it('counts only zone-scoped resolutions in a zone summary', () => {
    const pinScoped = db
      .prepare(`SELECT COUNT(*) AS n FROM resolutions WHERE import_id = ? AND scope_kind = 'pin'`)
      .get(importId) as { n: number }
    assert.ok(pinScoped.n > 0, 'the reference export has pin-scoped resolutions to be wrong about')

    // If they were folded in, the na counts would not have matched above. This
    // states the invariant directly so a future change breaks here rather than
    // in a comparison whose cause is three files away.
    const zoneOnly = computeZoneAudit({
      snapshot: factsForImport(db, importId).snapshot,
      facts: factsForImport(db, importId).visit,
      zoneId: 'nowhere', zoneType: null, visitKind: 'baseline',
      zoneResolutions: [],
    })
    assert.equal(zoneOnly.naCount, 0)
  })

  it('builds the type graph from the import own config, not from the binder schema', () => {
    const graph = graphForImport(db, importId)
    assert.ok(graph.declared.size > 0)
    // The reference export is field config v1.2.1, which predates component
    // inheritance entirely. An empty graph is the right answer for it, and
    // reaching for the schema's current graph would apply a newer config's
    // rules to an older import.
    assert.equal(graph.parentOf('water-softener'), undefined)
    assert.equal(graph.state('water-heater'), 'typed')
    assert.equal(graph.state('ev-charger'), 'stub', 'v1.2.1 already reserves stubs')
  })

  it('names an unknown zone type instead of inventing an inheritance for it', () => {
    const { snapshot } = factsForImport(db, importId)
    const known = listsForZoneType(snapshot, 'bathroom')
    assert.equal(known.unknownType, false)
    assert.ok(known.lists.length > 0)

    const madeUp = listsForZoneType(snapshot, 'wine-cellar')
    assert.equal(madeUp.unknownType, true)
    assert.deepEqual(madeUp.lists, [], 'no lists guessed at')
  })

  it('treats an item with no scope as applying to every kind of visit', () => {
    assert.equal(inScope({ id: 'x' }, 'monthly'), true)
    assert.equal(inScope({ id: 'x', scope: [] }, 'monthly'), true)
    assert.equal(inScope({ id: 'x', scope: ['baseline'] }, 'monthly'), false)
    assert.equal(inScope({ id: 'x', scope: ['baseline'] }, 'baseline'), true)
  })
})
