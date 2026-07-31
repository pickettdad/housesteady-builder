import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { runAudit } from '../src/audit/run.js'
import type { Db } from '../src/db/index.js'
import { runImport } from '../src/import/runImport.js'
import { addManualRow, buildDraft, rowTrail, writeEdit } from '../src/report/draft.js'
import { describeItems, naLabelMap, unratifiedNames, writeName } from '../src/report/names.js'
import { freshDb, makePropertyAndVisit, readReference, repoRoot, scratchDir, TEST_OPERATOR } from './helpers.js'

const LABELS = naLabelMap()

async function audited(): Promise<{ db: Db; propertyId: string }> {
  const db = freshDb()
  const ids = makePropertyAndVisit(db)
  await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
  runAudit({ db, propertyId: ids.propertyId, visitId: ids.visitId, visitKind: 'baseline', actorId: TEST_OPERATOR })
  return { db, propertyId: ids.propertyId }
}

const draftOf = (db: Db, propertyId: string) =>
  buildDraft({ db, propertyId, describe: describeItems(db), labels: LABELS })

/**
 * §1d — "Missing from you" ships, and ships honestly.
 *
 * The named failure: *if it renders as an empty column with a heading, the client
 * reads "you owe us nothing" — at the exact moment the deed, the permits and the
 * well record are the most useful thing we could ask them for.*
 */
describe('the "missing from you" column', () => {
  it('carries human-entered provenance, so nothing has to be untangled later', async () => {
    const { db, propertyId } = await audited()
    addManualRow({
      db, propertyId, text: 'The deed, or the most recent title search.',
      column: 'missing-from-you', actorId: TEST_OPERATOR,
    })

    const row = draftOf(db, propertyId).rows.find((r) => r.column === 'missing-from-you')!
    assert.ok(row, 'a typed row appears in the column')
    assert.equal(row.provenance, 'human-entered')
    assert.equal(row.text, 'The deed, or the most recent title search.')
    assert.equal(row.source, undefined, 'a typed row traces to nothing — it is not evidence-bound')

    // The state has to be visible in the RECORD, not only in the render — so
    // that when the intake table lands, which rows were typed is answerable
    // without anybody reconstructing it.
    const stored = db.prepare('SELECT kind, payload FROM report_row_edits WHERE property_id = ?')
      .all(propertyId) as { kind: string; payload: string }[]
    assert.equal(stored.length, 1)
    assert.equal(stored[0]!.kind, 'add')
  })

  it('keeps derived rows out of it — a checklist gap is never the client\'s to answer', async () => {
    const { db, propertyId } = await audited()
    const derived = draftOf(db, propertyId).rows.filter((r) => r.provenance === 'evidence-bound')
    for (const row of derived) {
      assert.notEqual(row.column, 'missing-from-you',
        'the field checklist records what WE did not reach; putting it in the client\'s column asks them to answer for our visit')
    }
  })
})

/**
 * §5 — the editor, and the one rule that must survive it.
 */
