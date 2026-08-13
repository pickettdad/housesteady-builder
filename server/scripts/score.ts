/**
 * Score a run against the confirmed room record — `npm run score`.
 *
 *   npm run score -- --visit <id> [--key /path/to/room-record.json] [--zone mechanical]
 *                                 [--pass match|identify|all]
 *
 * **Free. No model call.** It reads proposals already in the database and a key
 * from disk, and prints a report.
 *
 * ---
 *
 * ## Where the key lives — the owner ruled it into the repository
 *
 * **It is committed, at `fixtures/room-records/mechanical-room_2026-08-10.json`,
 * and `--key` defaults to it.**
 *
 * This file previously argued the opposite, on CLAUDE.md §14. **The argument was
 * wrong about whose house it is:** §14 was written about other people's homes
 * and never scoped the owner's own. He ruled it in, **because a correction has
 * to be recorded and git is the mechanism that records it** — a key living
 * outside version control cannot show what it used to say, which is exactly what
 * rule 5 needs of it.
 *
 * **Checked before committing:** no street address, no postal code, no phone
 * number, no licence or registration number, no personal name. Model numbers,
 * serials, photograph filenames and roles — his own equipment and nobody else's.
 *
 * ⚠ **A client's room record is a different question and this ruling does not
 * reach it.** Those stay in `/data`, which is gitignored and stays that way.
 * `--key` still takes a path, precisely so the harness never assumes the
 * committed one is the only one.
 *
 * *(Register #106 reserved the record's home as the project folder. Superseded
 * by the owner on 2026-08-11.)*
 *
 * ## It gates nothing
 *
 * **Rule 1, and it is first for a reason.** The key is one room in one house.
 * A harness that failed a build would make one basement the definition of
 * correct — and rule 5 exists because the key itself can be wrong.
 *
 * **The exit code is 0 unless the harness could not run at all.**
 *
 * ---
 *
 * ## ⚑ It scores one pass at a time, and that is new
 *
 * **`objects` holds the output of more than one pass.** The old identification
 * pass writes no lane; Amendment 11 pass 3 writes `plate` or `appearance`.
 * Until 2026-08-12 this script selected every object for the import and scored
 * the union — **so on any machine where `npm run identify` had ever been typed,
 * the number named neither pass**: twice the false positives, two shots at every
 * key object, and no way to tell from the output that it had happened.
 *
 * *That is the defect stage 4 was taken off the routine path to avoid, arriving
 * at the measurement instead of at the data.* **Now the passes are scored apart
 * and both are printed** — never added together.
 *
 * **Within pass 3 the two lanes are NOT scored apart**, and the reason is the
 * opposite one: `plate` and `appearance` are complementary halves of one answer,
 * so scoring them separately would mark everything the other half found as a
 * miss. **They are attributed on one score** — rule 7 — which answers *did the
 * scaffold do this, or did the enumeration?* without inventing two rooms.
 */

import { readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { openDb } from '../src/db/index.js'
import { latestImport } from '../src/ai/tasks/identify.js'
import { claimsForImport } from '../src/ai/tasks/readSurfaces.js'
import { proposalsForImport } from '../src/engine/compare.js'
import { parseFixture, proposalsOf } from '../src/engine/proposalFixture.js'
import { scoreRun, splitByPass, type RoomKey, type ScoredProposal } from '../src/engine/score.js'
import { plateModels } from '../src/engine/surfaces.js'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

/**
 * The owner's own mechanical room, committed by his ruling of 2026-08-11.
 *
 * **Resolved from this file rather than from the working directory.** It was a
 * bare relative path until 2026-08-12, which meant `npm run score` — which runs
 * in `server/` — could never find it, and only `npx tsx server/scripts/…` from
 * the repo root worked. *The same shape as `binder.ts`'s repo-root bug, and the
 * same fix: a script's own location is knowable and the caller's is not.*
 */
const repoRoot = join(import.meta.dirname, '..', '..')
const DEFAULT_KEY = join(repoRoot, 'fixtures', 'room-records', 'mechanical-room_2026-08-10.json')

/**
 * A path the caller typed, resolved against **where they typed it**.
 *
 * ⚑ `npm run` sets the working directory to `server/`, so a repo-root-relative
 * path handed to `--key` or `--proposals` resolves under `server/` and fails to
 * open. **The header already described this bug for the default key and the
 * fix only reached the default** — a caller-supplied path had the same problem
 * one line later. `INIT_CWD` is what npm sets to the directory the user was
 * actually standing in; without it, `process.cwd()` is the honest fallback.
 */
const fromCaller = (p: string): string =>
  isAbsolute(p) ? p : resolve(process.env.INIT_CWD ?? process.cwd(), p)

const visitId = arg('visit')
const keyPath = arg('key') ? fromCaller(arg('key')!) : DEFAULT_KEY
if (!visitId && !arg('proposals')) {
  console.error(
    'Usage: npm run score -- --visit <visitId> [--key <room-record.json>] [--zone <needle>] [--pass match|identify|all]\n' +
      '   or: npm run score -- --proposals <fixture.json> [--key <room-record.json>] [--pass …]\n\n' +
      '--proposals scores a fixture written by `npm run proposals` and NEVER opens the\n' +
      'database. Generating proposals and scoring them are separate jobs, and only the\n' +
      'first needs photographs, a key or a database.\n\n' +
      '--pass picks which pass to score. Omitted, every pass that wrote objects is\n' +
      'scored separately — never added together, because their union names neither.\n\n' +
      `--key defaults to ${DEFAULT_KEY} — the owner's own mechanical room, which\n` +
      "he ruled into the repository. A client's room record is a different thing: it lives in\n" +
      '/data, which is gitignored, and you pass its path.',
  )
  process.exit(1)
}

const key = JSON.parse(readFileSync(keyPath, 'utf8')) as RoomKey
if (!Array.isArray(key.confirmed_objects)) {
  console.error(`${keyPath} has no confirmed_objects array. Wrong file?`)
  process.exit(1)
}

/**
 * Which pass wrote a proposal. **Two passes, never one number.**
 *
 * `derived_from` is the whole test: pass 3 sets it, the old identification pass
 * does not. *Nothing here reads a label or a class to decide* — that would be
 * inference where a column already states the fact.
 */
const PASSES = [
  { key: 'match', title: 'Amendment 11 pass 3 — match and complete' },
  { key: 'identify', title: 'the identification pass (stage 4)' },
] as const

const wanted = arg('pass')
if (wanted !== undefined && !PASSES.some((p) => p.key === wanted) && wanted !== 'all') {
  console.error(`--pass takes ${PASSES.map((p) => p.key).join(', ')} or all. Got "${wanted}".`)
  process.exit(1)
}

/**
 * Does a proposal answer this key object?
 *
 * **Deliberately crude and deliberately here rather than inside the engine.**
 * The matching rule is a judgement about wording, and a judgement buried in a
 * similarity function is one nobody audits. A word from the key's role appearing
 * in the label is the floor; anything cleverer should be argued for first.
 */
const STOP = new Set(['the', 'and', 'for', 'with', 'in', 'of', 'to', 'a', 'an', 'house', 'system'])
const matches = (expected: string, p: ScoredProposal): boolean => {
  const want = expected.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w))
  const label = p.label.toLowerCase()
  return want.length > 0 && want.every((w) => label.includes(w))
}

/**
 * Score one set of proposals and print it. **The only reporting path**, so a
 * fixture and a database produce byte-identical output for the same proposals.
 */
