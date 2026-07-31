import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { buildReport } from '../src/import/report.js'
import { runImport } from '../src/import/runImport.js'
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
    for (const file of sourceFiles(webSrc).concat(sourceFiles(join(serverSrc, 'overlay')))) {
      const code = codeOf(file)
      for (const match of code.matchAll(/>([^<>{}]{3,80})</g)) {
        const text = match[1] ?? ''
        const t = text.trim().toLowerCase()
        if (!t || !/[a-z]/.test(t)) continue
        if (/\b(verify|verified|approve|approved|certify|certified)\b/.test(t)) {
          // The import report legitimately verifies checksums — that is a claim
          // about bytes, and it is the one place the word is honest.
          if (/checksum|file|sha|byte/.test(t)) continue
          offenders.push(`"${text.trim()}" in ${file.replace(repoRoot, '')}`)
        }
      }
    }
    assert.deepEqual(offenders, [], 'the button label is the claim')
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
        // this repo's own words by construction.
        if (/^(schema|profile|binding|audit)\./.test(value)) continue
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
   * **Nothing client-facing reads the hand-typed visit date.**
   *
   * `visits.visit_date` comes from a request body and no import path writes it,
   * so it can disagree with the evidence — and it did: the first signed edition
   * rendered *"visited 2026-07-24"* against a session that began
   * 2026-07-25T16:55Z, because a seed script typed a date nothing checked.
   *
   * The column stays, because a visit booked for next Tuesday genuinely has a
   * date and no manifest. It is simply not evidence.
   */
  it('never lets a client-facing or field-facing date come from the typed field', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(join(serverSrc, 'report')).concat(sourceFiles(join(serverSrc, 'plan')))) {
      if (/\bvisit_date\b/.test(codeOf(file))) offenders.push(file.replace(repoRoot, ''))
    }
    assert.deepEqual(offenders, [],
      'a client-facing document must not carry an unchecked claim about when we were in their house')

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
    const iface = plan.slice(plan.indexOf('export interface PlanZone'), plan.indexOf('export interface PlanObject'))
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
