/**
 * Stage 1 of the comparison pass, as a report — `npm run compare -- --visit <id>`.
 *
 * **Free. No model call, no key needed, nothing sent anywhere.** It reads
 * proposals already in the database and reports what can be settled without
 * asking anything, and what is left.
 *
 * ---
 *
 * **The number this exists to produce is the residue.** Amendment 11 §B argues
 * that a known inventory dissolves most duplication — three batches each finding
 * the same Burcam become three sightings of one known product rather than three
 * proposals needing comparison. **Stage 2 is only for what does not bind**, and
 * nobody knows how big that is.
 *
 * Run against the mechanical room's eight duplicate classes, five are expected
 * to dissolve at binding and three to remain: `sediment-filter`,
 * `appliance-water-connector`, `security-panel`. **None of the three is an
 * identity problem** — one is a consumable in the object channel, one is a
 * connective, one is a class error. If that holds, stage 2 is for unplated
 * objects and stage 3 may not need building at all.
 *
 * ⚠ **Bindings are unbuilt**, so today this reports the pre-binding state and
 * says so. Run it again after Amendment 11's pass 2 exists; the same command
 * produces the number that decides the increment.
 */

import { openDb } from '../src/db/index.js'
import { latestImport } from '../src/ai/tasks/identify.js'
import { compareProposals, proposalsForImport } from '../src/engine/compare.js'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const visitId = arg('visit')
if (!visitId) {
  console.error('Usage: npx tsx server/scripts/compare.ts --visit <visitId> [--zone <needle>]')
  process.exit(1)
}

const db = openDb()
const importId = latestImport(db, visitId)
if (!importId) {
  console.error(`Visit ${visitId} has no import.`)
  process.exit(1)
}

const zoneLabels = new Map(
  (
    db.prepare('SELECT zone_id AS zoneId, label, type FROM zones WHERE import_id = ?').all(importId) as {
      zoneId: string
      label: string | null
      type: string | null
    }[]
  ).map((z) => [z.zoneId, z.label ?? z.type ?? z.zoneId]),
)

const needle = arg('zone')?.toLowerCase()
const zoneIds = [...zoneLabels.keys()].filter(
  (id) =>
    needle === undefined ||
    id.toLowerCase().includes(needle) ||
    (zoneLabels.get(id) ?? '').toLowerCase().includes(needle),
)
if (zoneIds.length === 0) {
  console.error(`No zone matches "${arg('zone')}".`)
  process.exit(1)
}

console.log(`\nComparison stage 1 — visit ${visitId}, import ${importId}. Free; nothing is sent.\n`)

const labels = new Map<string, string>()
let totals = { proposals: 0, bound: 0, same: 0, different: 0, grouped: 0, residue: 0 }

for (const zoneId of zoneIds) {
  const proposals = proposalsForImport(db, importId, zoneId)
  if (proposals.length === 0) continue
  for (const p of proposals) labels.set(p.id, p.label)

  // Bindings come from Amendment 11 pass 2, which is unbuilt. Passing none is
  // the honest call — an empty array here is "the derivation did not run",
  // which the report distinguishes from "it ran and found nothing".
  const r = compareProposals(proposals)

  console.log(`${zoneLabels.get(zoneId) ?? zoneId}  —  ${r.proposals} proposals, ${r.bound} bound`)
  for (const c of r.candidates) {
    console.log(`  ${c.signal.padEnd(19)} ${c.objectIds.length} objects — ${c.detail}`)
    for (const id of c.objectIds) console.log(`      ${labels.get(id) ?? id}`)
  }
  if (r.residue.length > 0) {
    console.log(`  ${'residue'.padEnd(19)} ${r.residue.length} objects, grouped with nothing`)
  }
  console.log()

  totals = {
    proposals: totals.proposals + r.proposals,
    bound: totals.bound + r.bound,
    same: totals.same + r.derivedSame.length,
    different: totals.different + r.derivedDifferent.length,
    grouped: totals.grouped + r.candidates.reduce((n, c) => n + c.objectIds.length, 0),
    residue: totals.residue + r.residue.length,
  }
}

console.log('─'.repeat(72))
console.log(`proposals        ${totals.proposals}`)
console.log(`bound to a product  ${totals.bound}`)
console.log(`derived same     ${totals.same}`)
console.log(`derived different ${totals.different}`)
console.log(`in a candidate group ${totals.grouped}`)
console.log(`RESIDUE          ${totals.residue}   <- the number stage 2 is sized against`)
console.log('─'.repeat(72))

if (totals.bound === 0) {
  console.log(
    `\nNothing is bound, because Amendment 11's pass 2 does not exist yet. THIS IS THE PRE-BINDING\n` +
      `STATE, not a derivation that found nothing. Run this again once model numbers resolve to\n` +
      `products; the residue after that is what decides whether stage 2 is worth building.\n`,
  )
}
