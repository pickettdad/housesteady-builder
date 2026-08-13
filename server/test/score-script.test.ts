/**
 * `npm run score` as a PROCESS — the test that was missing.
 *
 * ⚑ **On 2026-08-13 a runner session ran the documented command against a real
 * house and got a clean exit and no output at all.** `scripts/score.ts` built
 * its proposals and fell off the end of the file: the reporting had been moved
 * into a function, and only the branch being added at the time was wired to
 * call it.
 *
 * **Every test the harness had called `scoreRun` directly.** The engine was
 * covered from four angles and *nothing ran the script*, so a script that never
 * calls the engine was invisible to all of them. `score-pipeline.test.ts` even
 * reads this script's source text — and read the matcher out of it while the
 * control flow underneath went untested.
 *
 * *A silent success is the worst available failure*, and the general form is
 * worth more than the fix: **a test that imports the thing a command uses is
 * not a test of the command.**
 *
 * So these spawn it. They are slower than every other test here and that is the
 * price of covering the seam between a script and its engine.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newId, now } from '../src/db/index.js'
import { openDb } from '../src/db/index.js'
import { buildFixture } from '../src/engine/proposalFixture.js'
import { mediaIdOf, type RoomKey } from '../src/engine/score.js'
import { readFileSync } from 'node:fs'
import { repoRoot } from './helpers.js'

const SCRIPT = join(repoRoot, 'server', 'scripts', 'score.ts')
const key = JSON.parse(
  readFileSync(join(repoRoot, 'fixtures', 'room-records', 'mechanical-room_2026-08-10.json'), 'utf8'),
) as RoomKey

/**
 * Run the script the way a person does, and capture what they would see.
 *
 * **Node directly rather than `npx`**, and that is not a style choice: *npx sets
 * `INIT_CWD` itself*, to wherever it was invoked. Going through it would
 * overwrite the very variable the caller-relative-path test is checking, and
 * the test would fail while the code was right.
 */
function run(
  args: string[],
  opts: { env?: Record<string, string>; cwd?: string } = {},
): { out: string; code: number } {
  try {
    const out = execFileSync(process.execPath, ['--import', 'tsx', SCRIPT, ...args], {
      cwd: opts.cwd ?? join(repoRoot, 'server'),
      env: { ...process.env, ...opts.env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { out, code: 0 }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number }
    return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 }
  }
}

/** A database with one zone, three laned objects, and the key's photographs. */
function seedDatabase(dir: string): string {
  const db = openDb(join(dir, 'housesteady.db'))
  const OP = 'op-script', PROPERTY = 'prop-1', VISIT = 'visit-script', MECH = 'zone-mech'
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
  ).run(MECH, importId, PROPERTY, VISIT, now())

  const media = db.prepare(
    `INSERT OR IGNORE INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind, owner_zone_id,
                                  owner_pin_id, owner_canvas_id, file, file_status, created_at)
     VALUES (?, ?, ?, ?, 'photo', 'zone', ?, NULL, NULL, ?, 'absent', ?)`,
  )
  const insert = db.prepare(
    `INSERT INTO objects (id, property_id, zone_id, import_id, class_id, label, actor_id, derived_from, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
  )
  const link = db.prepare('INSERT OR IGNORE INTO object_media (object_id, media_id, created_at) VALUES (?, ?, ?)')
  key.confirmed_objects.slice(0, 3).forEach((o, i) => {
    const m = mediaIdOf(o.photographs[0]!)
    media.run(m, importId, PROPERTY, VISIT, MECH, o.photographs[0]!, now())
    const id = newId()
    insert.run(id, PROPERTY, MECH, importId, o.role ?? o.product ?? 'x', OP, i === 0 ? 'plate' : 'appearance', now())
    link.run(id, m, now())
  })
  db.close()
  return VISIT
}

describe('⚑ the command prints a report — both paths', () => {
  it('scores from the database and does NOT exit silently', () => {
    // THE regression. Before 2026-08-13 this produced an empty string and a
    // zero exit code, and nothing in the suite could see it.
    const dir = mkdtempSync(join(tmpdir(), 'hs-score-'))
    const visitId = seedDatabase(dir)
    const { out, code } = run(['--visit', visitId, '--zone', 'mech'], { env: { HOUSESTEADY_DATA: dir } })

    assert.equal(code, 0)
    assert.ok(out.trim().length > 0, 'the documented command must print something')
    assert.match(out, /Scoring visit/)
    assert.match(out, /confirmed objects/)
    assert.match(out, /This report gates nothing/)
  })

  it('scores from a fixture without opening a database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hs-score-'))
    const path = join(dir, 'props.json')
    writeFileSync(
      path,
      JSON.stringify(
        buildFixture({ visitId: 'v', importId: 'i', zone: 'mech', producedAt: '2026-08-13T00:00:00Z' }, [
          { id: 'a', label: key.confirmed_objects[0]!.role ?? 'x', classId: null,
            mediaIds: [mediaIdOf(key.confirmed_objects[0]!.photographs[0]!)], lane: 'plate' },
        ]),
      ),
    )
    // HOUSESTEADY_DATA points at an empty directory: if the fixture path ever
    // opened a database, this would create one and the claim would be false.
    const { out, code } = run(['--proposals', path], { env: { HOUSESTEADY_DATA: join(dir, 'no-db-here') } })
    assert.equal(code, 0)
    assert.match(out, /Amendment 11 pass 3/)
    assert.match(out, /This report gates nothing/)
  })

  it('takes a fixture path relative to where the caller typed it', () => {
    // ⚑ `npm run` puts the process in `server/`, so a repo-root-relative path
    // resolved under it and failed to open. The runner hit this immediately
    // after hitting the silent-exit bug.
    const dir = mkdtempSync(join(tmpdir(), 'hs-score-'))
    writeFileSync(
      join(dir, 'props.json'),
      JSON.stringify(buildFixture({ visitId: 'v', importId: 'i', zone: null, producedAt: 'x' }, [])),
    )
    const { out, code } = run(['--proposals', 'props.json'], { env: { INIT_CWD: dir, HOUSESTEADY_DATA: dir } })
    assert.equal(code, 0, out)
    assert.match(out, /Nothing scored/)
  })

  it('refuses a --pass it does not know, rather than scoring everything', () => {
    const { out, code } = run(['--visit', 'nope', '--pass', 'nonsense'])
    assert.equal(code, 1)
    assert.match(out, /--pass takes/)
  })

  it('prints usage when given neither a visit nor a fixture', () => {
    const { out, code } = run([])
    assert.equal(code, 1)
    assert.match(out, /Usage: npm run score/)
  })
})
