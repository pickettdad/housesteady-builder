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
    const { importId } = await runImport({ db, ...ids, raw, dataDir: scratchDir() })
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

    const { importId } = await runImport({ db, ...ids, raw, dataDir: scratchDir() })
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
    const { importId } = await runImport({ db, ...ids, raw: JSON.stringify(parsed), dataDir: scratchDir() })

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
    const { importId } = await runImport({ db, ...ids, raw: readReference(), dataDir })

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
    await runImport({ db, ...ids, raw: readReference(), dataDir })

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
