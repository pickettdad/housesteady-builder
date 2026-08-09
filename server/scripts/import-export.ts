/**
 * Import a field export from a directory on disk — the step before `identify`.
 *
 * **This exists because the only import path was HTTP, and HTTP wants zips.**
 * `runImport` has always accepted `mediaDir` — an already-extracted media tree —
 * and nothing reached it. For a 529 MB export that difference is not cosmetic:
 * the upload route stages a multer copy, extracts it, then moves it, so a
 * half-gigabyte export wants a gigabyte and a half of working disk before the
 * first photograph is looked at. **On a container with a fixed disk allowance
 * that is the difference between running and not.**
 *
 * ---
 *
 * ## What it does, in order
 *
 * 1. Finds or creates the operator, the property and the visit. All three are
 *    required before an import has anywhere to go, and creating them by hand was
 *    three API calls nobody could make without a running server.
 * 2. Runs the import with `mediaDir` pointed at the export's own root.
 * 3. Prints the report — every check, by severity, and the media placement.
 *
 * **Nothing here is new import behaviour.** It is `runImport` with its arguments
 * assembled from a command line instead of from a multipart POST.
 *
 * ---
 *
 * ## ⚠ The files are MOVED, not copied
 *
 * `placeMedia` uses `renameSync` — it always has, because with zips the source
 * is a staging tree that is deleted straight afterwards. Pointed at a real
 * export folder it **empties that folder**, leaving the directory tree behind.
 *
 * **That is the right behaviour for this job and the wrong thing to discover.**
 * A 529 MB copy of a 529 MB import is disk that a container does not have to
 * spare. So: import from a working copy, and keep the original somewhere this
 * script cannot reach.
 *
 * **Related trap: `renameSync` cannot cross filesystems.** If the export sits on
 * a different mount from `HOUSESTEADY_DATA`, this fails with `EXDEV` on the
 * first photograph. Put the two on one filesystem.
 *
 * ---
 *
 *   npx tsx server/scripts/import-export.ts --export <dir> --property "Owner's house"
 *
 * `--export` is the directory holding `manifest.json` and `media/` — the export
 * root as the field app wrote it, since `media[].file` paths are relative to it.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { openDb, newId, now } from '../src/db/index.js'
import { runImport, ImportRefused } from '../src/import/runImport.js'
import { buildReport } from '../src/import/report.js'
import { createOperator, resolveOperator } from '../src/operators/registry.js'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const exportDir = arg('export')
const propertyLabel = arg('property')
if (!exportDir || !propertyLabel) {
  console.error(
    'Usage: npx tsx server/scripts/import-export.ts --export <dir> --property "<label>"\n' +
      '       [--visit-kind baseline] [--operator "<name>"] [--manifest <file>]\n\n' +
      '--export is the directory holding manifest.json and media/.\n' +
      'NOTE: media files are MOVED out of that directory. Point it at a working copy.',
  )
  process.exit(1)
}

if (!existsSync(exportDir) || !statSync(exportDir).isDirectory()) {
  console.error(`--export must be a directory that exists. Got: ${exportDir}`)
  process.exit(1)
}

// The field app names the manifest after the session, so it is found rather
// than assumed — and if there are two, the operator says which.
const named = arg('manifest')
const candidates = named
  ? [named]
  : readdirSync(exportDir).filter((f) => f.endsWith('.json') && f.toLowerCase().includes('manifest'))
if (candidates.length === 0) {
  console.error(
    `No manifest found in ${exportDir}. Looked for a *.json whose name contains "manifest". ` +
      `Pass --manifest <file> if it is called something else.`,
  )
  process.exit(1)
}
if (candidates.length > 1) {
  console.error(`More than one manifest in ${exportDir}:\n  ${candidates.join('\n  ')}\nPass --manifest <file>.`)
  process.exit(1)
}
const manifestPath = named && named.includes('/') ? named : join(exportDir, candidates[0]!)

const db = openDb()

// ------------------------------------------------------------------- the actor
// Increment 2c: an import records who ran it. There is no default operator and
// there should not be — "unknown" in an evidence trail is a value somebody has
// to chase later.
const operatorName = arg('operator') ?? process.env.HOUSESTEADY_OPERATOR
if (!operatorName) {
  console.error(
    'Who is running this import? Pass --operator "<name>", or set HOUSESTEADY_OPERATOR.\n' +
      'It is recorded against the import and every overlay that follows from it.',
  )
  process.exit(1)
}
let actorId: string
try {
  actorId = resolveOperator(db, operatorName).id
} catch {
  const created = createOperator(db, {
    displayName: operatorName,
    shortCode: operatorName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8) || 'op',
  })
  actorId = created.id
  console.log(`Created operator ${created.display_name} (${created.short_code}).`)
}

// ------------------------------------------------------- the property and visit
const existingProperty = db
  .prepare('SELECT id, label FROM properties WHERE lower(label) = lower(?)')
  .get(propertyLabel) as { id: string; label: string } | undefined

let propertyId: string
if (existingProperty) {
  propertyId = existingProperty.id
  console.log(`Property: ${existingProperty.label} (${propertyId}) — existing.`)
} else {
  propertyId = newId()
  // Address stays null. Doctrine 4 — an explicit unknown is information, and
  // nothing in this run needs an address.
  db.prepare('INSERT INTO properties (id, label, address, created_at, actor_id) VALUES (?, ?, ?, ?, ?)').run(
    propertyId,
    propertyLabel,
    null,
    now(),
    actorId,
  )
  console.log(`Property: ${propertyLabel} (${propertyId}) — created.`)
}

const visitId = newId()
// `performed_by` stays null: whoever imports an export is not necessarily who
// walked the house, and guessing puts a name on a client-facing "visited by".
db.prepare(
  `INSERT INTO visits (id, property_id, kind, planned_date, notes, created_at, actor_id, performed_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
).run(visitId, propertyId, arg('visit-kind') ?? 'baseline', null, null, now(), actorId, null)
console.log(`Visit:    ${visitId}`)

// ------------------------------------------------------------------ the import
console.log(`\nImporting ${manifestPath}\n  media from ${exportDir} (files are MOVED out of it)\n`)

let importId: string
let status: string
try {
  ;({ importId, status } = await runImport({
    db,
    propertyId,
    visitId,
    raw: readFileSync(manifestPath, 'utf8'),
    mediaDir: exportDir,
    actorId,
    producer: 'housesteady-field',
  }))
} catch (e) {
  if (e instanceof ImportRefused) {
    // Fail closed on structure — doctrine 7. The refusal is the useful output.
    console.error(`\nREFUSED: ${e.message}`)
    for (const c of e.checks ?? []) console.error(`  ${c.severity.padEnd(8)} ${c.code}  ${c.message}`)
    process.exit(1)
  }
  throw e
}

// ------------------------------------------------------------------ the report
const report = buildReport(db, importId)
console.log(`Import ${importId} — ${status}\n`)

if (report) {
  const { checks, counts, unrecognizedTerms } = report.validation
  console.log(`Checks: ${counts.errors} errors, ${counts.warnings} warnings, ${counts.infos} info`)
  for (const c of checks) {
    if (c.severity === 'info') continue
    console.log(`  ${c.severity.padEnd(8)} ${c.code}\n    ${c.message}`)
  }
  // Fail open on vocabulary — doctrine 7. An unmet word is reported, never fatal,
  // and it is one of the more interesting things a first real export can produce.
  if (unrecognizedTerms.length > 0) {
    console.log(`\nVocabulary this builder has not met (${unrecognizedTerms.length}) — reported, never fatal:`)
    for (const t of unrecognizedTerms) console.log(`  ${JSON.stringify(t)}`)
  }
}

const media = db
  .prepare(
    `SELECT kind, file_status AS fileStatus, COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes
       FROM media WHERE import_id = ? GROUP BY kind, file_status ORDER BY kind, file_status`,
  )
  .all(importId) as { kind: string | null; fileStatus: string; n: number; bytes: number }[]

// Bytes by kind, always — CLAUDE.md §11. Four videos outweigh their file share,
// and the arithmetic only gets worse as clips lengthen.
console.log('\nMedia on this machine:')
for (const m of media) {
  console.log(
    `  ${(m.kind ?? '(no kind)').padEnd(10)} ${m.fileStatus.padEnd(9)} ` +
      `${String(m.n).padStart(4)} files  ${(m.bytes / 1_000_000).toFixed(1)} MB`,
  )
}

const present = media.filter((m) => m.fileStatus === 'present').reduce((n, m) => n + m.n, 0)
console.log(
  present === 0
    ? '\nNothing is present. This is a manifest-only import — identification would skip every photograph.'
    : `\n${present} files are present. Next:\n  npm run identify -- --visit ${visitId}\n`,
)
