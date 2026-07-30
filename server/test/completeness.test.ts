/**
 * Completeness per slot kind, and the audit run — Increment 3 §0, §2, §3.
 *
 * The two non-negotiables get adversarial tests rather than confirming ones: a
 * narrative slot is put in a profile that marks it **required** and must still
 * never gap, and a derived slot is given no inputs at all and must still never
 * report an independent emptiness. Both are §0 rules, and a rule that only holds
 * for the configurations somebody happened to try is not a rule.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assessItem, assessSlot, gapList, naReasonsOf, rollUp, watchScheduleShortfall,
  type SlotAssessment,
} from '../src/audit/completeness.js'
import { loadProfile, loadSchema } from '../src/audit/schema.js'
import { latestRun, runAudit } from '../src/audit/run.js'
import { noFacts } from '../src/audit/triggers.js'
import { runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'
import type { CoverageItem, Slot } from '../src/audit/schema.js'
import type { Db } from '../src/db/index.js'

const NA_REASONS = naReasonsOf({
  naReasons: [
    { id: 'none-present', feedsGapList: false, recordsFinding: true },
    { id: 'no-access', feedsGapList: true, recordsFinding: false },
    { id: 'not-applicable', feedsGapList: false, recordsFinding: false },
    { id: 'deferred', feedsGapList: true, recordsFinding: false },
  ],
})

const ITEM: CoverageItem = {
  id: 'main-water', label: 'Main interior water shutoff', appliesWhen: 'always',
  binding: { componentType: 'water-main', viaItems: ['wm.wide'] },
}

const slot = (over: Partial<Slot> = {}): Slot => ({ id: 's1.shutoff-map', kind: 'coverage', ...over })

describe('a coverage item state', () => {
  const assess = (evidence: Parameters<typeof assessItem>[0]['evidence']) =>
    assessItem({ item: ITEM, facts: noFacts(), evidence, naReasons: NA_REASONS })

  it('is present when the binding is satisfied', () => {
    assert.equal(assess({ bound: true, short: [] }).state, 'present')
  })

  /**
   * **The most damaging modelling mistake available here** — CLAUDE.md §5.
   * `none-present` records a finding and does NOT feed the gap list: *there is
   * no fireplace* is a substantive fact about the house. `no-access` feeds the
   * gap list and records no finding: *nobody could reach it* is a hole.
   * Collapsing them turns every confirmed absence into a chore for the client,
   * or buries a room nobody could get into.
   */
  it('never merges a confirmed absence with something nobody could reach', () => {
    const absent = assess({ bound: false, short: [], naReasonId: 'none-present' })
    const unreachable = assess({ bound: false, short: [], naReasonId: 'no-access' })

    assert.equal(absent.state, 'confirmed-absent')
    assert.equal(unreachable.state, 'not-found')
    assert.notEqual(absent.state, unreachable.state)
  })

  /** The config decides which reason means what — never a hardcoded list. */
  it('reads the classification from this import config, not from a constant', () => {
    const inverted = naReasonsOf({
      naReasons: [{ id: 'none-present', feedsGapList: true, recordsFinding: false }],
    })
    const result = assessItem({
      item: ITEM, facts: noFacts(), naReasons: inverted,
      evidence: { bound: false, short: [], naReasonId: 'none-present' },
    })
    assert.equal(result.state, 'not-found', 'a config that says it feeds the gap list is obeyed')
  })

  /** Doctrine 7 — fail open on vocabulary, and say so. */
  it('preserves an n/a reason the config has never declared', () => {
    const result = assess({ bound: false, short: [], naReasonId: 'eaten-by-wasps' })
    assert.equal(result.state, null)
    assert.match(result.shortBecause ?? '', /eaten-by-wasps.*does not declare/)
  })

  /**
   * §2's locating-photo rule. A shutoff marked present with only a close-up of
   * a valve FAILS the slot — the photo must be wide enough to locate it in the
   * room. Bound to the field's own item (§1c), so this reports rather than
   * judges.
   */
  it('fails a shutoff whose locating photo is unresolved', () => {
    const result = assess({ bound: false, short: ['wm.wide'] })
    assert.equal(result.state, null, 'no state — the slot is not complete')
    assert.match(result.shortBecause ?? '', /wm\.wide is unresolved/)
    // And it is distinguishable from nothing having been captured at all.
    assert.notEqual(result.shortBecause, assess({ bound: false, short: [] }).shortBecause)
  })

  it('reports a broken binding as a schema problem, never as a missing shutoff', () => {
    const result = assess({ bound: false, short: [], brokenRefs: ['wm.curbstop'] })
    assert.match(result.shortBecause ?? '', /binding refers to wm\.curbstop/)
    assert.doesNotMatch(result.shortBecause ?? '', /nothing captured/)
  })
})

