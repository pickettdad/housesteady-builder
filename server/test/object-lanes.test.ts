/**
 * ⚑ The lane sweep, made permanent.
 *
 * On 2026-08-13 `binder.ts` was found counting two passes' proposals as one
 * house's components — after the roadmap had recorded that danger as closed,
 * because the *score* had been fixed. The design session's ruling made the sweep
 * standing rather than a one-off: **any consumer of `objects` that does not
 * filter by lane carries the same defect.**
 *
 * A standing action is a thing somebody has to remember, and this repo's own
 * §15 says the reason stale doctrine survives is that **nothing fails on
 * contact**. So the sweep is a test. Three consumers were blending when it was
 * written — `scripts/compare.ts`, `scripts/identify.ts` and `scripts/smoke.ts` —
 * and the fourth one written after today fails here instead of shipping.
 *
 * Two mechanisms, because the blend can happen at two layers, and neither
 * mechanism can see the other's layer:
 *
 * - **SQL** — `scanForUnlanedReads` over the source tree.
 * - **memory** — `LaneScope` is a required argument, so the typechecker catches
 *   a consumer that reads every pass and forgets to split. *That one is not
 *   testable here at all*; it is proven by the three call sites that stopped
 *   compiling when the argument landed.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { newId, now, openDb } from '../src/db/index.js'
import { proposalsForImport } from '../src/engine/compare.js'
import { passOf } from '../src/engine/score.js'
import {
  LANE_EXEMPT,
  laneClause,
  laneLabel,
  scanForUnlanedReads,
  type SourceFile,
} from '../src/engine/lanes.js'
import { repoRoot } from './helpers.js'

// ------------------------------------------------------------- the scanner

describe('the scan can disagree with itself — both answers, on made-up source', () => {
  const file = (text: string): SourceFile[] => [{ path: 'server/scripts/made-up.ts', text }]
  const none = new Map<string, string>()

  it('FLAGS a read that neither scopes nor carries the lane', () => {
    const r = scanForUnlanedReads(file("db.prepare('SELECT COUNT(*) AS n FROM objects WHERE import_id = ?')"), none)
    assert.equal(r.length, 1, 'this is the defect binder.ts shipped with')
    assert.equal(r[0]!.path, 'server/scripts/made-up.ts')
    assert.match(r[0]!.query, /SELECT COUNT/)
  })

  it('PASSES a read that scopes itself to one lane', () => {
    const r = scanForUnlanedReads(
      file("db.prepare('SELECT COUNT(*) FROM objects WHERE import_id = ? AND derived_from IS NOT NULL')"),
      none,
    )
    assert.deepEqual(r, [])
  })

  it('PASSES a read that carries the lane out to its caller', () => {
    // The half that makes this "either scope it or carry it" rather than "always
    // filter". `score.ts` reads every pass ON PURPOSE and is correct, because the
    // lane rides on every row and `splitByPass` separates them downstream.
    const r = scanForUnlanedReads(
      file("db.prepare('SELECT id, derived_from AS lane FROM objects WHERE import_id = ?')"),
      none,
    )
    assert.deepEqual(r, [])
  })

  it('reports the line, so the finding is somewhere rather than about a file', () => {
    const r = scanForUnlanedReads(file(`const a = 1\nconst b = 2\nconst q = 'SELECT * FROM objects WHERE x = ?'\n`), none)
    assert.equal(r[0]!.line, 3)
  })

  it('finds every unlaned read in a file, not just the first', () => {
    // binder.ts had three reads of `objects` in fifty lines. A scan that stops
    // at one would have reported the defect fixed with two of them still live.
    const r = scanForUnlanedReads(
      file(`const a = 'SELECT x FROM objects WHERE i = ?'\nconst b = 'SELECT y FROM objects o WHERE i = ?'\n`),
      none,
    )
    assert.equal(r.length, 2)
  })

  it('ignores writes — INSERT and UPDATE cannot blend two passes', () => {
    const r = scanForUnlanedReads(
      file("db.prepare('INSERT INTO objects (id, label) VALUES (?, ?)')\ndb.prepare('UPDATE objects SET label = ? WHERE id = ?')"),
      none,
    )
    assert.deepEqual(r, [])
  })

  it('does not flag prose about the rule — a comment is not an implementation', () => {
    // The first run of this check flagged `lanes.ts`, whose own doc comment
    // contains the words it searches for. Exempting the rule's own home would
    // have parked every file that argues about the defect.
    const r = scanForUnlanedReads(file(`// this reads FROM objects with no lane\n/* and so does FROM objects */\n`), none)
    assert.deepEqual(r, [])
  })

  it('still flags a real read in a file that ALSO discusses one in prose', () => {
    // The failure mode of comment-stripping done carelessly: strip the file and
    // lose the query with it.
    const r = scanForUnlanedReads(
      file(`// we used to read FROM objects unscoped\nconst q = 'SELECT n FROM objects WHERE import_id = ?'\n`),
      none,
    )
    assert.equal(r.length, 1)
    assert.equal(r[0]!.line, 2, 'blanked, not deleted — the line still points somewhere')
  })

  it('does not lose a query behind a URL in a string', () => {
    // ⚑ The false negative that a two-regex version would ship: `//` inside
    // `https://` ends the line, and any SQL after it goes unscanned. **A scan
    // with false negatives is the clean sweep that was not one.**
    const r = scanForUnlanedReads(
      file(`const doc = 'https://example.invalid/x'\nconst q = 'SELECT n FROM objects WHERE i = ?'`),
      none,
    )
    assert.equal(r.length, 1, 'the URL must not swallow the query below it')
  })

  it('skips an exempt path, and only that path', () => {
    const sql = "db.prepare('SELECT class_id FROM objects WHERE id = ?')"
    const exempt = new Map([['server/src/engine/confirm.ts', 'one row, picked by a human']])
    assert.deepEqual(scanForUnlanedReads([{ path: 'server/src/engine/confirm.ts', text: sql }], exempt), [])
    assert.equal(scanForUnlanedReads([{ path: 'server/src/engine/other.ts', text: sql }], exempt).length, 1)
  })
})

