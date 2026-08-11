/**
 * Run pass 1 against a visit's photographs — `npm run read`.
 *
 *   npm run read -- --visit <id>                                # plan only, free
 *   npm run read -- --visit <id> --zone mechanical --run --owner-property
 *
 * The first prints what would be sent and costs nothing. The second queues the
 * calls and drains them.
 *
 * ---
 *
 * ## Why this is a script and not part of the import
 *
 * **Same reason identification is.** The AI Processing Decision's identification
 * addendum §B authorizes sending the photographic interior of a house **on the
 * owner's own property**; §C gates a client's property behind a disclosure that
 * does not exist yet, and nothing in this database records whose house an import
 * is of.
 *
 * Pass 1's send is narrower than identification's — detail photographs only, no
 * canvas, no wide room shot — **but the gate is about whose house it is, not how
 * wide the frame is.** A run that sends the inside of somebody's basement is
 * something a person starts.
 *
 * ## What comes out is not a name
 *
 * Pass 1 produces text and surfaces. **Nothing here is an object, a class or an
 * identification**, and the report below deliberately reads as a list of labels
 * rather than a list of things — because that is what was found.
 */

import { openDb } from '../src/db/index.js'
import { latestImport, mediaForImport } from '../src/ai/tasks/identify.js'
import {
  claimsForImport, planSurfaceReads, queueSurfaceReading, READ_TASK,
} from '../src/ai/tasks/readSurfaces.js'
import { adjudicateManufacturer, plateModels, statesNotApplicable } from '../src/engine/surfaces.js'
import { assistsBlocked, drainVisit, liveDeps } from '../src/ai/worker.js'
import type { AssistDeps } from '../src/ai/tasks/index.js'
import { ModelNotConfigured, requireModel } from '../src/ai/models.js'
import { queueProgress, visitSpend } from '../src/ai/queue.js'
import { currentOperator, OperatorRefused } from '../src/operators/registry.js'

