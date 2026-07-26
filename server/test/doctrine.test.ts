import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { buildReport } from '../src/import/report.js'
import { runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, readReference, repoRoot, scratchDir } from './helpers.js'

/**
 * Doctrine, pinned.
 *
 * The rules in CLAUDE.md §4 are the ones that cost the most when they quietly
 * stop being true, and most of them are invisible in a normal test — they are
 * properties of the SHAPE of the code and the storage, not of any one output.
 * A feature test would not notice any of them breaking.
 *
 * Several of these are deliberately source-scanning rather than behavioural.
 * That is not laziness: "the builder never mutates an imported row" is not
 * something you can prove by importing a file, and by the time a behavioural
 * test could catch it the overlay would already have been written the wrong way.
 */

const serverSrc = join(repoRoot, 'server', 'src')

const sourceFiles = (dir: string): string[] => {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.ts')) out.push(full)
    }
  }
  walk(dir)
  return out
}

/** Source with comments and template-literal prose stripped, so prose never trips a scan. */
const codeOf = (file: string): string =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

describe('doctrine 1 — the manifest is immutable evidence', () => {
  /**
   * Every table holding something the field app said. Builder-side changes come
   * later as overlay tables; these must never be rewritten in place, because
   * "never launder an inference into an observation" is only structurally true
   * if the observation cannot be edited.
   */
  const CAPTURED_TABLES = [
    'imports', 'session_meta', 'config_snapshots', 'zones', 'canvases', 'pins',
    'anchors', 'media', 'notes', 'chat_threads', 'chat_messages', 'resolutions', 'events',
  ]

  it('never UPDATEs or DELETEs a captured row, anywhere in the codebase', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(serverSrc)) {
      const code = codeOf(file)
      for (const table of CAPTURED_TABLES) {
        const update = new RegExp(`UPDATE\\s+${table}\\b`, 'i')
        const del = new RegExp(`DELETE\\s+FROM\\s+${table}\\b`, 'i')
        if (update.test(code)) offenders.push(`UPDATE ${table} in ${file.replace(repoRoot, '')}`)
        if (del.test(code)) offenders.push(`DELETE FROM ${table} in ${file.replace(repoRoot, '')}`)
      }
    }
    assert.deepEqual(offenders, [], 'a correction adds a layer; it never overwrites')
  })

  it('gives captured entities no columns to record a builder-side opinion in', () => {
    // If these ever appear on a captured table, the overlay model has been
    // quietly abandoned and provenance stops being a property of storage.
    const migration = readFileSync(join(serverSrc, 'db', 'migrations', '001_initial.sql'), 'utf8')
    const pinsTable = migration.slice(migration.indexOf('CREATE TABLE pins'), migration.indexOf('CREATE INDEX idx_pins_import'))
    for (const forbidden of ['verified', 'confirmed', 'corrected', 'reviewed', 'approved']) {
      assert.ok(!new RegExp(`\\b${forbidden}\\b`, 'i').test(pinsTable), `pins must not carry a "${forbidden}" column`)
    }
  })

  it('stores the raw manifest byte-for-byte, whatever else it derives', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const raw = readReference()
    const { importId } = await runImport({ db, ...ids, raw, dataDir: scratchDir() })
    const stored = db.prepare('SELECT raw_manifest FROM imports WHERE id = ?').get(importId) as { raw_manifest: string }
    assert.equal(stored.raw_manifest, raw)
    db.close()
  })
})

describe('doctrine 3 — provenance travels', () => {
  it('keeps the source block on every kind of record that carries one', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const { importId } = await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir() })

    for (const table of ['media', 'notes', 'resolutions', 'events']) {
      const row = db
        .prepare(`SELECT source FROM ${table} WHERE import_id = ? AND source IS NOT NULL LIMIT 1`)
        .get(importId) as { source: string } | undefined
      assert.ok(row, `${table} rows carry their source`)
      const source = JSON.parse(row!.source)
      assert.ok(source.actor, `${table}.source names who or what produced it`)
    }

    // And an AI-authored chat reply is marked as such, not laundered into human.
    const aiMessage = db
      .prepare("SELECT source, model FROM chat_messages WHERE import_id = ? AND model IS NOT NULL")
      .get(importId) as { source: string; model: string }
    assert.equal(JSON.parse(aiMessage.source).actor, 'ai')
    assert.equal(aiMessage.model, 'claude-sonnet-5')
    db.close()
  })
})

describe('doctrine 6 — never drop anything silently', () => {
  it('creates a row for every media record even when no file arrives', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const { importId } = await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const count = db.prepare('SELECT COUNT(*) AS n FROM media WHERE import_id = ?').get(importId) as { n: number }
    assert.equal(count.n, 37, 'absent is a recorded state, not an omission')
    db.close()
  })

  it('surfaces orphan events rather than discarding them', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const parsed = JSON.parse(readReference())
    parsed.orphanEvents = [{ type: 'PhotoAdded', reason: 'no session' }]
    const { importId } = await runImport({ db, ...ids, raw: JSON.stringify(parsed), dataDir: scratchDir() })
    const report = buildReport(db, importId)!
    assert.equal(report.counts.orphanEvents, 1)
    db.close()
  })

  it('counts the inbox as first-class rather than burying it', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const { importId } = await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const report = buildReport(db, importId)!
    assert.equal(report.counts.inboxTotal, 1)
    db.close()
  })
})

