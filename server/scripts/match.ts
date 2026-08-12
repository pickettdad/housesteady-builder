/**
 * Run pass 3 against a visit — `npm run match`.
 *
 *   npm run match -- --visit <id>                                # plan only, free
 *   npm run match -- --visit <id> --zone mechanical --run --owner-property
 *
 * **This is the pass that replaced enumeration as the first question**, by the
 * ruling of 2026-08-12. Run pass 1 and pass 2 first, or every zone gets the
 * enumeration question and the whole point is lost — **which the plan below says
 * out loud rather than leaving you to notice.**
 */

import { openDb } from '../src/db/index.js'
import { latestImport } from '../src/ai/tasks/identify.js'
import { ENUMERATE_TASK, MATCH_TASK, planMatch, queueMatch, questionFor } from '../src/ai/tasks/matchComplete.js'
import { assistsBlocked, drainVisit, liveDeps } from '../src/ai/worker.js'
import type { AssistDeps } from '../src/ai/tasks/index.js'
import { ModelNotConfigured, requireModel } from '../src/ai/models.js'
import { queueProgress, visitSpend } from '../src/ai/queue.js'
import { currentOperator, OperatorRefused } from '../src/operators/registry.js'

const ACKNOWLEDGEMENT = `
This run sends the photographic interior of a house to an AI service — the room,
not a data plate. The AI Processing Decision's identification addendum authorizes
that on the OWNER'S OWN PROPERTY (§B) and gates a CLIENT'S property behind a
disclosure that does not yet exist (§C).

Pass --owner-property to confirm this visit is the owner's own.
`.trim()

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const flag = (n: string): boolean => process.argv.includes(`--${n}`)

const visitId = arg('visit')
if (!visitId) {
  console.error('Usage: npx tsx server/scripts/match.ts --visit <visitId> [--zone <needle>] [--run --owner-property]')
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

const plan = planMatch(db, importId)
const batches = plan.batches.filter((b) => zoneMatches(b.zoneId))

console.log(`\nVisit ${visitId} · import ${importId} · pass 3, match and complete`)
console.log(plan.note)
console.log()

for (const b of batches) {
  const q = questionFor(b) === MATCH_TASK ? 'MATCH    ' : 'ENUMERATE'
  const of = b.of > 1 ? ` ${b.index}/${b.of}` : '    '
  console.log(
    `  ${q}  ${(zoneLabels.get(b.zoneId) ?? b.zoneId).padEnd(22)}${of}  ` +
      `${String(b.media.length).padStart(3)} detail + ${b.context.length} context, ` +
      `${b.inventory.length} known product${b.inventory.length === 1 ? '' : 's'}`,
  )
  for (const p of b.inventory.slice(0, 8)) console.log(`             ${p.product}`)
  if (b.inventory.length > 8) console.log(`             ...and ${b.inventory.length - 8} more`)
}

// ⚑ The one thing a person running this out of order needs told, and it is
// stated rather than left to be inferred from a count of zero.
if (plan.withScaffold === 0 && plan.batches.length > 0) {
  console.log(
    `\n⚑ EVERY zone would get the ENUMERATION question, because no product has been resolved for this import.\n` +
      `   That is the harder question and the one this pass exists to avoid asking. Run \`npm run read\`\n` +
      `   and then \`npm run resolve\` first unless you intend this.\n`,
  )
}

if (!flag('run')) {
  console.log('\nThis was the plan only. Add --run --owner-property to send it.\n')
  report()
  process.exit(0)
}

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

const q = queueMatch(db, visit.propertyId, visitId, actorId, needle === undefined ? undefined : zoneMatches, flag('again'))
console.log(`\nQueued ${q.jobs} calls — ${q.matching} matching, ${q.enumerating} enumerating. Draining.\n`)

const tier = arg('tier') ?? 'fast'
if (tier !== 'fast' && tier !== 'strong') { console.error(`--tier is "fast" or "strong".`); process.exit(1) }
let deps: AssistDeps | undefined
if (tier === 'strong') {
  try { deps = { ...liveDeps(), model: requireModel('strong') } } catch (e) {
    if (e instanceof ModelNotConfigured) { console.error(`\nNo strong model configured.\n`); process.exit(1) }
    throw e
  }
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
report()

/** The two lanes, printed apart — because that is the whole point of the pass. */
function report(): void {
  const rows = db
    .prepare(
      `SELECT o.zone_id AS zoneId, o.label, o.class_id AS classId, o.derived_from AS lane,
              o.parent_object_id AS parent,
              (SELECT COUNT(*) FROM object_media m WHERE m.object_id = o.id) AS photos
         FROM objects o WHERE o.import_id = ? AND o.derived_from IS NOT NULL
        ORDER BY o.zone_id, o.derived_from DESC, o.label`,
    )
    .all(importId) as {
    zoneId: string; label: string; classId: string | null; lane: string; parent: string | null; photos: number
  }[]

  if (rows.length === 0) {
    console.log(`\nNo pass-3 objects for this import yet.\n`)
    return
  }

  const plate = rows.filter((r) => r.lane === 'plate')
  const appearance = rows.filter((r) => r.lane === 'appearance')
  console.log(`\n${rows.length} objects — ${plate.length} plate-derived, ${appearance.length} appearance-derived.\n`)

  console.log(`  PLATE-DERIVED — read off a label and looked up. Close to deterministic.`)
  for (const r of plate) {
    console.log(`    ${(zoneLabels.get(r.zoneId) ?? '').padEnd(18)} ${r.label}  [${r.photos} photo${r.photos === 1 ? '' : 's'}]${r.parent ? '  (part of something)' : ''}`)
  }

  console.log(`\n  APPEARANCE-DERIVED — recognised from shape and context. Every one is a guess.`)
  for (const r of appearance) {
    console.log(`    ${(zoneLabels.get(r.zoneId) ?? '').padEnd(18)} ${(r.classId ?? '(no class fits)').padEnd(28)} ${r.label}`)
  }

  const nc = appearance.filter((r) => r.classId === null).length
  if (nc > 0) console.log(`\n  ${nc} matched no class. That is a gap in the FRAME, not a failure of the object.`)

  console.log(
    `\nThe two lanes are stored apart and must stay apart. A plate-derived class follows from a resolution;\n` +
      `an appearance-derived class is a guess, and the same field reporting both at one confidence is what\n` +
      `Amendment 11 exists to end.\n`,
  )
  console.log(`Tasks used: \`${MATCH_TASK}\` where there was a scaffold, \`${ENUMERATE_TASK}\` where there was not.\n`)
}
