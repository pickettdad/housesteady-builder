import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { buildReport } from '../src/import/report.js'
import { runImport } from '../src/import/runImport.js'
import { enqueue } from '../src/ai/queue.js'
import { createOperator } from '../src/operators/registry.js'
import { loadPrompts } from '../src/ai/prompts.js'
import { freshDb, makePropertyAndVisit, readReference, repoRoot, scratchDir, TEST_OPERATOR } from './helpers.js'

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

/**
 * What `sourceFiles()` reads.
 *
 * **Declared, because the extension list is the scope of every scan that uses
 * it, and until 2026-08-04 nobody had audited it.** `.tsx` was missing; `web/src`
 * holds one `.ts` file and thirteen `.tsx`, so "the button label is the claim" —
 * the scan forbidding a user-visible *verify* or *certify* — had been reading
 * `api.ts` and no component at all, reporting green every run without ever
 * seeing a button.
 *
 * Rule 11's third instance and the sharpest of them: the check whose whole
 * subject is the words on a screen had never been shown a screen.
 */
const SCANNED_EXTENSIONS = ['.ts', '.tsx'] as const

/**
 * Extensions present under the scanned roots that this walker deliberately does
 * not return — **each with the reason, because rule 5 says a fix that removes a
 * symptom has not removed a class.** Adding `.tsx` fixed one instance. The class
 * is that an unaudited extension list silently scopes every scan built on it, so
 * an exclusion is now a declared decision rather than an absence.
 *
 * `everyExtensionIsAccountedFor` below fails when a new extension appears under
 * a scanned root, so the next one is a decision somebody makes rather than a
 * blind spot nobody sees.
 */
const NOT_SCANNED: Record<string, string> = {
  '.sql':
    'Migrations, read by `migrationFiles()` instead. Kept out of the general walker because ' +
    'most scans assume TypeScript and would misfire on DDL — a CREATE TABLE is not a code ' +
    'path. The separate walker is named so the two conventions are visible rather than an ' +
    'accident of whoever wrote each scan.',
  '.css':
    'One stylesheet. It carries no code paths — but it does carry user-visible text through ' +
    '`content:`, which is a real channel for a rule-12 violation that no TypeScript scan can ' +
    'see. `renderedText()` reads it for exactly that, and nothing else needs it.',
}

const sourceFiles = (dir: string): string[] => {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (SCANNED_EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full)
    }
  }
  walk(dir)
  return out
}

/** Every file under a directory, whatever its extension. For the audit below. */
const allFiles = (dir: string): string[] => {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else out.push(full)
    }
  }
  walk(dir)
  return out
}

/**
 * The migrations, by their own walker.
 *
 * Named rather than hand-rolled at each call site. Several scans already read
 * `.sql` this way; giving it a name is what makes the second convention a
 * decision instead of something a scan author has to know to reinvent.
 */