describe('doctrine — resolutions[] is state, events[] is history', () => {
  it('stores both, deriving neither from the other', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const { importId } = await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir() })

    const resolutions = db.prepare('SELECT COUNT(*) AS n FROM resolutions WHERE import_id = ?').get(importId) as { n: number }
    const events = db.prepare('SELECT COUNT(*) AS n FROM events WHERE import_id = ?').get(importId) as { n: number }

    assert.equal(resolutions.n, 20, 'the projection, exactly as exported')
    assert.equal(events.n, 111, 'and the whole log beside it')

    // The reopened item is in the log but not in current state — which is the
    // entire reason both are stored.
    const reopened = db
      .prepare("SELECT COUNT(*) AS n FROM events WHERE import_id = ? AND type = 'ItemReopened'")
      .get(importId) as { n: number }
    assert.equal(reopened.n, 1)
    db.close()
  })

  it('keeps each event whole, not just the fields the schema names', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const { importId } = await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const row = db
      .prepare("SELECT payload FROM events WHERE import_id = ? AND type = 'SessionInitialized'")
      .get(importId) as { payload: string }
    const payload = JSON.parse(row.payload)
    // Fields no column exists for still survive, because raw is the record.
    assert.ok(payload.propertyFlags)
    assert.ok(payload.configHash)
    db.close()
  })
})

describe('doctrine — the four streams never collapse', () => {
  it('never lets one resolution be both a gap and a finding', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const { importId } = await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const both = db
      .prepare('SELECT COUNT(*) AS n FROM resolutions WHERE import_id = ? AND feeds_gap_list = 1 AND records_finding = 1')
      .get(importId) as { n: number }
    assert.equal(both.n, 0, 'a missing photo is not a problem with the house')
    db.close()
  })

  it('never presents findings under a heading that implies trouble', () => {
    // The report is where this rule is either kept or broken, and it is broken
    // by a word, not by a bug.
    const report = readFileSync(join(repoRoot, 'web', 'src', 'pages', 'ImportReport.tsx'), 'utf8')
    const headings = [...report.matchAll(/<h[34]>([^<{]+)<\/h[34]>/g)].map((m) => m[1]!.toLowerCase())
    for (const heading of headings) {
      for (const loaded of ['problem', 'defect', 'fault', 'issue', 'failure']) {
        assert.ok(
          !heading.includes(loaded),
          `heading "${heading}" implies trouble; findings include confirmed absences`,
        )
      }
    }
    assert.ok(headings.some((h) => h.includes('finding') || h.includes('checklist')), 'sanity: headings were found')
  })

  it('reports the finding breakdown, never a bare total', () => {
    const report = readFileSync(join(repoRoot, 'web', 'src', 'pages', 'ImportReport.tsx'), 'utf8')
    assert.match(report, /failedChecks/, 'the failed-check count is shown')
    assert.match(report, /confirmedAbsences/, 'and the confirmed-absence count beside it')
  })
})

describe('doctrine — the config decides, not the builder', () => {
  it('hardcodes no na-reason ids anywhere in the import path', () => {
    // The list of which reasons feed the gap list lives in each import's own
    // config snapshot. A literal here means the rule has been frozen at whatever
    // the field app happened to declare the day it was written.
    const offenders: string[] = []
    for (const file of sourceFiles(join(serverSrc, 'import'))) {
      const code = codeOf(file)
      for (const reason of ['none-present', 'no-access', 'not-applicable', 'deferred']) {
        if (code.includes(`'${reason}'`) || code.includes(`"${reason}"`)) {
          offenders.push(`${reason} in ${file.replace(repoRoot, '')}`)
        }
      }
    }
    assert.deepEqual(offenders, [], 'read the flags from the snapshot, never a baked-in list')
  })
})

describe('doctrine 5 — the AI provenance shape exists before anything writes to it', () => {
  it('creates ai_generations empty, with abstention as a normal outcome', async () => {
    const db = freshDb()
    const rows = db.prepare('SELECT COUNT(*) AS n FROM ai_generations').get() as { n: number }
    assert.equal(rows.n, 0, 'no AI in this increment')

    const columns = (db.prepare('SELECT name, "notnull", dflt_value FROM pragma_table_info(?)').all('ai_generations') as {
      name: string
      notnull: number
      dflt_value: string | null
    }[])
    const byName = Object.fromEntries(columns.map((c) => [c.name, c]))

    for (const required of ['task', 'model', 'prompt_id', 'prompt_version', 'prompt_hash', 'abstained', 'human_decision']) {
      assert.ok(byName[required], `ai_generations.${required} exists`)
    }

    // abstained = 1 is a SUCCESSFUL outcome, so it defaults to 0 and is never null.
    assert.equal(byName.abstained!.notnull, 1)
    assert.equal(byName.abstained!.dflt_value, '0')
    // A generation is never itself client-facing — there is deliberately no
    // column that could make it so.
    for (const forbidden of ['published', 'rendered', 'client_facing', 'signed']) {
      assert.ok(!byName[forbidden], `ai_generations must not carry a "${forbidden}" column`)
    }
    db.close()
  })

  it('lets no model call use an inline prompt string', () => {
    // No AI yet, so this is a tripwire for the increment that adds it.
    const offenders = sourceFiles(serverSrc).filter((f) => /anthropic|openai|messages\.create/i.test(codeOf(f)))
    assert.deepEqual(offenders, [], 'when this fires, the prompt belongs in /prompts as versioned config')
  })
})

describe('doctrine 7 — fail open on vocabulary, fail closed on structure', () => {
  it('puts no CHECK constraint on any vocabulary column', () => {
    // A CHECK here would turn a word the field app just invented into a refused
    // import — the exact failure the doctrine forbids.
    const migration = readFileSync(join(serverSrc, 'db', 'migrations', '001_initial.sql'), 'utf8')
    assert.ok(!/\bCHECK\s*\(/i.test(migration), 'vocabulary columns are plain TEXT, on purpose')
  })
})
