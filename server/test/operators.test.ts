/**
 * Operator identity — Increment 2c.
 *
 * The tests the spec names, plus the two that matter most in practice: that a
 * retired operator's records still resolve to their name, and that a write path
 * cannot get a row in without saying who acted. The second is asserted against
 * the database rather than against a function signature, because a signature
 * only binds the code that exists today and the whole reason this increment came
 * before the rest of Increment 3 is that three more increments are about to add
 * write paths of their own.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { newId, now, type Db } from '../src/db/index.js'
import {
  createOperator, currentOperator, deactivateOperator, displayNameFor, LEGACY_OPERATOR_ID,
  listOperators, OperatorRefused, reactivateOperator, resolveOperator,
} from '../src/operators/registry.js'
import { runImport } from '../src/import/runImport.js'
import { enqueue } from '../src/ai/queue.js'
import { openZone, startPass } from '../src/pass/store.js'
import { writeOverlay } from '../src/overlay/store.js'
import { freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'

/**
 * Tables that deliberately record no actor, each with the reason.
 *
 * **This list replaces the hand-kept list of tables that DO**, and the inversion
 * is the point. `ATTRIBUTED` had to be remembered, so a table added without an
 * actor was a table the rule silently did not reach — which is exactly what
 * happened to `objects` in Increment 5 §2. **Fourth instance of a hand-maintained
 * restatement drifting from the data it restates**, after the status block, the
 * `_replaceWholesale` count and the worked-class merge.
 *
 * Exempting is now the thing that takes an entry, and attributing is the default.
 * A new table is covered the day it is created, by nobody doing anything.
 */
const UNATTRIBUTED: Readonly<Record<string, string>> = {
  _migrations: 'the migration runner, not a domain table',
  operators: 'the actors themselves — the first row has nobody to attribute it to',

  // Verbatim manifest mirrors. Doctrine 1: imports are stored exactly as
  // exported and never mutated, so the actor is the import that carried them and
  // a per-row actor would be the same value repeated a thousand times.
  zones: 'manifest mirror — the actor is on `imports`',
  pins: 'manifest mirror',
  media: 'manifest mirror',
  notes: 'manifest mirror',
  events: 'manifest mirror',
  resolutions: 'manifest mirror',
  anchors: 'manifest mirror',
  canvases: 'manifest mirror',
  chat_threads: 'manifest mirror',
  chat_messages: 'manifest mirror',
  inbox_refs: 'manifest mirror',
  session_meta: 'manifest mirror',
  config_snapshots: 'manifest mirror',

  // Derived rows. Nobody acts to create one; they follow from something that was
  // itself attributed, and inventing an actor would claim a decision nobody made.
  audit_slots: 'derived from an audit run, which carries the actor',
  audit_carried_items: 'derived from an audit run',
  active_items: 'derived projection',
  report_editions: 'derived from the edition that produced it',
  object_media: 'derived from the object, which carries the actor',
  object_provenance: 'derived from the decision — and it carries `actor_id` anyway',
}

