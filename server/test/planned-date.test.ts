/**
 * `visits.visit_date` → `visits.planned_date` — two facts, two names.
 *
 * > Routing reads through `walkedAt()` leaves a column named `visit_date`
 * > holding something that is not the visit date. That is one field standing for
 * > two facts, which has now bitten three times — `type`/`label` doing the
 * > nickname's job, `sinceImportedAt` describing a different import than
 * > `since`, and this one. Each time the fix was a name rather than an accessor.
 * > So: no reader can pick the wrong date, AND the two facts have two names.
 *
 * Three things need holding, and only the first is about the migration:
 *
 * 1. an existing database with data in the old column comes through with it
 * 2. the desk read models carry **both** dates, under names that say which
 * 3. `integrity.ts`'s pin-identity sentence names the WALK — it was the live one,
 *    a warning a person reads and acts on that could name a day nobody was in
 *    the house
 */

import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { plannedDate, walkedAt } from '../src/audit/walkedAt.js'
import { now, openDb } from '../src/db/index.js'
import { buildReport } from '../src/import/report.js'
import { runImport } from '../src/import/runImport.js'
import { buildPass } from '../src/pass/read.js'
import { addVisit, freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'

describe('the rename carries existing data', () => {
  /**
   * **The upgrade path, exercised rather than assumed.**
   *
   * Every other test opens a fresh `:memory:` database, where 001 creates the
   * column and 015 renames it milliseconds later — which proves the end state
   * and proves nothing about a database with a year of visits in it. So this one
   * builds a pre-015 database by hand, marks the earlier migrations applied, and
   * lets `openDb` run only the rename.
   *
   * A rename migration has exactly one way to fail badly, and this is it.
   */
  it('renames in place on a database that already holds visits', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'housesteady-migrate-')), 'db.sqlite')

    const pre = new Database(file)
    pre.exec(`CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE visits (
        id TEXT PRIMARY KEY, property_id TEXT NOT NULL, kind TEXT NOT NULL,
        visit_date TEXT, notes TEXT, created_at TEXT NOT NULL);`)
    // Everything before 015, so only the rename is pending.
    for (const n of [
      '001_initial.sql', '002_pin_number_nullable.sql', '003_overlays.sql', '004_passes.sql',
      '005_desk_media.sql', '006_ai_jobs.sql', '007_accept.sql', '008_operators.sql',
      '009_audit_runs.sql', '010_property_scoped.sql', '011_one_session_one_import.sql',
      '012_active_items.sql', '013_report_editor.sql', '014_editions.sql',
    ]) pre.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(n, now())

    pre.prepare(
      'INSERT INTO visits (id, property_id, kind, visit_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('v-old', 'p-old', 'baseline', '2026-03-14', 'a year of history', now())
    pre.close()

    const db = openDb(file)
    const row = db.prepare('SELECT * FROM visits WHERE id = ?').get('v-old') as Record<string, unknown>

    assert.equal(row.planned_date, '2026-03-14', 'the typed date came through the rename')
    assert.ok(!('visit_date' in row), 'and the old name is gone rather than duplicated')
    assert.equal(row.notes, 'a year of history', 'nothing else moved')
    db.close()
  })

  /**
   * **Two accessors, and neither can return the other's answer.**
   *
   * `walkedAt()` reads the manifest and never touches `planned_date`;
   * `plannedDate()` reads the column and never touches the manifest. A caller
   * wanting one has to ask for it by name — there is no shape where reaching for
   * the wrong one is possible.
   */
  it('keeps the two dates behind two accessors, and reports the disagreement', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    db.prepare('UPDATE visits SET planned_date = ? WHERE id = ?').run('2026-07-24', ids.visitId)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })

    assert.equal(plannedDate(db, ids.visitId), '2026-07-24', 'what somebody typed')
    const walked = walkedAt(db, ids.visitId)
    assert.equal(walked.date, '2026-07-25', 'what the manifest recorded')

    // Reported, never silently preferred. The two are different claims and a
    // disagreement is a fact about the record somebody should see.
    assert.deepEqual(walked.disagreesWithPlanned, { planned: '2026-07-24', walked: '2026-07-25' })
    db.close()
  })
})

