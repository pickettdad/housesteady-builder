/**
 * Schema and profile loading, and deterministic binding.
 *
 * Increment 3 §0, §1a, §1b, §1c, §1g.2. The binding tests are built on literal
 * snapshots rather than the reference export wherever the case being tested is
 * about the rule — the reference export is a two-room visit with no mechanicals,
 * so it cannot exercise a successful bind at all. It gets its own section for
 * what it CAN prove: that the report reads honestly on messy real input.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { componentGraph } from '../src/audit/components.js'
import { alternativesOf, bindItem, bindProperty, describeBinding } from '../src/audit/binding.js'
import { declaredItemIds, propertyEvidence } from '../src/audit/propertyEvidence.js'
import {
  loadProfile, loadSchema, provenanceOf, schemaRoot, SchemaRefused,
} from '../src/audit/schema.js'
import { noFacts, type FactSet } from '../src/audit/triggers.js'
import { runImport } from '../src/import/runImport.js'
import { newId, now, type Db } from '../src/db/index.js'
import { freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'
import type { CoverageItem, Slot } from '../src/audit/schema.js'
import type { VisitFacts } from '../src/audit/facts.js'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'

// ------------------------------------------------------------------ the loader

describe('loading the schema and profile', () => {
  const schema = loadSchema()
  const profile = loadProfile(schema)

  it('reads both files with their versions and content hashes', () => {
    assert.equal(schema.version, '1.0.0')
    assert.match(schema.hash, /^[0-9a-f]{64}$/)
    assert.equal(profile.profileId, 'baseline-v1')
    assert.match(profile.hash, /^[0-9a-f]{64}$/)
    assert.notEqual(schema.hash, profile.hash)
  })

  /**
   * §6's cross-check on load, and the count the spec states: 41 slots, 41
   * classified. **Unclassified is a loud error, not a default.**
   */
  it('classifies every slot in the schema', () => {
    assert.equal(schema.slots.length, 41)
    const counts = { required: 0, 'present-when-populated': 0, 'out-of-scope': 0 }
    for (const slot of schema.slots) counts[profile.classify(slot.id)]++
    assert.deepEqual(counts, { required: 28, 'present-when-populated': 7, 'out-of-scope': 6 })
  })

  /**
   * The failure this check exists for. A slot added to the schema and forgotten
   * in the profile would silently never be asked for, and nothing else in the
   * system would ever mention it — a binder ships missing a section while the
   * audit reports itself complete.
   */
  it('refuses a profile that leaves a slot unclassified', () => {
    const path = join(scratchDir(), 'gappy.json')
    writeFileSync(path, JSON.stringify({
      profileId: 'gappy', version: '1.0.0', schemaVersion: '1.0.0',
      required: ['s1.shutoff-map'], presentWhenPopulated: [], outOfScope: [],
    }))
    assert.throws(
      () => loadProfile(schema, path),
      (e: SchemaRefused) => e.code === 'profile.unclassified' && /does not classify 40 of 41/.test(e.message),
    )
  })

  /** The other direction: a profile written against an older schema. */
  it('refuses a profile naming a slot the schema does not declare', () => {
    const path = join(scratchDir(), 'stale.json')
    writeFileSync(path, JSON.stringify({
      profileId: 'stale', version: '1.0.0',
      required: [...schema.slots.map((s) => s.id), 's99.long-gone'],
      presentWhenPopulated: [], outOfScope: [],
    }))
    assert.throws(
      () => loadProfile(schema, path),
      (e: SchemaRefused) => e.code === 'profile.phantom-slot' && /s99\.long-gone/.test(e.message),
    )
  })

  it('refuses a slot classified twice', () => {
    const path = join(scratchDir(), 'double.json')
    writeFileSync(path, JSON.stringify({
      profileId: 'double', version: '1.0.0',
      required: schema.slots.map((s) => s.id),
      presentWhenPopulated: ['s1.shutoff-map'], outOfScope: [],
    }))
    assert.throws(
      () => loadProfile(schema, path),
      (e: SchemaRefused) => e.code === 'profile.double-classified',
    )
  })

  /** Doctrine 7 — fail closed on structure. */
  it('refuses an unparseable or absent schema rather than carrying on', () => {
    const path = join(scratchDir(), 'broken.json')
    writeFileSync(path, '{ not json')
    assert.throws(() => loadSchema(path), (e: SchemaRefused) => e.code === 'schema.unparseable')
    assert.throws(() => loadSchema('/nowhere/at/all.json'), (e: SchemaRefused) => e.code === 'schema.missing')
  })

  /**
   * §0.1 — a run records both. **Version and hash**, because a version is a
   * claim and the hash is the evidence: a schema edited without a version bump
   * is exactly the case where the version says nothing changed and the results
   * differ.
   */
  it('produces provenance carrying both the version and the hash', () => {
    const p = provenanceOf(schema, profile)
    assert.equal(p.schemaVersion, '1.0.0')
    assert.equal(p.schemaHash, schema.hash)
    assert.equal(p.profileId, 'baseline-v1')
    assert.equal(p.versionMismatch, undefined, 'the shipped pair agree')
  })

  it('flags a profile written against a different schema version without refusing it', () => {
    const path = join(scratchDir(), 'older.json')
    writeFileSync(path, JSON.stringify({
      profileId: 'older', version: '1.0.0', schemaVersion: '0.9.0',
      required: schema.slots.map((s) => s.id), presentWhenPopulated: [], outOfScope: [],
    }))
    const p = provenanceOf(schema, loadProfile(schema, path))
    assert.match(p.versionMismatch ?? '', /written against schema 0\.9\.0/)
  })

  it('keeps the out-of-scope reason available rather than hiding the slot', () => {
    // §4: not-applicable sections are shown greyed WITH their reason, never
    // hidden — a silently absent section is indistinguishable from one nobody
    // thought of.
    assert.equal(profile.classify('s4.site-plan'), 'out-of-scope')
    assert.match(profile.noteFor('s4.site-plan') ?? '', /capability gap, not a scope decision/)
  })
})