// ------------------------------------------------------------ the real tree

/**
 * Every `.ts` under `server/src` and `server/scripts`, repo-relative.
 *
 * **What is deliberately not walked, said out loud rather than left to be
 * discovered** — an unstated exclusion is the shape of hole this whole check
 * exists to close:
 *
 * - **`server/test`.** A test seeds rows it wrote and asserts on them; there is
 *   no reader to mislead. A test that seeds both passes and asserts a blended
 *   number would be asserting the defect, and no scan catches that.
 * - **`server/src/db/migrations`.** `.sql`, and a table rebuild copies every row
 *   by definition — lanes are not a question a migration can answer wrongly.
 * - **`web/`.** Nothing there reaches `objects`; the front end goes through the
 *   API, which lives under `server/src` and is walked.
 */
function sourceFiles(): SourceFile[] {
  const out: SourceFile[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry !== 'node_modules') walk(full)
      } else if (entry.endsWith('.ts')) {
        out.push({ path: relative(repoRoot, full).split(sep).join('/'), text: readFileSync(full, 'utf8') })
      }
    }
  }
  walk(join(repoRoot, 'server', 'src'))
  walk(join(repoRoot, 'server', 'scripts'))
  return out
}

describe('⚑ every read of `objects` in the source tree', () => {
  const files = sourceFiles()

  it('is looking at a tree it actually found', () => {
    // A scan over zero files reports zero findings and reads exactly like a
    // clean sweep. *A check whose output does not depend on what it checks is
    // not a check* — so the walk has to prove it walked.
    assert.ok(files.length > 50, `walked ${files.length} files`)
    const reads = files.reduce((n, f) => n + (f.text.match(/\bFROM\s+objects\b/gi) ?? []).length, 0)
    assert.ok(reads >= 6, `only ${reads} reads of \`objects\` found — the walk is not seeing the scripts`)
  })

  it('either scopes itself to one lane or carries the lane out', () => {
    const found = scanForUnlanedReads(files)
    assert.deepEqual(
      found.map((f) => `${f.path}:${f.line}  ${f.query}`),
      [],
      'a read of `objects` that does neither returns rows whose pass nobody can tell apart',
    )
  })

  it('is exempt only with a reason written down', () => {
    // An allow-list of bare filenames is how a real defect gets parked: the next
    // reader cannot tell an argued exemption from one added to go green.
    for (const [path, reason] of LANE_EXEMPT) {
      assert.ok(reason.length > 40, `${path} is exempt without saying why`)
      assert.ok(files.some((f) => f.path === path), `${path} is exempt and does not exist`)
    }
  })
})