describe('the operator registry', () => {
  let db: Db
  beforeEach(() => { db = freshDb() })

  it('registers somebody and finds them by id, code, or name', () => {
    const dp = createOperator(db, { displayName: 'David Pickett', shortCode: 'dp' })
    assert.equal(resolveOperator(db, dp.id).id, dp.id)
    assert.equal(resolveOperator(db, 'dp').id, dp.id)
    assert.equal(resolveOperator(db, 'David Pickett').id, dp.id)
    assert.equal(resolveOperator(db, 'david pickett').id, dp.id, 'case is not an identity')
  })

  it('refuses a duplicate short code by naming who holds it', () => {
    createOperator(db, { displayName: 'David Pickett', shortCode: 'dp' })
    assert.throws(
      () => createOperator(db, { displayName: 'Dana Price', shortCode: 'dp' }),
      (e: OperatorRefused) => e.code === 'operator.code-taken' && /David Pickett/.test(e.message),
      'the person adding the second needs to know it is not a stale row of their own',
    )
  })

  it('refuses two people with one name rather than picking one', () => {
    createOperator(db, { displayName: 'Sam Carter', shortCode: 'sc1' })
    createOperator(db, { displayName: 'Sam Carter', shortCode: 'sc2' })
    assert.throws(
      () => resolveOperator(db, 'Sam Carter'),
      (e: OperatorRefused) => e.code === 'operator.ambiguous' && /sc1, sc2/.test(e.message),
      'picking one silently would file somebody work under their colleague',
    )
  })

  /**
   * §2 — an operator who leaves is deactivated, never deleted. This is the case
   * the whole rule exists for: a report rendered years later still names the
   * person who walked the house.
   */
  it('keeps a retired operator resolvable, with their records intact', () => {
    const dp = createOperator(db, { displayName: 'David Pickett', shortCode: 'dp' })
    const { propertyId, visitId } = makePropertyAndVisit(db, { actorId: dp.id })

    const retired = deactivateOperator(db, dp.id)
    assert.equal(retired.active, 0)
    assert.ok(retired.deactivated_at, 'and when')

    assert.equal(displayNameFor(db, dp.id), 'David Pickett', 'their name still resolves')
    const property = db.prepare('SELECT actor_id FROM properties WHERE id = ?').get(propertyId) as { actor_id: string }
    assert.equal(displayNameFor(db, property.actor_id), 'David Pickett', 'and so do their records')
    const visit = db.prepare('SELECT performed_by FROM visits WHERE id = ?').get(visitId) as { performed_by: string }
    assert.equal(displayNameFor(db, visit.performed_by), 'David Pickett')

    assert.ok(!listOperators(db).some((o) => o.id === dp.id), 'but they are not offered for new work')
    assert.ok(listOperators(db, { includeInactive: true }).some((o) => o.id === dp.id))
  })

  it('brings somebody back without splitting their history', () => {
    const dp = createOperator(db, { displayName: 'David Pickett', shortCode: 'dp' })
    deactivateOperator(db, dp.id)
    const back = reactivateOperator(db, dp.id)
    assert.equal(back.id, dp.id, 'the same row — a new one would split their record in two')
    assert.equal(back.active, 1)
    assert.equal(back.deactivated_at, null)
  })

  it('renders a missing actor as not recorded rather than a uuid', () => {
    assert.equal(displayNameFor(db, null), 'not recorded')
    assert.match(displayNameFor(db, 'op-nobody'), /unknown operator/)
  })
})

describe('the legacy operator', () => {
  let db: Db
  beforeEach(() => { db = freshDb() })

  /**
   * §4 — existing rows get a named legacy operator, NOT the owner. Backfilling
   * to him would assert something untrue about who did the work.
   */
  it('is a real, retired row that says what is true and nothing more', () => {
    const legacy = db.prepare('SELECT * FROM operators WHERE id = ?').get(LEGACY_OPERATOR_ID) as {
      display_name: string; active: number; deactivated_at: string | null
    }
    assert.ok(legacy, 'a real row, so every backfilled foreign key resolves')
    assert.equal(legacy.display_name, 'pre-attribution')
    assert.equal(legacy.active, 0)
    assert.ok(legacy.deactivated_at)
  })

  it('can never be selected for new work', () => {
    assert.throws(
      () => currentOperator(db, 'legacy'),
      (e: OperatorRefused) => e.code === 'operator.legacy',
    )
    assert.throws(
      () => reactivateOperator(db, LEGACY_OPERATOR_ID),
      (e: OperatorRefused) => e.code === 'operator.legacy',
    )
  })
})