// ----------------------------------------------------------- multi-alternatives

describe('multi-alternative binding references', () => {
  /**
   * §1g.2's parsing warning, which this build walked straight into on its first
   * run: `utl.floor-drain|utl.cleanout|utl.backwater` reported as a broken
   * reference against an id that is really three live ones.
   */
  it('splits alternatives and keeps an escaped pipe literal', () => {
    assert.deepEqual(alternativesOf('utl.floor-drain|utl.cleanout|utl.backwater'),
      ['utl.floor-drain', 'utl.cleanout', 'utl.backwater'])
    assert.deepEqual(alternativesOf('wm.wide'), ['wm.wide'])
    assert.deepEqual(alternativesOf('ball\\|gate'), ['ball|gate'], 'an escaped pipe is a character, not a separator')
    assert.deepEqual(alternativesOf('a\\|b|c'), ['a|b', 'c'], 'and the two forms coexist in one cell')
  })
})

// ----------------------------------------------------------------- the binding

const SNAPSHOT = {
  configVersion: '9.9.9',
  componentLists: [
    { types: ['water-main'], items: [{ id: 'wm.wide' }, { id: 'wm.type' }, { id: 'wm.operate' }] },
    { types: ['water-treatment'], items: [{ id: 'wt.unit' }] },
    { types: ['water-softener'], inherits: 'water-treatment', items: [{ id: 'ws.salt' }] },
    { types: ['ev-charger'], stub: true, items: [] },
  ],
  baseLists: [{ id: 'interior-base', items: [{ id: 'int.canvas' }] }],
}

const slotOf = (item: CoverageItem): Slot => ({ id: 's1.shutoff-map', kind: 'coverage', items: [item] })

const factsOf = (over: Partial<FactSet> = {}): FactSet => ({ ...noFacts(), ...over })

const pin = (over: Partial<{ componentType: string | null; freeformLabel: string | null; retired: boolean }> = {}) => ({
  pinId: newId(), number: 1, zoneId: 'z1', flag: null,
  componentType: null, freeformLabel: null, retired: false,
  // §1i — a candidate carries where it came from, so a satisfied slot can name
  // which visit satisfied it.
  importId: 'i1', visitId: 'v1', at: '2026-07-25T00:00:00.000Z', ...over,
})