const migrationFiles = (): string[] =>
  readdirSync(join(repoRoot, 'server', 'src', 'db', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => join(repoRoot, 'server', 'src', 'db', 'migrations', f))

/**
 * Text a person actually sees, from every file that can carry it.
 *
 * **Two channels, because there are two.** JSX text between tags is the obvious
 * one. `content:` in CSS is the other, and no TypeScript scan can see it — a
 * `::after { content: "Verified" }` renders a claim onto the screen that every
 * scan over `.tsx` would miss. Found while auditing what `sourceFiles()` skips,
 * which is the point of auditing it.
 */
function* renderedTextIn(file: string, source: string): Generator<[string, string]> {
  if (file.endsWith('.css')) {
    for (const m of source.matchAll(/content:\s*(['"])([^'"]*)\1/g)) yield [file, m[2] ?? '']
    return
  }
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  for (const m of code.matchAll(/>([^<>{}]{3,80})</g)) yield [file, m[1] ?? '']
}

function* renderedText(dir: string): Generator<[string, string]> {
  for (const file of allFiles(dir)) {
    if (!/\.(tsx?|css)$/.test(file)) continue
    yield* renderedTextIn(file, readFileSync(file, 'utf8'))
  }
  for (const file of sourceFiles(join(serverSrc, 'overlay'))) {
    yield* renderedTextIn(file, readFileSync(file, 'utf8'))
  }
}

/** The roots any scan walks. Kept here so the audit below can walk them all. */
const SCANNED_ROOTS = [
  join(repoRoot, 'server', 'src'),
  join(repoRoot, 'web', 'src'),
]

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

  /**
   * Migration 010 rebuilt four CAPTURED tables to relax `visit_id` — §1j. A
   * rebuild is a copy, and a copy is where evidence gets quietly altered: a
   * column dropped from a hand-written list, a value coerced, a row lost to a
   * failed constraint.
   *
   * So the reference export is imported and every captured row is checksummed
   * against the manifest it came from. Doctrine 1 is only true if the rebuild
   * preserved it exactly, and "the tests still pass" does not prove that on its
   * own — most of them never look at a pin's nickname.
   */
  it('preserves every captured column through the rebuild', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const raw = readReference()
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw, dataDir: scratchDir() })
    const manifest = JSON.parse(raw) as {
      pins: { pinId: string; number: number; nickname?: string }[]
      zones: { zoneId: string; label: string }[]
      resolutions: { itemId: string }[]
      media: { mediaId: string; sha256?: string }[]
    }

    // Counts first: a row lost in the copy is the loudest possible failure.
    for (const [table, expected] of [
      ['pins', manifest.pins.length],
      ['zones', manifest.zones.length],
      ['resolutions', manifest.resolutions.length],
      ['media', manifest.media.length],
    ] as const) {
      const got = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE import_id = ?`).get(importId) as { n: number }
      assert.equal(got.n, expected, `${table}: ${got.n} rows for ${expected} in the manifest`)
    }

    // Then values, on the columns a rebuild is most likely to drop — the ones
    // nothing else in the suite reads.
    for (const pin of manifest.pins) {
      const row = db.prepare('SELECT number, nickname FROM pins WHERE import_id = ? AND pin_id = ?')
        .get(importId, pin.pinId) as { number: number; nickname: string | null } | undefined
      assert.ok(row, `pin ${pin.pinId} survived`)
      assert.equal(row.number, pin.number)
      assert.equal(row.nickname, pin.nickname ?? null)
    }
    for (const zone of manifest.zones) {
      const row = db.prepare('SELECT label FROM zones WHERE import_id = ? AND zone_id = ?')
        .get(importId, zone.zoneId) as { label: string | null } | undefined
      assert.equal(row?.label, zone.label)
    }
    for (const m of manifest.media.filter((m) => m.sha256)) {
      const row = db.prepare('SELECT sha256 FROM media WHERE import_id = ? AND media_id = ?')
        .get(importId, m.mediaId) as { sha256: string | null } | undefined
      assert.equal(row?.sha256, m.sha256, 'a checksum altered in a copy is undetectable later')
    }
    db.close()
  })

  it('stores the raw manifest byte-for-byte, whatever else it derives', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const raw = readReference()
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw, dataDir: scratchDir() })
    const stored = db.prepare('SELECT raw_manifest FROM imports WHERE id = ?').get(importId) as { raw_manifest: string }
    assert.equal(stored.raw_manifest, raw)
    db.close()
  })
})

describe('doctrine 1 — the overlay layer is the only way anything changes', () => {
  /**
   * Increment 2a §8's scans. These are the ones that stop being true quietly:
   * the day someone adds `UPDATE pins SET type_kind = ?` because it is two lines
   * shorter than an overlay, provenance stops being a property of storage and
   * becomes a thing people have to remember, which is the same as not having it.
   */
  const CAPTURED_TABLES = [
    'imports', 'session_meta', 'config_snapshots', 'zones', 'canvases', 'pins',
    'anchors', 'media', 'notes', 'chat_threads', 'chat_messages', 'resolutions', 'events',
  ]

  it('gives the overlay layer no write path into a captured table', () => {
    const overlaySrc = join(serverSrc, 'overlay')
    const offenders: string[] = []
    for (const file of sourceFiles(overlaySrc)) {
      const code = codeOf(file)
      for (const table of CAPTURED_TABLES) {
        for (const verb of ['INSERT\\s+INTO', 'UPDATE', 'DELETE\\s+FROM']) {
          if (new RegExp(`${verb}\\s+${table}\\b`, 'i').test(code)) {
            offenders.push(`${verb} ${table} in ${file.replace(repoRoot, '')}`)
          }
        }
      }
    }
    assert.deepEqual(offenders, [], 'the desk reads what the field captured and writes only overlays')
  })

  it('writes overlays from exactly one place', () => {
    // One INSERT means one set of rules. Two means the second one forgets the
    // prior value, or the supersession, or the forbidden-field gate.
    const offenders = sourceFiles(serverSrc)
      .filter((f) => /INSERT\s+INTO\s+overlays/i.test(codeOf(f)))
      .map((f) => f.replace(repoRoot, ''))
    assert.deepEqual(offenders, ['/server/src/overlay/store.ts'])
  })

  it('never UPDATEs or DELETEs an overlay either', () => {
    // Undo is a superseding row. If this ever fails, the trail has stopped being
    // able to read "assigned, unassigned, reassigned".
    const offenders: string[] = []
    for (const file of sourceFiles(serverSrc)) {
      const code = codeOf(file)
      if (/UPDATE\s+overlays\b/i.test(code)) offenders.push(`UPDATE in ${file.replace(repoRoot, '')}`)
      if (/DELETE\s+FROM\s+overlays\b/i.test(code)) offenders.push(`DELETE in ${file.replace(repoRoot, '')}`)
    }
    assert.deepEqual(offenders, [], 'undo supersedes; it never deletes')
  })

  it('stores no derived state — current state is computed on read', () => {
    // Spec §4: "Current state is computed on read, not maintained in a separate
    // table". A table or column holding the answer is a second copy that can
    // drift from the rows it summarises, and only one of them can be right.
    const migrations = join(serverSrc, 'db', 'migrations')
    const sql = readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(migrations, f), 'utf8'))
      .join('\n')
    for (const forbidden of ['overlay_state', 'current_state', 'entity_state', 'derived_state']) {
      assert.ok(!new RegExp(`CREATE\\s+TABLE\\s+${forbidden}`, 'i').test(sql), `no ${forbidden} table`)
    }
    // And the resolver is pure: it cannot write even if someone wanted it to.
    const model = codeOf(join(serverSrc, 'overlay', 'model.ts'))
    assert.ok(!/\bdb\b/.test(model), 'the state resolver takes rows, not a database handle')
  })
})

describe('doctrine — the concierge identifies, specialists assess', () => {
  it('lets no overlay kind set a condition, grade or adequacy field', () => {
    const fields = codeOf(join(serverSrc, 'overlay', 'fields.ts'))
    // The whitelist is the mechanism: a correctable field must be declared, and
    // the declared ones are all readings of what the field app captured.
    const declared = [...fields.matchAll(/field:\s*'([^']+)'/g)].map((m) => m[1]!)
    assert.ok(declared.length > 0, 'sanity: correctable fields were found')
    for (const field of declared) {
      for (const loaded of ['condition', 'grade', 'adequacy', 'rating', 'severity', 'risk', 'safety', 'score']) {
        assert.ok(!field.toLowerCase().includes(loaded), `"${field}" is a judgement, not a reading`)
      }
    }
  })

  it('keeps "verify", "approve" and "certify" out of the verification path', () => {
    /**
     * Spec §2: the button reads "Matches the photo" — not "Verify", not
     * "Approve", not "Confirm". "The button label is the claim." A signature
     * means "I observed this, and this description matches what I saw", and the
     * moment the button says Approve it starts meaning something the concierge
     * cannot defend.
     *
     * Scanned on user-visible strings only — `sha_verified` and the import
     * report's checksum wording are about files, not about houses.
     */
    const webSrc = join(repoRoot, 'web', 'src')
    const offenders: string[] = []
    for (const [file, text] of renderedText(webSrc)) {
      const t = text.trim().toLowerCase()
      if (!t || !/[a-z]/.test(t)) continue
      if (/\b(verify|verified|approve|approved|certify|certified)\b/.test(t)) {
        // The import report legitimately verifies checksums — that is a claim
        // about bytes, and it is the one place the word is honest.
        if (/checksum|file|sha|byte/.test(t)) continue
        offenders.push(`"${text.trim()}" in ${file.replace(repoRoot, '')}`)
      }
    }
    assert.deepEqual(offenders, [], 'the button label is the claim')

    // Negative-tested, because this scan spent its whole life idle and "it
    // passes" was exactly what that looked like. §9b.
    assert.ok(
      [...renderedTextIn('/x.tsx', '<button>Mark verified</button>')].some(([, t]) =>
        /verified/.test(t),
      ),
    )
    assert.ok(
      [...renderedTextIn('/x.css', '.done::after { content: "Verified"; }')].some(([, t]) =>
        /Verified/.test(t),
      ),
      'CSS content: is user-visible text and no TypeScript scan can see it',
    )
  })
})

describe('doctrine 3 — provenance travels', () => {
  it('keeps the source block on every kind of record that carries one', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })

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
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const count = db.prepare('SELECT COUNT(*) AS n FROM media WHERE import_id = ?').get(importId) as { n: number }
    assert.equal(count.n, 37, 'absent is a recorded state, not an omission')
    db.close()
  })

  it('surfaces orphan events rather than discarding them', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const parsed = JSON.parse(readReference())
    parsed.orphanEvents = [{ type: 'PhotoAdded', reason: 'no session' }]
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: JSON.stringify(parsed), dataDir: scratchDir() })
    const report = buildReport(db, importId)!
    assert.equal(report.counts.orphanEvents, 1)
    db.close()
  })

  it('counts the inbox as first-class rather than burying it', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const report = buildReport(db, importId)!
    assert.equal(report.counts.inboxTotal, 1)
    db.close()
  })
})

describe('doctrine — resolutions[] is state, events[] is history', () => {
  it('stores both, deriving neither from the other', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })

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
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
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
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
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

  /**
   * Increment 2b §10. The Increment 1 tripwire here has served its purpose and
   * is replaced by the two scans it was standing in for.
   *
   * Both are about the same thing: a model call's behaviour must be fully
   * described by configuration that is versioned and hashed. A prompt in source
   * and a model ID in source are the same bug — they make "why does this binder
   * read differently" unanswerable, because the thing that changed was a code
   * edit nobody recorded against the artifact.
   */
  it('lets no model call use an inline prompt string', () => {
    // Every file that talks to a model must get its wording from the library.
    const offenders = sourceFiles(serverSrc).filter((f) => {
      const code = codeOf(f)
      if (!/messages\.create|@anthropic-ai\/sdk/i.test(code)) return false
      return !/from '\.\/prompts\.js'|from '\.\.\/ai\/prompts\.js'/.test(code)
    })
    assert.deepEqual(offenders, [], 'a file that calls a model must load its prompt from /prompts, never carry one')
  })

  it('lets no model ID appear in source', () => {
    // §5: pinned model IDs live in environment variables, and an upgrade is a
    // deliberate config change with a golden-set run behind it. A literal here
    // would make the upgrade invisible.
    const offenders = sourceFiles(serverSrc).filter((f) =>
      /['"`](claude|gpt|gemini|llama|mistral)-[a-z0-9][a-z0-9.-]*['"`]/i.test(codeOf(f)),
    )
    assert.deepEqual(offenders, [], 'model IDs are configuration — HOUSESTEADY_MODEL_FAST, not a string literal')
  })

  /**
   * Increment 2b §2: "no path may render a generation as current state without
   * a corresponding accept overlay."
   *
   * The behavioural half is in acceptance.test.ts — propose, and the pin is
   * untouched. This is the structural half, and it is the one that survives a
   * refactor: the way this doctrine breaks is not by someone deciding to render
   * proposals, it is by a read path quietly joining `ai_generations` for
   * convenience and a value appearing on screen that nobody signed.
   */
  it('lets only the acceptance path read ai_generations at all', () => {
    const ALLOWED = [
      join('ai', 'accept.ts'),      // owns the pending → accepted/edited/discarded transitions
      join('ai', 'queue.ts'),       // writes the row, and sums cost off it
      join('overlay', 'store.ts'),  // validates the proposal an accept overlay cites
    ]
    const offenders = sourceFiles(serverSrc)
      .filter((f) => /\bai_generations\b/.test(codeOf(f)))
      .filter((f) => !ALLOWED.some((a) => f.endsWith(a)))
    assert.deepEqual(offenders, [],
      'a read path touching ai_generations is how an unsigned value reaches the screen')
  })

  /**
   * The structural half of "a proposal is not state", one layer above the
   * table scan.
   *
   * `buildPass` is the payload the screen renders as the record: pins, photos,
   * decisions, the trail. If it ever learned to fetch proposals — for
   * convenience, to save a request — an unsigned reading would arrive in the
   * same object as signed values and every guard after that would depend on the
   * front end remembering which was which. Keeping the two in separate payloads
   * is what makes the doctrine hard to break by accident rather than merely
   * forbidden, and this is the line that keeps them separate.
   *
   * Accepted values still reach the pass, because they are overlays and arrive
   * through `resolveState` like every other act. That is the point.
   */
  it('keeps the pass read model out of the AI layer entirely', () => {
    const offenders = sourceFiles(join(serverSrc, 'pass')).filter((f) =>
      /from '\.\.?\/ai\//.test(codeOf(f)),
    )
    assert.deepEqual(offenders, [],
      'the pass renders state; a proposal is not state and must arrive in its own payload')
  })

  /**
   * Increment 2c §5 — *"no write path to an attributed table without an actor
   * argument. This is the rule that survives the next feature; a behavioural
   * test only covers paths that exist today."*
   *
   * Read against the SQL rather than against function signatures, because the
   * insert is the thing that either carries an actor or does not. A helper that
   * takes an `actorId` and forgets to bind it would pass a signature check and
   * fail here.
   *
   * The database trigger refuses such a row at runtime as well — belt and
   * braces, deliberately. The trigger catches it when it runs; this catches it
   * when it is written, which is cheaper and lands on the person who can fix it.
   */
  it('gives every insert into an attributed table an actor column', () => {
    const ATTRIBUTED = [
      'properties', 'visits', 'imports', 'passes', 'pass_zone_opens', 'pass_events',
      'desk_media', 'ai_jobs', 'ai_generations', 'overlays',
    ]
    const offenders: string[] = []

    for (const file of sourceFiles(serverSrc)) {
      const code = codeOf(file)
      for (const m of code.matchAll(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]*)\)/gis)) {
        const [, table, columns] = m
        if (!ATTRIBUTED.includes(table!)) continue
        if (/\bactor_id\b/.test(columns!)) continue
        offenders.push(`${file.replace(repoRoot, '')}: INSERT INTO ${table} with no actor_id`)
      }
    }

    assert.deepEqual(
      offenders, [],
      'every row on these tables records which operator acted — with two concierges, ' +
        'an unattributed row is unanswerable, and it cannot be backfilled afterwards',
    )
  })

  /**
   * The other half of the same rule: nothing may reach for the legacy operator
   * to satisfy the constraint.
   *
   * `op-legacy` means *this predates attribution*. A write path using it for new
   * work would file live records under a name that asserts the opposite, and it
   * would pass every other check here — the row has an actor, the foreign key
   * resolves, the trigger is satisfied. Only this scan catches it.
   */
  it('never lets new work be filed under the legacy operator', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(serverSrc)) {
      // The registry defines the constant and the guard that refuses it; every
      // other mention would be a use.
      if (file.endsWith(join('operators', 'registry.ts'))) continue
      if (/(['"])op-legacy\1|LEGACY_OPERATOR_ID/.test(codeOf(file))) {
        offenders.push(file.replace(repoRoot, ''))
      }
    }
    assert.deepEqual(offenders, [], 'the legacy operator is what pre-attribution rows point at, never a default')
  })

  /**
   * Increment 2c §6 — *"This increment answers 'who did this,' never 'who is
   * allowed to.'"*
   *
   * Attribution and access control look adjacent and are not. The way this goes
   * wrong is not a decision to build auth; it is a permission check appearing
   * inside an identity module because the data was conveniently to hand, and the
   * first real authentication decision then getting made by accident, in a file
   * whose job was bookkeeping.
   */
  it('keeps the operator registry free of access control', () => {
    const forbidden = /\b(password|passwordHash|bcrypt|argon2|jwt|sessionToken|authenticate|authorize|permission|canAccess|isAdmin|role)\b/i
    for (const file of sourceFiles(join(serverSrc, 'operators'))) {
      const found = codeOf(file).match(forbidden)
      assert.equal(
        found, null,
        `${file.replace(repoRoot, '')} mentions "${found?.[0]}" — attribution, never access control. ` +
          'Authentication arrives with hosting and wants its own decision.',
      )
    }
  })

  /**
   * Increment 3 §0.3 — *"honesty labels are assigned at ingest from the source,
   * never at render. A label can never be upgraded by a later step."*
   *
   * The audit engine reads state and reports what is short. If it ever assigns
   * a label, it is deciding an origin for a value it did not witness — which is
   * how an inference becomes an observation without anyone choosing to launder
   * one. The mapping is in the schema; nothing here may write one.
   */
  it('never lets the audit engine assign an honesty label', () => {
    const LABELS = /\b(observed|measured|documented|reported-by-homeowner|inferred|not-inspected|not-accessible)\b/
    const offenders: string[] = []
    for (const file of sourceFiles(join(serverSrc, 'audit'))) {
      const code = codeOf(file)
      // Reading a label off the schema is fine; writing one is not. An
      // assignment is what this looks for.
      for (const m of code.matchAll(/(?:label|honestyLabel|defaultLabel)\s*[:=]\s*'([a-z-]+)'/g)) {
        if (LABELS.test(m[1]!)) offenders.push(`${file.replace(repoRoot, '')}: assigns '${m[1]}'`)
      }
    }
    assert.deepEqual(offenders, [], 'the schema declares the label; the audit reports state')
  })

  /**
   * §0.4 and §0.5 are non-negotiables, and both are enforced by ORDERING inside
   * `assessSlot` — the narrative branch returns before applicability or the
   * profile can reach it, and the derived branch before any emptiness can be
   * reported. That ordering is the mechanism, so this asserts the mechanism is
   * still in that order rather than only that today's behaviour is right.
   */
  it('keeps the narrative guard ahead of the profile in assessSlot', () => {
    const code = codeOf(join(serverSrc, 'audit', 'completeness.ts'))
    const narrative = code.indexOf("slot.kind === 'narrative'")
    const profile = code.indexOf("classification === 'out-of-scope'")
    const derived = code.indexOf("slot.kind === 'derived'")
    const empty = code.indexOf("state: 'empty'")

    assert.ok(narrative > 0 && profile > 0 && derived > 0 && empty > 0, 'all four branches are present')
    assert.ok(narrative < profile,
      '§0.4: a narrative slot never gaps REGARDLESS OF PROFILE, so the profile must not be consulted first')
    assert.ok(derived < empty,
      '§0.5: a derived slot never reports independently, so it must return before any emptiness is reachable')
  })

  /**
   * Increment 3 §1: *"Build it as a standalone module with no knowledge of
   * binders or schedules, or it gets built twice and the two drift."*
   *
   * The scan is the strongest available form — the evaluator imports NOTHING.
   * That guarantees the independence the spec asks for and the purity that makes
   * it exhaustively testable in one stroke, and it fails the moment somebody
   * reaches for a database handle or a schema type to save five lines.
   *
   * Two evaluators that disagree about whether a house has a well is not a bug
   * anyone finds quickly. It shows up as a shutoff nobody was asked about.
   */
  it('keeps the trigger evaluator standalone — it imports nothing at all', () => {
    const code = codeOf(join(serverSrc, 'audit', 'triggers.ts'))
    const imports = [...code.matchAll(/^\s*import\s.+$/gm)].map((m) => m[0].trim())
    assert.deepEqual(imports, [],
      'the evaluator serves binder slots AND the maintenance schedule; it may know about neither')
  })

  /**
   * §1's vocabulary lives in config, exactly as the field checklist's does.
   *
   * The same mechanism that makes pin-type invention structurally impossible: if
   * no flag id, item id or component type appears as a literal in the audit
   * path, then a config that adds one is supported the day it arrives and a
   * config that removes one stops being honoured without anyone editing code.
   */
  it('hardcodes no flag id, item id or component type in the audit engine', () => {
    // Config ids are dotted or hyphenated lowercase words: `property.well`,
    // `int.canvas`, `water-softener`. The namespaces themselves are this repo's
    // own grammar and are allowed.
    const NAMESPACES = /^(property|zone|pin|house|answer|always|any|all|not)$/

    /**
     * This repo's own domain vocabulary — code, not config.
     *
     * Bind states, profile classifications, slot kinds and refusal codes are
     * words the builder defines and switches on. They share a SHAPE with
     * component types (lowercase, hyphenated) and nothing else, so the scan
     * cannot tell them apart and the list is explicit instead.
     *
     * **Explicit is the point.** Adding a real component type here is a visible
     * line in a diff that a reviewer has to agree to, which is exactly the
     * friction wanted — the failure this guards against is a type getting
     * hardcoded quietly, not somebody arguing for one out loud.
     */
    const OURS = new Set([
      // bind states — src/audit/binding.ts
      'no-candidate', 'candidate-short', 'broken-binding', 'not-applicable', 'no-slot-wants-this-type',
      // profile classifications and slot kinds — src/audit/schema.ts
      'out-of-scope', 'present-when-populated', 'record-set',
      // slot and item states — src/audit/completeness.ts
      'n-a-narrative', 'not-applicable', 'confirmed-absent', 'not-found',
      // §1g.1 verification states — src/audit/provenance.ts
      'unknown-provenance',
      // Increment 4 §1b — the gap report's three columns, and the one gap
      // reason the builder names itself. `not-reached` is ours because an
      // unanswered item has no resolution record to carry a reason: there is
      // nothing to quote. Every OTHER reason in that stream is the config's own
      // na reason id, passed through verbatim and deliberately absent from here.
      'missing-from-you', 'missing-from-us', 'triggered-flags', 'not-reached',
      // Increment 4 §3 — why a gap's `since` is not a date. Ours because they
      // describe the state of THIS repo's record, not the house: a run that
      // reaches the earliest visit we hold, or an item whose import carries no
      // visit at all. Nothing in any config could ever declare either.
      //
      // Two of the four bases are here and two are not, and that is the scan's
      // reach rather than a distinction: `dated` and `undated` are single words
      // with no dot or hyphen, so this pattern cannot see them.
      'predates-record', 'no-visit',
      // Increment 3 §1f — the only `answer.*` comparison operator whose name is
      // a word rather than a symbol. Ours by construction: no config declares an
      // operator, and this one is spelled hyphenated to match the repo's own
      // vocabulary style rather than to dodge this scan.
      'not-in',
      // Increment 4 §1f — the manifest field that carries a recorded value,
      // OBSERVED on the first real walk rather than assumed. Not a config id:
      // no config declares it, and `answers.ts` reads it from the verbatim
      // `evidence` blob this repo stores.
      //
      // **The scan caught something real and this entry does not make it go
      // away.** A manifest key name inside `/audit` is adapter knowledge one
      // layer too high — it is there because `evidence` is stored verbatim by
      // doctrine 1 rather than parsed by the adapter. If `evidence` ever gains
      // an adapter shape, this literal moves there and comes out of this list.
      'evidence.value',
    ])

    const offenders: string[] = []
    for (const file of sourceFiles(join(serverSrc, 'audit'))) {
      // `sources.ts` is the seam between the schema's source vocabulary and
      // this repo's tables, and a mapping has to name both sides. It is
      // exempted BY NAME and alone — the failure worth preventing is that
      // knowledge being scattered across the engine, which is exactly what
      // pulling it into one file fixed.
      if (file.endsWith(join('audit', 'sources.ts'))) continue
      for (const m of codeOf(file).matchAll(/'([a-z]+[.-][a-z][a-z0-9-]*)'/g)) {
        const value = m[1]!
        const head = value.split(/[.-]/)[0]!
        if (NAMESPACES.test(head) && value.includes('.')) continue
        if (OURS.has(value)) continue
        // Refusal codes are namespaced on the module that raises them and are
        // this repo's own words by construction. `lineage` joined the list when
        // F10's reader landed — an extension of the stated exemption to a module
        // following the same convention, not a narrowing to make a scan pass.
        if (/^(schema|profile|binding|audit|lineage)\./.test(value)) continue
        offenders.push(`${file.replace(repoRoot, '')}: '${value}'`)
      }
    }
    assert.deepEqual(offenders, [], 'the config decides which items and types exist, not the builder')
  })

  it('lets nothing ask sharp to keep metadata on an image bound for a model', () => {
    // CLAUDE.md §14. The stripping is a library default, so the risk is not a
    // missing line — it is a future line that turns it off. Interior photographs
    // of a client's home can carry the coordinates of the home, and that is not
    // something to send anywhere by accident.
    const offenders = sourceFiles(join(serverSrc, 'ai')).filter((f) =>
      /\.(withMetadata|keepMetadata|keepExif|keepXmp|keepIccProfile)\s*\(/.test(codeOf(f)),
    )
    assert.deepEqual(offenders, [], 'an image sent to a model carries pixels and nothing else')
  })

  it('lets no AI path write a condition, grade, or adequacy field', () => {
    // CLAUDE.md §7 and §6 of the object model. The concierge identifies; a
    // licensed specialist assesses. An AI task that fills in "condition: poor"
    // would put an assessment in the record with nobody accountable for it.
    const offenders = sourceFiles(join(serverSrc, 'ai')).filter((f) =>
      /\b(condition|grade|adequacy|severity|rating)\s*[:=]/i.test(codeOf(f)),
    )
    assert.deepEqual(offenders, [], 'nothing in the AI layer may name a condition or grading field')
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

describe('doctrine 1 — the canonical shape is derived from the raw, never a replacement for it', () => {
  /**
   * The refactor that introduced the canonical shape is exactly when this could
   * have quietly stopped being true — by storing the normalized shape and
   * treating it as the record. These pin that it did not.
   */
  it('round-trips the raw manifest to a deep-equal object, not just a similar one', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const raw = readReference()
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw, dataDir: scratchDir() })
    const stored = db.prepare('SELECT raw_manifest FROM imports WHERE id = ?').get(importId) as {
      raw_manifest: string
    }
    assert.deepEqual(JSON.parse(stored.raw_manifest), JSON.parse(raw))
    assert.equal(stored.raw_manifest, raw, 'and byte-for-byte, not merely equivalent')
    db.close()
  })

  it('keeps a field the canonical shape does not model', async () => {
    // This is the sharp one. The canonical shape is deliberately lossy — it
    // models what the builder needs. That is only safe because the raw stays the
    // record. If normalization ever became the record, everything the shape does
    // not name would vanish silently.
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const parsed = JSON.parse(readReference())
    parsed.session.somethingTheBuilderHasNeverHeardOf = { weather: 'sleet', helper: 'Dana' }
    parsed.pins[0].futureFieldFromV4 = 'concern-uuid-here'
    const raw = JSON.stringify(parsed)

    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw, dataDir: scratchDir() })
    const stored = JSON.parse(
      (db.prepare('SELECT raw_manifest FROM imports WHERE id = ?').get(importId) as { raw_manifest: string })
        .raw_manifest,
    )
    assert.deepEqual(stored.session.somethingTheBuilderHasNeverHeardOf, { weather: 'sleet', helper: 'Dana' })
    assert.equal(stored.pins[0].futureFieldFromV4, 'concern-uuid-here')
    db.close()
  })

  it('never persists the canonical shape itself', () => {
    // No column holds it, and no code writes it. The normalized form is a
    // transient convenience between the file and the tables.
    const persist = codeOf(join(serverSrc, 'import', 'persist.ts'))
    assert.ok(!/JSON\.stringify\(\s*c\s*\)/.test(persist), 'the canonical object is never serialised whole')
    const migration = readFileSync(join(serverSrc, 'db', 'migrations', '001_initial.sql'), 'utf8')
    assert.ok(!/canonical/i.test(migration), 'no table exists to store it in')
  })

  it('reads the record of truth back out for anything the tables do not carry', async () => {
    // A measure resolution's numeric value has no column. It is not lost — it is
    // in the raw, which is what "record of truth" has to mean in practice.
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const parsed = JSON.parse(readReference())
    parsed.resolutions[0].resolution = { kind: 'satisfied', via: 'measure', value: 52, unit: 'psi' }
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: JSON.stringify(parsed), dataDir: scratchDir() })

    const stored = JSON.parse(
      (db.prepare('SELECT raw_manifest FROM imports WHERE id = ?').get(importId) as { raw_manifest: string })
        .raw_manifest,
    )
    assert.equal(stored.resolutions[0].resolution.value, 52)
    assert.equal(stored.resolutions[0].resolution.unit, 'psi')
    db.close()
  })
})

