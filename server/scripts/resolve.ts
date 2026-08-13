/**
 * Run pass 2 against a visit's readings — `npm run resolve`.
 *
 *   npm run resolve -- --visit <id>          # plan only, free
 *   npm run resolve -- --visit <id> --run
 *
 * ---
 *
 * ## No `--owner-property`, and the absence is deliberate
 *
 * Every other pass in this system asks for that flag because it sends
 * photographs of the inside of a house. **This one sends no images at all** —
 * only strings read off labels — so the identification addendum's gate does not
 * reach it, and adding a flag that guards nothing would teach people the flag
 * means nothing.
 *
 * *What it does send is a house's model numbers, which is not nothing. It is the
 * same class of data a nameplate extraction already sends and is covered by the
 * same decision.*
 *
 * ## It is the cheapest pass and the most valuable one
 *
 * Seven of the eight confident wrong classes measured on the owner's mechanical
 * room die here. **The whole room is one call carrying no images.**
 */

import { openDb } from '../src/db/index.js'
import { latestImport } from '../src/ai/tasks/identify.js'
import { knownInventory, planResolution, queueResolution, RESOLVE_TASK } from '../src/ai/tasks/resolveProduct.js'
import { assistsBlocked, drainVisit, liveDeps } from '../src/ai/worker.js'
import type { AssistDeps } from '../src/ai/tasks/index.js'
import { ModelNotConfigured, requireModel } from '../src/ai/models.js'
import { queueProgress, visitSpend } from '../src/ai/queue.js'
import { currentOperator, OperatorRefused } from '../src/operators/registry.js'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`)

const visitId = arg('visit')
if (!visitId) {
  console.error('Usage: npx tsx server/scripts/resolve.ts --visit <visitId> [--run] [--tier strong] [--limit N]')
  process.exit(1)
}

const db = openDb()
const visit = db
  .prepare('SELECT id, property_id AS propertyId FROM visits WHERE id = ?')
  .get(visitId) as { id: string; propertyId: string } | undefined
if (!visit) {
  console.error(`No visit ${visitId}.`)
  process.exit(1)
}

const found = latestImport(db, visitId)
if (!found) {
  console.error(`Visit ${visitId} has no import.`)
  process.exit(1)
}
const importId: string = found

const plan = planResolution(db, importId)

console.log(`\nVisit ${visitId} · import ${importId} · pass 2, resolve`)
console.log(plan.note)
console.log(`\n${plan.batches.length} call(s), no images. This pass sends text only.\n`)

for (const q of plan.batches.flat().slice(0, 30)) {
  console.log(`  ${q.specificity.padEnd(7)} ${q.text.slice(0, 90)}`)
}
if (plan.asked > 30) console.log(`  ...and ${plan.asked - 30} more`)

if (plan.skipped.length > 0) {
  console.log(
    `\n${plan.skipped.length} label(s) carry nothing that identifies a product. Not sent, because the answer ` +
      `is certain — and that is a capture finding: there is a label there and nothing on it names a thing.`,
  )
  for (const q of plan.skipped.slice(0, 8)) console.log(`  ${q.mediaId}  (${q.surface})`)
}

if (!flag('run')) {
  console.log('\nThis was the plan only. Add --run to send it.\n')
  // Nothing ran by construction, and the table has to say so.
  report(0, 0)
  process.exit(0)
}

const blocked = assistsBlocked()
if (blocked) {
  console.error(`\n${blocked}\n`)
  process.exit(1)
}

let actorId: string
try {
  actorId = currentOperator(db).id
} catch (e) {
  if (e instanceof OperatorRefused) {
    console.error(`\n${e.message}\n`)
    process.exit(1)
  }
  throw e
}

const q = queueResolution(db, visit.propertyId, visitId, actorId, flag('again'))
console.log(`\nQueued ${q.jobs} call(s) over ${q.queries} queries. Draining.\n`)

const tier = arg('tier') ?? 'fast'
if (tier !== 'fast' && tier !== 'strong') {
  console.error(`--tier is "fast" or "strong". Got: ${tier}`)
  process.exit(1)
}

let deps: AssistDeps | undefined
if (tier === 'strong') {
  try {
    deps = { ...liveDeps(), model: requireModel('strong') }
  } catch (e) {
    if (e instanceof ModelNotConfigured) {
      console.error(`\nNo strong model is configured.\n`)
      process.exit(1)
    }
    throw e
  }
  console.log(`Running on the STRONG tier: ${deps.model!.id}\n`)
}

const limit = arg('limit') ? Number(arg('limit')) : undefined
const result = await drainVisit(db, visitId, { ...(limit ? { limit } : {}), ...(deps ? { deps } : {}) })
console.log(`\n${result.reason}`)
console.log(`Ran ${result.ran}, failed ${result.failed}, stopped: ${result.stopped}.`)

const spend = visitSpend(db, visitId, tier)
console.log(
  spend.ratesKnown
    ? `Spend on this visit: $${spend.dollars.toFixed(2)} across ${spend.generations} calls.`
    : `${spend.generations} calls, ${spend.inputTokens.toLocaleString()} input tokens. No rates configured.`,
)
console.log(`Queue: ${JSON.stringify(queueProgress(db, visitId))}`)

report(result.ran, result.failed)

/**
 * The known inventory — what passes 1 and 2 together produced.
 *
 * ⚑ **Stored state, NOT this run's outcome, and it says so when they differ.**
 * On 2026-08-13 a runner watched this print a healthy-looking *21 products from
 * 35 labels asked* while **both of its jobs were failing 401** — the table was
 * the previous run's, read back verbatim. *A report that cannot tell "ran and
 * found this" from "did not run" is the silent-score failure wearing a table.*
 */
function report(ran: number, failed: number): void {
  const rows = db
    .prepare(
      `SELECT resolved, product, kind, specificity, recognised_from AS why, query
         FROM product_resolutions WHERE import_id = ? ORDER BY resolved DESC, kind, product`,
    )
    .all(importId) as {
    resolved: number
    product: string
    kind: string
    specificity: string
    why: string
    query: string
  }[]

  if (rows.length === 0) {
    console.log(`\nNothing resolved for this import yet. Pass 2 has not run against it.\n`)
    return
  }

  if (ran === 0) {
    console.log(
      `\n⚠ NOTHING RAN THIS TIME${failed > 0 ? ` and ${failed} job(s) failed` : ''}. Everything below is what was ` +
        `already stored\n  from an EARLIER run — read it as history, not as the outcome of this command.\n` +
        `  ⚑ If you were expecting new resolutions, the number below will not have moved.`,
    )
  } else if (failed > 0) {
    console.log(`\n⚠ ${failed} job(s) failed this run. The table below is complete storage, so it includes work those jobs did not do.`)
  }

  const yes = rows.filter((r) => r.resolved === 1)
  const no = rows.filter((r) => r.resolved === 0)
  console.log(`\nTHE KNOWN INVENTORY — ${yes.length} products, from ${rows.length} labels asked.\n`)

  const byKind = new Map<string, typeof yes>()
  for (const r of yes) {
    const list = byKind.get(r.kind)
    if (list) list.push(r)
    else byKind.set(r.kind, [r])
  }
  for (const [kind, list] of [...byKind].sort()) {
    console.log(`  ${kind} (${list.length})`)
    for (const r of list) console.log(`    ${r.specificity.padEnd(7)} ${r.product}`)
  }

  const consumables = yes.filter((r) => r.kind === 'consumable').length
  if (consumables > 0) {
    console.log(
      `\n${consumables} resolved to a CONSUMABLE. Those must not reach the object channel — a cartridge with ` +
        `a maintenance rhythm attached is how a binder comes to list filter media as equipment.`,
    )
  }

  if (no.length > 0) {
    console.log(`\n${no.length} unresolved. That is an expected outcome, kept as a row rather than deleted:`)
    for (const r of no.slice(0, 10)) console.log(`  ${r.query.slice(0, 80)}`)
  }

  console.log(
    `\nEvery row is labelled \`Inferred\` and none says Documented. This build has no search, so a resolution\n` +
      `here is a model recognising text rather than reading a manufacturer's page. \`Documented\` arrives with\n` +
      `search and a source URL, in the same change, or not at all.\n`,
  )
  console.log(`${knownInventory(db, importId).length} products are ready for pass 3 (\`${RESOLVE_TASK}\` done).\n`)
}
