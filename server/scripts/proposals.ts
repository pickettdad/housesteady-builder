/**
 * Write a run's proposals out as a fixture — `npm run proposals`.
 *
 *   npm run proposals -- --visit <id> [--zone <needle>] [--out <path>] [--note "..."]
 *
 * **Free. No model call.** It reads objects already in the database and writes
 * the one file the scoring harness needs.
 *
 * ---
 *
 * ## ⚑ Why this exists — the ruling of 2026-08-12
 *
 * **Generating proposals and scoring proposals are separate jobs, and only the
 * first needs photographs, a key or a database.**
 *
 * Generating costs money and needs a session with half a gigabyte of a real
 * house on disk. **Scoring needs two files.** Until this existed they were one
 * command — so every fix to the harness needed the expensive half again, and the
 * harness turned out to be broken three ways with nobody able to tell.
 *
 * **Generate once. Score forever, on any machine.**
 *
 * ## ⚠ Where it writes, and why it is not the repo
 *
 * **Default output is `<HOUSESTEADY_DATA>/proposals/`, which is gitignored.**
 *
 * A label is a model's words about a photograph and identification reads plates.
 * **This repository is public.** So every write runs the personal-data scan and
 * prints what it found; **moving the file into the repo is a human act taken
 * afterwards, not something this script does.**
 *
 * ⚑ *A clean scan is not permission to commit.* It cannot see a person's name and
 * it is deliberately blind to the shapes model numbers share with licence
 * numbers. It says **look here**, never **this is safe**.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { openDb, dataRoot } from '../src/db/index.js'
import { latestImport } from '../src/ai/tasks/identify.js'
import { claimsForImport } from '../src/ai/tasks/readSurfaces.js'
import { proposalsForImport } from '../src/engine/compare.js'
import { plateModels } from '../src/engine/surfaces.js'
import { buildFixture, scanForPersonalData } from '../src/engine/proposalFixture.js'
import { splitByPass, type ScoredProposal } from '../src/engine/score.js'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const visitId = arg('visit')
if (!visitId) {
  console.error(
      'Usage: npm run proposals -- --visit <visitId> [--zone <needle>] [--out <path>]\n' +
      '                              [--note "..."] [--generation <id>[,<id>]]\n\n' +
      'Writes the proposals the scoring harness reads, so scoring never needs the\n' +
      'photographs, the API key or this database again.\n\n' +
      '⚑ --generation scopes the fixture to one RUN. A re-run APPENDS rather than\n' +
      'replacing, and its objects carry the same import and the same lane as the\n' +
      'first — so after any --again, a fixture written blind mixes two runs. The\n' +
      'runs present are always printed, whether or not you filter.',
  )
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
    zoneId: string; label: string | null; type: string | null
  }[]
).filter(
  (z) =>
    needle === undefined ||
    z.zoneId.toLowerCase().includes(needle) ||
    (z.label ?? z.type ?? '').toLowerCase().includes(needle),
)

const platedModels = new Map<string, string[]>()
for (const m of plateModels(claimsForImport(db, importId))) {
  const list = platedModels.get(m.mediaId)
  if (list) list.push(m.value)
  else platedModels.set(m.mediaId, [m.value])
}

const proposals: ScoredProposal[] = zones.flatMap((z) =>
  // `every-pass` on purpose: a fixture is evidence of what an import held, so
  // dropping a pass at write time would put the choice beyond the scorer's
  // reach. The lane rides on every proposal and `score --pass` splits on it.
  proposalsForImport(db, importId, 'every-pass', z.zoneId).map((p) => ({
    id: p.id,
    label: p.label,
    classId: p.classId,
    mediaIds: p.mediaIds,
    lane: p.derivedFrom,
    modelRead: p.modelRead,
    generationId: p.generationId,
    models: [...new Set(p.mediaIds.flatMap((id) => platedModels.get(id) ?? []))],
  })),
)

/**
 * ⚑ Which RUN to write out — `objects.generation_id`.
 *
 * **A re-run appends; it does not replace.** `--again` re-queues the job and
 * `writeMatched` inserts; nothing is deleted, because the log is append-only and
 * the first run is evidence. So after a re-run this import holds two sets of
 * proposals with **the same `import_id` and the same lane** — and a fixture
 * written blind mixes them and scores a number naming neither.
 *
 * *This is the failure `splitByPass` exists to prevent, one level down: not two
 * passes, but two runs of one pass.* **Found by the runner session on
 * 2026-08-13 before it cost anything.**
 *
 * **The report below is always printed.** The filter is optional; knowing is not.
 */
const runs = new Map<string, number>()
for (const p of proposals) runs.set(p.generationId ?? '(no generation)', (runs.get(p.generationId ?? '(no generation)') ?? 0) + 1)

const wantRuns = arg('generation')?.split(',').map((x) => x.trim()).filter(Boolean)
if (wantRuns) {
  const unknown = wantRuns.filter((g) => !runs.has(g))
  if (unknown.length > 0) {
    console.error(`\n--generation names ${unknown.length} id(s) this import has no objects for: ${unknown.join(', ')}\n`)
    process.exit(1)
  }
}

const kept = wantRuns ? proposals.filter((p) => wantRuns.includes(p.generationId ?? '')) : proposals

const fixture = buildFixture(
  {
    visitId,
    importId,
    zone: needle ?? null,
    producedAt: new Date().toISOString(),
    ...(arg('note') ? { note: arg('note')! } : {}),
  },
  kept,
)

const out = arg('out') ?? join(dataRoot, 'proposals', `${visitId}${needle ? `-${needle}` : ''}.json`)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')