describe('doctrine — nothing stored is tied to this machine', () => {
  /**
   * A restore onto a different machine, a different user account, or a different
   * folder must not break every photo link. That is only true if paths are
   * stored relative and resolved at read time — and it is cheap to keep true
   * now, painful to retrofit once there are years of records.
   */
  it('stores every media and canvas path relative to the visit, never absolute', async () => {
    const db = freshDb()
    const dataDir = scratchDir()
    const ids = makePropertyAndVisit(db)
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir })

    const paths = [
      ...(db.prepare('SELECT file FROM media WHERE import_id = ? AND file IS NOT NULL').all(importId) as { file: string }[]),
      ...(db.prepare('SELECT file FROM canvases WHERE import_id = ? AND file IS NOT NULL').all(importId) as { file: string }[]),
    ].map((r) => r.file)

    assert.ok(paths.length > 0, 'sanity: there are paths to check')
    for (const p of paths) {
      assert.ok(!p.startsWith('/'), `"${p}" is absolute`)
      assert.ok(!/^[A-Za-z]:[\\/]/.test(p), `"${p}" is an absolute Windows path`)
      assert.ok(!p.includes(dataDir), `"${p}" embeds this machine's data directory`)
      assert.ok(p.startsWith('media/'), `"${p}" should be relative to the visit directory`)
    }
    db.close()
  })

  it('puts no machine-specific path in any stored column', async () => {
    const db = freshDb()
    const dataDir = scratchDir()
    const ids = makePropertyAndVisit(db)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir })

    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[])
      .map((t) => t.name)

    const offenders: string[] = []
    for (const table of tables) {
      const columns = (db.prepare('SELECT name FROM pragma_table_info(?)').all(table) as { name: string }[]).map((c) => c.name)
      for (const column of columns) {
        const rows = db.prepare(`SELECT "${column}" AS v FROM "${table}" WHERE "${column}" IS NOT NULL`).all() as { v: unknown }[]
        for (const row of rows) {
          if (typeof row.v === 'string' && row.v.includes(dataDir)) offenders.push(`${table}.${column}`)
        }
      }
    }
    assert.deepEqual([...new Set(offenders)], [], 'the database must survive being restored somewhere else')
    db.close()
  })

  it('resolves the data root at runtime rather than storing it', () => {
    const dbModule = codeOf(join(serverSrc, 'db', 'index.ts'))
    assert.match(dbModule, /process\.env\.HOUSESTEADY_DATA/, 'the location is configurable, not baked in')
  })
})

describe('doctrine 14 — a committed fixture never carries a location', () => {
  /**
   * CLAUDE.md §14. `/data` is gitignored and holds real houses; `/fixtures` is
   * committed and holds the owner's own equipment. That distinction only holds
   * while a committed photograph carries no coordinates — a fixture with real
   * GPS in it publishes the address of the house it was taken in, permanently
   * and in the git history, where deleting the file does not remove it.
   *
   * This was theoretical until 2026-07-28. The first fifteen nameplate
   * photographs carried no GPS block at all; the two that closed the
   * whole-image abstention path carry one, zeroed — longitude 0°0'0"E, no
   * latitude, which is what a phone writes with location services off. Zeroed
   * today and real the first time somebody photographs a plate with location on.
   *
   * Transmission is already safe and separately tested: `prepareImage` strips
   * everything before an image reaches a model. This is the other half — what
   * is safe to *keep*.
   */
  const rational = (buf: Buffer, off: number, le: boolean): number => {
    const num = le ? buf.readUInt32LE(off) : buf.readUInt32BE(off)
    const den = le ? buf.readUInt32LE(off + 4) : buf.readUInt32BE(off + 4)
    return den === 0 ? 0 : num / den
  }

  /** Latitude and longitude out of an EXIF block, or null where there are none. */
  const coordinates = (exif: Buffer): { lat: number; lon: number } | null => {
    // sharp hands back the TIFF block with an "Exif\0\0" header in front of it.
    const start = exif.subarray(0, 6).toString('latin1') === 'Exif\0\0' ? 6 : 0
    const tiff = exif.subarray(start)
    if (tiff.length < 8) return null
    const le = tiff.subarray(0, 2).toString('latin1') === 'II'
    const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o))
    const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o))

    const walk = (ifd: number, want: number): number | undefined => {
      if (ifd + 2 > tiff.length) return undefined
      const n = u16(ifd)
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12
        if (e + 12 > tiff.length) return undefined
        if (u16(e) === want) return u32(e + 8)
      }
      return undefined
    }

    const gpsIfd = walk(u32(4), 0x8825)
    if (gpsIfd === undefined || gpsIfd + 2 > tiff.length) return null

    // Degrees, minutes, seconds — three rationals, twenty-four bytes.
    const dms = (tag: number): number => {
      const at = walk(gpsIfd, tag)
      if (at === undefined || at + 24 > tiff.length) return 0
      return rational(tiff, at, le) + rational(tiff, at + 8, le) / 60 + rational(tiff, at + 16, le) / 3600
    }
    return { lat: dms(2), lon: dms(4) }
  }

  it('carries no real coordinates in any committed fixture photograph', async () => {
    const sharp = (await import('sharp')).default
    const roots = [join(repoRoot, 'fixtures')]
    const photos: string[] = []
    const walk = (d: string) => {
      for (const entry of readdirSync(d)) {
        const full = join(d, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(jpe?g|png|heic|webp)$/i.test(entry)) photos.push(full)
      }
    }
    for (const r of roots) walk(r)
    assert.ok(photos.length > 15, 'sanity: the fixture photographs were found')

    const located: string[] = []
    for (const file of photos) {
      const { exif } = await sharp(file).metadata()
      if (!exif) continue
      const c = coordinates(exif)
      // Zero is what a phone writes with location services off. A real
      // coordinate anywhere on earth is non-zero in at least one axis.
      if (c && (Math.abs(c.lat) > 0.0001 || Math.abs(c.lon) > 0.0001)) {
        located.push(`${file.replace(repoRoot, '')} (${c.lat.toFixed(4)}, ${c.lon.toFixed(4)})`)
      }
    }
    assert.deepEqual(
      located, [],
      'a committed photograph carrying coordinates publishes the address of the house it was taken in, ' +
        'and git history keeps it after the file is deleted. Strip it before committing, or leave it in /data.',
    )
  })
})

describe('doctrine — the checklist master is reference, never an input', () => {
  /**
   * `/docs/reference/` holds the field app's Checklist Master. It is here so a
   * person authoring the schema can check a name against the authority, and so
   * the cross-check in the findings note can be run by hand. **Nothing in the
   * builder may parse it at runtime**, and the reason is the self-contained
   * doctrine: every import carries its own config snapshot, so component-name
   * validation happens per import against that import's snapshot and fails open.
   *
   * A checked-in master would be a second authority that goes stale between
   * field releases and produces confident wrong answers — which is not
   * hypothetical. Running that check by hand against a two-versions-stale
   * config produced two false positives in one sitting, because `septic-alarm`
   * was absent from the 48-type list only by being newer than it.
   */
  it('is not read by any code path', () => {
    const offenders = sourceFiles(serverSrc)
      .concat(sourceFiles(join(repoRoot, 'web', 'src')))
      .filter((f) => /docs\/reference|Checklist-Master/i.test(codeOf(f)))
      .map((f) => f.replace(repoRoot, ''))
    assert.deepEqual(offenders, [],
      'the master is authoring reference; the runtime authority is each import\'s own config snapshot')
  })

  it('is present, so the cross-check can be run by hand', () => {
    const master = join(repoRoot, 'docs', 'reference', 'HouseSteady_Checklist-Master_v1-11.md')
    assert.ok(statSync(master).isFile(), 'the authority the schema files are reconciled against')
  })
})

describe('Amendment 6 §A — the class frame reaches the field app only as a component type', () => {
  /**
   * **The field checklist is what the concierge is asked to do at the visit; the
   * class frame's inspection points are what the binder expects to know.** A
   * class seeds a pin's *component type*, and the type brings whatever the field
   * config declares. Nothing about a class's own points crosses the wire.
   *
   * Two reasons, and the second is why this is a scan rather than a comment.
   * Generating checklist items from points would put the eight
   * `requires-access-event` points on a visit list as work the concierge cannot
   * do — the failure Amendment 5 exists to prevent. **And it would make
   * `checkComponentTypes` idle from birth**, because §1a is strong only while the
   * class list and the field config are maintained separately and can disagree.
   * *A check whose two sides cannot disagree has not been passing*, and the
   * change that destroyed it would have looked like tidying.
   *
   * **What this scan can and cannot claim.** `engine/classFrame.ts` has no
   * consumers yet, so a scan over its consumers would match nothing and report
   * green forever — writing that would be the exact error Amendment 6 ratifies.
   * What exists today is the session plan, which is the real wire to the field
   * app. So the assertion is narrow and true: **the plan path does not read the
   * frame.** It fires the moment somebody wires them together, which is the
   * moment worth catching.
   */
  const planPath = join(serverSrc, 'plan')

  /** Extracted so the negative test can run it over a file that does offend. */
  const readsTheFrame = (source: string): boolean =>
    /from\s+['"][^'"]*engine\/classFrame(\.js)?['"]/.test(source) || /\breadClassFrame\b/.test(source)

  it('has a plan path to scan, so this is not vacuous', () => {
    // §9b. The whole scan rests on these files existing.
    const files = sourceFiles(planPath)
    assert.ok(files.length > 0, 'the session plan is the wire this scan is about')
    assert.ok(files.some((f) => /sessionPlan/.test(f)), 'and it is the file that composes the export')
  })

  it('composes the session plan without reading the class frame', () => {
    const offenders = sourceFiles(planPath)
      .filter((f) => readsTheFrame(codeOf(f)))
      .map((f) => f.replace(repoRoot, ''))
    assert.deepEqual(offenders, [],
      'a class seeds a component type and the field config supplies the items; points do not travel')
  })

  it('catches the wiring when there is some, proved on constructed source', () => {
    // §9b again — negative-tested where it is written, because the shipped files
    // pass and a scan nothing can fail is a scan nobody has run.
    assert.equal(readsTheFrame(`import { readClassFrame } from '../engine/classFrame.js'`), true)
    assert.equal(readsTheFrame(`const f = readClassFrame()`), true)
    assert.equal(readsTheFrame(`import { componentGraph } from '../audit/components.js'`), false)
  })
})

describe('Amendment 6 §E — a care category and an access event may share an id', () => {
  /**
   * `chimney-sweep` is both, and that is an identity rather than a collision:
   * sweeping the chimney is the care task and is what opens the flue. **The two
   * are separate namespaces and are not required to align in either direction.**
   *
   * Recorded as a test because the amendment's own reason for recording it is
   * that a later author would tidy the inconsistency into false precision — and
   * a rule forcing them to match would invent a care item for every trade visit,
   * while one forbidding the match would split a single act in two.
   */
  const frame = (): { careCategories: { id: string }[]; inspectionPoints: { accessEvent?: string }[] } =>
    JSON.parse(readFileSync(join(repoRoot, 'schema', 'class-frame-v1.json'), 'utf8'))

  it('carries all three relationships, so neither alignment rule can be inferred', () => {
    const f = frame()
    const care = new Set(f.careCategories.map((c) => c.id))
    const events = new Set(f.inspectionPoints.flatMap((p) => (p.accessEvent ? [p.accessEvent] : [])))

    assert.ok([...events].some((e) => care.has(e)),
      'at least one event IS a care category — the same act being work and occasion')
    assert.ok([...events].some((e) => !care.has(e)),
      'at least one event is nobody’s care item — somebody else’s trade visit')
    assert.ok([...care].some((c) => !events.has(c)),
      'and most care categories gate nothing')
  })

  it('says so in the file, where the author who would tidy it is reading', () => {
    const raw = JSON.parse(
      readFileSync(join(repoRoot, 'schema', 'class-frame-v1.json'), 'utf8'),
    ) as Record<string, unknown>
    const note = JSON.stringify(raw.anEventMayShareAnIdWithACareCategory)
    assert.match(note, /identity rather than a collision/)
    assert.match(note, /NOT required to align in either direction/)
    assert.match(note, /invent a care item for every trade visit/)
  })
})

describe('rule 13 — a worked example never collides with the data it explains', () => {
  /**
   * Three schema files carry a worked example beside the array it explains:
   * `class-frame-v1.json`, `owner-question-wording-v1.json`,
   * `retirement-lineage-v1.json`. All three ship the example outside the array so
   * nothing iterating treats it as declared.
   *
   * **That property was asserted twice by hand and neither assertion checked
   * it.** Both bodies read `assert.deepEqual(file.theArray, [])` — which is
   * *the array is empty*, a different fact that happened to be true while every
   * one of these files shipped empty. The day the class frame gained 32 classes
   * the assertion failed, and it failed for the wrong reason: not because an
   * example had leaked, but because content had arrived. Rule 12, and rule 13
   * says a fix for a class of wording is tested on the class.
   *
   * The real property, and it holds whether the array has nothing in it or
   * everything: **no id inside an example block is also an id in the file's own
   * data.** It is what would have caught the actual collision — a worked class
   * keyed `septic-tank` sitting beside a real class of the same name, carrying a
   * superseded answer to a question the file had already resolved.
   *
   * Two files still ship empty and cannot collide today. That is the point of
   * scanning the class rather than the instance: the guard is in place before
   * their content lands, not written again afterwards from the same lesson.
   */
  const exampleKey = (k: string): boolean => /worked|example/i.test(k)

  /** Every `id` at any depth. An example nests; ids can be anywhere in it. */
  const idsWithin = (v: unknown, out: Set<string> = new Set()): Set<string> => {
    if (Array.isArray(v)) for (const x of v) idsWithin(x, out)
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (k === 'id' && typeof x === 'string') out.add(x)
        else idsWithin(x, out)
      }
    }
    return out
  }

  const schemaFiles = (): { path: string; file: Record<string, unknown> }[] =>
    allFiles(join(repoRoot, 'schema'))
      .filter((p) => p.endsWith('.json'))
      .map((path) => ({ path, file: JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> }))

  it('finds the example blocks, so this scan is not vacuous', () => {
    // §9b. A scan that silently matches nothing reports green forever.
    const carrying = schemaFiles().filter((s) => Object.keys(s.file).some(exampleKey))
    assert.ok(carrying.length >= 3, `only ${carrying.length} schema files carry an example`)
  })

  it('keeps every example’s ids out of the arrays it sits beside', () => {
    const offenders: string[] = []
    for (const { path, file } of schemaFiles()) {
      const declared = new Set(
        Object.entries(file).flatMap(([k, v]) =>
          exampleKey(k) || !Array.isArray(v)
            ? []
            : v.flatMap((e) => (e && typeof e === 'object' && typeof (e as { id?: unknown }).id === 'string'
                ? [(e as { id: string }).id]
                : []))))
      for (const [k, v] of Object.entries(file)) {
        if (!exampleKey(k)) continue
        for (const id of idsWithin(v)) {
          if (declared.has(id)) offenders.push(`${path.replace(repoRoot, '')} · ${k} uses the declared id \`${id}\``)
        }
      }
    }
    assert.deepEqual(offenders, [],
      'an example sharing an id with real data is a second answer to the same question, and the stale one wins by being read first')
  })

  it('catches a collision when there is one, proved on a constructed file', () => {
    // §9b again — negative-tested where it is written, because the shipped files
    // pass and a scan nothing can fail is a scan nobody has run.
    const file = {
      classes: [{ id: 'septic-tank', label: 'Septic tank' }],
      workedClass: { shape: { id: 'septic-tank', componentType: 'none' } },
    }
    const declared = new Set(file.classes.map((c) => c.id))
    assert.deepEqual([...idsWithin(file.workedClass)].filter((id) => declared.has(id)), ['septic-tank'])
  })
})

/**
 * Increment 4 §8 — the five scans the spec asks for, plus the two the build
 * turned out to need.
 *
 * Design's own words: *"doctrine scans are the durable half, and the highest-
 * leverage request available."* These encode §2's composer boundary and §2b's
 * label rules as properties of the code's shape, so a later change that produces
 * a correct-looking gap report by the wrong mechanism still fails here.
 */
