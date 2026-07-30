/**
 * Scope — Increment 3 §1i and §1j.
 *
 * §1i is the correction that matters most in this increment, because the failure
 * it prevents is not a crash: a visit-scoped audit produces a *confident* wrong
 * answer on the first monthly run, reporting a house's whole systems inventory
 * as missing because it was captured last time. So these tests import the same
 * export into two visits and assert the second run still sees the first.
 *
 * §6's three scope tests, verbatim: an audit run on a property with two visits
 * evaluates both · a slot satisfied at the Baseline still reads satisfied on a
 * monthly run · an import with no visit imports and is evaluated.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { bindProperty } from '../src/audit/binding.js'
import { propertyEvidence, unwalkedNote, zoneTypesDeclaring } from '../src/audit/propertyEvidence.js'
import { latestRun, runAudit } from '../src/audit/run.js'
import { loadProfile, loadSchema } from '../src/audit/schema.js'
import { mediaDirFor } from '../src/media/paths.js'
import { runImport } from '../src/import/runImport.js'
import { addVisit, freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'
import type { Db } from '../src/db/index.js'

describe('the audit is property-scoped', () => {
  let db: Db
  let propertyId: string
  let baselineVisit: string
  const schema = loadSchema()

  beforeEach(async () => {
    db = freshDb()
    const ids = makePropertyAndVisit(db)
    propertyId = ids.propertyId
    baselineVisit = ids.visitId
    await runImport({
      db, propertyId, visitId: baselineVisit, raw: readReference(),
      dataDir: scratchDir(), actorId: TEST_OPERATOR,
    })
  })

  const audit = (visitId: string | null, visitKind: string) =>
    runAudit({
      db, propertyId, visitId, visitKind, actorId: TEST_OPERATOR,
      schema, profile: loadProfile(schema),
    })

  /** §6 — an audit run on a property with two visits evaluates both. */
  it('evaluates every import the property has, not just the triggering visit', async () => {
    const monthly = addVisit(db, propertyId, 'monthly')
    // A second capture. Same export, different visit — a re-walk.
    await runImport({
      db, propertyId, visitId: monthly, raw: readReference(),
      dataDir: scratchDir(), actorId: TEST_OPERATOR,
    })

    const result = audit(monthly, 'monthly')
    assert.equal(result.binding.context.importsRead, 2, 'both imports were read')

    const facts = result.triggerFacts as { importsRead: { visitId: string | null }[] }
    assert.deepEqual(
      facts.importsRead.map((i) => i.visitId).sort(),
      [baselineVisit, monthly].sort(),
      'and the run records which, so a result stays explicable',
    )
  })

  /**
   * §6, and the whole reason §1i exists.
   *
   * The failure it prevents: evaluated per-visit, this run finds no components
   * and the gap report announces *"no components recorded"* for a house whose
   * furnace has been in the binder since the Baseline.
   */
  it('keeps a slot satisfied at the Baseline satisfied on a monthly run', () => {
    const baseline = audit(baselineVisit, 'baseline')
    const components = baseline.slots.find((s) => s.slotId === 's7.components')!
    assert.equal(components.state, 'complete', 'the Baseline captured the systems inventory')
    const captured = Number((components.detail as { expected?: number }).expected ?? 0)
    assert.ok(captured > 0, 'and there are components to lose')

    // A later visit that captures nothing new at all.
    const monthly = addVisit(db, propertyId, 'monthly')
    const later = audit(monthly, 'monthly')
    const stillThere = later.slots.find((s) => s.slotId === 's7.components')!

    assert.equal(stillThere.state, 'complete', 'a binder is the property record, not the visit record')
    assert.equal((stillThere.detail as { expected?: number }).expected, captured,
      'the same components, still counted')
    assert.ok(!later.gaps.some((g) => g.slotId === 's7.components'),
      'and §7 does not appear in the gap list')
  })

  /**
   * §1i's contribution dimension — *what did this visit change*, answered
   * without narrowing what the audit sees.
   */
  it('records which visit most recently satisfied each slot', () => {
    const result = audit(baselineVisit, 'baseline')
    const contribution = result.contributions.get('s7.components')
    assert.ok(contribution, 'a satisfied slot names what satisfied it')
    assert.equal(contribution.visitId, baselineVisit)

    const stored = latestRun(db, propertyId)!
    const row = stored.slots.find((s) => s.slot_id === 's7.components') as { satisfied_by_visit_id: string | null }
    assert.equal(row.satisfied_by_visit_id, baselineVisit, 'and it is stored, not only returned')
  })

  it('leaves the contribution null on a slot nothing has satisfied', () => {
    audit(baselineVisit, 'baseline')
    const stored = latestRun(db, propertyId)!
    const unsatisfied = stored.slots.filter((s) => s.state === 'empty') as { satisfied_by_visit_id: string | null }[]
    assert.ok(unsatisfied.length > 0)
    for (const row of unsatisfied) {
      assert.equal(row.satisfied_by_visit_id, null,
        'defaulting to the triggering visit would answer "what changed" with "everything"')
    }
  })

  /** `audit_runs.visit_id` means which visit TRIGGERED the run — never a filter. */
  it('treats the triggering visit as a label, not a filter', () => {
    const result = audit(null, 'baseline')
    assert.equal(result.binding.context.importsRead, 1, 'a run with no triggering visit still evaluates')
    const stored = latestRun(db, propertyId)!
    assert.equal(stored.run.visit_id, null)
    assert.equal(stored.run.imports_read, 1)
  })

  /** A property nobody has captured has nothing to evaluate, and says so calmly. */
  it('evaluates an empty property without inventing anything', () => {
    const empty = freshDb()
    const ids = makePropertyAndVisit(empty)
    const evidence = propertyEvidence(empty, ids.propertyId)
    assert.deepEqual(evidence.imports, [])
    assert.deepEqual(evidence.pins, [])
    assert.equal(evidence.latest, undefined)
    assert.equal(bindProperty({ evidence, schema }).rate.evidenceConsidered, 0)
  })
})