// -------------------------------------------------------- clause and vocabulary

describe('the SQL clause and the scoring vocabulary agree', () => {
  /** One import, three objects: two from pass 3, one from the retired pass. */
  function seed(): { db: ReturnType<typeof openDb>; importId: string; visitId: string } {
    const db = openDb(':memory:')
    const OP = 'op-lane', PROPERTY = 'p-lane', VISIT = 'v-lane', ZONE = 'zone-mech'
    db.prepare(`INSERT INTO operators (id, display_name, short_code, active, created_at) VALUES (?, 'L', 'l', 1, ?)`).run(OP, now())
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
    const ins = db.prepare(
      `INSERT INTO objects (id, property_id, zone_id, import_id, class_id, label, actor_id, derived_from, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    )
    ins.run(newId(), PROPERTY, ZONE, importId, 'a water heater', OP, 'plate', now())
    ins.run(newId(), PROPERTY, ZONE, importId, 'a water softener', OP, 'appearance', now())
    ins.run(newId(), PROPERTY, ZONE, importId, 'a water heater', OP, null, now())
    return { db, importId, visitId: VISIT }
  }

  it('selects exactly the rows `passOf` puts in that pass', () => {
    // ⚑ Two vocabularies for one partition is the four-numbering-schemes failure
    // in miniature. They cannot be checked by reading them side by side; they can
    // be checked by running both over the same rows.
    const { db, importId } = seed()
    const every = proposalsForImport(db, importId, 'every-pass')
    assert.equal(every.length, 3)

    for (const scope of ['match', 'identify'] as const) {
      const rows = proposalsForImport(db, importId, scope)
      assert.deepEqual(
        rows.map((r) => r.id).sort(),
        every.filter((p) => passOf(p.derivedFrom) === scope).map((p) => p.id).sort(),
        `laneClause('${scope}') and passOf disagree about which rows belong to ${scope}`,
      )
    }
    db.close()
  })

  it('every-pass takes both, and the two scopes partition it with nothing lost', () => {
    // Doctrine 6 in clause form: a row belongs to exactly one scope, and no
    // filter may quietly drop one that belongs to neither.
    const { db, importId } = seed()
    const match = proposalsForImport(db, importId, 'match')
    const identify = proposalsForImport(db, importId, 'identify')
    assert.equal(match.length, 2)
    assert.equal(identify.length, 1)
    assert.equal(match.length + identify.length, proposalsForImport(db, importId, 'every-pass').length)
    db.close()
  })

  it('names the column in every clause, including every-pass', () => {
    // Not cosmetic: the scan reads query text, so a clause that omits the column
    // would make the widest read look like the omission it exists to distinguish.
    for (const scope of ['match', 'identify', 'every-pass'] as const) {
      assert.match(laneClause(scope, 'o'), /o\.derived_from/, scope)
    }
  })

  it('has a human label for each scope, because a report names its lane', () => {
    for (const scope of ['match', 'identify', 'every-pass'] as const) {
      assert.ok(laneLabel[scope].length > 10)
    }
  })
})

// ------------------------------------------- the residue names its own pass

describe('⚑ `npm run compare` sizes stage 2 per pass, never on the union', () => {
  /**
   * **The residue decides whether an increment gets built**, and this script
   * handed both passes to one comparison. Every object both passes found counted
   * as a duplicate of itself: candidate groups up, residue down, stage 2 sized
   * against a number naming neither pass.
   *
   * Scoring-harness **rule 7 — a score names the lane that earned it.** Same
   * class of number, same rule.
   */
  function seedBothPasses(dir: string): string {
    const db = openDb(join(dir, 'housesteady.db'))
    const OP = 'op-c', PROPERTY = 'p-c', VISIT = 'visit-compare', ZONE = 'zone-mech'
    db.prepare(`INSERT INTO operators (id, display_name, short_code, active, created_at) VALUES (?, 'C', 'c', 1, ?)`).run(OP, now())
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
    const ins = db.prepare(
      `INSERT INTO objects (id, property_id, zone_id, import_id, class_id, label, actor_id, derived_from, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    // Both passes found the same two things, and nothing within a pass is a
    // duplicate — two objects, no shared photograph, no shared class, no shared
    // label word. Per pass the residue is 2. **Blended, the four group into two
    // pairs and the residue reads 0** — one house identified twice, read as one
    // house with no loose ends.
    for (const lane of ['plate', null]) {
      ins.run(newId(), PROPERTY, ZONE, importId, 'water-heater-gas', 'Gas water heater', OP, lane, now())
      ins.run(newId(), PROPERTY, ZONE, importId, 'electrical-panel', 'Electrical panel', OP, lane, now())
    }
    db.close()
    return VISIT
  }

  const run = (args: string[], dir: string): string =>
    execFileSync(process.execPath, ['--import', 'tsx', join(repoRoot, 'server', 'scripts', 'compare.ts'), ...args], {
      cwd: join(repoRoot, 'server'),
      env: { ...process.env, HOUSESTEADY_DATA: dir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

  it('reports each pass under its own heading and refuses to add them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hs-compare-'))
    const out = run(['--visit', seedBothPasses(dir)], dir)

    assert.match(out, /Amendment 11 pass 3/)
    assert.match(out, /retired identification pass/)
    assert.match(out, /compared APART/)
    // Two residues of 2, not one blended 0. The blend is the defect and its
    // signature is the LOWER number, which is why it never looked wrong.
    assert.equal((out.match(/RESIDUE\s+2\b/g) ?? []).length, 2, out)
    assert.doesNotMatch(out, /RESIDUE\s+0\b/)
  })

  it('scores one pass alone when asked, and says which', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hs-compare-'))
    const out = run(['--visit', seedBothPasses(dir), '--pass', 'match'], dir)
    assert.match(out, /Amendment 11 pass 3/)
    assert.doesNotMatch(out, /retired identification pass/)
    assert.doesNotMatch(out, /compared APART/)
  })

  it('says nothing was compared rather than printing a residue of zero', () => {
    // Doctrine 6. `RESIDUE 0` for a pass that never ran is the confident-looking
    // version of "no idea", and it is the number an increment gets cancelled on.
    const dir = mkdtempSync(join(tmpdir(), 'hs-compare-'))
    const db = openDb(join(dir, 'housesteady.db'))
    const visitId = seedBothPasses(dir)
    db.close()
    // Delete the retired pass's rows, then ask for exactly that pass.
    const db2 = openDb(join(dir, 'housesteady.db'))
    db2.prepare('DELETE FROM objects WHERE derived_from IS NULL').run()
    db2.close()

    const out = run(['--visit', visitId, '--pass', 'identify'], dir)
    assert.match(out, /Nothing compared\. This is not a residue of zero/)
    assert.doesNotMatch(out, /RESIDUE/)
    assert.doesNotMatch(out, /PRE-BINDING/, 'nothing was bound because nothing ran — a different fact')
  })
})