describe('the editor', () => {
  it('rewords without touching the evidence', async () => {
    const { db, propertyId } = await audited()
    const before = draftOf(db, propertyId)
    const target = before.rows[0] ?? before.withheld[0]!
    const parts = JSON.stringify(target.source!.parts)

    writeEdit({
      db, propertyId, rowKey: target.rowKey, kind: 'reword',
      payload: { text: 'We could not get to the ensuite this visit.' }, actorId: TEST_OPERATOR,
    })

    const after = draftOf(db, propertyId).rows.find((r) => r.rowKey === target.rowKey)!
    assert.equal(after.text, 'We could not get to the ensuite this visit.')
    assert.equal(after.reworded, true)
    assert.equal(JSON.stringify(after.source!.parts), parts,
      '§2\'s boundary holds through the editor: the parts stay as the producer wrote them')

    // And in storage, not only in the projection.
    const stored = db.prepare('SELECT parts FROM audit_carried_items WHERE item_id = ?')
      .get(target.source!.itemId) as { parts: string }
    assert.equal(stored.parts, parts, 'a rewording is a layer over the sentence, never a change to the row')
  })

  it('keeps the composed original beside a rewording', async () => {
    const { db, propertyId } = await audited()
    writeName({ db, itemId: 'int.canvas', name: 'A wide photo set of the room', actorId: TEST_OPERATOR })
    const row = draftOf(db, propertyId).rows.find((r) => r.source?.itemId === 'int.canvas')!
    assert.ok(row.composed, 'the composer wrote a sentence')

    writeEdit({ db, propertyId, rowKey: row.rowKey, kind: 'reword', payload: { text: 'Rewritten.' }, actorId: TEST_OPERATOR })
    const after = draftOf(db, propertyId).rows.find((r) => r.rowKey === row.rowKey)!
    assert.equal(after.text, 'Rewritten.')
    assert.equal(after.composed, row.composed,
      'showing what the composer wrote is how a reader tells a rewording from a correction')
  })

  it('toggles a row out and back, keeping both decisions in the record', async () => {
    const { db, propertyId } = await audited()
    writeName({ db, itemId: 'int.canvas', name: 'A wide photo set of the room', actorId: TEST_OPERATOR })
    const row = draftOf(db, propertyId).rows.find((r) => r.source?.itemId === 'int.canvas')!
    assert.equal(row.included, true, 'a gap the client should hear about is the default')

    writeEdit({ db, propertyId, rowKey: row.rowKey, kind: 'exclude', actorId: TEST_OPERATOR })
    assert.equal(draftOf(db, propertyId).rows.find((r) => r.rowKey === row.rowKey)!.included, false)

    writeEdit({ db, propertyId, rowKey: row.rowKey, kind: 'include', actorId: TEST_OPERATOR })
    assert.equal(draftOf(db, propertyId).rows.find((r) => r.rowKey === row.rowKey)!.included, true)

    const trail = rowTrail(db, propertyId, row.rowKey)
    assert.deepEqual(trail.map((t) => t.kind), ['exclude', 'include'],
      'nothing updates or deletes — "why does this report not mention the attic" stays answerable')
    assert.ok(trail.every((t) => t.actorId === TEST_OPERATOR))
  })

  /**
   * §5 — every row shows which column it landed in and why.
   *
   * A sentence rather than a rule id, so a concierge can see a misclassification
   * rather than only a wrong sentence.
   */
  it('says why each row is in the column it is in, for both reasons', async () => {
    const { db, propertyId } = await audited()
    const withheld = draftOf(db, propertyId).withheld

    const unanswered = withheld.find((r) => r.source?.reason === 'not-reached')!
    assert.match(unanswered.columnBecause, /has no answer, so it is ours to carry/)

    // The other branch: answered, but with a reason the config marks as a gap.
    // Both have to say something a person can disagree with, or only half the
    // rows are checkable.
    const deferred = withheld.find((r) => r.source?.itemId === 'ses.termination-reconcile')!
    assert.match(deferred.columnBecause, /answered in a way the config marks as a gap/)
    assert.match(deferred.columnBecause, /at close-out/, 'a session item is asked OF the visit, not located in it')

    for (const row of withheld) {
      assert.ok(!/\brule\b|^[a-z]+-\d+$/.test(row.columnBecause), 'a rule id cannot be disagreed with')
    }
  })

  it('survives a re-run of the audit', async () => {
    const { db, propertyId } = await audited()
    writeName({ db, itemId: 'int.canvas', name: 'A wide photo set of the room', actorId: TEST_OPERATOR })
    const row = draftOf(db, propertyId).rows.find((r) => r.source?.itemId === 'int.canvas')!
    writeEdit({ db, propertyId, rowKey: row.rowKey, kind: 'exclude', actorId: TEST_OPERATOR })

    // A NEW run, which is what happens every time somebody presses the button.
    runAudit({ db, propertyId, visitKind: 'baseline', actorId: TEST_OPERATOR })

    const after = draftOf(db, propertyId).rows.find((r) => r.source?.itemId === 'int.canvas')!
    assert.equal(after.included, false,
      'edits key on the row, not the run — a concierge who excluded a row on Monday must not find it back on Tuesday')
  })

  it('preserves an edit kind it does not understand rather than dropping it', async () => {
    const { db, propertyId } = await audited()
    const row = draftOf(db, propertyId).withheld[0]!
    // A kind from a future build. Fail open on vocabulary: it is still a
    // decision somebody made, and the row must not vanish because of it.
    writeEdit({ db, propertyId, rowKey: row.rowKey, kind: 'endorse' as never, actorId: TEST_OPERATOR })
    const after = draftOf(db, propertyId)
    assert.ok(after.withheld.some((r) => r.rowKey === row.rowKey), 'the row is still there')
    assert.equal(rowTrail(db, propertyId, row.rowKey).length, 1, 'and the edit is still in the log')
  })
})

/**
 * The mitigation that let the field side decline per-item evidence capture.
 *
 * *A person looking at this before signing* is the whole defence against telling
 * a homeowner we did not capture something we are holding a photograph of.
 */
describe('media on the row', () => {
  it('shows what the pin or room holds, broken out by kind', async () => {
    const { db, propertyId } = await audited()
    const withMedia = draftOf(db, propertyId).withheld.filter((r) => r.media && r.media.total > 0)
    assert.ok(withMedia.length > 0, 'the reference export has a zone holding 28 photos, so this asserts something')

    for (const row of withMedia) {
      assert.ok(row.media!.ofKind.length > 0)
      // Bytes by kind, always — CLAUDE.md §5. Video is arriving, and minutes of
      // it outweigh a whole visit's photos.
      for (const k of row.media!.ofKind) {
        assert.equal(typeof k.bytes, 'number')
        assert.equal(typeof k.kind, 'string')
      }
      assert.ok(row.media!.recent.length <= 6, 'enough to look at, not the whole roll')
    }
  })

  /**
   * **Never a filter.** A water-heater pin with a wide shot and a nameplate but
   * no drain-pan photo must still say so about the drain pan — which is the row
   * that most needed saying.
   */
  it('never removes a row because its pin has photographs', async () => {
    const { db, propertyId } = await audited()
    const draft = draftOf(db, propertyId)
    const all = [...draft.rows, ...draft.withheld]
    const withMedia = all.filter((r) => r.media && r.media.total > 0)
    const withoutMedia = all.filter((r) => !r.media || r.media.total === 0)

    assert.ok(withMedia.length > 0 && withoutMedia.length > 0,
      'both kinds are present, so the absence of filtering is actually observable')
    assert.equal(all.length, 20, 'every carried item reaches the editor, photographs or not')
  })
})