describe('cross-visit pin identity', () => {
  /**
   * The field-minted uuid is the identity that carries across visits, so the
   * same water heater seen twice is ONE pin with a later state — not two.
   *
   * If this were wrong the unmatched-evidence count would double every visit and
   * §1a's diagnostic number would climb for no reason at all.
   */
  it('counts a pin seen in two imports once, at its latest state', async () => {
    const db = freshDb()
    const { propertyId, visitId } = makePropertyAndVisit(db)
    await runImport({ db, propertyId, visitId, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })
    const first = propertyEvidence(db, propertyId).pins.length

    const second = addVisit(db, propertyId, 'monthly')
    await runImport({ db, propertyId, visitId: second, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })

    const evidence = propertyEvidence(db, propertyId)
    assert.equal(evidence.pins.length, first, 'the same pins, not twice as many')
    assert.equal(evidence.imports.length, 2)
    for (const pin of evidence.pins) {
      assert.equal(pin.visitId, second, 'and each carries its most recent state')
    }
  })
})

describe('a manifest is a property artifact', () => {
  /** §6 — an import with no visit imports and is evaluated. */
  it('imports with no visit and is evaluated', async () => {
    const db = freshDb()
    const { propertyId } = makePropertyAndVisit(db)

    const { importId } = await runImport({
      db, propertyId, visitId: null, raw: readReference(),
      dataDir: scratchDir(), actorId: TEST_OPERATOR, producer: 'housesteady-aerial',
    })

    const row = db.prepare('SELECT visit_id, producer, property_id FROM imports WHERE id = ?').get(importId) as
      { visit_id: string | null; producer: string; property_id: string }
    assert.equal(row.visit_id, null, 'a visit is when somebody was in the house — this was not one')
    assert.equal(row.producer, 'housesteady-aerial')
    assert.equal(row.property_id, propertyId)

    const evidence = propertyEvidence(db, propertyId)
    assert.equal(evidence.imports.length, 1)
    assert.ok(evidence.pins.length > 0, 'and its evidence is evaluated like any other')

    const result = runAudit({
      db, propertyId, visitId: null, importId, visitKind: 'baseline', actorId: TEST_OPERATOR,
    })
    assert.deepEqual(result.binding.context.producers, ['housesteady-aerial'])
  })

  it('names the producer on an ordinary field import rather than leaving it blank', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const { importId } = await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })
    const row = db.prepare('SELECT producer FROM imports WHERE id = ?').get(importId) as { producer: string }
    assert.equal(row.producer, 'housesteady-field')
  })

  /** §1j — the path shape assumed a visit, and an artifact has none. */
  it('puts an artifact media under its import rather than inventing a visit folder', () => {
    const attached = mediaDirFor({ propertyId: 'p1', visitId: 'v1', importId: 'i1' })
    const artifact = mediaDirFor({ propertyId: 'p1', visitId: null, importId: 'i1' })

    assert.equal(attached, 'properties/p1/visits/v1')
    assert.equal(artifact, 'properties/p1/artifacts/i1')
    assert.ok(!artifact.includes('visits'), 'no invented visit anywhere in the path')
  })

  /**
   * Currency is a query, not a concept — §1j. No validity field, no expiry.
   * The current artifact is the newest one, resolved on read.
   */
  it('reads the newest import as current without storing a validity flag', async () => {
    const db = freshDb()
    const { propertyId } = makePropertyAndVisit(db)
    const first = await runImport({
      db, propertyId, visitId: null, raw: readReference(),
      dataDir: scratchDir(), actorId: TEST_OPERATOR, producer: 'housesteady-aerial',
    })
    const second = await runImport({
      db, propertyId, visitId: null, raw: readReference().replace(/"sessionId": "/, '"sessionId": "x'),
      dataDir: scratchDir(), actorId: TEST_OPERATOR, producer: 'housesteady-aerial',
    })

    const evidence = propertyEvidence(db, propertyId)
    assert.equal(evidence.imports.length, 2)
    assert.equal(evidence.latest?.id, second.importId, 'the newest is current')
    assert.notEqual(evidence.latest?.id, first.importId)

    const columns = (db.prepare('PRAGMA table_info(imports)').all() as { name: string }[]).map((c) => c.name)
    for (const invented of ['valid_until', 'expires_at', 'is_current', 'superseded']) {
      assert.ok(!columns.includes(invented), `no ${invented} column — currency is a query`)
    }
  })
})