describe('completeness per slot kind', () => {
  const assess = (s: Slot, evidence: Parameters<typeof assessSlot>[0]['evidence'], classification: 'required' | 'out-of-scope' = 'required') =>
    assessSlot({ slot: s, classification, applicable: true, evidence })

  /**
   * §0.4 — **narrative slots never produce a gap. Ever. Regardless of profile.**
   *
   * Tested adversarially: the profile is told this slot is required, which is
   * the only way the rule could ever be broken, and it must hold anyway. §8 can
   * never be complete — a house always has one more quirk — and software that
   * reports it 80% done is lying to a client.
   */
  it('never gaps a narrative slot even when a profile demands it', () => {
    const result = assess(slot({ id: 's8.quirks', kind: 'narrative' }), { narrative: { entries: 0 } })
    assert.equal(result.state, 'n-a-narrative')
    assert.equal(result.required, false, 'the profile does not get to make it required')
    assert.deepEqual(gapList([result]), [])

    const started = assess(slot({ id: 's8.quirks', kind: 'narrative' }), { narrative: { entries: 4 } })
    assert.equal(started.detail.reportsAs, 'started')
    assert.equal(started.state, 'n-a-narrative', 'and writing more does not make it completable')
  })

  /** §0.5 — a derived slot never reports independently. */
  it('never lets a derived slot report an emptiness of its own', () => {
    const noInputs = assess(slot({ id: 's2.summary', kind: 'derived' }), { inputs: [] })
    assert.equal(noInputs.state, 'partial', 'never `empty` — there is nothing to capture here')

    const waiting = assess(slot({ id: 's2.summary', kind: 'derived' }), { inputs: ['complete', 'empty'] })
    assert.equal(waiting.state, 'partial')

    const done = assess(slot({ id: 's2.summary', kind: 'derived' }), { inputs: ['complete', 'not-applicable'] })
    assert.equal(done.state, 'complete', 'complete when its inputs are')
  })

  /** §2 — an explicit unknown COMPLETES a fixed slot; a blank does not. */
  it('completes a fixed slot on an explicit unknown but not on a blank', () => {
    const blank = assess(slot({ id: 's4.profile', kind: 'fixed' }), { value: { recorded: false, explicitUnknown: false } })
    assert.equal(blank.state, 'empty')

    const unknown = assess(slot({ id: 's4.profile', kind: 'fixed' }), { value: { recorded: true, explicitUnknown: true } })
    assert.equal(unknown.state, 'complete', 'an explicit unknown is information')
    assert.equal(unknown.detail.explicitUnknown, true, 'and stays distinguishable from a known value')
  })

  it('names what is short on a coverage slot rather than counting it', () => {
    const items = [
      { itemId: 'a', label: 'Main water shutoff', state: 'present' as const, applicable: true },
      { itemId: 'b', label: 'Panel directory', state: null, applicable: true, shortBecause: 'nothing captured' },
      { itemId: 'c', label: 'Sump breaker', state: null, applicable: true, shortBecause: 'nothing captured' },
      { itemId: 'd', label: 'Well cap', state: null, applicable: false },
    ]
    const result = assess(slot(), { items })
    assert.equal(result.state, 'partial')
    assert.equal(result.detail.applicableItems, 3, 'the inapplicable item is not counted against the house')
    assert.deepEqual(result.missing, [
      'Panel directory — nothing captured',
      'Sump breaker — nothing captured',
    ])
  })

  it('reports a coverage slot as complete when every applicable item has an answer', () => {
    const result = assess(slot(), {
      items: [
        { itemId: 'a', label: 'A', state: 'present', applicable: true },
        { itemId: 'b', label: 'B', state: 'confirmed-absent', applicable: true },
        { itemId: 'c', label: 'C', state: 'not-found', applicable: true },
      ],
    })
    // "Not found" is an answer. Coverage completeness means everything was
    // looked at and an answer recorded, not that everything exists.
    assert.equal(result.state, 'complete')
    assert.deepEqual(result.missing, [])
  })

  it('keeps an out-of-scope slot out of the gap list with its reason intact', () => {
    const result = assessSlot({
      slot: slot({ id: 's4.site-plan', kind: 'coverage' }),
      classification: 'out-of-scope', applicable: true, evidence: {},
    })
    assert.equal(result.state, 'not-applicable')
    assert.deepEqual(gapList([result]), [])
  })
})