describe('who is acting', () => {
  let db: Db
  beforeEach(() => { db = freshDb() })

  it('uses the one active operator when configuration is silent', () => {
    // freshDb registers exactly one. Unambiguous, so no ceremony is needed.
    assert.equal(currentOperator(db).id, TEST_OPERATOR)
  })

  /** The whole point. With two people, who is working has to be said. */
  it('refuses to guess once there is more than one operator', () => {
    createOperator(db, { displayName: 'David Pickett', shortCode: 'dp' })
    assert.throws(
      () => currentOperator(db),
      (e: OperatorRefused) => e.code === 'operator.ambiguous' && /test, dp|dp, test/.test(e.message),
    )
    assert.equal(currentOperator(db, 'dp').display_name, 'David Pickett', 'said, and it is answered')
  })

  it('tells an empty install how to get started rather than inventing somebody', () => {
    const empty = freshDb()
    empty.prepare('DELETE FROM operators WHERE id = ?').run(TEST_OPERATOR)
    assert.throws(
      () => currentOperator(empty),
      (e: OperatorRefused) => e.code === 'operator.none' && /npm run operator -- add/.test(e.message),
    )
  })

  it('will not act as somebody retired', () => {
    const dp = createOperator(db, { displayName: 'David Pickett', shortCode: 'dp' })
    deactivateOperator(db, dp.id)
    assert.throws(
      () => currentOperator(db, 'dp'),
      (e: OperatorRefused) => e.code === 'operator.inactive' && /keep their name/.test(e.message),
    )
  })
})