describe('Increment 4 §8 — the client-facing boundary', () => {
  const reportDir = join(serverSrc, 'report')
  const reportFiles = (): string[] => sourceFiles(reportDir)

  /**
   * §2a — *"no client-facing string is derived by transforming an internal
   * composed sentence."*
   *
   * The spec left the mechanism to Code and named the outcome. This is the
   * mechanism: the client-facing directory may not reach the internal composer
   * at all. Not by import, not by name.
   *
   * A lint over the internal sentence would satisfy any behavioural test — the
   * output would read fine — while being exactly the information destruction the
   * dash lesson names, one layer out and landing in a client's document.
   */
  it('never lets a client-facing composer reach the internal one', () => {
    const offenders: string[] = []
    for (const file of reportFiles()) {
      const code = codeOf(file)
      for (const banned of ['sentenceOf', 'describeProvenance', 'shortBecause']) {
        if (new RegExp(`\\b${banned}\\b`).test(code)) {
          offenders.push(`${file.replace(repoRoot, '')}: reaches ${banned}`)
        }
      }
    }
    assert.deepEqual(offenders, [],
      'the client composer reads structured parts; un-composing an internal sentence is guessing at a boundary that was never ambiguous')
  })

  /**
   * §2b — *"no client-facing render path can reach an item id, an na reason id,
   * or a provenance state name."*
   *
   * The values, not the type names. `Verification` as a type is fine; the string
   * `'unknown-provenance'` reaching a sentence a homeowner reads is the failure —
   * and on any export predating config v1.9 that is EVERY transcribed value, so
   * this is the normal path rather than a rare one.
   */
  it('never lets internal vocabulary into a client-facing string', () => {
    const BANNED = [
      'unknown-provenance', 'unverifiable', 'none-present', 'no-access',
      'not-applicable', 'candidate-short', 'broken-binding', 'feedsGapList',
    ]
    const offenders: string[] = []
    for (const file of reportFiles()) {
      /**
       * `render.ts` is exempt BY NAME, alone, and covered another way.
       *
       * Its `document()` builds the page from a multi-line template literal with
       * template literals nested inside its interpolations. **A regex cannot
       * tokenise that** — quote pairing goes wrong at the first nested backtick
       * and the scanner reports function bodies as string contents, which is
       * what it did.
       *
       * Rule 8 says read the finding rather than narrow the check. The finding
       * here is about the scanner, not the code: there is no way to answer this
       * question with a regex, so the honest move is to answer it somewhere that
       * can. **`render.test.ts` asserts the RENDERED BODY carries no item id, no
       * na reason and no operator id** — a stronger check than this one, because
       * it reads output rather than source.
       *
       * The assertion below keeps the exemption honest: if that behavioural
       * check ever disappears, this fails rather than quietly covering nothing.
       */
      if (file.endsWith(join('report', 'render.ts'))) continue

      const code = codeOf(file)
      /**
       * ONE left-to-right pass over string literals, and both checks ride on it.
       *
       * **A second, independent regex for item ids got this wrong**, and wrongly
       * in the way this repo keeps relearning: given
       * `i.text === 'string' && i.text.trim() !== ''`, a pattern that opens on a
       * quote can open on the CLOSING quote of `'string'` and close on the first
       * quote of `''`, making ` && i.text.trim() !== ` look like a quoted string
       * containing an item id. Only a scan that consumes each literal whole,
       * in order, pairs quotes correctly.
       *
       * **And the escape has to be part of the pattern.** `'not the client\'s'`
       * ends at the escaped apostrophe under a naive class, and every literal
       * after it in the file is paired one position out. Same failure as §1g.2's
       * escaped pipes in the master table and the dash inside a composed label —
       * third instance now, and always the same shape: a delimiter that also
       * occurs inside the data, un-escaped by a reader that did not know it was
       * escaped.
       */
      for (const m of code.matchAll(/`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g)) {
        const literal = m[0]!
        const inner = literal.slice(1, -1)
        /**
         * Is this PROSE, or is it a key?
         *
         * A bare enum literal is a comparison; one embedded in a sentence is
         * prose headed for a page a client reads. The first version tested the
         * raw source for whitespace — and a map key like
         * `${'${'}row.reason}\u0000${'${'}where ?? ''}` has whitespace inside its
         * EXPRESSIONS, so it read as prose and got reported as a client sentence.
         *
         * So: strip the interpolations first, then require two actual words in
         * what is left. A key strips to a separator and stops being prose; a
         * sentence strips to a sentence.
         */
        const stripped = inner.replace(/\$\{[^}]*\}/g, ' ')
        if (!/[A-Za-z]\s+[A-Za-z]/.test(stripped)) continue
        for (const word of BANNED) {
          if (inner.includes(word)) offenders.push(`${file.replace(repoRoot, '')}: ${literal.slice(0, 70)}`)
        }
        /**
         * Two checks, because a template literal holds two different things.
         *
         * **The literal text** may contain a hardcoded item id — that is the
         * original failure. **An interpolation** may inject one at runtime, and
         * that is a different question the same pattern cannot answer: `${'${'}item.name}`
         * is a ratified client name and `${'${'}zone.type}` is config vocabulary, and
         * they are identical in shape.
         *
         * The first version tested the raw source of both together, so every
         * template interpolating any property tripped it. Rule 8 says read the
         * finding before narrowing the check — and reading it the FIRST time
         * found a zone type reaching a client sentence. Reading it the second
         * time found this: the check was conflating two questions. So it now
         * asks both, separately and precisely.
         */
        if (/\b[a-z]{2,4}\.[a-z][a-z-]+\b/.test(stripped)) {
          offenders.push(`${file.replace(repoRoot, '')}: item id in prose — ${inner.slice(0, 70)}`)
        }
        for (const m of inner.matchAll(/\$\{([^}]*)\}/g)) {
          const expr = m[1]!.trim()
          // Fields that carry internal vocabulary by construction. A client
          // sentence interpolating any of these is §2b's failure at runtime,
          // which no literal-text check can see.
          if (/\.(itemId|item_id|reason|naReasonId|na_reason_id|scopeKind|scope_kind|componentType|component_type|type|rowKey|origin|status)$/.test(expr)) {
            offenders.push(`${file.replace(repoRoot, '')}: interpolates ${expr} into prose — ${inner.slice(0, 60)}`)
          }
        }
      }
    }
    assert.deepEqual(offenders, [],
      'a homeowner learns nothing from an item id except that we discuss their house in a language they do not speak')

    // The cover for render.ts's exemption. An exemption whose replacement check
    // has quietly gone is an exemption covering nothing.
    const renderTest = readFileSync(join(repoRoot, 'server', 'test', 'render.test.ts'), 'utf8')
    assert.match(renderTest, /puts no item id, na reason or operator id into the document/,
      'render.ts is exempt from the source scan because it is covered by a check on its output')
  })

  /**
   * §1b — *"the gap report reads `feedsGapList` from an import's config snapshot,
   * never from a literal."*
   *
   * The config decides, not the builder — CLAUDE.md §5, and this is the fourth
   * place that rule has bitten. Two reasons carry it today and the field app will
   * add more; a hardcoded list makes every one of those silently mishandled by
   * code nobody thought to update.
   */
  it('never hardcodes which na reasons feed the gap list', () => {
    const DECLARED_TODAY = ['no-access', 'deferred']
    const offenders: string[] = []
    for (const file of sourceFiles(join(serverSrc, 'audit')).concat(reportFiles())) {
      const code = codeOf(file)
      // A list of reason ids sitting in an array is the shape this forbids —
      // `['no-access', 'deferred']` — regardless of what it is called.
      for (const m of code.matchAll(/\[[^\]]*\]/g)) {
        const inside = m[0]!
        const hits = DECLARED_TODAY.filter((r) => inside.includes(`'${r}'`))
        if (hits.length > 1) offenders.push(`${file.replace(repoRoot, '')}: ${inside.slice(0, 60)}`)
      }
    }
    assert.deepEqual(offenders, [],
      'membership comes from the boolean the config declares; a builder-side list goes stale the next time the field app ships')
  })

  /**
   * §2b — *"no gap row carries a positive honesty label."*
   *
   * `observed`, `measured`, `documented`, `reported-by-homeowner` and `inferred`
   * are assertions about the house. **A gap report asserts nothing about the
   * house** — it says what we do not yet know, and a positive label on an absence
   * is an overclaim in the one artifact where overclaiming is the cardinal sin.
   */
  it('never lets a positive honesty label onto a gap row', () => {
    const POSITIVE = ['observed', 'measured', 'documented', 'reported-by-homeowner', 'inferred']
    const offenders: string[] = []
    for (const file of reportFiles()) {
      const code = codeOf(file)
      for (const m of code.matchAll(/label\s*[:=]\s*'([a-z-]+)'/g)) {
        if (POSITIVE.includes(m[1]!)) offenders.push(`${file.replace(repoRoot, '')}: assigns '${m[1]}'`)
      }
    }
    assert.deepEqual(offenders, [],
      'a gap report says what we do not know; only not-accessible and not-inspected can say that')

    // And the type itself is closed, which is the exception to fail-open and is
    // deliberate: an unknown word is still a word everywhere else, but a label
    // that reaches a client asserts something nobody reviewed.
    const source = readFileSync(join(reportDir, 'clientVoice.ts'), 'utf8')
    assert.match(source, /export type GapLabel = 'not-accessible' \| 'not-inspected'/)
  })

  /**
   * §1b again, from the storage side: the two gap streams stay two.
   *
   * Increment 3's causes describe why a BINDER SLOT is short. §1b's describe why
   * a CHECKLIST ITEM has no answer. Collapsing them is the modelling mistake
   * CLAUDE.md §5 names as the most damaging available here, and the tables are
   * where it would happen first.
   */
  it('keeps the field-checklist gap stream out of audit_slots', () => {
    const migrations = readdirSync(join(serverSrc, 'db', 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(serverSrc, 'db', 'migrations', f), 'utf8'))
      .join('\n')

    assert.match(migrations, /CREATE TABLE audit_carried_items/,
      'the checklist stream has its own table')
    const slotsTable = migrations.slice(migrations.indexOf('CREATE TABLE audit_slots'))
      .slice(0, migrations.slice(migrations.indexOf('CREATE TABLE audit_slots')).indexOf(');'))
    assert.ok(!/na_reason_id|scope_pin_id/.test(slotsTable),
      'a checklist item\'s scope has no business on a binder slot — that is the two streams collapsing')
  })

  /**
   * §3c — the active item set's origin travels per item.
   *
   * Same shape as §1g.1's refusal to return a bare count. A property with a v3
   * baseline and a v4 monthly holds both origins at once — the ordinary case from
   * v4 onward — and a single field on the set would have to lie about one half.
   */
  it('keeps the active-set origin on the item rather than on the set', () => {
    const code = readFileSync(join(serverSrc, 'audit', 'activeItems.ts'), 'utf8')
    assert.match(code, /interface ActiveItem\b[\s\S]*?origin: Origin/,
      'each item knows where its claim came from')
    assert.match(code, /origins: \{ received: number; computed: number \}/,
      'and the set reports the breakdown, never one word for a mixed set')
  })

  /**
   * Amendment 1 §C — the client-facing name never comes from the field config.
   *
   * **This scan exists because the mistake it forbids was shipped and measured.**
   * An earlier `describeFromConfig` read each checklist item's `text` as its
   * client-facing name. Every one of the 266 items in the reference config has
   * one, so the withholding rule never fired — and the strings are instructions
   * written for a concierge standing in the room:
   *
   * > Windows operated, locked, latched; seal-fog noted — pin defects
   *
   * Four contain the word *issue*, which House Style §7 bans outright.
   * Thirty-four use *pin* as a verb. Two carry markdown asterisks.
   *
   * **The general shape is what makes it worth a scan rather than a test.** A
   * fallback whose input is always present is not a fallback — it is the only
   * path, and it never announces itself. A behavioural test would have read
   * green throughout.
   */
  it('never lets the client-facing name come from the field config', () => {
    const CONFIG_KEYS = ['baseLists', 'zoneLists', 'componentLists', 'sessionItems', 'snapshot']
    const offenders: string[] = []
    for (const file of reportFiles()) {
      const code = codeOf(file)
      for (const key of CONFIG_KEYS) {
        if (new RegExp(`\\b${key}\\b`).test(code)) {
          offenders.push(`${file.replace(repoRoot, '')}: reads ${key}`)
        }
      }
    }
    assert.deepEqual(offenders, [],
      'the config\'s item text is an instruction for the concierge; a name for a client is a different thing a human writes')
  })

  /**
   * And the names table stays a table — never generated, never derived.
   *
   * §9's third guard, one artifact over: a suggestion sitting in the input box
   * makes acceptance the default and rejection work. A generated name in this
   * file would be ratified by the first person who did not look.
   */
  it('keeps the client-name table declarative', () => {
    const raw = readFileSync(join(repoRoot, 'schema', 'client-names-v1.json'), 'utf8')
    const table = JSON.parse(raw) as { names?: Record<string, unknown>; version?: string }
    assert.equal(typeof table.version, 'string', 'versioned like every other config file here')
    assert.ok(table.names && typeof table.names === 'object', 'a plain map, so a human can read what a client will')

    // The FILENAME, not the words. `/api/client-names` is a route path and a
    // scan matching the substring reports the API surface as a second reader of
    // the config file — which is how the first version of this failed.
    const offenders = sourceFiles(serverSrc)
      .filter((f) => !f.endsWith(join('report', 'names.ts')))
      .filter((f) => /client-names-v1\.json/.test(codeOf(f)))
      .map((f) => f.replace(repoRoot, ''))
    assert.deepEqual(offenders, [], 'one loader reads the file; nothing else opens it')
  })

  /**
   * §3c — no v4 adapter is registered, and that is load-bearing.
   *
   * A partial v4 adapter would make the import path ACCEPT a real v4 export and
   * silently drop everything v4 adds beyond `activeItems[]` — concerns as
   * entities above all. The refusal message is correct today and must stay
   * correct until v4 is actually built.
   */
  it('does not claim to read a manifest version it cannot read', () => {
    const registry = readFileSync(join(serverSrc, 'import', 'adapters', 'index.ts'), 'utf8')
    /**
     * The ARRAY LITERAL, not the file and not the declaration.
     *
     * The `Adapter` interface declares `version: number` and `adapterFor` takes
     * `version: unknown`, so a scan over the whole file reads three registered
     * adapters. And slicing from `const ADAPTERS` to the first `]` ends inside
     * `Adapter[]` on the declaration line itself, which reads zero. **Both
     * failures are the same one:** a boundary re-derived by looking for a
     * character that also occurs inside the data. So: open at the assignment,
     * close at the line that closes it.
     */
    const start = registry.indexOf('const ADAPTERS')
    const open = registry.indexOf('= [', start)
    const close = registry.indexOf('\n]', open)
    assert.ok(start >= 0 && open > start && close > open, 'the adapter registry is still an array literal')
    const versions = [...registry.slice(open, close).matchAll(/version:\s*(\w+)/g)].map((m) => m[1])
    assert.deepEqual(versions, ['V3'],
      'accepting a v4 export with a v3-shaped adapter loses everything v4 added, silently')
  })
})

describe('Increment 4 §5 — the editor, and the brand it renders under', () => {
  /**
   * §5 — *"editing wording does not edit evidence."*
   *
   * A reworded row is an overlay over the composed sentence, never a change to
   * `{ what, why }`. §2's boundary has to hold through the editor as well as
   * through the render, and the structural form of that is: nothing that writes
   * an editorial decision may write to the table the parts live in.
   */
  it('gives the editor no write path into a carried item', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(join(serverSrc, 'report'))) {
      const code = codeOf(file)
      for (const forbidden of ['UPDATE audit_carried_items', 'DELETE FROM audit_carried_items',
        'UPDATE audit_slots', 'INSERT INTO audit_carried_items']) {
        if (code.includes(forbidden)) offenders.push(`${file.replace(repoRoot, '')}: ${forbidden}`)
      }
    }
    assert.deepEqual(offenders, [],
      'a rewording is a layer over the sentence; the parts stay as the producer wrote them')
  })

  /** Append-only, like every other decision log here. A correction adds a layer. */
  it('never updates or deletes an editorial decision', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(serverSrc)) {
      const code = codeOf(file)
      for (const table of ['report_row_edits', 'client_names']) {
        if (new RegExp(`UPDATE\\s+${table}\\b`, 'i').test(code)) offenders.push(`UPDATE ${table} in ${file.replace(repoRoot, '')}`)
        if (new RegExp(`DELETE\\s+FROM\\s+${table}\\b`, 'i').test(code)) offenders.push(`DELETE ${table} in ${file.replace(repoRoot, '')}`)
      }
    }
    assert.deepEqual(offenders, [],
      '"why does this report not mention the attic" has to stay answerable, which a deleted row cannot do')
  })

  /**
   * The ratification gate, structurally.
   *
   * A name written inline goes into a COMPANY-WIDE table, so one person's
   * wording becomes everyone's. The gate is that nothing on the writing path can
   * set `ratified_at` — the person confirming a name is deliberately not the
   * person at the editor, and a route that could do both would collapse them.
   */
  it('lets nothing on the write path ratify a name', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(serverSrc)) {
      const code = codeOf(file)
      // Any INSERT or UPDATE putting a non-NULL value into ratified_at.
      for (const m of code.matchAll(/ratified_at\s*=\s*([^\s,)]+)/g)) {
        if (m[1] !== 'NULL') offenders.push(`${file.replace(repoRoot, '')}: sets ratified_at = ${m[1]}`)
      }
    }
    assert.deepEqual(offenders, [],
      'written, usable, and marked until the design session confirms it — the same gate as the golden set')

    const names = readFileSync(join(serverSrc, 'report', 'names.ts'), 'utf8')
    const insert = names.slice(names.indexOf('INSERT INTO client_names'))
    assert.match(insert.slice(0, 400), /NULL, NULL/, 'the insert hardcodes both ratification columns to NULL')
  })

  /**
   * The media affordance is an affordance, not a filter.
   *
   * **This is the mitigation that let the field side decline per-item evidence
   * capture**, and it only works if a person sees every row. A water-heater pin
   * with a wide shot and a nameplate but no drain-pan photo must still speak up
   * about the drain pan — which is the row that most needed saying.
   */
  it('never filters a report row on whether its pin has media', () => {
    const draft = codeOf(join(serverSrc, 'report', 'draft.ts'))
    // A filter would look like a media count deciding whether a row survives.
    for (const shape of [/\.filter\([^)]*media/, /if\s*\([^)]*media[^)]*\)\s*continue/, /media[^\n]*\?\s*rows\.push/]) {
      assert.ok(!shape.test(draft),
        'presence of media says nothing about whether THIS item was captured; gating on it silences the row that mattered')
    }
  })

  /**
   * Brand Guide §04 — *"Redraw, retype, or approximate the mark — the vial and
   * geometry reproduce from asset files only."*
   *
   * **A rule nobody can check by looking at a rendered page.** A mark 3% off is a
   * mark that looks right. So the delivered files are checksummed and the scan
   * asserts they are byte-identical to what was delivered — because the way an
   * approximation gets in is not somebody deciding to make one, it is somebody
   * editing a file in place.
   *
   * Same class of failure as the approximated name, and invisible in the same way.
   */
  it('keeps every brand asset byte-identical to what was delivered', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'brand', 'assets.json'), 'utf8')) as {
      source: { file: string; sha256: string }
      files: Record<string, string>
    }

    const zip = readFileSync(join(repoRoot, 'brand', manifest.source.file))
    assert.equal(createHash('sha256').update(zip).digest('hex'), manifest.source.sha256,
      'the delivered archive is the evidence; a changed one means the extracted files cannot be trusted')

    const mismatches: string[] = []
    for (const [rel, expected] of Object.entries(manifest.files)) {
      const bytes = readFileSync(join(repoRoot, 'brand', rel))
      const got = createHash('sha256').update(bytes).digest('hex')
      if (got !== expected) mismatches.push(rel)
    }
    assert.deepEqual(mismatches, [], 'an asset edited in place is how an approximated mark ships')
    assert.ok(Object.keys(manifest.files).length >= 15, 'every delivered file is accounted for')
  })

  /**
   * And nothing draws its own mark.
   *
   * The vector master is inlined from `assets/svg/housesteady-mark.svg` or there
   * is no mark. An `<svg>` with a `<path>` in a render path is somebody
   * reproducing the geometry by hand, which §04's first line forbids by name.
   */
  it('lets no render path draw a mark of its own', () => {
    const offenders: string[] = []
    const roots = [serverSrc, join(repoRoot, 'web', 'src')]
    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const code = codeOf(file)
        // A path element with real geometry in it. The brand mark is the only
        // thing in this product shaped like that.
        if (/<path\s[^>]*\bd=["'][Mm]\s*[\d.]/.test(code)) {
          offenders.push(`${file.replace(repoRoot, '')}: draws vector geometry`)
        }
      }
    }
    assert.deepEqual(offenders, [],
      'the mark reproduces from asset files only — a redrawn one looks right and is wrong')
  })

  /** The palette is one set of values, and the render does not invent a sixth. */
  it('keeps the render palette to what the brand guide declares', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'brand', 'assets.json'), 'utf8')) as {
      palette: Record<string, string>
    }
    const declared = new Set(
      Object.entries(manifest.palette)
        .filter(([k]) => k !== 'note')
        .map(([, v]) => v.toUpperCase()),
    )
    assert.ok(declared.has('#15223B') && declared.has('#BE8A3D'),
      'navy and brass are the two the guide names first')
    assert.equal(declared.size, 5, 'five colours, and a sixth is a brand decision rather than a code one')
  })
})

describe('Increment 4 §8 — nothing renders client-facing without a signature', () => {
  /**
   * **Scan five, and it is a shape rather than a behaviour.**
   *
   * §0.1: *"the signature is the render gate, not a step after it."* A
   * behavioural test can only check that today's call sites pass a signer. The
   * structural claim is stronger and is what this asserts: **there is exactly
   * one function in this repo that produces client-facing HTML, and it takes a
   * signer as a required argument.**
   *
   * Not `render()` with a `signed` flag — a flag can be passed wrong. Not
   * `render()` beside `sign()` — two functions can be called in the wrong order,
   * and the wrong order is the one that ships an unsigned document.
   */
  it('lets exactly one function compose client-facing HTML, and it requires a signer', () => {
    const render = readFileSync(join(serverSrc, 'report', 'render.ts'), 'utf8')

    // The document function is private; only signEdition is exported from it.
    const exported = [...render.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1])
    assert.deepEqual(exported.sort(), ['editionHtml', 'editions', 'signEdition'],
      'signEdition composes; the other two read back what it stored')

    // And it cannot be called without somebody putting their name to it.
    const signature = render.slice(render.indexOf('export function signEdition'))
    assert.match(signature.slice(0, 1400), /signedBy: string/, 'a signer is a required argument, not an option')
    assert.match(signature.slice(0, 1400), /signedByName: string/,
      'and the NAME as well as the id — an operator id in a client\'s document is internal vocabulary')

    // Nothing else anywhere composes a document. `<!doctype` is the tell.
    const offenders = sourceFiles(serverSrc)
      .filter((f) => !f.endsWith(join('report', 'render.ts')))
      .filter((f) => /<!doctype|<html/i.test(codeOf(f)))
      .map((f) => f.replace(repoRoot, ''))
    assert.deepEqual(offenders, [],
      'a second composer is a second path to an unsigned document')
  })

  /**
   * **The lint runs in the render path, not in a test.**
   *
   * House Style §11 and Increment 4 §6 both say where it goes, and the placement
   * is the whole requirement: a lint in a test checks the sentences a test
   * happens to build, and the sentence that reaches a client is the one a
   * concierge typed into a box on a Friday afternoon.
   */
  it('runs the house style lint inside the composition, before anything is stored', () => {
    const render = readFileSync(join(serverSrc, 'report', 'render.ts'), 'utf8')
    const compose = render.indexOf('const columns: EditionColumn[]')
    const linted = render.indexOf('const violations: Violation[]')
    const refused = render.indexOf('throw new HouseStyleRefused')
    const stored = render.indexOf('INSERT INTO report_editions')

    assert.ok(compose > 0 && linted > compose, 'the lint reads what was composed')
    assert.ok(refused > linted && stored > refused,
      'and refuses BEFORE the insert — a refused render must leave no half-edition behind')

    // The rules live with the standard, not scattered through the composer.
    const offenders = sourceFiles(join(serverSrc, 'report'))
      .filter((f) => !f.endsWith(join('report', 'houseStyle.ts')))
      .filter((f) => /\bissues\?\\b|severity adjective/i.test(codeOf(f)))
      .map((f) => f.replace(repoRoot, ''))
    assert.deepEqual(offenders, [], 'one place declares what House Style forbids')
  })

  /**
   * An edition's bytes are never rewritten.
   *
   * Design v1 §6 — a delivered binder is a dated snapshot. Late results produce
   * a NEW edition, because *what did we actually send them* has to be answerable
   * and a re-render against today's names answers a different question.
   */
  it('never updates or deletes an edition', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(serverSrc)) {
      const code = codeOf(file)
      if (/UPDATE\s+report_editions\b/i.test(code)) offenders.push(`UPDATE in ${file.replace(repoRoot, '')}`)
      if (/DELETE\s+FROM\s+report_editions\b/i.test(code)) offenders.push(`DELETE in ${file.replace(repoRoot, '')}`)
    }
    assert.deepEqual(offenders, [], 'edition 2 does not replace edition 1')
  })

  /**
   * The client-facing frames are declared, not generated.
   *
   * Fixing twenty identical sentences by generating a different one per row
   * would move the problem rather than solve it. The frame has to be a written
   * thing a person can read and change, which means it lives in reviewed config.
   */
  it('composes group frames from declared templates rather than building sentences', () => {
    const voice = codeOf(join(serverSrc, 'report', 'clientVoice.ts'))
    const groups = voice.slice(voice.indexOf('export function clientGroups'))
    assert.match(groups, /frames\.byReason\[[^\]]+\] \?\? frames\.default/,
      'the frame is looked up, with a declared fallback')
    assert.match(groups, /\.split\('\{room\}'\)\.join\(where\)/,
      'and filled by substitution into a declared template, not assembled here')

    const file = JSON.parse(readFileSync(join(repoRoot, 'schema', 'client-names-v1.json'), 'utf8')) as {
      frames: { default: unknown; byReason: Record<string, unknown> }
    }
    assert.ok(file.frames.default, 'a default frame exists, so an unmapped reason still speaks')
    assert.ok(Object.keys(file.frames.byReason).length > 0, 'and the reasons the export produces are written')
  })
})

describe('Increment 4 §3 — the session plan is session data, never config', () => {
  /**
   * §3: *"It rides into the field app as its own import artifact, never touches
   * the generated config or its hash."*
   *
   * A plan that modified the config would make the config a function of what the
   * builder thinks, which is exactly backwards: the config is the field's
   * declaration of what a visit asks, and the plan is one visit's starting state.
   */
  it('gives the plan no write path into a config snapshot', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(join(serverSrc, 'plan'))) {
      const code = codeOf(file)
      for (const forbidden of ['INSERT INTO config_snapshots', 'UPDATE config_snapshots',
        'DELETE FROM config_snapshots', 'config_hash']) {
        if (code.includes(forbidden)) offenders.push(`${file.replace(repoRoot, '')}: ${forbidden}`)
      }
    }
    assert.deepEqual(offenders, [], 'the plan reads the config; it never writes one')
  })

  /**
   * **A recorded false is a decision; an absent attribute is not.**
   *
   * The whole of §3a turns on this, and the mistake is one line: filtering the
   * attribute map to truthy values. That makes a bedroom recorded
   * `sleeping: false` identical to a room nobody was asked about, and visit two
   * cannot tell *"we established there is none"* from *"nobody has considered
   * it."* Same distinction as declared-and-false in the trigger evaluator.
   */
  it('never filters a zone attribute map to its true values', () => {
    const source = codeOf(join(serverSrc, 'plan', 'sessionPlan.ts'))

    /**
     * **Scoped to the block that builds the map, not to the file.**
     *
     * The first version scanned the whole module for `filter(Boolean)` and fired
     * on a line assembling a list of SENTENCES — nulls dropped from a note, not
     * trues kept from an attribute map. Rule 8: read the finding first. There
     * was no defect underneath, and the finding was that the check was asking
     * its question of the wrong region.
     *
     * A scan that forbids a common idiom everywhere gets narrowed by whoever
     * trips it next, and then it forbids nothing. Scoped, it keeps its teeth.
     */
    const start = source.indexOf('const attributes: Record<string, boolean>')
    const end = source.indexOf('byZone.set(')
    assert.ok(start > 0 && end > start, 'the attribute map is still built in one place')
    const plan = source.slice(start, end)

    for (const shape of [
      /filter\(\[[^\]]*\]\)\s*=>\s*v\)/,
      /\.filter\(\(\[, v\]\) => v\)/,
      /if \(!value\) continue/,
      /Boolean\)/,
    ]) {
      assert.ok(!shape.test(plan),
        'a recorded false has to survive the round trip, or a decision arrives as an absence')
    }
    // And the positive form: both booleans are admitted.
    assert.match(plan, /typeof value === 'boolean'/,
      'the test is whether it IS a boolean, not whether it is true')
  })

  /**
   * Every payload section says why it is empty.
   *
   * Verification Discipline rule 7 at the payload level: three of five sections
   * are empty on the reference export, and an empty section is identical whether
   * the mechanism works and found nothing or was never built. A plan that only
   * emitted arrays would be indistinguishable from an unimplemented one.
   */
  it('makes every payload section report why it is empty', () => {
    const plan = readFileSync(join(serverSrc, 'plan', 'sessionPlan.ts'), 'utf8')
    const iface = plan.slice(plan.indexOf('sections: {'), plan.indexOf('warnings: string[]'))
    const declared = [...iface.matchAll(/^\s{4}(\w+): SectionReport$/gm)].map((m) => m[1])
    assert.ok(declared.length >= 6, `every section carries a report, found ${declared.join(', ')}`)

    // And a SectionReport is a count AND a sentence — a bare count is the thing
    // this exists to prevent.
    assert.match(plan, /interface SectionReport \{[\s\S]*?count: number[\s\S]*?note: string/,
      'a count alone cannot say whether the mechanism ran')
  })

  /**
   * The naming trap, per §3.
   *
   * `src/engine/plan.ts` in the FIELD repo exports `SessionPlan` and
   * `compilePlan` and is the v1 slot-model plan compiler — unrelated to this.
   * Two things with one name is how somebody eventually binds to the wrong one.
   */
  /**
   * **Nothing client-facing reads the hand-typed planned date.**
   *
   * `visits.planned_date` comes from a request body and no import path writes
   * it, so it can disagree with the evidence — and it did: the first signed
   * edition rendered *"visited 2026-07-24"* against a session that began
   * 2026-07-25T16:55Z, because a seed script typed a date nothing checked.
   *
   * The column stays, because a visit booked for next Tuesday genuinely has a
   * date and no manifest. It is simply not evidence.
   *
   * **Migration 015 renamed it from `visit_date`, and this scan now holds the
   * name too.** Routing readers through `walkedAt()` stops anyone picking the
   * wrong date today and leaves a column named `visit_date` holding something
   * that is not the visit date — one field standing for two facts, which is the
   * shape that has cost this repo three times (a zone `type` doing a nickname's
   * job, `sinceImportedAt` describing a different import than `since`, and this).
   * So the old name is forbidden **everywhere**, not only under `report/` and
   * `plan/`: a reintroduced `visit_date` fails here rather than quietly starting
   * the cycle again.
   */
  it('never lets a client-facing or field-facing date come from the typed field', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(join(serverSrc, 'report')).concat(sourceFiles(join(serverSrc, 'plan')))) {
      if (/\bplanned_date\b|\bplannedDate\b/.test(codeOf(file))) offenders.push(file.replace(repoRoot, ''))
    }
    assert.deepEqual(offenders, [],
      'a client-facing document must not carry an unchecked claim about when we were in their house')

    // The old name is gone from the source entirely. A migration is the record
    // of the rename and may name it; nothing else may.
    const revived = sourceFiles(serverSrc)
      .filter((f) => !f.endsWith('.sql') && /\bvisit_date\b|\bvisitDate\b/.test(codeOf(f)))
      .map((f) => f.replace(repoRoot, ''))
    assert.deepEqual(revived, [],
      'one field standing for two facts is the shape this rename removed; the old name does not come back')

    // And the one place that resolves it reads the session start, not the last
    // completion — a reopened session has more than one completion.
    const walked = codeOf(join(serverSrc, 'audit', 'walkedAt.ts'))
    assert.match(walked, /MIN\(s\.started_at\)/, 'the walk began when the session began')
    assert.ok(!/completed_at/.test(walked),
      'completedAt moves when a session is reopened; startedAt is when the house was walked')
  })

  /**
   * The emitter sends no `unanswered` list, and cannot honestly.
   *
   * v1.2.1 declares five zone attributes; v1.11 declares six, and the sixth is
   * `has_mechanicals` — the only one carrying a `defaultsTrueFor`. **An emitter
   * always reads a past config**, so any list it derives is systematically
   * under-inclusive, and across those two versions it is missing exactly the
   * attribute §3a is named after. The receiver derives it from its own
   * vocabulary minus the verbatim map.
   */
  it('sends no derived unanswered list in the plan payload', () => {
    const plan = readFileSync(join(serverSrc, 'plan', 'sessionPlan.ts'), 'utf8')
    const iface = plan.slice(plan.indexOf('export interface PlanZone'), plan.indexOf('export interface PlanTypedPin'))
    assert.ok(!/unanswered|neverAsked/.test(iface.replace(/\/\*[\s\S]*?\*\//g, '')),
      'an emitter cannot answer a question about a vocabulary it has not seen')
  })

  it('does not borrow the field repo\'s plan-compiler vocabulary', () => {
    const offenders = sourceFiles(join(serverSrc, 'plan'))
      .filter((f) => /\bcompilePlan\b/.test(codeOf(f)))
      .map((f) => f.replace(repoRoot, ''))
    assert.deepEqual(offenders, [], 'compilePlan means something else in the field repo')
  })

  /**
   * §B3 — the unit shot and the nameplate shot stay distinct.
   *
   * A prior unit photograph is a comparison POSITION: the same object from the
   * same angle, month after month. Falling back to "the most recent photo on
   * this pin" when no `.unit` item declares one would conflate the two
   * canonical photographs the spec keeps apart — and would be the
   * always-present-fallback failure a third time, in the artifact that rides
   * back into the field.
   */
  it('resolves a prior unit photograph only through a declared .unit item', () => {
    const plan = codeOf(join(serverSrc, 'plan', 'sessionPlan.ts'))
    const resolve = plan.slice(plan.indexOf('const candidates'), plan.indexOf('return {\n      pinId'))
    assert.match(resolve, /candidates/, 'the item ids come from the config')
    assert.ok(!/\?\?\s*media\b|else\s*\{[^}]*most recent/i.test(resolve),
      'no fallback to an arbitrary photograph when the config declares no comparison position')
  })

  /**
   * §7 — **`since` is the run, and `dueSince` is not allowed to stand in for it.**
   *
   * This scan exists because the defect it forbids was shipped. `since` read
   * `dueSince` — the import that FIRST made an item due — which is *the first
   * time it was ever outstanding*, so an item satisfied on visit two and
   * unanswered again on visit three was dated a year back when it was closed for
   * eleven months of it.
   *
   * The two facts are both worth keeping and are both still here, which is
   * exactly why a shape rule is needed rather than a behaviour test: they are one
   * greppable token apart, and the next person to reach for a date has both in
   * scope.
   */
  it('derives a gap\'s `since` from the run, never from the first time it was due', () => {
    const plan = codeOf(join(serverSrc, 'plan', 'sessionPlan.ts'))
    const emit = plan.slice(plan.indexOf('const carriedGaps: PlanGap[]'), plan.indexOf('const byBasis'))

    assert.match(emit, /since:\s*run\?\./, 'the date comes from the run walk')
    // `firstDueImportedAt` may read `dueSince` — that IS what it means. Nothing
    // whose name is `since` may.
    for (const m of emit.matchAll(/^\s*(since\w*):\s*(.+)$/gm)) {
      const [, field, value] = m
      if (field === 'sinceImportedAt') assert.fail('renamed to firstDueImportedAt — see §7c')
      assert.ok(!/dueSince/.test(value!),
        `${field} reads dueSince, which is the first time it was ever due and not the current run`)
    }
  })

  /**
   * §7b — **a nullable client-facing date carries the reason it is null.**
   *
   * Verification Discipline rule 7 as a shape. `since` is null for four
   * different reasons and a receiver cannot tell them apart from the null: the
   * run's visit has no session start, the run reaches a record that does not
   * start at a baseline, or no visit ever had the item due. A bare nullable date
   * is a fallback that cannot fail, which is how the old one survived.
   */
  it('pairs the plan\'s nullable date with a basis and a stated reason', () => {
    const plan = readFileSync(join(serverSrc, 'plan', 'sessionPlan.ts'), 'utf8')
    const iface = plan.slice(plan.indexOf('export interface PlanGap'), plan.indexOf('export interface SectionReport'))
    const decls = iface.replace(/\/\*[\s\S]*?\*\//g, '')

    assert.match(decls, /\bsince:\s*string \| null/, 'the date is nullable, which is what makes the rest necessary')
    assert.match(decls, /\bsinceBasis:\s*SinceBasis/, 'and which of four nulls it is')
    assert.match(decls, /\bsinceNote:\s*string/, 'and why, in words a receiver does not have to interpret')
  })
})

/**
 * Verification Discipline rule 9 — **a document asserting a checked state must
 * carry the check, not the claim.**
 *
 * The rule arrived from three prose claims that had gone stale, and it came with
 * a second half that is easy to lose: *carrying a check that itself needs
 * maintaining only moves the problem.* So these scans take their inputs from the
 * artifact rather than from a list somebody has to remember to update.
 */
describe('rule 9 — checks that re-derive rather than remember', () => {
  /**
   * **A `defaultLabel` of `null` is a value, not an absence.**
   *
   * Rule 9's third instance was a count — *"20 of 41 slots carry a label"* — and
   * re-deriving it produced **three** defensible answers, because one slot
   * declares the key as `null`. `s1.response-procedures` is fed from the
   * template library: the builder writes the content, so no honesty label
   * applies, and saying so is a statement rather than an omission.
   *
   * Nothing reads the field yet. That is exactly when to fix the type — the
   * first reader would have had `null` narrowed away and would have treated
   * *no label applies* as *nobody said*. Fifth instance of the distinction.
   */
  it('types a declared-null default label as a value rather than an absence', () => {
    const declared = codeOf(join(serverSrc, 'audit', 'schema.ts'))
    assert.match(declared, /defaultLabel\?:\s*string \| null/,
      'the shipped schema holds a null; a `string | undefined` type narrows it away')

    // And the schema really does hold one, so this scan is about live data
    // rather than a hypothetical. Read from the file, not asserted as a number.
    const schema = JSON.parse(
      readFileSync(join(repoRoot, 'schema', 'binder-schema-v1.json'), 'utf8'),
    ) as { sections: { slots?: { id: string; defaultLabel?: string | null }[] }[] }
    const slots = schema.sections.flatMap((s) => s.slots ?? [])
    const nulls = slots.filter((s) => 'defaultLabel' in s && s.defaultLabel === null)
    assert.ok(nulls.length > 0,
      'if no slot declares a null label any more, this scan has nothing to hold — say so and remove it')
  })

  /**
   * **Nothing reads `defaultLabel` for truthiness.**
   *
   * The durable half. A count is a fact about today's schema; *no reader may
   * collapse declared-null into never-declared* is a fact about the code, and it
   * is the one that survives a schema edit.
   */
  it('lets nothing test a default label for truthiness', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(serverSrc)) {
      const code = codeOf(file)
      // `if (slot.defaultLabel)`, `x.defaultLabel ? a : b`, `defaultLabel &&` —
      // every shape that reads a declared null as though the key were absent.
      //
      // **`?:` and `?.` are excluded, and rule 8 is why.** The first version of
      // this pattern fired on `defaultLabel?: string | null` — the optional
      // PROPERTY marker in the type declaration it was written to protect. Read
      // first: no defect underneath, the pattern simply cannot tell an optional
      // property from a ternary without looking at what follows the `?`. So it
      // looks. `??` is also fine: it is the explicit-default idiom, not a
      // truthiness test, and it treats null and undefined alike by design.
      for (const m of code.matchAll(/defaultLabel\s*(\?(?![:.?])|&&)/g)) {
        offenders.push(`${file.replace(repoRoot, '')}: ${m[0].trim()}`)
      }
      if (/if\s*\([^)]*\bdefaultLabel\b[^)]*\)/.test(code)) {
        offenders.push(`${file.replace(repoRoot, '')}: truthiness test on defaultLabel`)
      }
    }
    assert.deepEqual(offenders, [],
      'a slot that declares `defaultLabel: null` said something; absence said nothing')
  })

  /**
   * **The archive README's claim carries its own grep.**
   *
   * Rule 9's first instance: *"nothing references anything in this directory"*
   * was false for four live citations. The fix was not a corrected sentence — it
   * was a check whose inputs are the directory listing, so archiving a file
   * extends the check without anyone remembering to.
   *
   * This scan is that same check, run in CI rather than by hand.
   */
  it('holds the archive README\'s claim that nothing outside it cites the archive', () => {
    const archive = join(repoRoot, 'docs', 'archive')
    const archived = readdirSync(archive)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f) => f.replace(/\.md$/, ''))
    assert.ok(archived.length > 0, 'nothing is archived, so this scan proves nothing')

    // Every tracked file except the archive itself. `git ls-files` rather than a
    // hand-written directory list — same reason as above.
    const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !f.startsWith('docs/archive/'))

    const offenders: string[] = []
    for (const file of tracked) {
      let body: string
      try {
        body = readFileSync(join(repoRoot, file), 'utf8')
      } catch {
        continue // binary or unreadable — nothing to cite from
      }
      for (const name of archived) if (body.includes(name)) offenders.push(`${file} cites ${name}`)
    }
    assert.deepEqual(offenders, [],
      'the archive README says nothing outside it references the archive; this is that sentence, executable')
  })
})

/**
 * Increment 4 §4 and §7 — the two items claimed from Increment 3, and the desk
 * timing that closes the increment.
 */
describe('Increment 4 §4 and §7', () => {
  /**
   * **§1d is internal only, and the spec says so in one sentence.**
   *
   * > A retired item id is a discontinuity in **our record**, not something the
   * > client did or failed to do, and it must never reach the client-facing
   * > report.
   *
   * A homeowner told *"this series ends because the checklist changed"* is being
   * shown our filing problem as though it were a fact about their house.
   */
  it('keeps the discontinuity display out of every client-facing path', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(join(serverSrc, 'report')).concat(sourceFiles(join(serverSrc, 'plan')))) {
      const code = codeOf(file)
      if (/itemSeries|SeriesBreak|discontinuous/.test(code)) offenders.push(file.replace(repoRoot, ''))
    }
    assert.deepEqual(offenders, [],
      'a retirement is a break in OUR record; a client is never shown it')
  })

  /**
   * **A retirement's successors are `null`, never `[]`.**
   *
   * Table F lives in the Checklist Master, which is reference-only by doctrine —
   * a scan already forbids any code path from reading it. So this repo cannot
   * name a successor, and an empty array would say *there are none.* Rule 7 in
   * the one place the input genuinely is always absent.
   */
  it('reports an unavailable lineage as unknown rather than as none', () => {
    const code = readFileSync(join(serverSrc, 'audit', 'itemSeries.ts'), 'utf8')
    const iface = code.slice(code.indexOf('export interface SeriesBreak'), code.indexOf('export interface ItemSeries'))
    const decls = iface.replace(/\/\*[\s\S]*?\*\//g, '')

    assert.match(decls, /successors:\s*string\[\] \| null/, 'null is a state the type has to allow')
    assert.match(decls, /lineageAvailable:\s*boolean/, 'and the reason is said out loud beside it')
    assert.ok(!/successors:\s*string\[\]\s*$/m.test(decls), 'a non-nullable array cannot say "unknown"')

    // And nothing here reads the master, which is why the lineage is absent.
    assert.ok(!/Checklist-Master|docs\/reference/.test(codeOf(join(serverSrc, 'audit', 'itemSeries.ts'))),
      'the master is reference-only; that constraint is the reason for the null')
  })

  /**
   * **§1f's comparison operators are a closed set** — the deliberate exception to
   * fail-open.
   *
   * Vocabulary fails open because a word the builder has not met is still a word.
   * An operator is structure: a condition using one nobody implemented cannot be
   * evaluated in either direction, so it is refused loudly rather than skipped.
   */
  it('refuses an unimplemented comparison operator rather than failing open', () => {
    const code = codeOf(join(serverSrc, 'audit', 'triggers.ts'))
    const block = code.slice(code.indexOf('const op = COMPARE_OPS['), code.indexOf('const rest ='))
    assert.match(block, /throw new ConditionRefused/,
      'doctrine 7: fail open on vocabulary, fail CLOSED on structure')
  })

  /**
   * **A recorded value that cannot be ordered is unknown, not false.**
   *
   * `"hairline" > 5` is `false` in JavaScript, and shipping that means a
   * coercion rule deciding whether a crack is wide. The guard has to be a
   * type check before the comparison, not a `catch` after it.
   */
  it('type-checks a value before ordering it', () => {
    const code = codeOf(join(serverSrc, 'audit', 'triggers.ts'))
    const compare = code.slice(code.indexOf('function compare('), code.indexOf('const sameValue ='))

    const guard = compare.indexOf('uncomparable.push')
    const ordering = compare.indexOf("case '>':")
    assert.ok(guard > 0 && ordering > 0, 'both the guard and the ordering are present')
    assert.ok(guard < ordering,
      'the guard must return before any ordering runs, or JavaScript answers for it')

    /**
     * **Position is not enough, and negative-testing this scan is what showed
     * it.** §9b: plant the violation and confirm it fires. Replacing the guard's
     * condition with `if (false)` left the ordering intact, so the first version
     * of this scan passed on a guard that could never run.
     *
     * So it now asserts the guard is LIVE: that its condition tests the type it
     * exists to test, and that it returns unknown rather than falling through.
     */
    const condition = compare.slice(compare.lastIndexOf('if (', guard), guard)
    assert.match(condition, /typeof/, 'the guard tests a type — a constant condition guards nothing')
    assert.match(compare.slice(guard, ordering), /return 'unknown'/,
      'and it returns unknown, rather than reporting and then ordering anyway')
  })

  /**
   * **§7 collects and does not report.**
   *
   * > *Recorded, not specced:* what gets reported from it. Collect first.
   *
   * A total or a rate published now fixes the shape of the answer before the
   * first ten houses have said what the question is — which is exactly why the
   * effort map carries four work classes and no hour figures.
   */
  it('publishes no aggregate from the desk-work timings', () => {
    const code = codeOf(join(serverSrc, 'desk', 'work.ts'))
    const offenders = [...code.matchAll(/\b(totalMs|totalMinutes|averageMs|hourlyRate|reduce\s*\()/g)]
      .map((m) => m[0])
    assert.deepEqual(offenders, [],
      '§7 says collect first; a number reported before anyone has said what it is for fixes the answer early')
  })

  /**
   * **Nothing closes a running span on its own.**
   *
   * A guessed end time enters the pricing basis wearing the clothes of a measured
   * one, and the whole reason to collect this is that it is measured.
   */
  /**
   * **F10 — no reader may collapse "no lineage recorded" into "no successors".**
   *
   * `lineageFor()` returns null for an id nobody has told us about and
   * `{successors: []}` for one the master records as retiring with no
   * replacement. Those are opposite claims. **`?? []` on the call site undoes the
   * entire file**, and it is the single most natural line somebody would write.
   *
   * Sixth instance of declared-versus-absent deciding a design here.
   */
  it('lets nothing default an absent lineage to an empty successor list', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(serverSrc)) {
      const code = codeOf(file)
      // `lineageFor(...) ?? []`, `.successors ?? []`, `?.successors ?? []` —
      // every shape that turns "never told" into "told there are none".
      for (const m of code.matchAll(/(?:lineageFor\([^)]*\)|\.successors)\s*(?:\?\.[\w]+\s*)?\?\?\s*\[/g)) {
        offenders.push(`${file.replace(repoRoot, '')}: ${m[0].trim()}`)
      }
    }
    assert.deepEqual(offenders, [],
      'an absent entry says nobody told us; an empty array says there is no replacement')

    // And the branch that decides it reads the null explicitly rather than by
    // truthiness, so an entry object can never be mistaken for a present one.
    const series = codeOf(join(serverSrc, 'audit', 'itemSeries.ts'))
    assert.match(series, /lineageAvailable:\s*known !== null/,
      'availability is decided by the presence of an entry, not by whether it has successors in it')
  })

  it('never auto-closes a running desk-work span', () => {
    const code = codeOf(join(serverSrc, 'desk', 'work.ts'))
    const writes = [...code.matchAll(/UPDATE desk_work SET ended_at[^`']*/g)].map((m) => m[0])
    assert.equal(writes.length, 1, 'exactly one place ends a span')
    assert.match(writes[0]!, /WHERE id = \?/,
      'by id, from an explicit stop — never a sweep over open spans')
    assert.ok(!/ended_at IS NULL/.test(writes[0]!),
      'a write targeting every open span is an auto-close by another name')
  })
})

