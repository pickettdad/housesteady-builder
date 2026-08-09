/**
 * One real model call against the synthetic fixture — `npm run smoke`.
 *
 * **The cheapest possible proof that the entry point works.** Import, operator
 * resolution, job insert, queue claim, model config, image encoding, the call,
 * the response, the object write. Three or four calls on eleven placeholder
 * images: a few cents, no house involved.
 *
 * ---
 *
 * ## Why this exists
 *
 * On 2026-08-09 `--run` was found broken for everybody. `scripts/identify.ts`
 * passed `process.env.HOUSESTEADY_OPERATOR` — a short code — into `actorId`,
 * which is a foreign key to `operators(id)`, so the insert died with
 * `SQLITE_CONSTRAINT_FOREIGNKEY`. **984 tests green, typecheck clean, the free
 * plan step perfect.** It took a real call with a real operator to find, on the
 * owner's own photographs, after moving 529 MB.
 *
 * **None of that was about photographs.** The failure was in the job insert,
 * before an image was looked at. So the check that would have caught it needs a
 * key and a fixture — not a house.
 *
 * ---
 *
 * ## ⚠ WHAT A GREEN SMOKE DOES NOT COVER
 *
 * **Written down before green starts reading as covered**, because that is
 * exactly how the four no-op generator fixtures survived.
 *
 * The synthetic fixture is **11 media across 3 zones**. Two consequences, and
 * both are paths this repo has argued about at length:
 *
 * 1. **It never splits a batch.** `MAX_MEDIA_PER_CALL` is 24 and no zone here
 *    comes near it, so the multi-batch path — `1/3`, `2/3`, `3/3`, the canvas
 *    riding every batch, cross-batch duplication — is **never exercised**. That
 *    is the path that produced four proposals for one pressure tank.
 * 2. **It never exercises the image-edge cap.** `edgeForCall` only lowers the
 *    edge above 20 images in one call. At 11 media total, that branch cannot be
 *    reached, so the >20-image rejection case — the one that fails outright with
 *    `invalid_request_error` rather than degrading — stays **unproven**.
 *
 * **Both paths stay unproven by a green smoke.** A run against a real multi-zone
 * export is the only thing that covers them, and this script is not a substitute
 * for one. It proves the pipe, not the arithmetic.
 *
 * **Also not covered:** identification *quality*. The fixture's images are
 * 4–6 KB generated placeholders, not photographs of equipment. Whatever comes
 * back is not a judgement about the pass — an empty result here is a pass.
 *
 * ---
 *
 *   npm run smoke              # import + one drained call, then clean up
 *   npm run smoke -- --keep    # leave the scratch database for inspection
 */