describe('deterministic binding', () => {
  const facts = factsOf()
  const graph = componentGraph(SNAPSHOT)
  const declaredItems = declaredItemIds(SNAPSHOT)

  const bind = (item: CoverageItem, candidates: ReturnType<typeof pin>[], resolved: string[] = []) =>
    bindItem({
      slot: slotOf(item), item, facts, graph, candidates,
      resolvedItems: new Set(resolved), declaredItems,
    })

  const MAIN_WATER: CoverageItem = {
    id: 'main-water', label: 'Main interior water shutoff', appliesWhen: 'always',
    binding: { pinnedBy: 'wm.wide', componentType: 'water-main', viaItems: ['wm.wide', 'wm.type'] },
  }

  /** §1a — a lookup, not a judgement. */
  it('binds a canonical component type with its field items resolved', () => {
    const result = bind(MAIN_WATER, [pin({ componentType: 'water-main' })], ['wm.wide', 'wm.type'])
    assert.equal(result.state, 'bound')
    assert.equal(result.matched.length, 1)
    assert.deepEqual(result.unresolvedItems, [])
  })

  /**
   * §1c — **bind, do not re-implement.** The locating-photo rule is a field
   * checklist item; sufficiency is whether that item resolved, never a photo
   * check of the builder's own.
   */
  it('separates a candidate that falls short from one that is missing', () => {
    const short = bind(MAIN_WATER, [pin({ componentType: 'water-main' })], ['wm.type'])
    assert.equal(short.state, 'candidate-short')
    assert.deepEqual(short.unresolvedItems, ['wm.wide'], 'named, so the fix is obvious')
    assert.equal(short.matched.length, 1, 'and the evidence is still attached')

    const missing = bind(MAIN_WATER, [], [])
    assert.equal(missing.state, 'no-candidate')
    assert.equal(missing.matched.length, 0)
    // "nothing was captured" and "something was captured but lacks its locating
    // photo" are different problems with different fixes — §1a.
    assert.notEqual(short.state, missing.state)
  })

  /** §1b — a graph walk. A softener IS a water treatment device. */
  it('lets a sub-type satisfy a parent expectation, and not the reverse', () => {
    const wantsTreatment: CoverageItem = {
      id: 'treatment', label: 'Water treatment', appliesWhen: 'always',
      binding: { componentType: 'water-treatment', viaItems: [] },
    }
    assert.equal(bind(wantsTreatment, [pin({ componentType: 'water-softener' })]).state, 'bound')

    const wantsSoftener: CoverageItem = {
      id: 'softener', label: 'Softener', appliesWhen: 'always',
      binding: { componentType: 'water-softener', viaItems: [] },
    }
    assert.equal(bind(wantsSoftener, [pin({ componentType: 'water-treatment' })]).state, 'no-candidate',
      'a generic treatment pin is not a softener')
  })

  /**
   * §6 — **an alias never binds.** A freeform label reading like the thing is
   * evidence a person must look at, never a match. This is what keeps the
   * unmatched rate a measurement rather than a guess.
   */
  it('never binds a freeform label however well it reads', () => {
    const result = bind(MAIN_WATER, [pin({ freeformLabel: 'Main water shutoff' })], ['wm.wide', 'wm.type'])
    assert.equal(result.state, 'no-candidate')
  })

  it('never binds a retired pin', () => {
    const result = bind(MAIN_WATER, [pin({ componentType: 'water-main', retired: true })], ['wm.wide', 'wm.type'])
    assert.equal(result.state, 'no-candidate')
  })

  /**
   * §1g.2 — a binding naming an id the config does not declare is a BROKEN
   * REFERENCE, not a gap. Checked before candidates, because `no-candidate`
   * against an id nothing declares reads as *the house is missing this* when the
   * truth is *the schema points at something that does not exist here*. Those go
   * to different people.
   */
  it('reports a binding to an undeclared item as broken, never as a gap', () => {
    const stale: CoverageItem = {
      id: 'stale', label: 'Something retired', appliesWhen: 'always',
      binding: { componentType: 'water-main', viaItems: ['wm.curbstop'] },
    }
    const result = bind(stale, [pin({ componentType: 'water-main' })], [])
    assert.equal(result.state, 'broken-binding')
    assert.deepEqual(result.brokenRefs, ['wm.curbstop'])
    assert.notEqual(result.state, 'no-candidate')
  })

  it('accepts a multi-alternative reference when any one alternative is declared', () => {
    const drains: CoverageItem = {
      id: 'drains', label: 'Drains', appliesWhen: 'always',
      binding: { componentType: 'water-main', viaItems: ['utl.nothing|wm.wide|utl.also-nothing'] },
    }
    const result = bind(drains, [pin({ componentType: 'water-main' })], ['wm.wide'])
    assert.equal(result.state, 'bound', 'one live alternative is enough — and it satisfies the requirement too')
  })

  it('does not apply an item whose condition is false for this house', () => {
    const wellOnly: CoverageItem = {
      id: 'well-cap', label: 'Well cap', appliesWhen: 'property.well',
      binding: { componentType: 'water-main', viaItems: [] },
    }
    const municipal = factsOf({
      property: new Set(['municipal_water']),
      propertyVocabulary: new Set(['well', 'municipal_water']),
    })
    const result = bindItem({
      slot: slotOf(wellOnly), item: wellOnly, facts: municipal, graph, candidates: [],
      resolvedItems: new Set(), declaredItems,
    })
    assert.equal(result.state, 'not-applicable', 'a house on municipal water is never asked for a well cap')
  })
})