/**
 * The engine's send side — Increment 5 §10, Amendment 1 §C and §D.
 *
 * **Every scan here is negative-tested in place, per Verification Discipline §9b.**
 * Each one extracts its detector as a predicate and asserts both directions: the
 * real source is clean, *and* a synthetic offender is caught. A scan that has
 * only ever seen clean input has not been passing — it has been idle (rule 11),
 * and this file has now produced two scans that were silently doing nothing.
 */
describe('doctrine — assembly is separable from the call', () => {
  const engineSrc = join(serverSrc, 'engine')

  /**
   * The whole point of the split (Amendment 1, ruling 1). If assembly can reach
   * a model, then deciding what to send and sending it are one lump again and
   * the send side stops being testable without a key. The seam is only real if
   * nothing crosses it.
   */
  const reachesAModel = (code: string): boolean =>
    /\bfetch\s*\(|from\s+['"]@anthropic-ai|from\s+['"][^'"]*ai\/client|new\s+Anthropic\b|\.messages\.create\b/.test(code)

  it('lets no assembly module reach a model, a network or a key', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(engineSrc)) {
      if (reachesAModel(codeOf(file))) offenders.push(file.replace(repoRoot, ''))
    }
    assert.deepEqual(offenders, [],
      'assembly decides what to send; only the call sends it')

    // Negative: the detector catches each shape it claims to.
    assert.ok(reachesAModel(`const r = await fetch('https://api.anthropic.com')`))
    assert.ok(reachesAModel(`import Anthropic from '@anthropic-ai/sdk'`))
    assert.ok(reachesAModel(`import { call } from '../ai/client.js'`))
    assert.ok(reachesAModel(`const m = await client.messages.create({})`))
    assert.ok(!reachesAModel(`const m = media.filter((x) => x.kind === 'photo')`))
  })

  /**
   * Amendment §C: declare what is consumed, never what is skipped. A skip list
   * goes stale the first time the field app ships a kind nobody has met, and it
   * fails by silently feeding that kind to an image call — which is the exact
   * failure CLAUDE.md §5 forbids.
   */
  /**
   * Both directions of the comparison, because a skip is as often written
   * `if (kind === 'video') return` as `if (kind !== 'video') send`. The first
   * form is the likelier one and the first version of this detector missed it —
   * caught by the negative assertions below, which is the whole argument for
   * §9b: a scan tested only against clean source proves nothing about what it
   * would catch.
   *
   * A positive comparison against `'photo'` is caught too, and deliberately: a
   * hardcoded kind test bypasses the declared constant even when it happens to
   * agree with it today.
   */
  const isSkipList = (code: string): boolean =>
    /kind\s*[!=]==?\s*['"](?:video|voice|audio|photo)['"]|!\s*\[[^\]]*['"](?:video|voice)['"][^\]]*\]\s*\.includes/.test(code)

  it('decides consumption by a declared allow-list, never by excluding kinds', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(engineSrc)) {
      if (isSkipList(codeOf(file))) offenders.push(file.replace(repoRoot, ''))
    }
    assert.deepEqual(offenders, [],
      'the direction of the list is the rule — an allow-list fails safe on a kind nobody has met')

    // The allow-list itself exists and is what the code branches on.
    const assembly = codeOf(join(engineSrc, 'assembly.ts'))
    assert.match(assembly, /CONSUMED_KINDS[^=]*=\s*\[\s*'photo'\s*\]/,
      'the consumed set is a declared constant, not a condition scattered through the code')
    assert.match(assembly, /CONSUMED_KINDS\.includes\(/,
      'membership of the allow-list is what decides, not a comparison against a kind')

    // Negative: the detector catches the skip-list shapes.
    assert.ok(isSkipList(`if (m.kind !== 'video') send(m)`))
    assert.ok(isSkipList(`if (m.kind === 'voice') return`))
    assert.ok(isSkipList(`if (!['video', 'voice'].includes(m.kind)) send(m)`))
    assert.ok(!isSkipList(`if (CONSUMED_KINDS.includes(m.kind)) send(m)`))
  })

  /**
   * Amendment §D and doctrine 2. Cost enters the ledger through tokens the API
   * reported, never through arithmetic over photographs. The temptation is
   * unusually strong on this walk — all 157 photographs are 4032 on the long
   * edge, so a per-image constant would produce exact-looking per-zone totals
   * that were still a guess. An estimate that looks measured is worse than an
   * honest absence, which is the same rule the honesty labels obey.
   */
  it('prices a run only from reported tokens', () => {
    const engineCode = sourceFiles(engineSrc).map((f) => codeOf(f)).join('\n')
    const priced = [...engineCode.matchAll(/estimateCost\s*\(/g)]
    assert.equal(priced.length, 1,
      'exactly one route from tokens to dollars, so there is no second door for an estimate')

    const record = codeOf(join(engineSrc, 'runRecord.ts'))
    assert.match(record, /export function usageFrom\([\s\S]*?tokensIn:\s*number,\s*tokensOut:\s*number,?\s*\)/,
      'the only pricing entry point takes token counts, never a media count')
    assert.ok(!/usageFrom\([^)]*\.length/.test(engineCode),
      'a media count reaching the pricing function is an estimate wearing a measurement’s clothes')

    // A cost total that quietly omits unpriced calls understates the bill while
    // looking authoritative. Withholding it is the only honest option.
    assert.match(record, /anyRun && anyUnpriced \? null : costUsd/,
      'a partial cost total is not a total')
  })

  /**
   * §3's accuracy claim is that the model sees a room rather than disconnected
   * frames. A zone split across calls no longer satisfies it, so the split has
   * to travel with the result — §10's no-silent-caps discipline applied to the
   * one place where the cap changes what the answer means.
   */
  it('cannot split a zone without recording that it did', () => {
    const assembly = codeOf(join(serverSrc, 'engine', 'assembly.ts'))
    // Every construction site of a multi-batch result also builds the record.
    assert.match(assembly, /batches\.length > 1 && thresholdInForce/,
      'the split record is derived from the batching, not set by a caller who might forget')
    assert.match(assembly, /No single call saw the whole room/,
      'the withdrawal of §3’s claim is in words a person reads')

    // And the absence of a threshold is declared rather than inferred from a
    // sentinel — a configured-and-unreached threshold is a different fact from
    // no threshold at all.
    assert.match(assembly, /thresholdInForce\s*=\s*max !== undefined && max > 0/,
      'no-threshold is a declared state, never a magic number')
    assert.ok(!/maxPhotosPerBatch\s*(?:\?\?|\|\|)\s*(?:Infinity|\d+)/.test(assembly),
      'defaulting an unset threshold to a number erases the distinction it exists to keep')
  })
})