import { mkdtempSync, readFileSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = join(here, '..', '..')
const fixture = join(repoRoot, 'fixtures', 'synthetic')

// A scratch data root, set BEFORE anything reads `dataRoot` at module load.
const scratch = mkdtempSync(join(tmpdir(), 'housesteady-smoke-'))
process.env.HOUSESTEADY_DATA = scratch

const { openDb, newId, now } = await import('../src/db/index.js')
const { runImport } = await import('../src/import/runImport.js')
const { createOperator } = await import('../src/operators/registry.js')
const { queueIdentification } = await import('../src/ai/tasks/identify.js')
const { drainVisit } = await import('../src/ai/worker.js')
const { assistsBlocked } = await import('../src/ai/worker.js')
const { visitSpend, queueProgress } = await import('../src/ai/queue.js')
const { apiKey, apiKeySource, modelFor } = await import('../src/ai/models.js')

const keep = process.argv.includes('--keep')
const cleanUp = (): void => {
  if (keep) console.log(`\nScratch kept at ${scratch}`)
  else rmSync(scratch, { recursive: true, force: true })
}

console.log('\nSmoke — one real call against the synthetic fixture. No house is involved.\n')

const blocked = assistsBlocked()
if (blocked) {
  console.error(`${blocked}\n`)
  console.error(
    `Smoke needs a key and a fast model:\n` +
      `  HOUSESTEADY_ANTHROPIC_API_KEY=...\n  HOUSESTEADY_MODEL_FAST=...\n`,
  )
  cleanUp()
  process.exit(1)
}
console.log(`Key from ${apiKeySource()}, model ${modelFor('fast')!.id}.`)
if (!apiKey()) throw new Error('unreachable — assistsBlocked would have caught it')

const db = openDb()

try {
  // The media tree is COPIED, because `placeMedia` moves files out of it and the
  // fixture is committed. A smoke run that empties `fixtures/synthetic/media`
  // would be a check that destroys the thing it checks.
  const staging = join(scratch, 'export')
  cpSync(fixture, staging, { recursive: true })

  const operator = createOperator(db, { displayName: 'Smoke run', shortCode: 'smoke' })
  const propertyId = newId()
  const visitId = newId()
  db.prepare('INSERT INTO properties (id, label, address, created_at, actor_id) VALUES (?, ?, NULL, ?, ?)').run(
    propertyId, 'Synthetic fixture', now(), operator.id,
  )
  db.prepare(
    `INSERT INTO visits (id, property_id, kind, planned_date, notes, created_at, actor_id, performed_by)
     VALUES (?, ?, 'baseline', NULL, NULL, ?, ?, NULL)`,
  ).run(visitId, propertyId, now(), operator.id)

  const { importId, status } = await runImport({
    db, propertyId, visitId, actorId: operator.id,
    raw: readFileSync(join(staging, 'manifest.json'), 'utf8'),
    mediaDir: staging,
    producer: 'smoke',
  })
  const present = db
    .prepare(`SELECT COUNT(*) AS n FROM media WHERE import_id = ? AND file_status = 'present'`)
    .get(importId) as { n: number }
  console.log(`Import ${status} — ${present.n} media present.`)
  if (present.n === 0) throw new Error('No media landed. The fixture or the placement path is broken.')

  // The line the FK bug died on. Resolved id, exactly as `identify.ts` does it.
  const queued = queueIdentification(db, propertyId, visitId, operator.id)
  console.log(`Queued ${queued.jobs} calls over ${queued.zones} zones.`)
  if (queued.jobs === 0) throw new Error('Nothing queued. The plan produced no batches from a fixture that has media.')

  // ONE call. The point is that a call happens, not how many.
  const result = await drainVisit(db, visitId, { limit: 1 })
  console.log(`\n${result.reason}`)
  console.log(`Ran ${result.ran}, failed ${result.failed}, stopped: ${result.stopped}.`)

  if (result.ran === 0) {
    console.error(`\nSMOKE FAILED — no call completed. ${JSON.stringify(queueProgress(db, visitId).failures)}\n`)
    cleanUp()
    process.exit(1)
  }

  const gen = db
    .prepare(`SELECT model, input_tokens AS i, output_tokens AS o, cost_estimate AS c FROM ai_generations
              WHERE visit_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(visitId) as { model: string; i: number; o: number; c: number } | undefined
  const objects = db.prepare('SELECT COUNT(*) AS n FROM objects WHERE import_id = ?').get(importId) as { n: number }

  console.log(`\nGeneration: ${gen?.model} — ${gen?.i} in, ${gen?.o} out.`)
  const spend = visitSpend(db, visitId)
  console.log(
    spend.ratesKnown
      ? `Cost: $${spend.dollars.toFixed(4)}.`
      : `Cost unknown — no rates configured. Set HOUSESTEADY_FAST_INPUT_PER_MTOK to price it.`,
  )
  console.log(`${objects.n} objects proposed. On placeholder images, any number is fine — including zero.`)

  console.log(
    `\nSMOKE PASSED. The entry point works end to end.\n` +
      `NOT covered: batch splitting (11 media, ceiling is 24) and the >20-image edge cap.\n` +
      `Both need a real multi-zone export. See this file's header.\n`,
  )
} catch (e) {
  console.error(`\nSMOKE FAILED — ${(e as Error).message}\n`)
  cleanUp()
  process.exit(1)
} finally {
  db.close()
}

cleanUp()
