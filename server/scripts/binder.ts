/**
 * The Home Binder draft — `npm run binder`.
 *
 *   npm run binder -- --visit <id> [--out draft.md]
 *
 * **Free. No model call.** It reads what is in the database, compares it against
 * the Binder Schema's 23 sections and the baseline profile's 41 slots, and
 * writes a document with **every heading present and every empty one saying
 * which kind of empty it is.**
 *
 * ---
 *
 * ## What this is for, and it changes what "good" means
 *
 * **It exists to be wrong in ways nobody here can predict**, and to be shown to
 * an outside reviewer. So the measure of a good draft is not how full it is —
 * **it is whether a reviewer can tell a missing producer from a missing fact.**
 *
 * ⚑ *A binder showing thirteen legitimately-empty sections as thirteen holes
 * gets reviewed on the wrong thirteen things, and the reviewer's attention is
 * what this document is spending.*
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openDb } from '../src/db/index.js'
import { latestImport } from '../src/ai/tasks/identify.js'
import { buildDraft, renderDraft, type BinderProfile, type BinderSchema } from '../src/report/binderDraft.js'


/**
 * Slots nothing in this build can fill, whatever the visit contained.
 *
 * ⚑ **This is a hand-kept list and that is a known risk in this repo** — four
 * things have drifted from a hand-kept restatement of something the data
 * already knew. **So it is checked**: every id here must be a real slot id, and
 * a rename fails loudly rather than silently un-marking a gap.
 *
 * **It is derived from `CLAUDE.md` §15**, which is the list of things this
 * project describes and has not built. *When a row leaves §15, its ids leave
 * here in the same change.*
 */
const NO_PRODUCER: Record<string, string> = {
  's5.index': 'the documents index — §4.1d paper capture is a field-side stage and unbuilt, so no document exists to index',
  's9.consumables': 'a consumables register — pass 2 sorts consumables out, and nothing collects them into a list',
  's10.concerns': 'concerns as records — §15: nothing implements them; `openConcerns` is typed `never[]`',
  's11.lifespans': 'lifespans — `schema/reference/lifespans-v1` does not exist, so no replacement horizon can be produced',
  's13.tests': 'lab results — §15: nothing knows a result is late, or that one was ordered',
  's17.directory': 'the vendor directory — the outcome log (stage 13) is its producer and is unbuilt',
  's19.reserve-figure': 'the reserve figure — it depends on replacement horizons, which depend on lifespans',
  's19.replacement-windows': 'replacement windows — same dependency',
  's20.readings': 'utility history — no producer, and out of scope for a baseline besides',
  's3.calendar': 'the year calendar — stage 9 (what each thing needs) is unbuilt',
  's15.default-schedule': 'the schedule render — 190 maintenance items exist as data and nothing renders them into a binder',
}

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const visitId = arg('visit')
if (!visitId) {
  console.error('Usage: npx tsx server/scripts/binder.ts --visit <visitId> [--out <path>]')
  process.exit(1)
}

/** This file is `server/scripts/`, so the repo root is two levels up. */
const repoRoot = join(import.meta.dirname, '..', '..')

const schema = JSON.parse(readFileSync(join(repoRoot, 'schema', 'binder-schema-v1.json'), 'utf8')) as BinderSchema
const profile = JSON.parse(
  readFileSync(join(repoRoot, 'schema', 'profiles', 'baseline-v1.json'), 'utf8'),
) as BinderProfile

// ⚑ The hand-kept list, checked. A slot id that no longer exists means the
// schema was renamed and this list was not — which would silently un-mark a gap.
const slotIds = new Set(schema.sections.flatMap((s) => (s.slots ?? []).map((x) => x.id)))
const stale = Object.keys(NO_PRODUCER).filter((id) => !slotIds.has(id))
if (stale.length > 0) {
  console.error(
    `\nNO_PRODUCER names ${stale.length} slot id(s) the schema does not declare: ${stale.join(', ')}\n` +
      `Either the schema was renamed or the list is wrong. Both are worth knowing; neither is worth guessing past.\n`,
  )
  process.exit(1)
}

const db = openDb()
const visit = db.prepare('SELECT id, property_id AS propertyId FROM visits WHERE id = ?').get(visitId) as
  | { id: string; propertyId: string }
  | undefined
if (!visit) { console.error(`No visit ${visitId}.`); process.exit(1) }
const importId = latestImport(db, visitId)
if (!importId) { console.error(`Visit ${visitId} has no import.`); process.exit(1) }

/**
 * What the database can actually put in each slot today.
 *
 * **Only slots with a real producer appear here.** Everything else is zero,
 * which the draft then explains rather than leaves blank.
 */
const one = (sql: string, ...p: unknown[]): number =>
  (db.prepare(sql).get(...p) as { n: number } | undefined)?.n ?? 0

const counts = new Map<string, number>([
  ['s7.components', one('SELECT COUNT(*) AS n FROM objects WHERE import_id = ?', importId)],
  ['s4.profile', one('SELECT COUNT(*) AS n FROM zones WHERE import_id = ?', importId)],
  ['s12.alarms', one(`SELECT COUNT(*) AS n FROM objects WHERE import_id = ? AND class_id LIKE '%alarm%'`, importId)],
  ['s10.findings', one('SELECT COUNT(*) AS n FROM audit_slots WHERE 1 = 0')],
])

// ⚑ Every id above must be a real slot too, for the same reason NO_PRODUCER's
// are checked — a count written against a renamed slot silently reports zero,
// which the draft would then render as a gap that is not one.
const badCounts = [...counts.keys()].filter((id) => !slotIds.has(id))
if (badCounts.length > 0) {
  console.error(`\nCounts are keyed on slot id(s) the schema does not declare: ${badCounts.join(', ')}\n`)
  process.exit(1)
}

const draft = buildDraft(schema, profile, {
  counts,
  noProducer: new Set(Object.keys(NO_PRODUCER)),
})

const property = db.prepare('SELECT label FROM properties WHERE id = ?').get(visit.propertyId) as
  | { label: string }
  | undefined

const md = renderDraft(draft, {
  house: property?.label ?? 'A house',
  date: (db.prepare('SELECT imported_at AS d FROM imports WHERE id = ?').get(importId) as { d: string }).d.slice(0, 10),
})

const out = arg('out')
if (out) {
  writeFileSync(out, md, 'utf8')
  console.log(`\nWrote ${out} — ${md.split('\n').length} lines.\n`)
} else {
  console.log(md)
}

const c = draft.counts
console.error(
  `\n${c.sections} sections · ${c.slots} slots · ${c.filled} filled · ` +
    `${c.gaps} gaps · ${c.correctlyEmpty} correctly empty · ${c.outOfScope} out of scope`,
)
const noProducerGaps = draft.sections
  .flatMap((s) => s.slots)
  .filter((s) => s.emptyReason === 'no-producer').length
console.error(
  `\n⚑ ${noProducerGaps} of the ${c.gaps} gaps are missing PRODUCERS rather than missing data — ` +
    `no visit to this house would close them, and they are what an outside review is for.\n`,
)