const split = splitByPass(kept)
console.log(`\nWrote ${out}`)
console.log(`${kept.length} proposals — ${split.match.length} from pass 3, ${split.identify.length} from the identification pass.`)

// ⚑ Always. A mixed fixture must never be written without the writer knowing.
const generationDetail = db.prepare(
  `SELECT id, task, created_at AS at FROM ai_generations WHERE id = ?`,
)
/**
 * ⚑ Generations grouped into RUNS — and the grouping is stated, not guessed.
 *
 * **A "run" is not a concept the schema has.** One drain of a pass produces
 * several generations, one per batch, and nothing ties them together — so this
 * groups them by **task and a time gap**, and ⚠ *that is a heuristic, printed
 * with its threshold so a reader can disagree with it.* Every generation is
 * listed individually underneath for exactly that reason.
 *
 * *Same-task contiguity alone is NOT enough and the first version of this got it
 * wrong:* run 1 and run 2 of the 2026-08-13 re-run are both `match_known`, so
 * grouping on task merged them back into one. **Calls within a drain are
 * seconds apart; runs are hours.**
 *
 * **And this exists because the first version of the hint named only the newest
 * generation.** The 2026-08-13 re-run's second pass spanned **three** — 18, 17
 * and 15 objects — so following the hint would have scoped **15 of 50** and
 * scored a third of a run while looking complete. *The runner caught it by
 * reading the list rather than the hint.*
 */
const listed = [...runs].map(([g, n]) => {
  const row = g === '(no generation)' ? undefined : (generationDetail.get(g) as { task: string; at: string } | undefined)
  return { g, n, task: row?.task ?? '(none)', at: row?.at ?? '' }
}).sort((a, b) => a.at.localeCompare(b.at))

/** Same task, and no longer than this between consecutive calls. */
const RUN_GAP_MINUTES = 15
const blocks: { task: string; at: string; from: string; ids: string[]; objects: number }[] = []
for (const r of listed) {
  const last = blocks[blocks.length - 1]
  const gapMin = last && r.at && last.at ? (Date.parse(r.at) - Date.parse(last.at)) / 60000 : Infinity
  if (last && last.task === r.task && gapMin <= RUN_GAP_MINUTES) {
    last.ids.push(r.g); last.objects += r.n; last.at = r.at
  } else {
    blocks.push({ task: r.task, at: r.at, from: r.at, ids: [r.g], objects: r.n })
  }
}

console.log(
  `\nRuns in this import — grouped by task, split where more than ${RUN_GAP_MINUTES} minutes\n` +
    `passed between calls. ⚠ That grouping is a guess; every generation is listed so\nyou can disagree with it.`,
)
blocks.forEach((b, i) => {
  console.log(
    `\n  run ${i + 1}  ${b.from.slice(0, 19).padEnd(20)} ${b.task.padEnd(16)} ` +
      `${String(b.objects).padStart(4)} objects across ${b.ids.length} generation${b.ids.length === 1 ? '' : 's'}`,
  )
  for (const id of b.ids) console.log(`          ${id}`)
})

if (blocks.length > 1 && !wantRuns) {
  const newest = blocks[blocks.length - 1]!
  console.log(
    `\n⚑ ${blocks.length} runs are in this fixture and they are NOT separable afterwards by lane —\n` +
      `  a re-run appends, and its objects carry the same import and the same lane as the first.\n` +
      `  Scoring this mixes them into one number naming neither.\n\n` +
      `  The newest run is ${newest.objects} objects across ${newest.ids.length} generation(s). To scope to it:\n\n` +
      `    npm run proposals -- --visit ${visitId}${needle ? ` --zone ${needle}` : ''} \\\n` +
      `      --generation ${newest.ids.join(',')}\n\n` +
      `  ⚑ ALL of those ids, not just the last — one run is several calls. Nothing is deleted either way.`,
  )
}

if (kept.length === 0) {
  // Doctrine 6 — an empty fixture is a fact, said out loud rather than written
  // quietly and discovered when a score reports nothing.
  console.log(`\n⚑ No objects for this import${needle ? ` in a zone matching "${needle}"` : ''}${wantRuns ? ' in the named generation(s)' : ''}. The fixture is empty and a score of it will be too.`)
}

// ------------------------------------------------------------------- the scan

const hits = scanForPersonalData(fixture.proposals)
console.log(`\n${'─'.repeat(72)}`)
if (hits.length === 0) {
  console.log(
    `The personal-data scan found nothing.\n\n` +
      `⚑ That is NOT permission to commit this file. The scan looks for addresses,\n` +
      `  telephone numbers, postal codes, email addresses, and licence or registration\n` +
      `  numbers that name themselves. It CANNOT see a person's name, and it is\n` +
      `  deliberately blind to bare licence numbers because they are shaped exactly\n` +
      `  like the model numbers and serials a mechanical room is full of.\n\n` +
      `  Read the labels before this file goes anywhere public.`,
  )
} else {
  const byKind = new Map<string, number>()
  for (const h of hits) byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + 1)
  console.log(`⚠ The personal-data scan found ${hits.length} thing(s) to look at:\n`)
  for (const [kind, n] of [...byKind].sort()) console.log(`  ${kind.padEnd(26)}${String(n).padStart(4)}`)
  console.log(`\n  Where:`)
  for (const h of hits) console.log(`    ${h.where.padEnd(6)} ${h.kind.padEnd(26)} ${h.matched}`)
  console.log(
    `\n  ⚑ This file must not be committed as it stands. The repository is public.\n` +
      `  Redact or drop these proposals, or leave the fixture in /data.`,
  )
}
console.log(`${'─'.repeat(72)}\n`)