function report(proposals: readonly ScoredProposal[], header: string): void {
  const split = splitByPass(proposals)
  const present = PASSES.map((p) => ({ ...p, proposals: split[p.key] })).filter(
    (p) => p.proposals.length > 0 && (wanted === undefined || wanted === 'all' || wanted === p.key),
  )

    console.log(`\nScoring ${header}\nagainst ${keyPath}`)

  if (present.length === 0) {
    // Doctrine 6 — say so rather than print a clean zero, which reads as a run
    // that found nothing rather than as a run that never happened.
    console.log(
      `\n${proposals.length} object(s) in this import, and none belongs to a pass this harness scores` +
        `${wanted ? ` under --pass ${wanted}` : ''}.\n\nNothing scored. This is not a score of zero.\n`,
    )
    return
    }

  if (present.length > 1) {
    console.log(
      `\n⚑ ${present.length} passes have written objects for this import, and they are scored APART.\n` +
        `  Adding them would give one number naming neither: two shots at every key object\n` +
        `  and twice the false positives. Two answers to one question is the condition itself.\n`,
    )
  }

  const line = (o: string, n: number): string => `  ${o.padEnd(18)}${String(n).padStart(4)}`

  for (const pass of present) {
    const r = scoreRun(key, pass.proposals, matches)

    console.log(`\n${'='.repeat(72)}\n${pass.title}`)
    console.log(`${pass.proposals.length} proposals against ${r.keyObjects} confirmed objects.\n`)

    console.log(line('correct', r.counts.correct))
    console.log(line('wrong', r.counts.wrong))
    console.log(line('key-uncertain', r.counts['key-uncertain']))
    console.log(line('plate-legibility', r.counts['plate-legibility']))
    console.log(line('false positives', r.falsePositives.length))

    /**
     * Rule 7 — the same outcomes, by lane.
     *
     * Only for a pass that has more than one, because a single-lane table says
     * nothing the totals above do not already say.
     */
    const lanes = Object.entries(r.byLane).sort(([a], [b]) => a.localeCompare(b))
    if (lanes.length > 1) {
      console.log(`\n  by lane — which half of the pass earned each outcome:`)
      console.log(`    ${'lane'.padEnd(14)}${'props'.padStart(7)}${'correct'.padStart(9)}${'wrong'.padStart(7)}${'uncert'.padStart(8)}${'legib'.padStart(7)}${'false+'.padStart(8)}${'on role'.padStart(8)}${'on prod'.padStart(9)}${'on model'.padStart(10)}`)
      for (const [l, t] of lanes) {
        console.log(
          `    ${l.padEnd(14)}${String(t.proposals).padStart(7)}${String(t.correct).padStart(9)}` +
            `${String(t.wrong).padStart(7)}${String(t['key-uncertain']).padStart(8)}` +
            `${String(t['plate-legibility']).padStart(7)}${String(t.falsePositives).padStart(8)}` +
            `${String(t.correctOnRole).padStart(8)}${String(t.correctOnProduct).padStart(9)}${String(t.correctOnModel).padStart(10)}`,
        )
      }
      console.log(
        `\n    ⚑ The last three columns are rule 8, and they are the diagnostic this run\n` +
          `    exists for: a PLATE proposal matching on PRODUCT or MODEL is right, and an\n` +
          `    APPEARANCE proposal matching on ROLE is right. Which column carries a\n` +
          `    lane's correct answers is how you see what that half of the pass did.\n\n` +
          `    These rows are attributions, not a partition — two lanes can cite one\n` +
          `    photograph, and a key object nothing proposed credits no lane at all.\n` +
          `    So they need not sum to the totals above, and that is not an error.`,
      )
    }

    if (r.missed.length > 0) {
      console.log(`\nKey objects no proposal cites a photograph of (${r.missed.length}):`)
      for (const m of r.missed) console.log(`  ${m.expected}`)
    }

    const wrong = r.judged.filter((j) => j.outcome === 'wrong')
    if (wrong.length > 0) {
      console.log(`\nDisagreements (${wrong.length}) — each resolvable as engine-wrong OR key-wrong:`)
      for (const j of wrong) {
        console.log(`  expected: ${j.expected}`)
        for (const l of j.proposalLabels) console.log(`      got: ${l}`)
      }
    }

    if (r.falsePositives.length > 0) {
      console.log(`\nProposals matching no key object (${r.falsePositives.length}):`)
      for (const f of r.falsePositives) {
        console.log(`  ${f.lane.padEnd(12)} ${(f.classId ?? '(no class)').padEnd(30)} ${f.label}`)
      }
    }

    console.log(`\n${r.note}`)
  }

  console.log('\nThis report gates nothing. Exit 0.\n')
}

