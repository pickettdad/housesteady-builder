/**
 * The first real walk, redacted — `fixtures/walk-2026-07-31/`.
 *
 * **These tests are the fixture's purpose written down.** A change that breaks
 * one of them has changed what the fixture is *for*, not merely what is in it —
 * and the point of a fixture nobody can casually re-cut is that it keeps
 * exercising the things nothing else reaches.
 *
 * The directory README says what was redacted. Everything asserted here survived
 * that redaction unchanged: the real manifest and this one were imported side by
 * side and produced identical zone agreement, due counts, gap counts and values.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { activeItemSet } from '../src/audit/activeItems.js'
import { answersForProperty } from '../src/audit/answers.js'
import { runAudit } from '../src/audit/run.js'
import { auditZones } from '../src/audit/zoneAudit.js'
import type { Db } from '../src/db/index.js'
import { runImport } from '../src/import/runImport.js'
import { buildReport } from '../src/import/report.js'
import { buildSessionPlan } from '../src/plan/sessionPlan.js'
import { freshDb, makePropertyAndVisit, readWalk, scratchDir, TEST_OPERATOR } from './helpers.js'

async function walked(): Promise<{ db: Db; propertyId: string; visitId: string; importId: string }> {
  const db = freshDb()
  const ids = makePropertyAndVisit(db, { kind: 'baseline' })
  const { importId } = await runImport({
    actorId: TEST_OPERATOR, db, ...ids, raw: readWalk(), dataDir: scratchDir(),
  })
  runAudit({ db, propertyId: ids.propertyId, visitId: ids.visitId, visitKind: 'baseline', actorId: TEST_OPERATOR })
  return { db, ...ids, importId }
}

describe('the walk fixture — what it must keep doing', () => {
  /**
   * **The oracle, on data that can actually exercise it.**
   *
   * This is the check that agreed for four increments while being wrong. The
   * reference export could not tell a right answer from a wrong one — one typed
   * live pin, its five items all resolved, so the fold contributed zero either
   * way. Eight zones and seventeen pins can.
   */
  it('agrees with all eight exported zone audit summaries, item for item', async () => {
    const { db, importId } = await walked()
    const zones = auditZones(db, importId, 'baseline')

    assert.equal(zones.length, 8)
    assert.equal(zones.filter((z) => z.imported).length, 8, 'every zone carries a summary to check against')
    for (const z of zones) {
      assert.deepEqual(z.differences, [], `${z.label}: ${z.differences.join(' · ')}`)
    }
  })

  it('holds 213 items due and 208 carried gaps from 5 resolutions', async () => {
    const { db, propertyId } = await walked()
    const set = activeItemSet(db, propertyId)
    const byScope = { zone: 0, pin: 0, session: 0 }
    for (const i of set.items.values()) byScope[i.scope.kind as keyof typeof byScope] += 1

    assert.deepEqual(byScope, { zone: 156, pin: 52, session: 5 })
    assert.equal(set.items.size, 213)
    assert.equal(buildSessionPlan({ db, propertyId, generatedBy: TEST_OPERATOR }).carriedGaps.length, 208)
  })

  /**
   * **The wire shape of a recorded value, which no export had ever carried.**
   *
   * A `measure` with a unit and a `choice` — the two things §1f needed and could
   * not have. `26` stays a string, verbatim from the manifest.
   */
  it('carries a measure with a unit and a choice, read from evidence.value', async () => {
    const { db, propertyId } = await walked()
    const a = answersForProperty(db, propertyId)

    assert.equal(a.values.get('liv.egress-sill'), '26', 'verbatim — the manifest says "26", not 26')
    assert.equal(a.values.get('att.access-honesty'), 'no access')

    const measured = a.found.find((f) => f.itemId === 'liv.egress-sill')!
    assert.equal(measured.carrier, 'evidence.value')
    assert.equal(measured.unit, 'in')
    assert.equal(measured.declaredUnit, 'in', 'and the config agrees, so nothing is reported as mismatched')
    assert.deepEqual(a.ambiguous, [])
  })

  /**
   * `fine` is settable in the shipping app and is not in the Manifest Contract.
   * Session-Plan Contract §9 predicted it would surface as unmet vocabulary the
   * first time somebody tapped it. **This is that first time**, six times over —
   * preserved, counted, and never treated as a monitor.
   */
  it('surfaces the `fine` flag as unmet vocabulary rather than dropping it', async () => {
    const { db, propertyId } = await walked()
    const plan = buildSessionPlan({ db, propertyId, generatedBy: TEST_OPERATOR })

    assert.match(plan.sections.monitorsDue.note, /6 fine/)
    assert.match(plan.sections.monitorsDue.note, /1 issue/)
    assert.equal(plan.monitorsDue.length, 0, '`fine` is not a monitor and is not guessed into being one')
    assert.ok(plan.warnings.some((w) => /does not recognise: fine \(6\)/.test(w)))
  })

  /** Video, and the storage arithmetic broken out by kind — CLAUDE.md §5. */
  it('carries video, and reports bytes by media kind', async () => {
    const { db, importId } = await walked()
    const media = db.prepare('SELECT kind, COUNT(*) n, SUM(bytes) b FROM media WHERE import_id = ? GROUP BY kind')
      .all(importId) as { kind: string; n: number; b: number }[]
    const byKind = Object.fromEntries(media.map((m) => [m.kind, m.n]))

    assert.deepEqual(byKind, { photo: 157, video: 4, voice: 2 })
    assert.equal(media.reduce((t, m) => t + m.b, 0), 528625165, 'mediaBytes survives the redaction')
  })

  /** The event shapes nothing else has: a retirement, three reopens, discards. */
  it('carries the lifecycle events no other fixture has', async () => {
    const { db, importId } = await walked()
    const counts = Object.fromEntries(
      (db.prepare('SELECT type, COUNT(*) n FROM events WHERE import_id = ? GROUP BY type').all(importId) as
        { type: string; n: number }[]).map((r) => [r.type, r.n]),
    )
    for (const [type, n] of Object.entries({
      ZoneReopened: 3, PinRetired: 1, ItemReopened: 1, MediaDiscarded: 3,
      ExportProduced: 1, SessionCompleted: 1,
    })) {
      assert.equal(counts[type], n, `${type}`)
    }
  })

  /**
   * **The redaction is a property of the fixture, not a one-off script run.**
   *
   * If somebody re-cuts this from a newer walk and forgets a field, this is what
   * says so. Checked by path rather than by word, because the first attempt at
   * this grepped for content and flagged the config's own checklist text.
   */
  /**
   * **The redaction check, by SHAPE rather than by a list somebody maintains.**
   *
   * The first version of this asserted specific fields were clean — and it
   * missed `zones[].closeNote` entirely, because a check that only inspects keys
   * you already thought of cannot flag the one you did not. Rule 11 in the
   * redaction's own verification: its discriminating power depended on my memory
   * being complete.
   *
   * So this finds every prose-like string in the file — three or more words,
   * not a uuid, hash, timestamp or lowercase token — and requires each one to
   * sit at a path that is *declared* either redacted or deliberately kept.
   * **A new free-text field in a future export fails here rather than shipping.**
   */
  it('leaves no prose-like field unaccounted for, found by shape not by list', () => {
    const m = JSON.parse(readWalk()) as Record<string, unknown>

    // Kept on purpose: the AI thread names nobody and is the only captured
    // thread that exists; zone labels are generic vocabulary and the
    // label-versus-type distinction is a live test.
    const KEPT = new Set(['.chats[].messages[].text', '.events[].label', '.zones[].label'])
    const REDACTED = new Set([
      '.session.propertyLabel', '.events[].propertyLabel', '.notes[].text', '.events[].text',
      '.resolutions[].resolution.note', '.events[].resolution.note', '.zones[].closeNote',
      '.events[].note',
    ])

    const unaccounted: string[] = []
    const walk = (node: unknown, path: string, inConfig: boolean): void => {
      if (Array.isArray(node)) { for (const v of node) walk(v, `${path}[]`, inConfig); return }
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, inConfig || k === 'config')
        return
      }
      if (typeof node !== 'string' || inConfig) return
      if (/^[0-9a-f-]{36}$/.test(node) || /^[0-9a-f]{64}$/.test(node)) return
      if (/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(node) || /^[a-z0-9][a-z0-9._/-]*$/.test(node)) return
      if (node.split(/\s+/).length < 3) return
      if (!KEPT.has(path) && !REDACTED.has(path)) unaccounted.push(`${path}: ${node.slice(0, 60)}`)
    }
    walk(m, '', false)

    assert.deepEqual(unaccounted, [],
      'a prose field at a path nobody declared is a field nobody decided about')
  })

  it('carries no real-house text, and keeps the config and chat verbatim', () => {
    const m = JSON.parse(readWalk()) as {
      session: { propertyLabel: string }
      notes: { text: string }[]
      chats: { messages: { role: string; text: string }[] }[]
      config: { version: string; snapshot: Record<string, unknown> }
      media: { sha256: string }[]
    }

    assert.equal(m.session.propertyLabel, 'Property ID 7XKQ2M4B', 'the owner\'s label is gone')
    assert.equal(m.config.version, '1.11.0', 'the config is the point and is untouched')
    assert.ok(m.notes.every((n) => n.text.length > 0), 'notes are replaced, never emptied — length is a test')
    assert.ok(m.chats[0]!.messages.some((x) => x.role === 'assistant' && x.text.length > 100),
      'the AI reply is kept — it names nobody and is the only captured thread that exists')
    assert.equal(new Set(m.media.map((x) => x.sha256)).size, m.media.length,
      'rehashed checksums stay unique, so dedup behaviour is unchanged')
  })

  it('imports with media absent and says so, rather than pretending', async () => {
    const { db, importId } = await walked()
    const report = buildReport(db, importId)!
    assert.ok(report.validation.checks.some((c) => c.code === 'media.absent'))
    assert.equal(report.visit.walkedDate, '2026-07-31')
  })
})