/**
 * Zone resolution and room context — Amendment 2 §A and §B.
 *
 * Both scans here guard decisions that produced *correct output by an incorrect
 * method*, which is the version hardest to catch: nothing failed, so nothing drew
 * attention. The first version of `engine/plan.ts` grouped media on the export's
 * `group` key and got every per-zone number right, because the contract stores a
 * pin's media under its zone's directory. The coincidence breaks on an unanchored
 * pin, on inbox media, and on any future change to the export's storage layout.
 */
describe('doctrine 4 — ownership is declared, never re-derived from a path', () => {
  const engineSrc = join(serverSrc, 'engine')

  /**
   * Deciding *where a photograph belongs* from *where it is stored* is
   * un-composing something the producer already composed. It also lets a storage
   * decision silently change what a model is shown.
   */
  const derivesFromPath = (code: string): boolean =>
    /group_key|\bgroup\b\s*[,)]|(?:\.file|file)\s*\.\s*(?:split|startsWith|match|includes)\s*\(|(?:dirname|basename)\s*\(/.test(code)

  it('resolves a zone from the declared owner, never from the file path', () => {
    /**
     * **Scoped to modules that handle media, and the narrowing was earned.**
     *
     * This fired on `classFrame.ts` the moment that module shipped, because it
     * uses `dirname()` to locate a schema file on disk. Rule 8 says investigate
     * before narrowing, so: that module reads a JSON file and touches no media
     * at all — it cannot derive media ownership from a path because it has no
     * media to derive it for.
     *
     * So the scope is the rule's own domain rather than an exemption by name:
     * **you can only derive media ownership from a path if you handle media.**
     * A future engine module that starts touching media comes back into scope
     * automatically, which an exemption list would not do.
     */
    const handlesMedia = (code: string): boolean => /\bmedia\b/i.test(code)
    const offenders: string[] = []
    for (const file of sourceFiles(engineSrc)) {
      const code = codeOf(file)
      if (!handlesMedia(code)) continue
      if (derivesFromPath(code)) offenders.push(file.replace(repoRoot, ''))
    }
    assert.deepEqual(offenders, [],
      'the path is storage location only — the manifest’s own comment says so')

    // And the resolution reads the three declared owner columns.
    const plan = codeOf(join(engineSrc, 'plan.ts'))
    for (const col of ['owner_kind', 'owner_zone_id', 'owner_pin_id', 'owner_canvas_id']) {
      assert.match(plan, new RegExp(col), `resolution reads ${col}`)
    }
    assert.match(plan, /pinZone|canvasZone/, 'a pin’s and a canvas’s zone are looked up, not guessed')

    // Negative: the detector catches each shape it claims to.
    assert.ok(derivesFromPath(`const zone = m.file.split('/')[1]`))
    assert.ok(derivesFromPath(`SELECT group_key FROM media`))
    assert.ok(derivesFromPath(`const z = dirname(m.file)`))
    assert.ok(derivesFromPath(`if (file.startsWith('media/_misc')) skip()`))
    assert.ok(!derivesFromPath(`const z = pinZone.get(m.owner_pin_id)`))

    // And the scope is not vacuous: the modules that do handle media are still
    // being read. A narrowing that quietly emptied the scan would be worse than
    // the false positive it fixed.
    const inScope = sourceFiles(engineSrc).filter((f) => /\bmedia\b/i.test(codeOf(f)))
    assert.ok(inScope.length >= 2, 'the media-handling modules remain in scope')
    assert.ok(inScope.some((f) => f.endsWith('plan.ts')), 'including the one that owns the resolution')
  })

  /**
   * Amendment 2 §B1. An unanchored pin's photograph and an inbox item are real
   * captures with no room — unassigned rather than missing. Folding them into
   * `unavailable` would report a capture that exists as one that does not, and
   * the two want different actions from a person.
   */
  it('keeps a capture with no room apart from one that is missing', () => {
    const plan = codeOf(join(engineSrc, 'plan.ts'))
    assert.match(plan, /unassigned:\s*Unassigned\[\]/, 'unassigned is its own bucket')
    assert.ok(!/unassigned[\s\S]{0,200}unavailable\.push/.test(plan),
      'an unresolved zone never becomes an unavailable file')
    // Every way a capture can fail to resolve names itself. Checked against the
    // strings the code actually carries rather than a shape this scan imagined —
    // the first version asserted `reason: '...'` and failed, because they are
    // positional arguments. A scan that describes code it has not read is the
    // same error class as resolving a zone from a path.
    for (const reason of ['pin-is-unanchored', 'pin-not-in-import', 'canvas-not-in-import', 'zone-not-in-import']) {
      assert.ok(plan.includes(`'${reason}'`), `${reason} is a named reason, because the reason is the data`)
    }
    assert.match(plan, /unassigned\.push\(\{[^}]*reason:/,
      'nothing lands in the bucket without saying why it is there')
    // And it counts toward the import's reconciliation rather than vanishing.
    assert.match(plan, /a\.unassigned\.length === total|\+ a\.unassigned\.length/,
      'unassigned media is part of the arithmetic that proves nothing was dropped')
  })

  /**
   * Amendment 2 §A2. A canvas image is the room, sent so the model can place
   * everything else — but it is not a thing in the room. A floorplan sketch
   * coming back as a proposed object called "a drawing of a room" is the failure.
   */
  it('cannot let room context become something to identify', () => {
    const assembly = codeOf(join(engineSrc, 'assembly.ts'))
    assert.match(assembly, /m\.role === 'context' \? context : subjects/,
      'the role decides the bucket, at one place')
    assert.match(assembly, /subjectCount:\s*ordered\.length/,
      'the subject count comes from the subject list, never from the batch contents')

    // Context repeats across batches, so summing batch membership would
    // over-count it — the reconciliation must not be written that way.
    assert.match(assembly, /a\.subjectCount \+ a\.context\.length/,
      'reconciliation counts distinct media, not batch membership')
    assert.ok(!/reduce\(\(t, b\) => t \+ b\.subjects\.length, 0\) \+ a\.unconsumed/.test(assembly),
      'summing batches would over-count a repeated room shot once per split')

    // The threshold counts subjects only, so a second wide shot cannot split a
    // room that an otherwise identical room would not split.
    assert.ok(!/ordered\.length \+ orderedContext\.length/.test(assembly),
      'context must not count toward the batch threshold')
  })
})

/**
 * §E — the property pass's ordering constraint, which the spec calls hard
 * rather than preferred.
 */
describe('doctrine 7 — an empty queue is not evidence that the work was done', () => {
  const engineSrc = join(serverSrc, 'engine')

  it('cannot establish readiness from the absence of pending work', () => {
    const code = codeOf(join(engineSrc, 'completeness.ts'))
    // Which zones were identified is an input, never something this module goes
    // looking for — the whole failure §E names is inferring "done" from "nothing
    // queued", and a query for pending work here would rebuild that inference.
    assert.match(code, /identifiedZones:\s*ReadonlySet<string>/,
      'identification status is supplied by the caller')
    for (const smell of ['ai_jobs', 'queue', 'pending', 'COUNT(*) = 0']) {
      assert.ok(!code.includes(smell), `readiness must not consult ${smell}`)
    }
  })

  /**
   * **Scoped to `engine/`, and deliberately not repo-wide.**
   *
   * The bug was found in `completeness.ts`; a scan pinned to that file would
   * cover where it was found and not where it will be found next. Where it will
   * be found next is the identification runner, the property pass and the review
   * queue — all of which land in this directory.
   *
   * Repo-wide was considered and rejected on evidence rather than taste. Eleven
   * modules outside `engine/` touch the ownership columns and at least two do so
   * correctly: `import/report.ts` groups by `owner_kind` to census the raw
   * declaration, and `pass/read.ts` reads zone-owned media for the fresh-pass
   * screen, where pin-owned photographs appear under their pins instead. A scan
   * firing on those has still fired, and a false positive teaches people to
   * route around scans.
   *
   * The Checklist Master scan is repo-wide because its rule genuinely is —
   * *no code path reads `/docs/reference`* admits no exceptions. This rule is
   * the engine's, so its scope is the engine's.
   */
  it('lets no engine module re-answer which media belongs to a zone', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(engineSrc)) {
      if (file.endsWith('plan.ts')) continue // the one place that owns the rule
      if (/FROM media/.test(codeOf(file))) offenders.push(file.replace(repoRoot, ''))
    }
    assert.deepEqual(offenders, [],
      'a second query over media is a second answer to a question with one home')

    // And the module that needed the answer asks for it.
    assert.match(codeOf(join(engineSrc, 'completeness.ts')), /assembleImport\(/,
      'resolution comes from the one place that owns it')

    // The exemption is a single file, not a pattern anybody can join.
    const owners = sourceFiles(engineSrc).filter((f) => /FROM media/.test(codeOf(f)))
    assert.deepEqual(owners.map((f) => f.replace(repoRoot, '')), ['/server/src/engine/plan.ts'])
  })

  it('makes readiness unforgeable, so the check cannot be skipped', () => {
    const code = codeOf(join(engineSrc, 'completeness.ts'))
    assert.match(code, /declare const readyBrand: unique symbol/,
      'the proof carries a brand no caller can construct')
    // Exactly one place mints it, inside the function that did the checking.
    assert.equal([...code.matchAll(/as unknown as PropertyReady/g)].length, 1)
    assert.ok(!/export (function|const) makePropertyReady/.test(code),
      'no exported constructor — §10’s "the type forbids it", applied to a hard ordering constraint')
  })

  it('never lets anybody sign completeness as a judgement', () => {
    // The overlay layer's own note: a signature claims the record matches the
    // evidence and never condition, adequacy, age, safety or COMPLETENESS. So
    // the recorded human act is the narrow fact — this zone has no media — and
    // readiness is computed from it. A `capture-complete` kind would be the
    // assessment the concierge may not make, arriving through a new door.
    const code = codeOf(join(engineSrc, 'completeness.ts'))
    assert.match(code, /NO_MEDIA_KIND = 'capture-none'/)
    for (const forbidden of ['capture-complete', 'capture-adequate', 'capture-sufficient']) {
      assert.ok(!code.includes(forbidden), `${forbidden} would be a judgement, not a fact`)
    }
    // And the fact is useless without its reason, so the reason is required.
    assert.match(code, /has to say why/)
  })
})

/**
 * §9 guard 1 at the resolution it was always about — Increment 5 §6.
 *
 * Scans rather than behavioural tests because there is no web test harness, and
 * because what matters here is the *shape* of the screen: that the evidence is
 * reachable at full size, and that the magnifier does not carry the model's
 * reading into itself.
 */
describe('doctrine — a photograph the concierge cannot read is not evidence', () => {
  const webSrc = join(repoRoot, 'web', 'src')
  const passSrc = join(webSrc, 'pass')

  /**
   * A browser fits a 4032px image to the viewport, so the new tab was the same
   * downscale one click further away — with the reading left behind on another
   * screen. A hand-built media href is that pattern returning.
   *
   * **Now repo-wide over the pass, with no exemptions.** The interim recorded
   * two remaining sites on the decisions screen with their exact count, so that
   * fixing one or adding one both failed. They are fixed, and the list is empty —
   * which is the only state a defect list should be allowed to rest in.
   */
  it('no longer offers a new tab in place of a magnifier', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(passSrc)) {
      for (const m of codeOf(file).matchAll(/href=\{`\/api\/visits\/\$\{[^}]+\}\/media\/[^`]*`\}/g)) {
        offenders.push(`${file.replace(repoRoot, '')}: ${m[0]}`)
      }
    }
    assert.deepEqual(offenders, [],
      'evidence opens in the magnifier, not in a tab that downscales it again')

    // Negative: the detector still recognises the pattern it was written for.
    const pattern = /href=\{`\/api\/visits\/\$\{[^}]+\}\/media\/[^`]*`\}/
    assert.ok(pattern.test('<a href={`/api/visits/${visitId}/media/${id}`}>'))
  })

  it('uses the full-size path its comment has always claimed', () => {
    // `mediaUrl` existed and was referenced nowhere, with a comment saying it was
    // "used for the lightbox". That comment is how the gap survived: anyone
    // grepping for the full-size path found it and read the comment as evidence
    // it was wired up. Rule 9, in a doc-comment.
    const users = sourceFiles(webSrc).filter(
      (f) => !f.endsWith('api.ts') && /\bmediaUrl\(/.test(codeOf(f)),
    )
    assert.ok(users.length > 0, 'something actually fetches the original')
    assert.ok(
      users.some((f) => f.endsWith('Lightbox.tsx')),
      'and it is the magnifier, which is what the comment says',
    )
  })

  it('keeps the model’s reading out of the magnifier', () => {
    /**
     * Guard 1 specifies the layout — photo large, suggestion beside it — and the
     * magnifier is a temporary act of reading laid over it. Putting the reading
     * inside would rebuild the original problem at higher resolution: the
     * concierge would check a string against a plate rather than read a plate.
     *
     * **Checked on the interface, not on word occurrence.** The first version of
     * this scan forbade the substrings `suggestion` and `reading` anywhere in the
     * file — and simultaneously asserted the phrase *"Never a reading"* was
     * present. It asserted a contradiction and could never have passed. What the
     * rule is actually about is what the component can *receive*, so that is what
     * is checked.
     */
    const code = codeOf(join(passSrc, 'Lightbox.tsx'))
    for (const leak of ['proposal', 'ProposedField', 'AssistModel', 'NameplateProposal']) {
      assert.ok(!code.includes(leak), `the magnifier must not be able to receive ${leak}`)
    }
    // Its props are exactly the four it needs, and none of them is a value.
    const props = code.match(/export interface LightboxProps \{([\s\S]*?)\n\}/)
    assert.ok(props, 'the props are declared in one place')
    const names = [...props[1]!.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1])
    assert.deepEqual(names.sort(), ['caption', 'mediaId', 'onClose', 'visitId'])
  })

  it('zooms past 1:1, because the plate is a fraction of the frame', () => {
    // Stopping at "actual size" stops exactly where the small text starts to
    // matter — the subject is the plate, not the water heater it is bolted to.
    const code = codeOf(join(passSrc, 'Lightbox.tsx'))
    const steps = code.match(/const STEPS = \[([^\]]+)\]/)
    assert.ok(steps, 'the zoom steps are declared in one place')
    const values = steps[1]!.split(',').map((s) => Number(s.trim()))
    assert.ok(Math.max(...values) >= 4, 'magnification runs well past fit-to-window')
  })
})