/**
 * Amendment 1 §C plus the owner's ratification gate.
 *
 * A name goes into a company-wide file, so one person's wording becomes
 * everyone's. Written, usable, and marked until the design session confirms it.
 */
describe('inline naming', () => {
  it('makes a withheld row renderable, and marks the name unratified', async () => {
    const { db, propertyId } = await audited()
    const before = draftOf(db, propertyId)
    assert.equal(before.rows.length, 0, 'nothing is named yet, so nothing can be written')
    assert.equal(before.withheld.length, 20)

    writeName({ db, itemId: 'int.canvas', name: 'A wide photo set of the room', actorId: TEST_OPERATOR, propertyId })

    const after = draftOf(db, propertyId)
    assert.equal(after.rows.length, 1)
    const row = after.rows[0]!
    assert.match(row.text, /A wide photo set of the room/)
    assert.equal(row.nameRatified, false,
      'usable immediately — the concierge signs the sentence — and marked, because the table is company-wide')
    assert.equal(after.withheld.length, 19)
  })

  it('offers the unratified names with enough context to judge them', async () => {
    const { db, propertyId } = await audited()
    writeName({ db, itemId: 'int.canvas', name: 'A wide photo set of the room', actorId: TEST_OPERATOR, propertyId })

    const pending = unratifiedNames(db)
    assert.equal(pending.length, 1)
    // Never summon a human to a blank space — the wording, who wrote it, when,
    // and which house they were looking at.
    assert.equal(pending[0]!.name, 'A wide photo set of the room')
    assert.equal(pending[0]!.itemId, 'int.canvas')
    assert.equal(pending[0]!.actorId, TEST_OPERATOR)
    assert.equal(pending[0]!.propertyId, propertyId)
  })

  it('lets the reviewed file win over an inline proposal', async () => {
    const { db, propertyId } = await audited()
    writeName({ db, itemId: 'int.canvas', name: 'Whatever I typed', actorId: TEST_OPERATOR })

    const file = {
      version: '1.0.0', hash: 'x', declared: 1,
      describe: (id: string) => (id === 'int.canvas' ? { text: 'The room photo set', ratified: true } : undefined),
    }
    const row = buildDraft({ db, propertyId, describe: describeItems(db, file), labels: LABELS })
      .rows.find((r) => r.source?.itemId === 'int.canvas')!

    assert.match(row.text, /The room photo set/,
      'a ratified name is house style; letting a text box shadow it is the failure the gate exists for')
    assert.equal(row.nameRatified, true)
  })

  it('keeps every version of a name, latest winning', async () => {
    const { db, propertyId } = await audited()
    writeName({ db, itemId: 'int.canvas', name: 'First attempt', actorId: TEST_OPERATOR })
    writeName({ db, itemId: 'int.canvas', name: 'Second attempt', actorId: TEST_OPERATOR })

    const row = draftOf(db, propertyId).rows.find((r) => r.source?.itemId === 'int.canvas')!
    assert.match(row.text, /Second attempt/)
    const rows = db.prepare('SELECT name FROM client_names WHERE item_id = ? ORDER BY seq').all('int.canvas')
    assert.equal(rows.length, 2, 'append-only — what this said in March survives into September')
  })

  it('cannot ratify anything through the write path', () => {
    const source = readFileSync(join(repoRoot, 'server', 'src', 'report', 'names.ts'), 'utf8')
    const insert = source.slice(source.indexOf('INSERT INTO client_names'))
    assert.match(insert.slice(0, 400), /ratified_at, ratified_by[\s\S]*?NULL, NULL/,
      'the insert hardcodes NULL: the person confirming a name is not the person at the editor')
  })
})

/** The client-safe location, which is not the desk one. */
describe('where a row says it is', () => {
  it('never puts a zone type into a client sentence', async () => {
    const { db, propertyId } = await audited()
    // A zone nobody labelled. The desk still needs something to show; the client
    // sentence must compose without a location rather than say "the bathroom"
    // when that is a config type rather than a name somebody wrote.
    db.prepare('UPDATE zones SET label = NULL').run()
    runAudit({ db, propertyId, visitKind: 'baseline', actorId: TEST_OPERATOR })
    writeName({ db, itemId: 'int.canvas', name: 'A wide photo set of the room', actorId: TEST_OPERATOR })

    const row = draftOf(db, propertyId).rows.find((r) => r.source?.itemId === 'int.canvas')!
    assert.ok(!/bathroom|living-space/.test(row.text),
      'a zone TYPE is config vocabulary; "the living-space" in a homeowner\'s document is §2b in three words')
    assert.match(row.source!.where, /bathroom|unnamed/, 'the desk still gets something to show')
  })
})