describe('the desk sees both dates, named', () => {
  it('carries planned and walked separately on the pass model', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    db.prepare('UPDATE visits SET planned_date = ? WHERE id = ?').run('2026-07-24', ids.visitId)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })

    const model = buildPass(db, ids.visitId)!
    assert.equal(model.visit.plannedDate, '2026-07-24')
    assert.equal(model.visit.walkedDate, '2026-07-25')
    // The name that used to mean either is gone, not aliased to one of them.
    assert.ok(!('visitDate' in model.visit))
    db.close()
  })

  it('carries planned and walked separately on the import report', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    db.prepare('UPDATE visits SET planned_date = ? WHERE id = ?').run('2026-07-24', ids.visitId)
    const { importId } = await runImport({
      actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir(),
    })

    const visit = buildReport(db, importId)!.visit as Record<string, unknown>
    assert.equal(visit.plannedDate, '2026-07-24')
    assert.equal(visit.walkedDate, '2026-07-25')
    assert.ok(!('visitDate' in visit))
    db.close()
  })
})

describe('the live one — the pin-identity warning', () => {
  /**
   * **A warning a person reads and acts on, naming a day nobody was in the
   * house.**
   *
   * `pins.identity-changed` says *"…different than it did on this property's
   * baseline visit of 2026-07-24…"* and sends somebody to check. It read the
   * typed column. It now reads the session start of the import the prior pin was
   * recorded in — which is the walk on which it was last seen, and is the only
   * date that sentence could honestly carry.
   */
  it('names the walk, not the planned date', async () => {
    const db = freshDb()
    const dataDir = scratchDir()
    const ids = makePropertyAndVisit(db)
    // The typed date is wrong by a day, exactly as it was in the real record.
    db.prepare('UPDATE visits SET planned_date = ? WHERE id = ?').run('2026-07-24', ids.visitId)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir })

    const second = JSON.parse(readReference()) as { session: { sessionId: string }; pins: { type: unknown }[] }
    second.session.sessionId = 'second-visit-session'
    second.pins[7]!.type = { kind: 'component', componentType: 'co-alarm' }
    const visitTwo = addVisit(db, ids.propertyId, 'monthly')
    const { importId } = await runImport({
      actorId: TEST_OPERATOR, db, propertyId: ids.propertyId, visitId: visitTwo,
      raw: JSON.stringify(second), dataDir,
    })

    const warning = buildReport(db, importId)!.validation.checks.find((c) => c.code === 'pins.identity-changed')!
    assert.match(warning.message, /baseline visit of 2026-07-25/, 'the session began on the 25th')
    assert.ok(!/2026-07-24/.test(warning.message), 'and the typed 24th does not appear anywhere in it')
    db.close()
  })

  /**
   * No date rather than the planned one, where the manifest carries none.
   *
   * An unnamed visit sends somebody looking. A wrong date sends them to the
   * wrong day and looks authoritative doing it — which is the whole failure this
   * change is about, so the fallback is deliberately absent.
   */
  it('omits the date entirely when no session start exists, rather than falling back', async () => {
    const db = freshDb()
    const dataDir = scratchDir()
    const ids = makePropertyAndVisit(db)
    db.prepare('UPDATE visits SET planned_date = ? WHERE id = ?').run('2026-07-24', ids.visitId)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir })
    db.prepare('UPDATE session_meta SET started_at = NULL').run()

    const second = JSON.parse(readReference()) as { session: { sessionId: string }; pins: { type: unknown }[] }
    second.session.sessionId = 'second-visit-session'
    second.pins[7]!.type = { kind: 'component', componentType: 'co-alarm' }
    const visitTwo = addVisit(db, ids.propertyId, 'monthly')
    const { importId } = await runImport({
      actorId: TEST_OPERATOR, db, propertyId: ids.propertyId, visitId: visitTwo,
      raw: JSON.stringify(second), dataDir,
    })

    const warning = buildReport(db, importId)!.validation.checks.find((c) => c.code === 'pins.identity-changed')!
    assert.match(warning.message, /this property's baseline visit:/, 'the visit is named without a date')
    assert.ok(!/2026-07-24/.test(warning.message))
    db.close()
  })
})