/**
 * The scanner's own scope — rule 5 applied to rule 11's third instance.
 *
 * Adding `.tsx` fixed the instance. **The class is that `sourceFiles()` silently
 * scopes every scan built on it by an extension list nobody audits**, and a scan
 * that cannot say what it did not look at is a scan reporting on a scope nobody
 * chose.
 */
describe('doctrine — a scan says what it did not look at', () => {
  it('accounts for every extension present under the roots it walks', () => {
    const found = new Map<string, number>()
    for (const root of SCANNED_ROOTS) {
      for (const file of allFiles(root)) {
        const ext = file.slice(file.lastIndexOf('.'))
        found.set(ext, (found.get(ext) ?? 0) + 1)
      }
    }

    const unaccounted = [...found.keys()].filter(
      (e) => !SCANNED_EXTENSIONS.includes(e as (typeof SCANNED_EXTENSIONS)[number]) && !(e in NOT_SCANNED),
    )
    assert.deepEqual(unaccounted, [],
      'a new extension appeared under a scanned root — scan it, or record in NOT_SCANNED why not')

    // And every declared exclusion is still real. An exclusion for something no
    // longer present is a decision about nothing, and it hides the next one.
    const stale = Object.keys(NOT_SCANNED).filter((e) => !found.has(e))
    assert.deepEqual(stale, [], 'NOT_SCANNED names an extension that is no longer under any scanned root')
  })

  it('scans the extensions it claims to, in the numbers actually present', () => {
    // The failure this replaces was invisible precisely because a count was
    // never asserted: thirteen unread files look the same as none.
    const web = sourceFiles(join(repoRoot, 'web', 'src'))
    assert.ok(web.filter((f) => f.endsWith('.tsx')).length >= 13,
      'the components are in scope, which they were not before 2026-08-04')
    assert.ok(sourceFiles(serverSrc).length > 50)
  })

  it('reads migrations through a named walker rather than a reinvented one', () => {
    // Two file-walking conventions in one file is fine; two *unnamed* ones is how
    // a scan author picks the wrong scope without knowing there was a choice.
    assert.ok(migrationFiles().length >= 16)
    assert.ok(migrationFiles().every((f) => f.endsWith('.sql')))
  })
})

