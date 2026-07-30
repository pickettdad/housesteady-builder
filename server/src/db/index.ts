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

    /**
     * A migration may declare that it manages its own transaction.
     *
     * SQLite cannot drop a NOT NULL constraint in place, so relaxing one means
     * the documented rebuild — new table, copy, drop, rename — which requires
     * `PRAGMA foreign_keys=off`, and that pragma is a **silent no-op inside a
     * transaction.** Wrapping such a migration would appear to work and leave
     * every child row's foreign key pointing at a table that no longer exists.
     *
     * So a file may opt out with a leading `-- no-transaction`, take
     * responsibility for its own BEGIN/COMMIT, and run `PRAGMA
     * foreign_key_check` before it finishes. The default stays wrapped: this is
     * the exception, and it has to be asked for in the file where the reason is
     * written down.
     */
    const managesOwnTransaction = /^\s*--\s*no-transaction\b/.test(sql)

    if (managesOwnTransaction) {
      db.exec(sql)
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(name, new Date().toISOString())
    } else {
      db.transaction(() => {
        db.exec(sql)
        db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
          name,
          new Date().toISOString(),
        )
      })()
    }
    console.log(`[db] applied migration ${name}`)
  }

  return db
}

export const now = (): string => new Date().toISOString()
export const newId = (): string => crypto.randomUUID()

/** Store JSON-ish values as TEXT, preserving null vs "null". */
export const j = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v))