describe('the gap list says why, not just what', () => {
  let db: Db
  let propertyId: string
  let visitId: string

  beforeEach(async () => {
    db = freshDb()
    const ids = makePropertyAndVisit(db)
    propertyId = ids.propertyId
    visitId = ids.visitId
    await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })
  })

  /**
   * The correction: *"Main interior water shutoff — nothing captured"* reads as
   * **the concierge missed it**. On a two-room capture the truth is that no room
   * where that item is ever asked has been walked. Same class of error as the
   * binding report's bare 100%, and the gap report is the one place a false
   * implication reaches a client.
   */
  it('says a room was never walked rather than implying something was missed', () => {
    const result = runAudit({ db, propertyId, visitId, visitKind: 'baseline', actorId: TEST_OPERATOR })
    const shutoffs = result.slots.find((s) => s.slotId === 's1.shutoff-map')!

    assert.ok(shutoffs.missing.length > 0, 'the reference export is two rooms, so §1 is short')
    const unwalked = shutoffs.missing.filter((m) => /has been walked on this property/.test(m))
    assert.ok(unwalked.length > 0, `expected an unwalked note, got: ${shutoffs.missing.slice(0, 3).join(' | ')}`)
    for (const line of unwalked) {
      assert.match(line, /not been reached rather than missed/)
      assert.doesNotMatch(line, /nothing captured/, 'the two must not stack — the specific one would be buried')
    }
  })

  /** Derived from the config, never a hardcoded list of room names. */
  it('reads which rooms would ask an item from the config', () => {
    const { snapshot } = propertyEvidence(db, propertyId)

    const utility = zoneTypesDeclaring(snapshot, 'utl.main-shutoff')
    assert.ok(utility.includes('utility'), 'the main shutoff is asked in a utility room')
    assert.ok(!utility.includes('bathroom'), 'and not in a bathroom')

    // A base-list item reaches every zone type inheriting that list, so it is
    // asked nearly everywhere — which is why a hardcoded room list would be wrong.
    assert.ok(zoneTypesDeclaring(snapshot, 'int.canvas').length > 1)
    assert.deepEqual(zoneTypesDeclaring(snapshot, 'nothing.declares-this'), [])
  })

  it('does not claim a room was unwalked when one was', () => {
    const evidence = propertyEvidence(db, propertyId)
    assert.ok(evidence.zoneTypes.includes('bathroom'), 'the reference export walked a bathroom')
    // An item asked in a bathroom cannot be excused by zone coverage.
    assert.equal(unwalkedNote(evidence, 'wet.fan'), undefined)
  })

  /**
   * The precision point: the workbench IS where a human enters this, so calling
   * it unreadable states a sequencing fact as a permanent one.
   */
  it('calls a human-entered slot not yet enterable rather than not readable', () => {
    const result = runAudit({ db, propertyId, visitId, visitKind: 'baseline', actorId: TEST_OPERATOR })
    const humanSourced = result.slots.find((s) => s.slotId === 's2.next-review')!
    assert.match(humanSourced.missing.join(' '), /not yet enterable/)
    assert.doesNotMatch(humanSourced.missing.join(' '), /does not read/)

    // And a genuinely external input still says what it says.
    const intake = result.slots.find((s) => s.slotId === 's4.profile')!
    assert.match(intake.missing.join(' '), /no source wired yet/)
  })
})
