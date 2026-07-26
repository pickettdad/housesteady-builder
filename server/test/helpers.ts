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

export const scratchDir = (): string => mkdtempSync(join(tmpdir(), 'housesteady-test-'))

export function freshDb(): Db {
  return openDb(':memory:')
}

export function makePropertyAndVisit(
  db: Db,
  opts: { label?: string; address?: string | null; kind?: string } = {},
): { propertyId: string; visitId: string } {
  const propertyId = newId()
  const visitId = newId()
  db.prepare('INSERT INTO properties (id, label, address, created_at) VALUES (?, ?, ?, ?)').run(
    propertyId,
    opts.label ?? 'Test build 7 web app 1',
    opts.address ?? null,
    now(),
  )
  db.prepare(
    'INSERT INTO visits (id, property_id, kind, visit_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(visitId, propertyId, opts.kind ?? 'baseline', null, null, now())
  return { propertyId, visitId }
}

export function addVisit(db: Db, propertyId: string, kind = 'baseline'): string {
  const visitId = newId()
  db.prepare(
    'INSERT INTO visits (id, property_id, kind, visit_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(visitId, propertyId, kind, null, null, now())
  return visitId
}
