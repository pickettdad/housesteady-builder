/**
 * Run identification against a visit's photographs — Increment 5 §3.
 *
 * ---
 *
 * ## ⚑ OFF THE ROUTINE PATH — owner ruling, 2026-08-12
 *
 * **The routine path is `npm run passes`: read, then resolve, then match.** This
 * command still works and is deliberately kept working, but it is not part of
 * it and `passes` does not call it.
 *
 * **Why it came off.** Pass 3 asks *here are the known products, what else is
 * here*, and it labels every object it writes as plate-derived or
 * appearance-derived. **This pass asks *what is in this room* and labels
 * nothing** — so every room it touches produces an unlabelled appearance-derived
 * list **alongside** a properly laned one. *Two answers to one question, which
 * is the shape this project keeps paying for.*
 *
 * **The condition for deleting it is written down rather than assumed:** once
 * pass 3 has run against a real room and been scored against the room record,
 * this file comes out — **or the reason it stayed gets written down.** Not
 * deleted today, because the scoring has not happened and a pass removed before
 * its replacement is measured is a pass removed on faith.
 *
 * **This is the command the roadmap's §4 step 1 needs**: photographs in, objects
 * out, on the owner's own house. There is no screen for it yet and it does not
 * need one — the point of the first run is to find out what the pass gets right
 * before ratifying anything as a golden set.
 *
 * ---
 *
 * ## Why identification has a script and the other assists do not
 *
 * Nameplate reading, routing and pin typing are queued automatically when an
 * import completes. **Identification is not, and that is the whole reason this
 * file exists.**
 *
 * The AI Processing Decision's identification addendum §A: *nameplate extraction
 * sends a data plate; routing sends loose room photographs; **identification
 * sends the room**.* §B authorizes that on the owner's own property. **§C gates a
 * client's property behind a disclosure sentence that does not exist yet.**
 *
 * Nothing in this database records whose house an import is of, so no code here
 * can enforce §C. **What it can do is require somebody to type the acknowledgement
 * below**, which is weaker than a constraint and much stronger than a comment —
 * and it puts the addendum's own sentence in front of the person at the moment
 * they decide.
 *
 * ---
 *
 * ## Two steps, and the plan is worth reading before paying for the calls
 *
 *   npx tsx server/scripts/identify.ts --visit <id>            # plan only, free
 *   npx tsx server/scripts/identify.ts --visit <id> --run --owner-property
 *
 * The first prints what would be sent — how many calls, how many photographs,
 * what is excluded and why. It costs nothing and needs no key. The second queues
 * the work and drains it.
 *
 * **Two different bounds, and they answer different questions.**
 *
 * - `--zone <needle>` picks **which** room, matching label or id. This is how a
 *   first run is the mechanical room — the one room whose right answer is
 *   already known, so it can be graded rather than only read.
 * - `--limit N` bounds **how many** calls are drained, in queue order. It cannot
 *   say which room, so on its own it buys a bound and not a comparison.
 */

import { openDb } from '../src/db/index.js'
import { queueIdentification, IDENTIFY_TASK } from '../src/ai/tasks/identify.js'
import { planIdentificationCalls } from '../src/engine/identify.js'
import { mediaForImport, zoneRoutes, latestImport } from '../src/ai/tasks/identify.js'
import { projectClasses, approximateTokens } from '../src/engine/projection.js'
import { readClassFrame } from '../src/engine/classFrame.js'
import { assistsBlocked, drainVisit, liveDeps } from '../src/ai/worker.js'
import type { AssistDeps } from '../src/ai/tasks/index.js'
import { requireModel, ModelNotConfigured } from '../src/ai/models.js'
import { visitSpend, queueProgress } from '../src/ai/queue.js'
import { currentOperator, OperatorRefused } from '../src/operators/registry.js'

