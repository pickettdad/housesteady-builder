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
    'Usage: npm run proposals -- --visit <visitId> [--zone <needle>] [--out <path>] [--note "..."]\n\n' +
      'Writes the proposals the scoring harness reads, so scoring never needs the\n' +
      'photographs, the API key or this database again.',
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
  proposalsForImport(db, importId, z.zoneId).map((p) => ({
    id: p.id,
    label: p.label,
    classId: p.classId,
    mediaIds: p.mediaIds,
    lane: p.derivedFrom,
    models: [...new Set(p.mediaIds.flatMap((id) => platedModels.get(id) ?? []))],
  })),
)

const fixture = buildFixture(
  {
    visitId,
    importId,
    zone: needle ?? null,
    producedAt: new Date().toISOString(),
    ...(arg('note') ? { note: arg('note')! } : {}),
  },
  proposals,
)

const out = arg('out') ?? join(dataRoot, 'proposals', `${visitId}${needle ? `-${needle}` : ''}.json`)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')

const split = splitByPass(proposals)
console.log(`\nWrote ${out}`)
console.log(`${proposals.length} proposals — ${split.match.length} from pass 3, ${split.identify.length} from the identification pass.`)
if (proposals.length === 0) {
  // Doctrine 6 — an empty fixture is a fact, said out loud rather than written
  // quietly and discovered when a score reports nothing.
  console.log(`\n⚑ No objects for this import${needle ? ` in a zone matching "${needle}"` : ''}. The fixture is empty and a score of it will be too.`)
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