describe('every attributed row records who acted', () => {
  let db: Db
  beforeEach(() => { db = freshDb() })

  /**
   * §5's doctrine scan, expressed against the database.
   *
   * A trigger cannot be forgotten by code that has not been written yet. A
   * migration, a repair script, a console session and a feature nobody has
   * specified are all refused identically — which is what "survives the next
   * feature" has to mean.
   */
  it('refuses an unattributed insert on every attributed table', () => {
    // **Derived from the schema rather than from a list somebody maintains.**
    // Every table is attributed unless it is explicitly exempt, so a table added
    // tomorrow is covered tomorrow — which the previous shape could not do.
    const tables = (db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]).map((r) => r.name)
    const triggers = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as { name: string }[])
        .map((r) => r.name),
    )
    const hasActor = (t: string): boolean =>
      (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((c) => c.name === 'actor_id')

    const missing = tables
      .filter((t) => !(t in UNATTRIBUTED))
      .filter((t) => !hasActor(t) || !triggers.has(`trg_${t}_actor`))
    assert.deepEqual(missing, [],
      'every table records which operator acted, or says in UNATTRIBUTED why it does not')
  })

  it('and the exemption list names no table that has stopped existing', () => {
    // The exemption list is itself a restatement, so it gets the same treatment:
    // an entry for a dropped table is a reason nobody can check any more.
    const tables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[]).map((r) => r.name),
    )
    assert.deepEqual(Object.keys(UNATTRIBUTED).filter((t) => !tables.has(t)), [])
  })

  it('names the table when it refuses, so the fix is obvious', () => {
    assert.throws(
      () => db.prepare('INSERT INTO properties (id, label, created_at) VALUES (?, ?, ?)')
        .run(newId(), 'No operator', now()),
      /properties: every row records which operator acted/,
    )
  })

  it('refuses an actor who is not a registered operator', () => {
    assert.throws(
      () => db.prepare('INSERT INTO properties (id, label, created_at, actor_id) VALUES (?, ?, ?, ?)')
        .run(newId(), 'Made-up actor', now(), 'op-invented'),
      /FOREIGN KEY/,
    )
  })

  /** Every table, populated through its real write path, carries an actor. */
  it('leaves nothing unattributed after a real import and a pass', async () => {
    const { propertyId, visitId } = makePropertyAndVisit(db)
    await runImport({ db, propertyId, visitId, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })

    const zoneId = (db.prepare('SELECT zone_id FROM zones WHERE visit_id = ? LIMIT 1').get(visitId) as
      { zone_id: string }).zone_id
    startPass(db, visitId, TEST_OPERATOR)
    openZone(db, visitId, zoneId, TEST_OPERATOR)
    writeOverlay({
      db, propertyId, visitId, kind: 'memory', targetKind: 'zone', targetId: zoneId,
      field: 'text', newValue: { text: 'a note' }, actorId: TEST_OPERATOR,
    })
    enqueue({
      db, propertyId, visitId, task: 'nameplate_classify',
      targetKind: 'media', targetId: 'anything', actorId: TEST_OPERATOR,
    })

    // Same derivation as the trigger check — every attributed table, discovered
    // rather than listed, so this walks whatever the schema actually holds.
    const attributed = (db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[])
      .map((r) => r.name)
      .filter((t) => !(t in UNATTRIBUTED))
    assert.ok(attributed.length > 0, 'idle if every table were somehow exempt')
    for (const table of attributed) {
      const rows = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
      const orphans = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE actor_id IS NULL`).get() as { n: number }
      assert.equal(orphans.n, 0, `${table} has ${orphans.n} of ${rows.n} rows with nobody attached`)
    }
  })

  /**
   * §3 — the actor on a generation is who TRIGGERED the run, never the model.
   * The model has its own column; conflating them would make a proposal read as
   * a human act, and doctrine 5 turns on that distinction being legible.
   */
  it('attributes an AI job to the person who triggered it, not to the model', () => {
    const { propertyId, visitId } = makePropertyAndVisit(db)
    const job = enqueue({
      db, propertyId, visitId, task: 'nameplate_classify',
      targetKind: 'media', targetId: 'm-1', actorId: TEST_OPERATOR,
    })
    assert.equal(job.actor_id, TEST_OPERATOR)
    // And the id is an operator, which is what makes "never the model" structural
    // rather than a convention: no model name is a row in this table.
    assert.ok(db.prepare('SELECT 1 FROM operators WHERE id = ?').get(job.actor_id))
  })
})

describe('the three roles', () => {
  let db: Db
  beforeEach(() => { db = freshDb() })

  /**
   * §3 — who was in the house and who worked the desk pass are different
   * questions. One concierge visits, another assembles.
   */
  it('records the visitor and the desk worker independently', () => {
    const walker = createOperator(db, { displayName: 'David Pickett', shortCode: 'dp' })
    const desk = createOperator(db, { displayName: 'Sam Carter', shortCode: 'sc' })

    const { visitId } = makePropertyAndVisit(db, { actorId: walker.id })
    startPass(db, visitId, desk.id)

    const visit = db.prepare('SELECT performed_by FROM visits WHERE id = ?').get(visitId) as
      { performed_by: string }
    const pass = db.prepare('SELECT worked_by, actor_id FROM passes WHERE visit_id = ?').get(visitId) as
      { worked_by: string; actor_id: string }

    assert.equal(displayNameFor(db, visit.performed_by), 'David Pickett', 'visited by')
    assert.equal(displayNameFor(db, pass.worked_by), 'Sam Carter', 'assembled by')
    assert.notEqual(visit.performed_by, pass.worked_by, 'the difference is visible rather than assumed away')
  })

  /**
   * Doctrine 4 — a visit booked before it happens has no honest answer for who
   * was in the house, and inventing one is the same class of act as inventing an
   * install date. `actor_id` still records who booked it.
   */
  it('leaves the visited-by line unrecorded rather than defaulting it', () => {
    const visitId = newId()
    const { propertyId } = makePropertyAndVisit(db)
    db.prepare(
      `INSERT INTO visits (id, property_id, kind, created_at, actor_id) VALUES (?, ?, 'baseline', ?, ?)`,
    ).run(visitId, propertyId, now(), TEST_OPERATOR)

    const visit = db.prepare('SELECT actor_id, performed_by FROM visits WHERE id = ?').get(visitId) as
      { actor_id: string; performed_by: string | null }
    assert.equal(visit.performed_by, null)
    assert.equal(displayNameFor(db, visit.performed_by), 'not recorded', 'said plainly, never guessed')
    assert.equal(visit.actor_id, TEST_OPERATOR, 'who booked it is still known')
  })
})