const ACKNOWLEDGEMENT = `
This run sends detail photographs from the inside of a house to an AI service.
The AI Processing Decision's identification addendum authorizes that on the
OWNER'S OWN PROPERTY (§B) and gates a CLIENT'S property behind a disclosure that
does not yet exist (§C).

Pass 1 sends less than identification does — no canvas, no wide room frame — but
the question is whose house it is. Pass --owner-property to confirm this visit is
the owner's own.
`.trim()

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`)

const visitId = arg('visit')
if (!visitId) {
  console.error('Usage: npx tsx server/scripts/read.ts --visit <visitId> [--zone <needle>] [--run --owner-property] [--limit N]')
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
  console.error(`Visit ${visitId} has no import, so there are no photographs to read.`)
  process.exit(1)
}
// Bound here rather than relied on through the exit above: `report()` is a
// hoisted declaration, so the narrowing does not reach inside it.
const importId: string = found

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
const zoneMatches = (zoneId: string): boolean =>
  needle === undefined ||
  zoneId.toLowerCase().includes(needle) ||
  (zoneLabels.get(zoneId) ?? '').toLowerCase().includes(needle)

const whole = planSurfaceReads(db, importId)
const batches = whole.batches.filter((b) => zoneMatches(b.zoneId))
if (needle !== undefined && batches.length === 0) {
  console.error(`\nNo zone matches "${arg('zone')}". Zones with detail photographs:`)
  for (const z of new Set(whole.batches.map((b) => b.zoneId))) {
    console.error(`  ${zoneLabels.get(z) ?? '(no label)'}   ${z}`)
  }
  process.exit(1)
}

const onDisk = new Map(mediaForImport(db, importId).map((m) => [m.mediaId, m.fileStatus]))

console.log(`\nVisit ${visitId} · import ${importId} · pass 1, read`)
console.log(whole.note)
if (needle !== undefined) {
  console.log(`Filtered to "${arg('zone')}" — ${batches.length} of ${whole.batches.length} calls. The note above describes the whole export.`)
}
console.log()

let sendable = 0
let missing = 0
for (const b of batches) {
  const here = b.media.filter((m) => onDisk.get(m.mediaId) === 'present').length
  sendable += here
  missing += b.media.length - here
  const of = b.of > 1 ? ` ${b.index}/${b.of}` : '    '
  console.log(
    `  ${(zoneLabels.get(b.zoneId) ?? b.zoneId).padEnd(22)}${of}  ${String(here).padStart(3)} photographs` +
      (b.media.length - here > 0 ? `   (${b.media.length - here} not on this machine)` : ''),
  )
}

console.log(`\n${sendable} photographs would be sent across ${batches.length} calls. No canvas frames — pass 1 does not send them.`)
if (missing > 0) console.log(`${missing} are recorded and not on this machine.`)

if (!flag('run')) {
  console.log('\nThis was the plan only. Add --run --owner-property to send it.\n')
  report()
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

const again = flag('again')
if (again && needle === undefined) {
  console.error(`\n--again re-runs completed batches, which costs money again. It requires --zone.\n`)
  process.exit(1)
}

const q = queueSurfaceReading(db, visit.propertyId, visitId, actorId, needle === undefined ? undefined : zoneMatches, again)
console.log(`\nQueued ${q.jobs} calls over ${q.zones} zones, ${q.photographs} photographs. Draining.\n`)

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
console.log(
  spend.ratesKnown
    ? `Spend on this visit: $${spend.dollars.toFixed(2)} across ${spend.generations} calls.`
    : `${spend.generations} calls, ${spend.inputTokens.toLocaleString()} input tokens. No rates configured, so the cost is unknown rather than zero.`,
)
console.log(`Queue: ${JSON.stringify(queueProgress(db, visitId))}`)

report()

// ---------------------------------------------------------------- what came out

/**
 * What pass 1 found, read back from the tables rather than from the answer.
 *
 * **Deliberately not a list of objects.** Labels, surfaces and fields — because
 * that is what this pass produces, and a report that grouped them into things
 * would be doing pass 3's job in a print statement.
 */
function report(): void {
  const labels = db
    .prepare(
      `SELECT r.id, r.media_id AS mediaId, r.zone_id AS zoneId, r.surface, r.surface_note AS whereItIs,
              (SELECT COUNT(*) FROM reading_fields f WHERE f.reading_id = r.id) AS fields
         FROM readings r WHERE r.import_id = ? ORDER BY r.zone_id, r.created_at, r.id`,
    )
    .all(importId) as {
    id: string
    mediaId: string
    zoneId: string | null
    surface: string
    whereItIs: string | null
    fields: number
  }[]

  if (labels.length === 0) {
    console.log(`\nNo labels are stored for this import yet. Pass 1 has not run against it.\n`)
    return
  }

  const claims = claimsForImport(db, importId)
  const bySurface = new Map<string, number>()
  for (const l of labels) bySurface.set(l.surface, (bySurface.get(l.surface) ?? 0) + 1)

  console.log(`\n${labels.length} labels read across ${new Set(labels.map((l) => l.mediaId)).size} photographs.\n`)
  for (const [surface, n] of [...bySurface].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${surface.padEnd(20)} ${String(n).padStart(3)}`)
  }

  const empty = labels.filter((l) => l.fields === 0)
  if (empty.length > 0) {
    console.log(
      `\n${empty.length} label(s) carry no readable field. That is a capture finding, not a model failure — ` +
        `there is something printed there and the photograph cannot carry it. Reshoot square-on.`,
    )
  }

  const na = claims.filter((c) => !c.unreadable && statesNotApplicable(c.value))
  if (na.length > 0) {
    console.log(`\n${na.length} field(s) state N/A. Each is a manufacturer saying this thing does not have that property:`)
    for (const c of na.slice(0, 12)) console.log(`  ${c.field}: ${c.value}   (${c.surface})`)
    if (na.length > 12) console.log(`  ...and ${na.length - 12} more`)
  }

  const unread = claims.filter((c) => c.unreadable)
  if (unread.length > 0) {
    console.log(`\n${unread.length} field(s) named and illegible — the partial read is kept as evidence:`)
    for (const c of unread.slice(0, 8)) console.log(`  ${c.field}: ${c.value || '(nothing resolved)'}   (${c.surface})`)
  }

  const models = plateModels(claims)
  console.log(`\n${models.length} model string(s) read from a nameplate — this is what pass 2 looks up:`)
  for (const m of models.slice(0, 20)) console.log(`  ${m.field.padEnd(18)} ${m.value}`)

  // The manufacturer rule, per photograph, because a photograph is where two
  // labels compete. This is the NextEnergy case reported rather than repeated.
  const perMedia = new Map<string, typeof claims>()
  for (const c of claims) {
    const list = perMedia.get(c.mediaId)
    if (list) list.push(c)
    else perMedia.set(c.mediaId, [c])
  }
  const contested = [...perMedia].map(([mediaId, cs]) => [mediaId, adjudicateManufacturer(cs)] as const)
    .filter(([, a]) => a.competing.length > 0 || (a.asserted === null && a.claims.length > 0))
  if (contested.length > 0) {
    console.log(`\n${contested.length} photograph(s) where a manufacturer is contested or unsupported:`)
    for (const [mediaId, a] of contested) {
      console.log(`  ${mediaId}`)
      console.log(`    ${a.asserted ? `asserted: ${a.asserted} (${a.supportedBy})` : 'asserted: nothing'}`)
      console.log(`    ${a.why}`)
    }
  }

  console.log(`\nNothing here names an object. \`${READ_TASK}\` reads text; pass 2 resolves it.\n`)
}