const ACKNOWLEDGEMENT = `
This run sends the photographic interior of a house to an AI service — the room,
not a data plate. The AI Processing Decision's identification addendum authorizes
that on the OWNER'S OWN PROPERTY (§B) and gates a CLIENT'S property behind a
disclosure that does not yet exist (§C).

Nothing in this database records whose house this is. Pass --owner-property to
confirm this visit is the owner's own.
`.trim()

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`)

const visitId = arg('visit')
if (!visitId) {
  console.error('Usage: npx tsx server/scripts/identify.ts --visit <visitId> [--run --owner-property] [--limit N]')
  process.exit(1)
}

const db = openDb()

const visit = db
  .prepare('SELECT id, property_id AS propertyId, kind FROM visits WHERE id = ?')
  .get(visitId) as { id: string; propertyId: string; kind: string } | undefined
if (!visit) {
  console.error(`No visit ${visitId}. Visits on this machine:`)
  for (const v of db.prepare('SELECT id, kind, created_at FROM visits ORDER BY created_at DESC LIMIT 20').all() as {
    id: string
    kind: string
    created_at: string
  }[]) {
    console.error(`  ${v.id}  ${v.kind}  ${v.created_at}`)
  }
  process.exit(1)
}

const importId = latestImport(db, visitId)
if (!importId) {
  console.error(`Visit ${visitId} has no import, so there are no photographs to look at.`)
  process.exit(1)
}

// ------------------------------------------------------------------- the plan

const media = mediaForImport(db, importId)
const wholePlan = planIdentificationCalls(media, zoneRoutes(db, importId))
const frame = readClassFrame()
const projection = projectClasses(frame)

const zoneLabels = new Map(
  (
    db.prepare('SELECT zone_id AS zoneId, label, type FROM zones WHERE import_id = ?').all(importId) as {
      zoneId: string
      label: string | null
      type: string | null
    }[]
  ).map((z) => [z.zoneId, z.label ?? z.type ?? z.zoneId]),
)

/**
 * `--zone <needle>` — one room rather than a house.
 *
 * Matches the zone's label or its id, case-insensitively, as a substring. The
 * same predicate filters the plan and the run, so what is printed is what is
 * sent. Two variables holding one intention is how a plan and a run come to
 * disagree.
 */
const zoneNeedle = arg('zone')?.toLowerCase()
const zoneMatches = (zoneId: string): boolean =>
  zoneNeedle === undefined ||
  zoneId.toLowerCase().includes(zoneNeedle) ||
  (zoneLabels.get(zoneId) ?? '').toLowerCase().includes(zoneNeedle)

const plan = { ...wholePlan, batches: wholePlan.batches.filter((b) => zoneMatches(b.zoneId)) }

if (zoneNeedle !== undefined && plan.batches.length === 0) {
  console.error(`\nNo zone matches "${arg('zone')}". Zones in this import:`)
  for (const zoneId of new Set(wholePlan.batches.map((b) => b.zoneId))) {
    console.error(`  ${zoneLabels.get(zoneId) ?? '(no label)'}   ${zoneId}`)
  }
  process.exit(1)
}

const onDisk = new Map(media.map((m) => [m.mediaId, m.fileStatus]))
const present = (id: string): boolean => onDisk.get(id) === 'present'

console.log(`\nVisit ${visitId} · import ${importId}`)
console.log(plan.note)
if (zoneNeedle !== undefined) {
  console.log(
    `Filtered to "${arg('zone')}" — ${plan.batches.length} of ${wholePlan.batches.length} calls. ` +
      `The note above describes the whole export.`,
  )
}
console.log(
  `Class frame v${projection.frameVersion}: ${projection.classCount} classes, ` +
    `≈${approximateTokens(projection.text).toLocaleString()} tokens as a projection.\n`,
)

// Per row: what THIS call would carry, so a canvas riding three batches shows on
// all three. In the totals: DISTINCT photographs, because 12 canvas frames on 11
// calls is 23 sends and not 23 pictures. Merging the two counts is how a plan
// reads like a bigger house than it is.
const sendable = new Set<string>()
const missing = new Set<string>()
for (const b of plan.batches) {
  const here = b.media.filter((m) => present(m.mediaId))
  const ctx = b.context.filter((m) => present(m.mediaId))
  const gone = [...b.media, ...b.context].filter((m) => !present(m.mediaId))
  for (const m of [...here, ...ctx]) sendable.add(m.mediaId)
  for (const m of gone) missing.add(m.mediaId)
  const name = (zoneLabels.get(b.zoneId) ?? b.zoneId).padEnd(22)
  const of = b.of > 1 ? ` ${b.index}/${b.of}` : '    '
  console.log(
    `  ${name}${of}  ${String(here.length).padStart(3)} detail + ${ctx.length} context` +
      (gone.length > 0 ? `   (${gone.length} not on this machine)` : ''),
  )
}

if (plan.excluded.length > 0) {
  const byKind = new Map<string, number>()
  for (const e of plan.excluded) byKind.set(e.kind ?? '(no kind)', (byKind.get(e.kind ?? '(no kind)') ?? 0) + 1)
  console.log(`\n  Excluded by kind: ${[...byKind].map(([k, n]) => `${n} ${k}`).join(', ')}`)
}
for (const u of plan.unresolved) console.log(`  Unresolved: ${u.mediaId} — ${u.why}`)

console.log(`\n${sendable.size} distinct photographs would be sent across ${plan.batches.length} calls.`)
if (missing.size > 0) {
  console.log(
    `${missing.size} are recorded and not on this machine. ` +
      (sendable.size === 0
        ? 'This is a manifest-only import — the rows are here and the bytes are not, so every call would skip with a reason.'
        : 'Those photographs are simply not sent; the rooms they belong to still run.'),
  )
}

if (!flag('run')) {
  console.log('\nThis was the plan only. Add --run --owner-property to send it.\n')
  process.exit(0)
}

// -------------------------------------------------------------------- the run

if (!flag('owner-property')) {
  console.error(`\n${ACKNOWLEDGEMENT}\n`)
  process.exit(1)
}

const blocked = assistsBlocked()
if (blocked) {
  console.error(`\n${blocked}\n`)
  process.exit(1)
}

/**
 * Who is running this — resolved through the registry, never taken raw.
 *
 * **`ai_jobs.actor_id` is a foreign key to `operators(id)`.** This line used to
 * pass `process.env.HOUSESTEADY_OPERATOR` straight in, which is a short code or
 * a display name — never an id — so the insert died with
 * `SQLITE_CONSTRAINT_FOREIGNKEY` and **`--run` could not work for anybody.** The
 * fallback string `'unknown-operator'` was worse: it can never be a valid id, so
 * the unconfigured path was equally dead.
 *
 * *Found on the first real run, 2026-08-09. 984 tests green, typecheck clean,
 * the plan step perfect — and the primary entry point could not insert a job.
 * Nothing that did not spend money could have caught it.*
 */
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

/**
 * `--again` — run batches that are already done, a second time.
 *
 * **This is the fast-then-strong comparison, and it only works in one database.**
 * `ai_generations` was built to hold two passes over one room; the container
 * these runs happen in is ephemeral, so two sessions cannot share a ledger.
 * Without this, a second `--tier strong` on the same zone queues nothing, drains
 * nothing, and reports success.
 *
 * **Requires `--zone`.** `--again` across a whole visit would silently re-pay for
 * every room, and the one use for it is comparing a single room.
 */
const again = flag('again')
if (again && zoneNeedle === undefined) {
  console.error(
    `\n--again re-runs batches that already completed, which costs money again.\n` +
      `It requires --zone, because the reason to use it is comparing one room across two tiers.\n`,
  )
  process.exit(1)
}

const q = queueIdentification(
  db,
  visit.propertyId,
  visitId,
  actorId,
  zoneNeedle === undefined ? undefined : zoneMatches,
  again,
)
if (again) {
  console.log(
    `--again: ${q.jobs} batch(es) re-queued. Their first-pass generations and objects are kept — ` +
      `every object records the generation that proposed it, so the two passes stay distinguishable.`,
  )
}
console.log(`\nQueued ${q.jobs} calls over ${q.zones} zones. Draining.\n`)

/**
 * `--tier strong` — run identification on the strong model instead of the fast one.
 *
 * **This exists so a comparison run does not have to lie about which tier it is.**
 * The alternative is pointing `HOUSESTEADY_MODEL_FAST` at a strong model, which
 * works and then records the wrong thing: every row in `ai_generations` would say
 * fast tier, and *"why did the mechanical room read better in August"* would be
 * unanswerable from the ledger — which is the one question the ledger exists for.
 *
 * **Not a change to the tiering doctrine.** Extraction and classification belong
 * on the cheap tier in production. This is the escape hatch for a measurement,
 * and a measurement wants its own model id recorded against it.
 */
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
      console.error(`\nNo strong model is configured. Set HOUSESTEADY_MODEL_STRONG, or drop --tier strong.\n`)
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
// An unmeasured cost and a zero cost are different facts. Printing $0.00 where
// no rates are configured would be the confident-looking version of "no idea".
console.log(
  spend.ratesKnown
    ? `Spend on this visit: $${spend.dollars.toFixed(2)} across ${spend.generations} calls.`
    : `${spend.generations} calls, ${spend.inputTokens.toLocaleString()} input tokens. ` +
      `No rates are configured, so the cost is unknown rather than zero — set HOUSESTEADY_FAST_INPUT_PER_MTOK.`,
)

const progress = queueProgress(db, visitId)
console.log(`Queue: ${JSON.stringify(progress)}`)

// ------------------------------------------------------------ what came out

/**
 * ⚑ **This pass's own objects — `derived_from IS NULL`.**
 *
 * The listing was unscoped, so a run of the retired pass printed *its own
 * proposals plus every one Amendment 11's pass 3 had already written*, under the
 * heading "N objects proposed". **The most misleading place of all for the blend
 * to land:** this is the report a person reads immediately after a run, to judge
 * whether the run was any good. Pass 3's work would have been read as this
 * pass's output and inflated the very comparison stage 4 was retired over.
 *
 * Same defect as `binder.ts` carried, in the mirror — that one counted pass 3
 * and swallowed this pass; this one counted this pass and swallowed pass 3.
 * Pass 3's objects are reported below rather than dropped.
 */
const objects = db
  .prepare(
    `SELECT o.zone_id AS zoneId, o.class_id AS classId, o.label,
            (SELECT COUNT(*) FROM object_media om WHERE om.object_id = o.id) AS evidence
       FROM objects o WHERE o.import_id = ? AND o.derived_from IS NULL ORDER BY o.zone_id, o.label`,
  )
  .all(importId) as { zoneId: string; classId: string | null; label: string; evidence: number }[]

console.log(`\n${objects.length} objects proposed. None is confirmed — that is the next act, and it is a human's.\n`)
let zone = ''
for (const o of objects) {
  if (o.zoneId !== zone) {
    zone = o.zoneId
    console.log(`  ${zoneLabels.get(zone) ?? zone}`)
  }
  console.log(
    `    ${(o.classId ?? '(no class in the frame fits)').padEnd(34)} ${o.label}  [${o.evidence} photo${o.evidence === 1 ? '' : 's'}]`,
  )
}

const unclassed = objects.filter((o) => o.classId === null).length
if (unclassed > 0) {
  console.log(
    `\n${unclassed} of them matched no class. That is a gap in the FRAME, not a failure of the object — ` +
      `it is what the review queue is for.`,
  )
}

// ⚑ Doctrine 6 — what the listing above deliberately left out.
const fromPass3 = (
  db
    .prepare(`SELECT COUNT(*) AS n FROM objects WHERE import_id = ? AND derived_from IS NOT NULL`)
    .get(importId) as { n: number }
).n
if (fromPass3 > 0) {
  console.log(
    `\n⚑ ${fromPass3} object(s) in this import came from Amendment 11's pass 3 and are NOT listed above.\n` +
      `  This listing is the identification pass's own output. Both passes answer the same question,\n` +
      `  so showing them together would read as one run finding twice as much — and this is exactly\n` +
      `  the report someone judges a run by. Nothing is deleted; they are excluded and said out loud.`,
  )
}
console.log(`\nRun \`${IDENTIFY_TASK}\` again after a prompt change and compare, before ratifying anything.\n`)
