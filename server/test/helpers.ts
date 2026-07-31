import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { newId, now, openDb, type Db } from '../src/db/index.js'

const here = fileURLToPath(new URL('.', import.meta.url))
export const repoRoot = join(here, '..', '..')

export const referencePath = join(
  repoRoot,
  'fixtures',
  'reference',
  'housesteady-019f9a33-manifest.json',
)

export const readReference = (): string => readFileSync(referencePath, 'utf8')

/**
 * The reference export as a SECOND capture of the same house.
 *
 * A re-walk is a new field session and carries a new session id — migration 011
 * refuses the same capture event twice, on the reasoning that recording it twice
 * is duplicate evidence and inflates `imports_read`. The pin uuids are
 * deliberately left alone: they are the cross-visit identity, and keeping them
 * is what makes this a second look at the same water heater rather than a
 * second water heater.
 */
export const readReferenceAsRewalk = (sessionId = 'session-rewalk-1'): string => {
  const manifest = JSON.parse(readReference()) as { session: { sessionId: string } }
  manifest.session.sessionId = sessionId
  return JSON.stringify(manifest)
}

export const scratchDir = (): string => mkdtempSync(join(tmpdir(), 'housesteady-test-'))

/**
 * The operator every test acts as.
 *
 * A real row rather than a literal string, because the foreign key is part of
 * what is being tested: a write path that invents an actor id has to fail here
 * exactly as it would in production.
 */
export const TEST_OPERATOR = 'op-test'

export function freshDb(): Db {
  const db = openDb(':memory:')
  db.prepare(
    `INSERT INTO operators (id, display_name, short_code, active, created_at, deactivated_at)
     VALUES (?, 'Test Operator', 'test', 1, ?, NULL)`,
  ).run(TEST_OPERATOR, now())
  return db
}

export function makePropertyAndVisit(
  db: Db,
  opts: { label?: string; address?: string | null; kind?: string; actorId?: string } = {},
): { propertyId: string; visitId: string } {
  const propertyId = newId()
  const visitId = newId()
  const actorId = opts.actorId ?? TEST_OPERATOR
  db.prepare(
    'INSERT INTO properties (id, label, address, created_at, actor_id) VALUES (?, ?, ?, ?, ?)',
  ).run(
    propertyId,
    opts.label ?? 'Test build 7 web app 1',
    opts.address ?? null,
    now(),
    actorId,
  )
  db.prepare(
    `INSERT INTO visits (id, property_id, kind, planned_date, notes, created_at, actor_id, performed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(visitId, propertyId, opts.kind ?? 'baseline', null, null, now(), actorId, actorId)
  return { propertyId, visitId }
}

export function addVisit(db: Db, propertyId: string, kind = 'baseline', actorId = TEST_OPERATOR): string {
  const visitId = newId()
  db.prepare(
    `INSERT INTO visits (id, property_id, kind, planned_date, notes, created_at, actor_id, performed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(visitId, propertyId, kind, null, null, now(), actorId, actorId)
  return visitId
}