/**
 * ⚑ The fixture path — the ruling of 2026-08-12.
 *
 * **With `--proposals`, this script never opens the database.** Generating
 * proposals and scoring them are separate jobs, and only the first needs
 * photographs, a key or a database. *So the harness is fixable and re-runnable
 * on any machine with two files: this fixture and the key.*
 */
const fixturePath = arg('proposals')
if (fixturePath) {
  const fixture = parseFixture(JSON.parse(readFileSync(fromCaller(fixturePath), 'utf8')))
  report(
    proposalsOf(fixture),
    `${fixture.provenance.visitId}${fixture.provenance.zone ? ` · zone ${fixture.provenance.zone}` : ''}` +
      ` · proposals generated ${fixture.provenance.producedAt || 'at an unrecorded time'}` +
      `${fixture.provenance.note ? `\n${fixture.provenance.note}` : ''}`,
  )
  process.exit(0)
}

// Past the fixture branch, so a visit id is required and the type says so.
if (!visitId) process.exit(1)

const db = openDb()
const importId = latestImport(db, visitId)
if (!importId) {
  console.error(`Visit ${visitId} has no import.`)
  process.exit(1)
}

const needle = arg('zone')?.toLowerCase()
const zones = (
  db.prepare('SELECT zone_id AS zoneId, label, type FROM zones WHERE import_id = ?').all(importId) as {
    zoneId: string
    label: string | null
    type: string | null
  }[]
).filter(
  (z) =>
    needle === undefined ||
    z.zoneId.toLowerCase().includes(needle) ||
    (z.label ?? z.type ?? '').toLowerCase().includes(needle),
)

/**
 * Model numbers per photograph, from Amendment 11 pass 1.
 *
 * **Rule 6's legibility bucket was empty by construction until this existed** —
 * the run stored no model string anywhere, so the rule was built, tested and
 * unreachable on a real run. Pass 1 is what fills it.
 *
 * **Nameplate only**, which `plateModels` enforces: rule 6's whole claim is that
 * a one-character difference is a photograph of a plate rather than an engine
 * error, and a model number read off a carton is a different kind of evidence.
 */
const platedModels = new Map<string, string[]>()
for (const m of plateModels(claimsForImport(db, importId))) {
  const list = platedModels.get(m.mediaId)
  if (list) list.push(m.value)
  else platedModels.set(m.mediaId, [m.value])
}

const proposals: ScoredProposal[] = zones.flatMap((z) =>
  // `every-pass` is a promise to split downstream, and `report()` keeps it —
  // `splitByPass` scores each pass apart and refuses to add them.
  proposalsForImport(db, importId, 'every-pass', z.zoneId).map((p) => ({
    id: p.id,
    label: p.label,
    classId: p.classId,
    mediaIds: p.mediaIds,
    lane: p.derivedFrom,
    modelRead: p.modelRead,
    // Every plate model read from any photograph this proposal cites. A list,
    // because one photograph can hold two plates and choosing between them here
    // would hide exactly what rule 6 separates.
    models: [...new Set(p.mediaIds.flatMap((id) => platedModels.get(id) ?? []))],
  })),
)

/**
 * ⚑ **The call this file was missing for a day.**
 *
 * The `--proposals` branch above calls `report()` and exits; **this line did not
 * exist**, so `npm run score --visit` built its proposals, fell off the end of
 * the file, printed nothing and exited 0. *A silent success is the worst
 * available failure* — the runner session ran the documented command, got a
 * clean exit and no output, and had to read the source to find out why.
 *
 * **It was introduced by moving the reporting into a function and wiring only
 * the branch being added.** `test/score-script.test.ts` now runs both paths as
 * processes, because every test this file had called `scoreRun` directly and
 * none of them could see a script that never calls it.
 */
report(proposals, `visit ${visitId}${needle ? ` · zone ${needle}` : ''}`)

