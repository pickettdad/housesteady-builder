import Database from 'better-sqlite3'
import { readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, 'migrations')

export type Db = Database.Database

/** Repo root — /data lives beside /server and /web, and is gitignored. */
export const dataRoot = process.env.HOUSESTEADY_DATA ?? join(here, '..', '..', '..', 'data')

/**
 * Opens the database and brings it up to date.
 *
 * Migrations are plain .sql files applied in filename order and recorded in
 * `_migrations`. Applied files are never re-run and never edited — same
 * append-only instinct as the rest of the system.
 */
export function openDb(file?: string): Db {
  const path = file ?? join(dataRoot, 'housesteady.db')
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })

  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r) => (r as { name: string }).name),
  )

  const pending = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !applied.has(f))

  for (const name of pending) {
    const sql = readFileSync(join(migrationsDir, name), 'utf8')
    db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
        name,
        new Date().toISOString(),
      )
    })()
    console.log(`[db] applied migration ${name}`)
  }

  return db
}

export const now = (): string => new Date().toISOString()
export const newId = (): string => crypto.randomUUID()

/** Store JSON-ish values as TEXT, preserving null vs "null". */
export const j = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v))