// -------------------------------------------------------- against the export

describe('the binding report on the reference export', () => {
  let db: Db
  let ids: { propertyId: string; visitId: string }
  let importId: string
  const schema = loadSchema()

  beforeEach(async () => {
    db = freshDb()
    ids = makePropertyAndVisit(db)
    const result = await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })
    importId = result.importId
  })

  const run = () => bindProperty({ evidence: propertyEvidence(db, ids.propertyId), schema })

  /**
   * §1a — **unmatched evidence is listed individually, never only counted.**
   * "9 unmatched" cannot be chased; "pin 7, freeform 'Ceiling light'" can.
   */
  it('names every piece of unmatched evidence', () => {
    const report = run()
    assert.ok(report.unmatchedEvidence.length > 0, 'the reference export has plenty')
    for (const e of report.unmatchedEvidence) {
      assert.ok(e.number > 0 && e.describedAs.length > 0, 'each carries a pin number and a description')
    }
    // §11 — typeless and freeform pins are a normal visit, not a corrupt file,
    // and they are described rather than explained away.
    const reasons = new Set(report.unmatchedEvidence.map((e) => e.reason))
    assert.ok(reasons.has('freeform'), 'freeform pins reported as such')
    assert.ok(reasons.has('typeless'), 'and a typeless pin is not silently dropped')
  })

  /**
   * The context that keeps the headline number from being misread. §1a says the
   * rate decides whether an AI assist is warranted; a 100% rate on a two-room
   * export is a fact about which rooms were walked, not a case for AI.
   */
  it('carries the context the rate has to be read against', () => {
    const report = run()
    assert.equal(report.context.configVersion, '1.2.1')
    assert.match(report.context.schemaReconciledAgainst, /v1\.11/)
    assert.deepEqual(report.context.zoneTypes.sort(), ['bathroom', 'living-space'],
      'two rooms, neither of them where a shutoff lives')
  })

  it('separates broken references from gaps in a real import', () => {
    const report = run()
    // v1.2.1 predates the 23 `.unit` items, so the schema's bindings to them
    // cannot resolve. That is a version fact, not a missing shutoff.
    assert.ok(report.brokenBindings.length > 0)
    for (const b of report.brokenBindings) {
      assert.ok(b.brokenRefs.length > 0, 'each names which reference is unresolvable')
      assert.equal(b.matched.length, 0, 'and does not also claim evidence')
    }
    const brokenIds = new Set(report.brokenBindings.map((b) => b.itemId))
    for (const b of report.noCandidate) {
      assert.ok(!brokenIds.has(b.itemId), 'nothing is both a broken reference and a gap')
    }
  })

  it('states both versions when it reports a broken reference', () => {
    const lines = describeBinding(run()).join('\n')
    assert.match(lines, /config 1\.2\.1/)
    assert.match(lines, /does not decide which/, 'a retirement is never auto-followed')
  })

  /** Same visit, same schema — the report is reproducible. */
  it('produces the same report twice', () => {
    assert.deepEqual(JSON.stringify(run()), JSON.stringify(run()))
  })

  it('counts the rate against live evidence only', () => {
    const report = run()
    const { rate } = report
    assert.equal(rate.evidenceBound + rate.evidenceUnmatched, rate.evidenceConsidered)
    assert.ok(rate.unmatchedPercent >= 0 && rate.unmatchedPercent <= 100)
    const retired = db.prepare(
      'SELECT COUNT(*) AS n FROM pins WHERE import_id = ? AND retired_at IS NOT NULL',
    ).get(importId) as { n: number }
    assert.ok(retired.n > 0, 'the reference export has retired pins to be wrong about')
    const all = db.prepare('SELECT COUNT(*) AS n FROM pins WHERE import_id = ?').get(importId) as { n: number }
    assert.equal(rate.evidenceConsidered, all.n - retired.n, 'a retired pin is not unmatched evidence')
  })
})