/**
 * The class frame — Increment 5 §1 and Amendment 3.
 */
describe('doctrine — the class frame reads the config, and never re-owns the calendar', () => {
  const engineSrc = join(serverSrc, 'engine')

  /**
   * §1a's core requirement. The named failure is the class list and the field
   * config maintained separately, disagreeing, and nobody noticing until a
   * session plan seeds the wrong checklist — which a list of component types
   * kept in this repo is exactly how you get.
   */
  const holdsATypeList = (code: string): boolean =>
    /\[\s*(['"])(?:water-heater|furnace|electrical-panel|sump-pump|heat-pump)\1\s*,/.test(code) ||
    /componentTypes?\s*[:=]\s*\[\s*['"]/.test(code)

  it('keeps no component-type list anywhere in the engine', () => {
    const offenders = sourceFiles(engineSrc).filter((f) => holdsATypeList(codeOf(f)))
    assert.deepEqual(offenders.map((f) => f.replace(repoRoot, '')), [],
      'the import’s own config snapshot is the only source of component types')

    // And the check really takes a snapshot rather than reaching for one.
    const frame = codeOf(join(engineSrc, 'classFrame.ts'))
    assert.match(frame, /configSnapshot: Record<string, unknown>/,
      'the config is an argument, so a caller cannot accidentally supply the wrong import’s')
    assert.match(frame, /componentGraph\(configSnapshot\)/,
      'resolution goes through the one graph the audit already trusts')

    // Negative: the detector recognises the shapes it claims to.
    assert.ok(holdsATypeList(`const TYPES = ['water-heater', 'furnace']`))
    assert.ok(holdsATypeList(`componentTypes: ['sump-pump', 'deck']`))
    assert.ok(!holdsATypeList(`const g = componentGraph(configSnapshot)`))
  })

  /**
   * Amendment 3 §A2. The schedule owns the calendar slot and the default
   * cadence; the engine owns identity, multiplicity and model-specific detail
   * rendered inside it. **A research-pass interval that differs from a schedule
   * default is a manufacturer-instruction override** — the mechanism, its
   * per-property scope and its obligation to carry a reason and a source are all
   * already declared in `maintenance-schedule-v1.json`'s own `overrideRule`.
   *
   * So the failure to forbid is the engine emitting a **second calendar item**:
   * one binder carrying *flush annually* and *flush every six months*, both
   * signed, with nothing saying which is authoritative.
   */
  const emitsAScheduleItem = (code: string): boolean =>
    /cadence\s*:/.test(code) && /appliesWhen\s*:/.test(code)

  it('lets no engine module emit a schedule item of its own', () => {
    const offenders = sourceFiles(engineSrc).filter((f) => emitsAScheduleItem(codeOf(f)))
    assert.deepEqual(offenders.map((f) => f.replace(repoRoot, '')), [],
      'a differing interval is an override on the schedule’s item, never a second item beside it')

    // Negative: the detector catches the shape a second calendar item would take.
    assert.ok(emitsAScheduleItem(`return { id, text, cadence: 'annual', appliesWhen: 'house.water-heater' }`))
    assert.ok(!emitsAScheduleItem(`return { classId, careCategories: ['descale'] }`))

    // And the rule the engine must obey is recorded in the file it binds to,
    // not only in an amendment — checked from the artefact, per rule 9.
    const sched = JSON.parse(
      readFileSync(join(repoRoot, 'schema', 'reference', 'maintenance-schedule-v1.json'), 'utf8'),
    ) as { overrideRule?: string }
    assert.match(sched.overrideRule ?? '', /carry a reason and a source/)
  })

  /**
   * Amendment 3 §B3's second weakness, and the one no code can enforce: if the
   * vocabulary is harvested from the classes after they are written, no class
   * can name an undeclared term and the check is idle from birth.
   *
   * A scan cannot catch that. What it can do is hold the instruction in the file
   * the author will have open — so this asserts the file still says it.
   */
  it('keeps the authoring order recorded where the author will read it', () => {
    const raw = JSON.parse(
      readFileSync(join(repoRoot, 'schema', 'class-frame-v1.json'), 'utf8'),
    ) as Record<string, unknown>
    const v = JSON.stringify(raw.theVocabulariesMustComeFirst ?? '')
    assert.match(v, /authored FROM THE SYSTEMS/, 'the order is stated')
    assert.match(v, /ownerQuestions/, 'and it covers all four vocabularies, including Amendment 4’s')
    assert.match(v, /idle from birth/, 'and why it is not a preference')
    // The frame's own limits are recorded rather than left to be rediscovered.
    assert.match(JSON.stringify(raw.whatThisCrossCheckCannotDo ?? ''), /cannot catch a judgement error/)
  })
})

describe('an actor is resolved through the registry, never taken from the environment raw', () => {
  /**
   * **`--run` was broken for everybody and nothing could see it.**
   *
   * `scripts/identify.ts` passed `process.env.HOUSESTEADY_OPERATOR` straight in
   * as `actorId`. That variable holds a short code or a display name — never an
   * id — and `ai_jobs.actor_id` is a foreign key to `operators(id)`, so the
   * insert died with `SQLITE_CONSTRAINT_FOREIGNKEY` on the primary entry point.
   * The fallback `'unknown-operator'` was worse: it can never be a valid id, so
   * the unconfigured path was equally dead.
   *
   * **984 tests green, typecheck clean, the plan step perfect.** It took a real
   * call with a real operator on 2026-08-09 to find it.
   *
   * So this scans the class rather than the instance. A type cannot catch it —
   * `actorId` is a `string` and so is a short code. What distinguishes them is
   * where the string came from, and that is a property of the call site.
   */
  it('a script that reads the variable and stores an actor resolves it through the registry', () => {
    /**
     * **File-level, and deliberately so.** A line-level scan was written first
     * and produced three false positives on its first run: the comment in
     * `identify.ts` describing this very bug, `import-export.ts` reading the
     * variable on one line and resolving it on the next, and `preflight.ts`
     * printing it as a diagnostic. **A rule that fires on all three teaches
     * people to ignore it.**
     *
     * So the shape is: *reads the variable* **and** *stores an actor* implies
     * *resolves through the registry*. A script that only prints the variable —
     * preflight — stores nothing and is not the subject.
     *
     * **Exempting takes an entry with a reason**, the same inversion the
     * `UNATTRIBUTED` map above uses — and for the same reason. A first draft
     * keyed on the presence of an `actorId` variable, which **the fix itself
     * introduced**: the original bug passed the environment string inline and
     * declared no such variable, so that scan would have passed on the very code
     * it was written to catch. A scan that reads a symptom of the fix is not
     * watching the defect.
     *
     * **What this cannot do**, said rather than left to be discovered: it cannot
     * tell that a *resolved* value went to the right parameter. It catches the
     * class of bug that happened, not every possible one.
     */
    const MAY_READ_WITHOUT_RESOLVING: Readonly<Record<string, string>> = {
      'scripts/preflight.ts':
        'prints the variable as a diagnostic and stores nothing. Resolving it there would ' +
        'turn a check that answers "did the value arrive" into one that refuses.',
    }

    /**
     * **Comments are stripped first, and that is not tidiness.**
     *
     * Twice now this scan has fired on *prose about the bug*: once on
     * `identify.ts`'s comment explaining the fix, and once on `smoke.ts`'s
     * header explaining why smoke exists. **A check that a file cannot describe
     * the defect without being accused of it will be silenced**, and a silenced
     * scan protects nothing.
     *
     * Exempting those files would have papered over a scanner defect with a
     * policy. Reading only the code is the fix, because the code is the subject.
     */
    const codeOnly = (text: string): string =>
      text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

    const offenders: string[] = []
    for (const file of sourceFiles(join(repoRoot, 'server', 'scripts'))) {
      const name = file.split('/server/')[1]!
      const text = codeOnly(readFileSync(file, 'utf8'))
      if (!/process\.env\.HOUSESTEADY_OPERATOR/.test(text)) continue
      if (name in MAY_READ_WITHOUT_RESOLVING) continue
      if (!/\b(currentOperator|resolveOperator)\s*\(/.test(text)) offenders.push(name)
    }
    assert.deepEqual(
      offenders,
      [],
      'HOUSESTEADY_OPERATOR is a short code or a display name, never an id. Resolve it — ' +
        '`currentOperator(db).id` — before it reaches anything that stores an actor.',
    )
  })

  it('the foreign key really does reject a short code, so the scan above guards something', () => {
    // Rule 11b — the two sides must be able to disagree. Without this, the scan
    // could be passing because the constraint is absent rather than honoured.
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const operator = createOperator(db, { displayName: 'David Pickett', shortCode: 'dp' })

    assert.throws(
      () => enqueue({
        db, ...ids, actorId: 'dp', task: 'identify_objects', targetKind: 'zone-batch', targetId: 'z:1',
      }),
      /FOREIGN KEY|SQLITE_CONSTRAINT/,
      'a short code is not an id, and the database is the thing that knows it',
    )

    const job = enqueue({
      db, ...ids, actorId: operator.id, task: 'identify_objects', targetKind: 'zone-batch', targetId: 'z:1',
    })
    assert.ok(job.id, 'and the resolved id goes in cleanly')
    db.close()
  })
})

describe('a prompt version cannot go live by being added', () => {
  /**
   * **`/prompts` has no draft state, and that is a defect in a system where
   * everything else about a prompt is versioned and content-hashed.**
   *
   * `currentPrompt` returns the LAST version in a task directory. So dropping
   * `v002.md` beside `v001.md` changes production behaviour on the next call —
   * **no review, no ruling, no signal.** On 2026-08-09 a drafted `identify_objects`
   * v002 was kept out of `/prompts` by remembering, which is not a mechanism.
   *
   * **The safe place already exists and nothing said so.** `loadPrompts` reads
   * `*.md` only at the task-directory level and does not recurse, so
   * `prompts/<task>/drafts/v002.md` is invisible to it. *(A top-level
   * `prompts/drafts/` is NOT safe — it would be read as a task and refuse on the
   * first file not named vNNN.md.)*
   *
   * **This pin is the other half.** Adding a version now fails here until
   * somebody updates this list, which turns *shipped by being written* into
   * *shipped by being acknowledged*. It cannot check that a version was ruled
   * on — nothing can — but it makes going live a deliberate act.
   */
  const LIVE: Readonly<Record<string, string>> = {
    'house-style': 'v001',
    identify_objects: 'v001',
    nameplate_classify: 'v001',
    nameplate_extract: 'v002',
    photo_routing: 'v002',
    pin_type: 'v001',
    read_surfaces: 'v001',
    resolve_product: 'v001',
    match_known: 'v001',
    enumerate_room: 'v001',
  }

  it('the live version of every task is the one recorded here', () => {
    const library = loadPrompts(join(repoRoot, 'prompts'))
    const live = Object.fromEntries([...library].map(([task, versions]) => [task, versions[versions.length - 1]!.version]))
    assert.deepEqual(
      live,
      LIVE,
      'A prompt version changed. If that was intended, update LIVE in the same commit — and if it was not, ' +
        'a file added to /prompts just changed what every binder sounds like.',
    )
  })

  it('a drafts subdirectory is invisible to the loader, which is what makes it the safe place', () => {
    // Rule 11b — asserted rather than assumed, because the whole convention
    // rests on `loadPrompts` not recursing.
    const scratch = mkdtempSync(join(tmpdir(), 'housesteady-prompts-'))
    try {
      mkdirSync(join(scratch, 'a-task', 'drafts'), { recursive: true })
      writeFileSync(join(scratch, 'a-task', 'v001.md'), 'the live one')
      writeFileSync(join(scratch, 'a-task', 'drafts', 'v002.md'), 'the draft')
      const library = loadPrompts(scratch)
      assert.deepEqual(library.get('a-task')!.map((p) => p.version), ['v001'], 'the draft is not loaded')
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
