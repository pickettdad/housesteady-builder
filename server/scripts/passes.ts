/**
 * The routine path — `npm run passes`.
 *
 *   npm run passes -- --visit <id>                                  # plan only, free
 *   npm run passes -- --visit <id> --zone mechanical --run --owner-property
 *
 * **Read, then resolve, then match. In that order, every time.**
 *
 * ---
 *
 * ## Why this exists, and why it is not the enforcement
 *
 * ⚑ **The enforcement is in pass 3.** `queueMatch` refuses to enqueue a zone
 * whose pass-1 read has not settled, and `runMatchComplete` refuses to run one —
 * so typing `npm run match` on a fresh import cannot produce an unscaffolded
 * answer that looks like a scaffolded one.
 *
 * **This command is the convenience, not the wall.** *A gate that only holds
 * when somebody uses the combined command is a gate somebody routes around by
 * typing the individual one*, which is the difference between a rule being
 * enforced and being remembered.
 *
 * ## What is deliberately NOT in here
 *
 * **`identify_objects` — stage 4.** It is off the routine path by the ruling of
 * 2026-08-12 and its code stays runnable at `npm run identify`. ⚑ **Every room
 * it touches produces an unlabelled appearance-derived list alongside a properly
 * laned one — two answers to one question**, which is the shape this project
 * keeps paying for. *It comes out, or its reason for staying gets written down,
 * once pass 3 has run against a real room and been scored.*
 */

import { openDb } from '../src/db/index.js'
import { latestImport } from '../src/ai/tasks/identify.js'
import { planSurfaceReads, queueSurfaceReading, readState } from '../src/ai/tasks/readSurfaces.js'
import { planResolution, queueResolution } from '../src/ai/tasks/resolveProduct.js'
import { planMatch, queueMatch, questionFor, MATCH_TASK } from '../src/ai/tasks/matchComplete.js'
import { assistsBlocked, drainVisit, liveDeps } from '../src/ai/worker.js'
import type { AssistDeps } from '../src/ai/tasks/index.js'
import { ModelNotConfigured, requireModel } from '../src/ai/models.js'
import { queueProgress, visitSpend } from '../src/ai/queue.js'
import { currentOperator, OperatorRefused } from '../src/operators/registry.js'

const ACKNOWLEDGEMENT = `
This runs three passes and two of them send photographs from the inside of a
house to an AI service. The AI Processing Decision's identification addendum
authorizes that on the OWNER'S OWN PROPERTY (§B) and gates a CLIENT'S property
behind a disclosure that does not yet exist (§C).

Pass --owner-property to confirm this visit is the owner's own.
`.trim()

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const flag = (n: string): boolean => process.argv.includes(`--${n}`)

const visitId = arg('visit')
if (!visitId) {
  console.error('Usage: npx tsx server/scripts/passes.ts --visit <visitId> [--zone <needle>] [--run --owner-property] [--tier strong]')
  process.exit(1)
}

const db = openDb()
const visit = db.prepare('SELECT id, property_id AS propertyId FROM visits WHERE id = ?').get(visitId) as
  | { id: string; propertyId: string }
  | undefined
if (!visit) { console.error(`No visit ${visitId}.`); process.exit(1) }

const found = latestImport(db, visitId)
if (!found) { console.error(`Visit ${visitId} has no import.`); process.exit(1) }
const importId: string = found

const zoneLabels = new Map(
  (
    db.prepare('SELECT zone_id AS zoneId, label, type FROM zones WHERE import_id = ?').all(importId) as {
      zoneId: string; label: string | null; type: string | null
    }[]
  ).map((z) => [z.zoneId, z.label ?? z.type ?? z.zoneId]),
)

const needle = arg('zone')?.toLowerCase()
const zoneMatches = (id: string): boolean =>
  needle === undefined || id.toLowerCase().includes(needle) || (zoneLabels.get(id) ?? '').toLowerCase().includes(needle)
const only = needle === undefined ? undefined : zoneMatches

// ------------------------------------------------------------------- the plan

const read = planSurfaceReads(db, importId)
const resolve = planResolution(db, importId)
const match = planMatch(db, importId)

console.log(`\nVisit ${visitId} · import ${importId}\n`)
console.log(`  1 · READ     ${read.batches.filter((b) => zoneMatches(b.zoneId)).length} calls — ${read.note}`)
console.log(`  2 · RESOLVE  ${resolve.batches.length} calls — ${resolve.note}`)
console.log(`  3 · MATCH    ${match.batches.filter((b) => zoneMatches(b.zoneId)).length} calls — ${match.note}`)

console.log(`\nPer zone, as things stand right now:`)
for (const b of match.batches.filter((b) => zoneMatches(b.zoneId))) {
  const s = readState(db, importId, visitId, b.zoneId)
  const q = questionFor(b) === MATCH_TASK ? 'match' : 'enumerate'
  console.log(
    `  ${(zoneLabels.get(b.zoneId) ?? b.zoneId).padEnd(22)} read ${s.settled}/${s.planned}` +
      `   ${b.inventory.length} known   would ${q}`,
  )
}

