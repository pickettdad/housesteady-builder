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
 *
 * ---
 *
 * ## ⚑ The residue is scored PER PASS, and it was not
 *
 * `objects` holds two passes' answers to the same question. This script read all
 * of them and handed the union to one comparison — so every object identified by
 * both passes appeared as a duplicate *of itself*, inflating the candidate groups
 * and deflating the residue. **The residue is the number that decides whether
 * stage 2 gets built**, so a blended one buys or cancels an increment on a
 * measurement of the wrong thing.
 *
 * Scoring-harness **rule 7 — a score names the lane that earned it** — is not
 * about the score alone. This is the same kind of number and now obeys the same
 * rule: each pass compared separately, each residue reported under its own
 * heading, never summed. *Found by the sweep the design session made standing on
 * 2026-08-13, after `binder.ts` turned up carrying the identical defect.*
 */

import { openDb } from '../src/db/index.js'
import { latestImport } from '../src/ai/tasks/identify.js'
import { compareProposals, proposalsForImport } from '../src/engine/compare.js'
import { laneLabel, type LaneScope } from '../src/engine/lanes.js'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const visitId = arg('visit')
if (!visitId) {
  console.error(
    'Usage: npx tsx server/scripts/compare.ts --visit <visitId> [--zone <needle>] [--pass match|identify]\n\n' +
      '--pass picks which pass to compare. Omitted, every pass that wrote objects is\n' +
      'compared separately — never together, because their union counts each object\n' +
      'identified twice as a duplicate of itself and reports a residue naming neither.',
  )
  process.exit(1)
}

/**
 * The pass vocabulary is `score.ts`'s, verbatim — `match` and `identify`.
 *
 * Two commands that name the same two passes differently is the four-numbering-
 * schemes failure in miniature, and this repo has paid for that once already.
 */
const PASSES: readonly LaneScope[] = ['match', 'identify']
const wanted = arg('pass')
if (wanted !== undefined && !PASSES.includes(wanted as LaneScope)) {
  console.error(`--pass takes ${PASSES.join(' or ')}. Got "${wanted}".`)
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

/** Compare one pass across the selected zones. Returns null if it wrote nothing. */
function comparePass(scope: LaneScope): { proposals: number; bound: number; grouped: number; residue: number } | null {
  let totals = { proposals: 0, bound: 0, same: 0, different: 0, grouped: 0, residue: 0 }
  const lines: string[] = []

  for (const zoneId of zoneIds) {
    const proposals = proposalsForImport(db, importId!, scope, zoneId)
    if (proposals.length === 0) continue
    for (const p of proposals) labels.set(p.id, p.label)

    // Bindings come from Amendment 11 pass 2, which is unbuilt. Passing none is
    // the honest call — an empty array here is "the derivation did not run",
    // which the report distinguishes from "it ran and found nothing".
    const r = compareProposals(proposals)

    lines.push(`${zoneLabels.get(zoneId) ?? zoneId}  —  ${r.proposals} proposals, ${r.bound} bound`)
    for (const c of r.candidates) {
      lines.push(`  ${c.signal.padEnd(19)} ${c.objectIds.length} objects — ${c.detail}`)
      for (const id of c.objectIds) lines.push(`      ${labels.get(id) ?? id}`)
    }
    if (r.residue.length > 0) {
      lines.push(`  ${'residue'.padEnd(19)} ${r.residue.length} objects, grouped with nothing`)
    }
    lines.push('')

    totals = {
      proposals: totals.proposals + r.proposals,
      bound: totals.bound + r.bound,
      same: totals.same + r.derivedSame.length,
      different: totals.different + r.derivedDifferent.length,
      grouped: totals.grouped + r.candidates.reduce((n, c) => n + c.objectIds.length, 0),
      residue: totals.residue + r.residue.length,
    }
  }

  if (totals.proposals === 0) return null

  // ⚑ Rule 7 — the lane comes FIRST, above the number it earned. A residue read
  // off the bottom of a report is a residue whose pass the reader has to
  // remember, and the whole defect was that nobody did.
  console.log(`━━ ${laneLabel[scope]}`)
  console.log()
  for (const l of lines) console.log(l)
  console.log('─'.repeat(72))
  console.log(`proposals        ${totals.proposals}`)
  console.log(`bound to a product  ${totals.bound}`)
  console.log(`derived same     ${totals.same}`)
  console.log(`derived different ${totals.different}`)
  console.log(`in a candidate group ${totals.grouped}`)
  console.log(`RESIDUE          ${totals.residue}   <- the number stage 2 is sized against, for THIS pass`)
  console.log('─'.repeat(72))
  console.log()
  return { proposals: totals.proposals, bound: totals.bound, grouped: totals.grouped, residue: totals.residue }
}

const ran = PASSES.filter((p) => wanted === undefined || wanted === p).map((p) => ({ scope: p, r: comparePass(p) }))
const present = ran.filter((x) => x.r !== null)

if (present.length === 0) {
  // Doctrine 6 — a run that never happened must not read as a run that found
  // nothing. `residue 0` here would be the confident-looking version of both.
  console.log(
    `No pass has written objects for this import${wanted ? ` under --pass ${wanted}` : ''}.\n\n` +
      `Nothing compared. This is not a residue of zero.\n`,
  )
} else if (present.length > 1) {
  console.log(
    `⚑ ${present.length} passes have written objects for this import, and they are compared APART.\n` +
      `  Their union is not a bigger sample of one house — it is the same house identified twice,\n` +
      `  so every object both passes found would count as a duplicate of itself. That inflates the\n` +
      `  candidate groups, deflates the residue, and sizes stage 2 against a number naming neither.\n`,
  )
}

// `every` over an empty list is true, and this message under "nothing compared"
// would explain the absence of a number that was never produced.
if (present.length > 0 && present.every((x) => x.r!.bound === 0)) {
  console.log(
    `\nNothing is bound, because Amendment 11's pass 2 does not exist yet. THIS IS THE PRE-BINDING\n` +
      `STATE, not a derivation that found nothing. Run this again once model numbers resolve to\n` +
      `products; the residue after that is what decides whether stage 2 is worth building.\n`,
  )
}
