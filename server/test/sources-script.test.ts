/**
 * `npm run sources` as a PROCESS — the reader half of Binder 6b.
 *
 * ⚑ **This repo has already paid for the lesson once.** On 2026-08-13 a runner
 * ran `npm run score` against a real house and got a clean exit and no output at
 * all: the engine was covered from four angles and *nothing ran the script*.
 * `score-script.test.ts` records the general form — **a test that imports the
 * thing a command uses is not a test of the command.**
 *
 * `sources.test.ts` covers the rules from four angles. These spawn the command,
 * because the reader is the half of 6b a person actually meets, and an honesty
 * label nobody can look at is the project's signature failure at the highest
 * possible stakes.
 *
 * ⛑ **Rule 44: the empty database comes first.** The very first person to run
 * this will have no sources recorded — that path has to say something useful
 * rather than crash or print nothing.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { newId, now, openDb } from '../src/db/index.js'
import { writeResolutions } from '../src/ai/tasks/resolveProduct.js'
import { writeReadings } from '../src/ai/tasks/readSurfaces.js'
import { repoRoot } from './helpers.js'

const SCRIPT = join(repoRoot, 'server', 'scripts', 'sources.ts')
const OP = 'op-script'
const PLATE = 'G9-50SDE-30'

/** Run it the way a person does. Node directly — see score-script.test.ts on npx. */
function run(dir: string, args: string[]): { out: string; code: number } {
  try {
    return {
      out: execFileSync(process.execPath, ['--import', 'tsx', SCRIPT, ...args], {
        cwd: join(repoRoot, 'server'),
        env: { ...process.env, HOUSESTEADY_DATA: dir, HOUSESTEADY_OPERATOR: OP },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      code: 0,
    }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number }
    return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 }
  }
}

/** A house with one resolved product and no source recorded — where everyone starts. */
function seed(): { dir: string; visitId: string; resolutionId: string } {
  const dir = mkdtempSync(join(tmpdir(), 'hs-sources-'))
  const db = openDb(join(dir, 'housesteady.db'))
  const PROPERTY = 'prop-1', VISIT = 'visit-src', ZONE = 'zone-mech'
  db.prepare(`INSERT INTO operators (id, display_name, short_code, active, created_at) VALUES (?, 'S', 's', 1, ?)`).run(OP, now())
  db.prepare(`INSERT INTO properties (id, label, created_at, actor_id) VALUES (?, 'A house', ?, ?)`).run(PROPERTY, now(), OP)
  db.prepare(`INSERT INTO visits (id, property_id, kind, created_at, actor_id) VALUES (?, ?, 'baseline', ?, ?)`).run(VISIT, PROPERTY, now(), OP)
  const importId = newId()
  db.prepare(
    `INSERT INTO imports (id, visit_id, property_id, imported_at, media_mode, raw_manifest, validation_report, status, created_at, actor_id)
     VALUES (?, ?, ?, ?, 'full', '{}', '{}', 'ok', ?, ?)`,
  ).run(importId, VISIT, PROPERTY, now(), now(), OP)
  db.prepare(
    `INSERT INTO zones (zone_id, import_id, property_id, visit_id, type, label, level, created_at)
     VALUES (?, ?, ?, ?, 'mechanical', 'Mechanical room', 'basement', ?)`,
  ).run(ZONE, importId, PROPERTY, VISIT, now())
  db.prepare(
    `INSERT INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind, owner_zone_id,
                        owner_pin_id, owner_canvas_id, file, file_status, created_at)
     VALUES ('m1', ?, ?, ?, 'photo', 'zone', ?, NULL, NULL, 'm1.jpg', 'absent', ?)`,
  ).run(importId, PROPERTY, VISIT, ZONE, now())
  const [readingId] = writeReadings(db, {
    propertyId: PROPERTY, importId, zoneId: ZONE, actorId: OP,
    labels: [{ mediaId: 'm1', surface: 'nameplate', whereItIs: '', fields: [{ field: 'Model', value: PLATE, unreadable: false }] }],
  })
  const [resolutionId] = writeResolutions(db, {
    propertyId: PROPERTY, importId, actorId: OP,
    queries: [{ readingId: readingId!, mediaId: 'm1', surface: 'nameplate', text: PLATE, specificity: 'line', why: '', from: [], models: [PLATE] }],
    resolutions: [{
      readingId: readingId!, product: 'A 50-gallon gas water heater', kind: 'equipment',
      recognisedFrom: 'the model number', resolved: true, specificity: 'line',
    }],
  })
  db.close()
  return { dir, visitId: VISIT, resolutionId: resolutionId! }
}

