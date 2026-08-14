/**
 * The golden session plan — one committed artifact, two suites, one contract.
 *
 * ---
 *
 * ## Why this exists
 *
 * The session plan is described in four places: this repo's `SessionPlan`
 * interface, the prose contract in `/docs`, the field side's receiver, and the
 * field side's own copy of the contract. **Nothing bound any of them.** Four
 * descriptions of one seam, each able to drift on its own, and the first thing
 * that would notice is an import failing six weeks later with no way to tell
 * which side moved.
 *
 * So the fixture is **the binding artifact rather than a fifth description.**
 * This repo commits it and tests that the emitter still reproduces it; the field
 * side commits a copy and tests that its receiver parses it. A drift on either
 * side fails a suite **on the side that drifted, on the day it drifts.**
 *
 * ## ⚑ What this is NOT
 *
 * **It is a tripwire, not a cross-repo guarantee.** Nothing here can see the
 * field repo, run its tests, or stop it merging. The mechanism is only this:
 *
 * > When the emitted shape changes, **this repo's own test fails first.** That
 * > forces a regenerate, and the regenerate is what forces a note to the field
 * > side.
 *
 * A note somebody still has to send. If they do not send it, or the field side
 * does not update its copy, this fixture does nothing at all. *Describing it as
 * more than that would make it the fourth unbound description with a green tick
 * beside it*, which is worse than the three.
 *
 * ## What is stabilised, and why substitution rather than a field list
 *
 * A plan carries values that differ on every run — minted uuids and wall-clock
 * timestamps. Left alone they would churn the committed file on every
 * regenerate and the diff would stop being readable, which is how a tripwire
 * gets ignored.
 *
 * **The volatile VALUES are substituted across the whole payload, not a list of
 * field paths.** A path list only covers the fields somebody remembered; if a
 * new field starts carrying the visit id, a path list keeps passing and the file
 * quietly churns. Substituting the value catches it wherever it lands.
 *
 * And the converse is deliberate: **a genuinely new volatile value — a fresh
 * uuid or timestamp this function does not know about — fails the comparison.**
 * That is the tripwire working. The fix is to add it here and regenerate, not to
 * loosen the comparison.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { runImport } from '../import/runImport.js'
import { runAudit } from '../audit/run.js'
import { newId, now, openDb, type Db } from '../db/index.js'
import { buildSessionPlan, type SessionPlan } from './sessionPlan.js'

const here = fileURLToPath(new URL('.', import.meta.url))
export const repoRoot = join(here, '..', '..', '..')

/** The export the golden plan is emitted from — eight zones, a real house. */
export const GOLDEN_SOURCE = join(repoRoot, 'fixtures', 'walk-2026-07-31', 'housesteady-019fb92d-manifest.json')

/** Where the committed artifact lives. Both repos' tests read a copy of this. */
export const GOLDEN_PATH = join(repoRoot, 'fixtures', 'session-plan', 'session-plan_walk-2026-07-31_v1.json')

/**
 * The stand-ins. **Shaped like the real thing** — a uuid where production emits
 * a uuid, an ISO instant where production emits one — so a receiver's parsing
 * and type checks are exercised by the fixture rather than sidestepped by it.
 */
const STABLE = {
  property: '00000000-0000-4000-8000-000000000001',
  visit: '00000000-0000-4000-8000-000000000002',
  auditRun: '00000000-0000-4000-8000-000000000003',
  operator: 'golden-operator',
  generatedAt: '2026-08-14T00:00:00.000Z',
  importedAt: '2026-08-01T00:00:00.000Z',
} as const

/**
 * Emit the plan from the walk export, in a throwaway database.
 *
 * `dataDir` receives the export's media; callers pass a scratch directory. The
 * database is in-memory, so nothing here touches `/data`.
 */
export async function emitGoldenPlan(dataDir: string): Promise<{ plan: SessionPlan; volatile: string[] }> {
  const db: Db = openDb(':memory:')
  const operator = newId()
  const propertyId = newId()
  const visitId = newId()

  db.prepare(
    `INSERT INTO operators (id, display_name, short_code, active, created_at) VALUES (?, 'Golden', 'gold', 1, ?)`,
  ).run(operator, now())
  db.prepare('INSERT INTO properties (id, label, address, created_at, actor_id) VALUES (?, ?, NULL, ?, ?)').run(
    propertyId,
    'The walk fixture house',
    now(),
    operator,
  )
  /**
   * ⚑ **The typed date column is not named here, and that is not tidiness.**
   *
   * A doctrine scan forbids it anywhere under `src/plan/` — a hand-typed date
   * can disagree with the evidence, and the first signed edition rendered a day
   * nobody was in the house because of one. **The scan fired on this file's
   * first draft**, which named the column to write NULL into it.
   *
   * Omitting it writes the same NULL and leaves the rule untouched. And it is
   * the right value on its own terms: the golden plan's dates come from the
   * manifest's `session.startedAt` through `walkedAt()`, so a fixture carrying a
   * typed date would encode the very disagreement the emitter exists to report.
   */
  db.prepare(
    `INSERT INTO visits (id, property_id, kind, created_at, actor_id, performed_by)
     VALUES (?, ?, 'baseline', ?, ?, ?)`,
  ).run(visitId, propertyId, now(), operator, operator)

  const { importId } = await runImport({
    actorId: operator,
    db,
    propertyId,
    visitId,
    raw: readFileSync(GOLDEN_SOURCE, 'utf8'),
    dataDir,
  })
  runAudit({ db, propertyId, visitId, visitKind: 'baseline', actorId: operator })

  const plan = buildSessionPlan({ db, propertyId, generatedBy: operator })

  const importedAt = (db.prepare('SELECT imported_at AS a FROM imports WHERE id = ?').get(importId) as { a: string }).a
  const auditRun = (
    db.prepare('SELECT id FROM audit_runs WHERE property_id = ? ORDER BY run_at DESC, id DESC LIMIT 1').get(propertyId) as
      | { id: string }
      | undefined
  )?.id

  db.close()
  return {
    plan,
    // Order matters only in that every one of these must be substituted; they
    // are distinct values, so the replacements cannot interfere.
    volatile: [propertyId, visitId, auditRun ?? '', operator, plan.source.generatedAt, importedAt].filter(Boolean),
  }
}

/**
 * Replace every run-dependent value with its stand-in, everywhere it appears.
 *
 * Substitution over the serialised payload rather than over named fields — see
 * this file's header for why a field list is the version that silently rots.
 */
export function stabilise(plan: SessionPlan, volatile: readonly string[]): SessionPlan {
  const [property, visit, auditRun, operator, generatedAt, importedAt] = volatile
  let text = JSON.stringify(plan)
  const swap = (from: string | undefined, to: string): void => {
    if (!from) return
    text = text.split(from).join(to)
  }
  swap(property, STABLE.property)
  swap(visit, STABLE.visit)
  swap(auditRun, STABLE.auditRun)
  swap(operator, STABLE.operator)
  swap(generatedAt, STABLE.generatedAt)
  swap(importedAt, STABLE.importedAt)
  return JSON.parse(text) as SessionPlan
}

/** The committed artifact, exactly as both repos read it. */
export const readGolden = (): SessionPlan => JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as SessionPlan

/** How it is written — two-space JSON with a trailing newline, so diffs read. */
export const serialise = (plan: SessionPlan): string => `${JSON.stringify(plan, null, 2)}\n`
