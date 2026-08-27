/**
 * ⚑ Telling *this run found these* from *this run did nothing, and here is what
 * was already there*.
 *
 * **`npm run read` and `npm run match` printed `Ran 0, failed 16` and then a
 * confident table** — read back from the tables, so on a run where every call
 * failed it showed a previous run's output with nothing saying so. *A verdict
 * formed with nothing present that could refute it*, in the two passes that cost
 * money and send photographs of the inside of a house.
 *
 * **The fix is not that the table becomes empty.** Prior rows are real and a
 * person looking at a failed run still wants them. **The fix is that the two
 * states are distinguishable** — the same distinction as a blank versus a
 * refusal in the field app.
 *
 * *Audit finding `read.ts:220` and `match.ts`, Band 2, 2026-08-26.*
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newId, now, openDb } from '../src/db/index.js'
import { describeRun, partitionByRun, PLAN_ONLY, type RunOutcome } from '../src/ai/runReport.js'
import { repoRoot } from './helpers.js'

const row = (createdAt: string) => ({ createdAt })
const OLD = '2026-08-01T00:00:00.000Z'
const NEW = '2026-08-26T12:00:00.000Z'
const SINCE = '2026-08-26T11:00:00.000Z'

describe('⚑ the four states a report can be in, and none reads like another', () => {
  const part = (rows: { createdAt: string }[], o: RunOutcome) => partitionByRun(rows, o, (r) => r.createdAt)

  it('THE REGRESSION — every call failed, and prior rows must not read as a result', () => {
    const o: RunOutcome = { since: SINCE, ran: 0, failed: 16 }
    const p = part([row(OLD), row(OLD)], o)
    const text = describeRun(o, p, 'objects')

    assert.match(text, /THIS RUN PRODUCED NOTHING/)
    assert.match(text, /16 call\(s\) failed/)
    assert.match(text, /already there before this run started/)
    assert.match(text, /Nothing below is evidence that this run worked/)
  })

  it('separates a failed run with NO prior rows from one with them', () => {
    const o: RunOutcome = { since: SINCE, ran: 0, failed: 16 }
    const text = describeRun(o, part([], o), 'labels')
    assert.match(text, /THIS RUN PRODUCED NOTHING/)
    assert.match(text, /No labels are stored for this import at all/)
    assert.doesNotMatch(text, /already there/, 'there is nothing prior to describe')
  })

  it('distinguishes ran-and-found-nothing from did-not-run', () => {
    // A pass can legitimately find nothing. That is not the same fact as a pass
    // that never called, and the old code could not say either.
    const o: RunOutcome = { since: SINCE, ran: 4, failed: 0 }
    const text = describeRun(o, part([row(OLD)], o), 'labels')
    assert.match(text, /4 call\(s\) completed and produced no new labels/)
    assert.match(text, /A pass that ran and found nothing is not a pass that did not run/)
    assert.doesNotMatch(text, /PRODUCED NOTHING/, 'nothing failed — this is not the failure case')
  })

  it('says how many of the rows shown this run actually wrote', () => {
    const o: RunOutcome = { since: SINCE, ran: 3, failed: 0 }
    const text = describeRun(o, part([row(NEW), row(NEW), row(OLD)], o), 'objects')
    assert.match(text, /2 of the 3 objects below were written by this run/)
    assert.match(text, /The other 1 were already stored/)
  })

  it('reports a partial failure as both, rather than as a success', () => {
    const o: RunOutcome = { since: SINCE, ran: 2, failed: 5 }
    const text = describeRun(o, part([row(NEW), row(OLD)], o), 'objects')
    assert.match(text, /1 of the 2 objects below were written by this run/)
    assert.match(text, /5 call\(s\) failed/, 'a partial failure must not be silent')
  })

  it('⚑ plan-only is a THIRD state, not a run with zero calls', () => {
    // `since: null` means nothing was called. Everything shown predates the
    // invocation by definition, and saying "produced nothing" would imply an
    // attempt that never happened.
    const text = describeRun(PLAN_ONLY, part([row(OLD), row(NEW)], PLAN_ONLY), 'objects')
    assert.match(text, /Nothing was called/)
    assert.match(text, /All 2 objects below were already stored/)
    assert.match(text, /none is a result of it/)
    assert.doesNotMatch(text, /failed/)
  })

  it('a plan-only run against an empty import says which fact it is reporting', () => {
    const text = describeRun(PLAN_ONLY, part([], PLAN_ONLY), 'labels')
    assert.match(text, /That is the state of the tables, not a result — nothing ran/)
  })
})

describe('partitionByRun', () => {
  it('puts a row written during the run on the fresh side, boundary included', () => {
    const o: RunOutcome = { since: SINCE, ran: 1, failed: 0 }
    const p = partitionByRun([row(SINCE), row(OLD), row(NEW)], o, (r) => r.createdAt)
    assert.equal(p.fresh.length, 2, 'a row stamped at the instant the run began is the run\'s own')
    assert.equal(p.prior.length, 1)
  })

  it('attributes nothing to a plan-only run', () => {
    const p = partitionByRun([row(NEW)], PLAN_ONLY, (r) => r.createdAt)
    assert.deepEqual(p.fresh, [], 'nothing was called, so nothing can be its output')
    assert.equal(p.prior.length, 1)
  })
})

// ------------------------------------------------- the command, as a process

describe('⚑ `npm run match` prints the distinction — the command, not the module', () => {
  /**
   * **A test that imports the thing a command uses is not a test of the
   * command** — `score-script.test.ts` exists because a command fell off the end
   * of its own file behind four green engine tests.
   *
   * The plan-only path is the one state reachable without spending money, and it
   * is also the state the old code got wrong in the quietest way: it printed the
   * stored table under a heading that said nothing about where those rows came
   * from.
   */
  it('says nothing was called, and that the rows shown are not its output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hs-runreport-'))
    const db = openDb(join(dir, 'housesteady.db'))
    const OP = 'op-rr', PROPERTY = 'p-rr', VISIT = 'visit-rr', ZONE = 'zone-mech'
    db.prepare(`INSERT INTO operators (id, display_name, short_code, active, created_at) VALUES (?, 'R', 'r', 1, ?)`).run(OP, now())
    db.prepare(`INSERT INTO properties (id, label, created_at, actor_id) VALUES (?, 'A house', ?, ?)`).run(PROPERTY, now(), OP)
    db.prepare(`INSERT INTO visits (id, property_id, kind, created_at, actor_id) VALUES (?, ?, 'baseline', ?, ?)`).run(VISIT, PROPERTY, now(), OP)
    const importId = newId()
    db.prepare(
      `INSERT INTO imports (id, visit_id, property_id, imported_at, media_mode, raw_manifest, validation_report, status, created_at, actor_id)
       VALUES (?, ?, ?, ?, 'full', '{}', '{}', 'ok', ?, ?)`,
    ).run(importId, VISIT, PROPERTY, now(), now(), OP)
    db.prepare(
      `INSERT INTO zones (zone_id, import_id, property_id, visit_id, type, label, level, created_at)
       VALUES (?, ?, ?, ?, 'mechanical', 'Mech', 'basement', ?)`,
    ).run(ZONE, importId, PROPERTY, VISIT, now())
    // Two objects from an EARLIER run. Under the old code these printed with no
    // hint that this invocation had not produced them.
    const ins = db.prepare(
      `INSERT INTO objects (id, property_id, zone_id, import_id, class_id, label, actor_id, derived_from, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 'plate', ?)`,
    )
    ins.run(newId(), PROPERTY, ZONE, importId, 'a water heater', OP, '2026-08-01T00:00:00.000Z')
    ins.run(newId(), PROPERTY, ZONE, importId, 'a water softener', OP, '2026-08-01T00:00:00.000Z')
    db.close()

    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', join(repoRoot, 'server', 'scripts', 'match.ts'), '--visit', VISIT],
      { cwd: join(repoRoot, 'server'), env: { ...process.env, HOUSESTEADY_DATA: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )

    assert.match(out, /Nothing was called/)
    assert.match(out, /All 2 objects below were already stored/)
    assert.match(out, /none is a result of it/)
    // And the rows are still shown — the fix is not that the table disappears.
    assert.match(out, /a water heater/)
  })
})