describe('§10 specificity — a completeness rule, not style advice', () => {
  const REQUIRES = ['measurement', 'cadence', 'namedEscalationTrigger']

  /**
   * *"A concern that says only 'watch this' fails the slot."* This is the
   * identification/assessment line made mechanically checkable — a watch
   * schedule without these three is an opinion wearing a plan's clothes, and
   * the concierge cannot defend an opinion.
   */
  it('fails a watch schedule that says only "watch this"', () => {
    assert.deepEqual(watchScheduleShortfall({ note: 'watch this' }, REQUIRES), REQUIRES)
  })

  it('passes one that measures, sets a cadence, and names an escalation', () => {
    const complete = {
      measurement: '3mm horizontal crack, north basement wall',
      cadence: 'every April and October',
      namedEscalationTrigger: 'engineer if it exceeds 5mm or offsets',
    }
    assert.deepEqual(watchScheduleShortfall(complete, REQUIRES), [])
  })

  it('names which of the three is missing rather than failing wholesale', () => {
    const partial = { measurement: '3mm', cadence: '   ' }
    assert.deepEqual(watchScheduleShortfall(partial, REQUIRES), ['cadence', 'namedEscalationTrigger'],
      'whitespace is not a cadence')
  })
})

describe('the section rollup', () => {
  const mk = (state: SlotAssessment['state']): SlotAssessment =>
    ({ slotId: 'x', kind: 'fixed', applicable: true, required: true, state, missing: [], detail: {} })

  it('is derived from slots, never stored beside them', () => {
    assert.equal(rollUp([mk('complete'), mk('complete')]).state, 'complete')
    assert.equal(rollUp([mk('complete'), mk('empty')]).state, 'partial')
    assert.equal(rollUp([mk('empty'), mk('empty')]).state, 'empty')
    assert.equal(rollUp([mk('not-applicable'), mk('not-applicable')]).state, 'not-applicable')
  })

  it('does not let a narrative slot drag a section down', () => {
    const r = rollUp([mk('complete'), mk('n-a-narrative')])
    assert.equal(r.state, 'complete', '§8 can never be finished and must not make its section look unfinished')
  })
})