describe('⚑ npm run sources prints something on every path a person will take', () => {
  it('the registry, on a database where nothing has ever been read', () => {
    const { dir } = seed()
    const { out, code } = run(dir, ['--hosts'])
    assert.equal(code, 0, out)
    assert.match(out, /5 hosts ruled/, 'the five §8b organisations are seeded and shown')
    assert.match(out, /ahridirectory\.org/)
    assert.match(out, /No unruled host has been read yet/,
      'the empty work queue is a sentence, not a blank space')
  })

  it('a visit whose resolutions have no sources — and it says what would change that', () => {
    const { dir, visitId } = seed()
    const { out, code } = run(dir, ['--visit', visitId])
    assert.equal(code, 0, out)
    assert.match(out, /1 resolution/)
    assert.match(out, /0 Documented · 1 Inferred/)
    assert.match(out, /no source has been recorded/)
    assert.match(out, /Documented means a source was read/,
      'the rule is on the screen, not only in a document nobody has open')
  })

  it('a visit with no resolutions at all says so instead of printing a header and stopping', () => {
    const { dir } = seed()
    const db = openDb(join(dir, 'housesteady.db'))
    db.prepare('DELETE FROM product_resolutions').run()
    db.close()
    const { out, code } = run(dir, ['--visit', 'visit-src'])
    assert.equal(code, 0, out)
    assert.match(out, /Pass 2 has not run against this import/)
  })

  /** The manual path end to end, which is the only path that works in this build. */
  it('records a source by hand and the resolution becomes Documented', () => {
    const { dir, visitId, resolutionId } = seed()
    const recorded = run(dir, [
      'record', resolutionId,
      '--url', 'https://ahridirectory.org/listing/12345',
      '--claim', 'Rated input 40,000 BTU/h.',
      '--model', PLATE,
      '--plate', PLATE,
      '--on', '2026-08-28',
    ])
    assert.equal(recorded.code, 0, recorded.out)
    assert.match(recorded.out, /qualifies yes/)

    const { out } = run(dir, ['--visit', visitId])
    assert.match(out, /1 Documented · 0 Inferred/)
    assert.match(out, /✓ https:\/\/ahridirectory\.org/)
  })

  it('and a source from an unruled host stays Inferred, naming the host as the work', () => {
    const { dir, visitId, resolutionId } = seed()
    run(dir, [
      'record', resolutionId, '--url', 'https://some-supplier.example/p',
      '--claim', 'A water heater.', '--model', PLATE, '--plate', PLATE, '--on', '2026-08-28',
    ])
    const { out } = run(dir, ['--visit', visitId])
    assert.match(out, /0 Documented · 1 Inferred/)
    assert.match(out, /nobody has ruled what `some-supplier\.example` is/)

    const hosts = run(dir, ['--hosts'])
    assert.match(hosts.out, /1 host has been read and never ruled/)
    assert.match(hosts.out, /npm run sources -- rule some-supplier\.example/,
      'the queue prints the command that clears it — a work item nobody can act on is a complaint')
  })

  it('ruling that host promotes the resolution without touching it', () => {
    const { dir, visitId, resolutionId } = seed()
    run(dir, [
      'record', resolutionId, '--url', 'https://some-supplier.example/p',
      '--claim', 'A water heater.', '--model', PLATE, '--plate', PLATE, '--on', '2026-08-28',
    ])
    const ruled = run(dir, [
      'rule', 'some-supplier.example', 'manufacturer',
      '--as', 'Some Supplier Ltd', '--why', 'Checked by hand — their own site.',
    ])
    assert.equal(ruled.code, 0, ruled.out)

    // ⚑ The label is derived, so one ruling changes every resolution citing the
    // host — with nothing rewritten and no source row touched.
    const { out } = run(dir, ['--visit', visitId])
    assert.match(out, /1 Documented · 0 Inferred/)
  })

  it('refuses to rule a manufacturer host without saying whose it is', () => {
    const { dir } = seed()
    const { out, code } = run(dir, ['rule', 'x.example', 'manufacturer', '--why', 'theirs'])
    assert.equal(code, 1)
    assert.match(out, /--as/)
  })

  it('refuses a ruling with no reason, and says why a reason is the point', () => {
    const { dir } = seed()
    const { out, code } = run(dir, ['rule', 'x.example', 'excluded'])
    assert.equal(code, 1)
    assert.match(out, /--why is required/)
  })

  it('has no flag anywhere that sets the label', () => {
    const { dir } = seed()
    const usage = run(dir, ['record'])
    assert.equal(usage.code, 1)
    for (const forbidden of ['--documented', '--honesty', '--label', '--tier']) {
      assert.ok(!usage.out.includes(forbidden), `\`${forbidden}\` would make the reader a way to overclaim`)
    }
  })
})
