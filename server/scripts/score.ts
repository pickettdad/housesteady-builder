/**
 * Score a run against the confirmed room record — `npm run score`.
 *
 *   npm run score -- --visit <id> [--key /path/to/room-record.json] [--zone mechanical]
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
 */

import { readFileSync } from 'node:fs'
import { openDb } from '../src/db/index.js'
import { latestImport } from '../src/ai/tasks/identify.js'
import { claimsForImport } from '../src/ai/tasks/readSurfaces.js'
import { proposalsForImport } from '../src/engine/compare.js'
import { scoreRun, type RoomKey, type ScoredProposal } from '../src/engine/score.js'
import { plateModels } from '../src/engine/surfaces.js'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

/** The owner's own mechanical room, committed by his ruling of 2026-08-11. */
const DEFAULT_KEY = 'fixtures/room-records/mechanical-room_2026-08-10.json'

const visitId = arg('visit')
const keyPath = arg('key') ?? DEFAULT_KEY
if (!visitId) {
  console.error(
    'Usage: npx tsx server/scripts/score.ts --visit <visitId> [--key <room-record.json>] [--zone <needle>]\n\n' +
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
  proposalsForImport(db, importId, z.zoneId).map((p) => ({
    id: p.id,
    label: p.label,
    classId: p.classId,
    mediaIds: p.mediaIds,
    // Every plate model read from any photograph this proposal cites. A list,
    // because one photograph can hold two plates and choosing between them here
    // would hide exactly what rule 6 separates.
    models: [...new Set(p.mediaIds.flatMap((id) => platedModels.get(id) ?? []))],
  })),
)

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

const r = scoreRun(key, proposals, matches)

console.log(`\nScoring visit ${visitId} against ${keyPath}`)
console.log(`${proposals.length} proposals against ${r.keyObjects} confirmed objects.\n`)

const line = (o: string, n: number): string => `  ${o.padEnd(18)}${String(n).padStart(4)}`
console.log(line('correct', r.counts.correct))
console.log(line('wrong', r.counts.wrong))
console.log(line('key-uncertain', r.counts['key-uncertain']))
console.log(line('plate-legibility', r.counts['plate-legibility']))
console.log(line('false positives', r.falsePositives.length))

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
  for (const f of r.falsePositives) console.log(`  ${(f.classId ?? '(no class)').padEnd(30)} ${f.label}`)
}

console.log(`\n${r.note}\n`)
console.log('This report gates nothing. Exit 0.\n')