describe('auditing the reference visit', () => {
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

  const run = (profile = loadProfile(schema)) =>
    runAudit({
      db, propertyId: ids.propertyId, visitId: ids.visitId, importId,
      visitKind: 'baseline', actorId: TEST_OPERATOR, schema, profile,
    })

  it('audits without error and produces an inspectable gap list', () => {
    const result = run()
    assert.equal(result.slots.length, 41)
    assert.equal(result.sections.length, 23)
    assert.ok(result.gaps.length > 0)
    for (const gap of result.gaps) {
      assert.ok(gap.missing.length > 0, `${gap.slotId} is a gap that does not say what is short`)
      assert.ok(gap.required && gap.applicable)
    }
  })

  /**
   * §0.4's "regardless of profile", against the real schema. A profile that
   * marks every narrative slot required must still produce no narrative gap.
   */
  it('keeps narrative slots out of the gap list under a profile that demands them', () => {
    const path = join(scratchDir(), 'demanding.json')
    writeFileSync(path, JSON.stringify({
      profileId: 'demanding', version: '1.0.0', schemaVersion: schema.version,
      required: schema.slots.map((s) => s.id), presentWhenPopulated: [], outOfScope: [],
    }))
    const result = run(loadProfile(schema, path))

    const narrative = result.slots.filter((s) => s.kind === 'narrative')
    assert.ok(narrative.length >= 3, 'the schema has narrative slots to be wrong about')
    for (const s of narrative) {
      assert.equal(s.state, 'n-a-narrative')
      assert.equal(s.required, false)
      assert.ok(!result.gaps.includes(s), `${s.slotId} reached the gap list`)
    }
  })

  it('never reports a derived slot as independently empty', () => {
    for (const s of run().slots.filter((s) => s.kind === 'derived')) {
      assert.notEqual(s.state, 'empty', `${s.slotId} claimed an emptiness of its own`)
    }
  })

  /** §6 — the same visit audited twice produces identical results. */
  it('produces identical results on a second run', () => {
    const strip = (r: ReturnType<typeof run>) => JSON.stringify({ slots: r.slots, sections: r.sections })
    assert.equal(strip(run()), strip(run()))
  })

  /** §3 — stored, so a rendered gap report stays reproducible. */
  it('stores the run with its schema and profile provenance', () => {
    const result = run()
    const stored = latestRun(db, ids.propertyId)!
    assert.equal(stored.run.id, result.runId)
    assert.equal(stored.run.schema_version, schema.version)
    assert.equal(stored.run.schema_hash, schema.hash)
    assert.equal(stored.run.profile_id, 'baseline-v1')
    assert.equal(stored.run.visit_kind, 'baseline')
    assert.equal(stored.run.actor_id, TEST_OPERATOR)
    assert.equal(stored.slots.length, 41)
  })

  /**
   * §4 — *"why is this house being asked about a sump"* must always be
   * answerable, from the run itself rather than from a config that may since
   * have changed.
   */
  it('stores the resolved trigger facts with the run', () => {
    run()
    const facts = JSON.parse(latestRun(db, ids.propertyId)!.run.trigger_facts as string)
    assert.deepEqual(facts.property.sort(), ['ev', 'generator', 'propane', 'septic', 'well'])
    assert.ok(facts.propertyVocabulary.length > facts.property.length, 'and what could have been set')
    assert.equal(facts.visitKind, 'baseline')
  })

  it('records what it could not do cleanly rather than absorbing it', () => {
    const result = run()
    assert.ok(result.warnings.length > 0, 'v1.2.1 predates the .unit items, so there are broken bindings')
    assert.ok(result.warnings.some((w) => /broken binding/.test(w)))
    assert.deepEqual(
      JSON.parse(latestRun(db, ids.propertyId)!.run.warnings as string), result.warnings,
      'and they are stored, not only returned',
    )
  })

  /**
   * A slot this builder has no source for is honestly empty WITH the reason.
   * Reporting it as a bare gap would put "the client owes us this" against a
   * slot the builder simply cannot see — true state, false implication.
   */
  it('says when a slot has no source wired rather than implying the client is short', () => {
    const unwired = run().slots.filter((s) => s.missing.some((m) => /no source wired/.test(m)))
    assert.ok(unwired.length > 0, 'intake, documents and lab are not tables here yet')
    for (const s of unwired) {
      assert.match(s.missing.join(' '), /which this builder does not read/)
    }
  })

  it('gives a different answer for a monthly visit', () => {
    const baseline = run()
    const monthly = runAudit({
      db, propertyId: ids.propertyId, visitId: ids.visitId, importId,
      visitKind: 'monthly', actorId: TEST_OPERATOR, schema, profile: loadProfile(schema),
    })
    assert.equal(monthly.triggerFacts.visitKind, 'monthly')
    assert.notEqual(monthly.runId, baseline.runId, 'each run is its own record')
  })
})