console.log(
  `\nThose figures are BEFORE this run. The three passes run in order, so a zone with 0 known products\n` +
    `here may well have some by the time pass 3 reaches it — which is the whole reason for the ordering.\n`,
)

if (!flag('run')) {
  console.log('This was the plan only. Add --run --owner-property to send it.\n')
  process.exit(0)
}

// -------------------------------------------------------------------- the run

if (!flag('owner-property')) { console.error(`\n${ACKNOWLEDGEMENT}\n`); process.exit(1) }
const blocked = assistsBlocked()
if (blocked) { console.error(`\n${blocked}\n`); process.exit(1) }

let actorId: string
try {
  actorId = currentOperator(db).id
} catch (e) {
  if (e instanceof OperatorRefused) { console.error(`\n${e.message}\n`); process.exit(1) }
  throw e
}

const tier = arg('tier') ?? 'fast'
if (tier !== 'fast' && tier !== 'strong') { console.error(`--tier is "fast" or "strong".`); process.exit(1) }
let deps: AssistDeps | undefined
if (tier === 'strong') {
  try { deps = { ...liveDeps(), model: requireModel('strong') } } catch (e) {
    if (e instanceof ModelNotConfigured) { console.error(`\nNo strong model configured.\n`); process.exit(1) }
    throw e
  }
  console.log(`Running on the STRONG tier: ${deps.model!.id}\n`)
}

const drain = async (label: string): Promise<void> => {
  const r = await drainVisit(db, visitId, { ...(deps ? { deps } : {}) })
  console.log(`  ${label}: ran ${r.ran}, failed ${r.failed}${r.stopped ? `, stopped: ${r.stopped}` : ''}`)
  // ⚑ A failed pass is not a reason to stop the run, and it IS a reason the
  // next pass may refuse a zone. The gate handles that; this only says so.
  if (r.failed > 0) {
    console.log(`     ${r.failed} call(s) failed. Zones they covered will be refused by the next pass rather than run blind.`)
  }
}

console.log(`\n─── 1 · READ ${'─'.repeat(50)}`)
const q1 = queueSurfaceReading(db, visit.propertyId, visitId, actorId, only)
console.log(`  queued ${q1.jobs} calls, ${q1.photographs} photographs`)
await drain('read')

console.log(`\n─── 2 · RESOLVE ${'─'.repeat(47)}`)
// Re-planned after pass 1 drained, because its input is what pass 1 just wrote.
const q2 = queueResolution(db, visit.propertyId, visitId, actorId)
console.log(`  queued ${q2.jobs} calls over ${q2.queries} queries, ${q2.skipped} labels with nothing to resolve`)
await drain('resolve')

console.log(`\n─── 3 · MATCH ${'─'.repeat(49)}`)
const q3 = queueMatch(db, visit.propertyId, visitId, actorId, only)
console.log(`  queued ${q3.jobs} calls — ${q3.matching} matching, ${q3.enumerating} enumerating`)
if (q3.blocked.length > 0) {
  // Named, never silently dropped. A zone refused here is a zone whose read did
  // not settle, and that is a finding about this run rather than about the room.
  console.log(`  ⚑ ${q3.blocked.length} zone(s) REFUSED by the gate:`)
  for (const b of q3.blocked) console.log(`      ${zoneLabels.get(b.zoneId) ?? b.zoneId} — ${b.why}`)
}
await drain('match')

// ------------------------------------------------------------------ the result

const spend = visitSpend(db, visitId, tier)
console.log(
  `\n${
    spend.ratesKnown
      ? `Spend on this visit: $${spend.dollars.toFixed(2)} across ${spend.generations} calls.`
      : `${spend.generations} calls, ${spend.inputTokens.toLocaleString()} input tokens. No rates configured.`
  }`,
)
console.log(`Queue: ${JSON.stringify(queueProgress(db, visitId))}`)

const lanes = db
  .prepare(
    `SELECT derived_from AS lane, COUNT(*) AS n FROM objects
      WHERE import_id = ? AND derived_from IS NOT NULL GROUP BY derived_from`,
  )
  .all(importId) as { lane: string; n: number }[]
const products = db
  .prepare('SELECT COUNT(*) AS n FROM product_resolutions WHERE import_id = ? AND resolved = 1')
  .get(importId) as { n: number }
const labels = db.prepare('SELECT COUNT(*) AS n FROM readings WHERE import_id = ?').get(importId) as { n: number }

console.log(`\n${labels.n} labels read · ${products.n} products resolved · ${lanes.map((l) => `${l.n} ${l.lane}-derived`).join(', ') || 'no objects'}`)
console.log(
  `\nThe two lanes are stored apart. A plate-derived class follows from a resolution; an appearance-derived\n` +
    `class is a guess. \`npm run identify\` is off this path by ruling — it produces a third, unlabelled list.\n`,
)
