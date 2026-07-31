/**
 * The `since` ruling — Increment 4 §3.
 *
 * > It is the FIRST VISIT OF THE CURRENT UNBROKEN RUN of being outstanding. Not
 * > the first time it was ever outstanding — an item satisfied on visit two and
 * > unanswered again on visit three would tell a client it has been open for a
 * > year when it was closed for eleven months of it. Not the most recent carry
 * > either, or the clock resets every visit and the sentence stops meaning
 * > anything. And it needs the third state.
 *
 * Two halves. The scenarios that run a real manifest through a real import test
 * the shipped path end to end; the ones below them drive `outstandingSince`
 * against a hand-built record, because a pin retired for one visit and back the
 * next cannot be produced by re-importing one export and the transparency rule
 * is exactly what needs proving.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { activeItemSet } from '../src/audit/activeItems.js'
import type { ActiveItem, ActiveItemSet } from '../src/audit/activeItems.js'
import { outstandingSince } from '../src/audit/outstandingSince.js'
import { runAudit } from '../src/audit/run.js'
import type { Db } from '../src/db/index.js'
import { now } from '../src/db/index.js'
import { runImport } from '../src/import/runImport.js'
import { buildSessionPlan } from '../src/plan/sessionPlan.js'
import { addVisit, freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'

/** The reference export, restamped as a different walk on a different day. */
function asWalk(opts: { sessionId: string; startedAt: string; resolve?: Resolve[] }): string {
  const m = JSON.parse(readReference()) as {
    session: { sessionId: string; startedAt: string; completedAt: string }
    resolutions: unknown[]
  }
  m.session.sessionId = opts.sessionId
  m.session.startedAt = opts.startedAt
  m.session.completedAt = opts.startedAt
  for (const r of opts.resolve ?? []) {
    m.resolutions.push({
      scope: r.scope,
      itemId: r.itemId,
      resolution: r.reasonId
        ? { kind: 'na', reasonId: r.reasonId }
        : { kind: 'satisfied', via: 'check' },
      at: opts.startedAt,
      source: { actor: 'human', actorId: 'inspector', device: 'test', appVersion: '0.5.0' },
    })
  }
  return JSON.stringify(m)
}

interface Resolve {
  scope: { kind: string; zoneId?: string; pinId?: string }
  itemId: string
  /** Set for an `na`; omitted for a satisfied check. */
  reasonId?: string
}

const plan = (db: Db, propertyId: string) => buildSessionPlan({ db, propertyId, generatedBy: TEST_OPERATOR })

/** One visit, one import, audited. */
async function visit(
  db: Db,
  ids: { propertyId: string; visitId: string },
  raw: string,
  kind = 'baseline',
): Promise<void> {
  await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw, dataDir: scratchDir() })
  runAudit({ db, propertyId: ids.propertyId, visitId: ids.visitId, visitKind: kind, actorId: TEST_OPERATOR })
}

describe('since — the current unbroken run', () => {
  /**
   * The baseline alone. One visit, so the run is one visit long and the date is
   * that walk — which is also what the old `dueSince` read gave, and is why a
   * single-visit fixture could never have caught the defect.
   */
  it('dates a one-visit run to that visit', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await visit(db, ids, readReference())

    const gaps = plan(db, ids.propertyId).carriedGaps
    assert.equal(gaps.length, 20)
    assert.ok(gaps.every((g) => g.sinceBasis === 'dated'))
    assert.ok(gaps.every((g) => g.since === '2026-07-25'))
    assert.ok(gaps.every((g) => g.sinceRunVisits === 1))
  })

  /**
   * **Not the most recent carry.** Two visits, the same items unanswered at
   * both: the sentence has to say the baseline, not last week.
   *
   * **Both visits are `baseline` kind, and that is a fixture constraint rather
   * than a scenario.** Every session item in this config declares
   * `scope: ["baseline"]`, so on a `monthly` the checklist never asks them and
   * they are not due — which the run walk correctly steps over, and which would
   * make this test about transparency instead of about reach-back. The one that
   * exercises transparency does it deliberately, below.
   */
  it('reaches back through a second visit that also left it open', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await visit(db, ids, readReference())

    const second = addVisit(db, ids.propertyId, 'baseline')
    await visit(db, { propertyId: ids.propertyId, visitId: second },
      asWalk({ sessionId: 'session-2', startedAt: '2026-09-12T14:00:00.000Z' }))

    const gaps = plan(db, ids.propertyId).carriedGaps
    assert.ok(gaps.length > 0)
    assert.ok(gaps.every((g) => g.since === '2026-07-25'),
      'still open, so the run began at the baseline — not at the visit that most recently carried it')
    assert.ok(gaps.every((g) => g.sinceRunVisits === 2))
    assert.ok(gaps.every((g) => /2 consecutive visits/.test(g.sinceNote)))
  })

  /**
   * **Not the first time it was ever outstanding.** The headline case, and the
   * one the shipped code got wrong.
   *
   * `ses.termination-reconcile` is deferred on the baseline — it is the export's
   * one gap-feeding `na`. Visit two satisfies it; visit three defers it again.
   * `dueSince` says the baseline and would age it by the whole gap; the run says
   * visit three, which is the truth.
   */
  it('starts a new run after an answer, rather than aging an item by the months it was closed', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await visit(db, ids, readReference())

    const item = 'ses.termination-reconcile'
    const scope = { kind: 'session' }

    const second = addVisit(db, ids.propertyId, 'baseline')
    await visit(db, { propertyId: ids.propertyId, visitId: second },
      asWalk({ sessionId: 'session-2', startedAt: '2026-09-12T14:00:00.000Z', resolve: [{ scope, itemId: item }] }))
    // Answered on visit two, so it leaves the stream entirely.
    assert.equal(plan(db, ids.propertyId).carriedGaps.filter((g) => g.itemId === item).length, 0)

    const third = addVisit(db, ids.propertyId, 'baseline')
    await visit(db, { propertyId: ids.propertyId, visitId: third },
      asWalk({
        sessionId: 'session-3',
        startedAt: '2026-10-14T14:00:00.000Z',
        resolve: [{ scope, itemId: item, reasonId: 'deferred' }],
      }))

    const gap = plan(db, ids.propertyId).carriedGaps.find((g) => g.itemId === item)!
    assert.equal(gap.reason, 'deferred')
    assert.equal(gap.since, '2026-10-14', 'the run began when it reopened, not when it first came up')
    assert.equal(gap.sinceRunVisits, 1)
    assert.match(gap.sinceNote, /the visit before it holds an answer/)

    // And `dueSince` still points at the baseline import — the two facts are
    // both kept, under their own names, and neither stands in for the other.
    const gaps = plan(db, ids.propertyId).carriedGaps
    const untouched = gaps.find((g) => g.itemId !== item)!
    assert.equal(untouched.since, '2026-07-25')
  })

  /**
   * **The third state.** The property's record starts at a monthly, so there
   * were visits before this database existed and the run may have started at
   * one of them.
   *
   * The old code would have dated every one of these to the earliest visit that
   * happens to exist — a confident wrong date, and rule 7 exactly: a fallback
   * whose input is always present never announces that it could not answer.
   */
  it('refuses to date a run that reaches a record which does not start at a baseline', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'monthly' })
    await visit(db, ids, readReference(), 'monthly')

    const p = plan(db, ids.propertyId)
    const gaps = p.carriedGaps
    assert.ok(gaps.length > 0)
    assert.ok(gaps.every((g) => g.sinceBasis === 'predates-record'))
    assert.ok(gaps.every((g) => g.since === null), 'no date, rather than the earliest one that exists')
    assert.ok(gaps.every((g) => g.sinceVisitId === ids.visitId),
      'the visit it reaches is still named — an unknown start is not an unknown record')
    assert.ok(gaps.every((g) => /cannot be stated/.test(g.sinceNote)))

    assert.ok(p.warnings.some((w) => /earliest visit on record is `monthly`, not `baseline`/.test(w)))
    assert.match(p.sections.carriedGaps.note, /predates-record/)
  })

  /**
   * No session start, so the run's visit is known and its date is not. A
   * different silence from `predates-record`, and it says which.
   */
  it('names the visit but withholds the date when the manifest carries no session start', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await visit(db, ids, readReference())
    db.prepare('UPDATE session_meta SET started_at = NULL').run()

    const p = plan(db, ids.propertyId)
    assert.ok(p.carriedGaps.every((g) => g.sinceBasis === 'undated'))
    assert.ok(p.carriedGaps.every((g) => g.since === null))
    assert.ok(p.carriedGaps.every((g) => g.sinceVisitId === ids.visitId))
    assert.ok(p.carriedGaps.every((g) => g.firstDueImportedAt !== null),
      'the import timestamp is still there under its own name, and is not promoted into `since`')
    assert.match(p.sections.carriedGaps.note, /not defaulted to the import timestamp/)
  })

  /**
   * `since` follows the WALK, not the upload.
   *
   * A baseline walked in March and imported in June happened before a monthly
   * walked in April. Import order would put them the wrong way round and date
   * the run to April.
   */
  it('orders visits by the walk rather than the upload, and says when the two differ', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    const second = addVisit(db, ids.propertyId, 'monthly')

    // The monthly is uploaded first, though it was walked second.
    await visit(db, { propertyId: ids.propertyId, visitId: second },
      asWalk({ sessionId: 'session-2', startedAt: '2026-09-12T14:00:00.000Z' }), 'monthly')
    await visit(db, ids, readReference())

    const p = plan(db, ids.propertyId)
    assert.ok(p.carriedGaps.every((g) => g.since === '2026-07-25'),
      'the July walk is the start of the run even though it was imported second')
    assert.ok(p.warnings.some((w) => /sort differently by walk date than by import order/.test(w)))
  })
})

// ---------------------------------------------------------------------------
// The unit half. A record built by hand, because these shapes cannot be made by
// re-importing one export.
// ---------------------------------------------------------------------------

/** A property with N visits, each with one import, in the order given. */
function record(visits: { kind: string; startedAt: string | null; importedAt: string }[]): {
  db: Db; propertyId: string; visitIds: string[]; importIds: string[]
} {
  const db = freshDb()
  const propertyId = 'prop-1'
  db.prepare('INSERT INTO properties (id, label, address, created_at, actor_id) VALUES (?, ?, NULL, ?, ?)')
    .run(propertyId, 'Hand-built', now(), TEST_OPERATOR)

  const visitIds: string[] = []
  const importIds: string[] = []
  visits.forEach((v, i) => {
    const visitId = `v${i + 1}`
    const importId = `i${i + 1}`
    db.prepare(
      `INSERT INTO visits (id, property_id, kind, visit_date, notes, created_at, actor_id, performed_by)
       VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)`,
    ).run(visitId, propertyId, v.kind, now(), TEST_OPERATOR, TEST_OPERATOR)
    db.prepare(
      `INSERT INTO imports (id, property_id, visit_id, producer, imported_at, media_mode,
        raw_manifest, validation_report, status, actor_id, created_at)
       VALUES (?, ?, ?, 'housesteady-field', ?, 'none', '{}', '{}', 'complete', ?, ?)`,
    ).run(importId, propertyId, visitId, v.importedAt, TEST_OPERATOR, now())
    if (v.startedAt) {
      db.prepare(
        `INSERT INTO session_meta (import_id, session_id, property_label, started_at, completed_at,
          exported_at, lifecycle, flags, totals, created_at)
         VALUES (?, ?, 'Hand-built', ?, ?, ?, '[]', '[]', '{}', ?)`,
      ).run(importId, `s${i + 1}`, v.startedAt, v.startedAt, v.startedAt, now())
    }
    visitIds.push(visitId)
    importIds.push(importId)
  })
  return { db, propertyId, visitIds, importIds }
}

/** One resolution row against the session scope. */
function resolve(
  db: Db,
  args: { importId: string; visitId: string; itemId: string; kind: string; reasonId?: string; feeds: number },
): void {
  db.prepare(
    `INSERT INTO resolutions (import_id, property_id, visit_id, scope_kind, scope_zone_id, scope_pin_id,
      item_id, kind, via, result, note, reason_id, evidence, at, source, is_recognized,
      feeds_gap_list, records_finding, created_at)
     VALUES (?, 'prop-1', ?, 'session', NULL, NULL, ?, ?, 'check', NULL, NULL, ?, '[]', ?, '{}', 1, ?, 0, ?)`,
  ).run(args.importId, args.visitId, args.itemId, args.kind, args.reasonId ?? null, now(), args.feeds, now())
}

/** An active set holding one session-scoped item, due at the visits given. */
function activeAt(itemId: string, dueAt: string[]): ActiveItemSet {
  const item: ActiveItem = {
    scope: { kind: 'session', zoneId: null, pinId: null },
    itemId,
    tier: 'standard',
    source: 'session',
    certain: true,
    unrecognised: [],
    group: null,
    status: null,
    origin: 'computed',
    dueSince: { importId: 'i1', visitId: 'v1', at: '2026-07-25' },
    dueAt,
    where: 'this visit',
    whereLabel: null,
    itemText: null,
  }
  return { items: new Map([[`session/${itemId}`, item]]), origins: { received: 0, computed: 1 }, warnings: [] }
}

describe('since — what breaks a run and what does not', () => {
  /**
   * **A visit that did not ask it is transparent.**
   *
   * Outstanding on visit one, not due on visit two — a pin retired for a month,
   * a zone attribute untoggled — outstanding again on visit three. Nothing ever
   * answered it, so the run is unbroken and reaches visit one. Treating the
   * silence as an answer would reset the clock on a question nobody closed.
   */
  it('steps over a visit that never asked the item, rather than treating it as an answer', () => {
    const { db, propertyId } = record([
      { kind: 'baseline', startedAt: '2026-03-01T10:00:00Z', importedAt: '2026-03-02' },
      { kind: 'monthly', startedAt: '2026-04-01T10:00:00Z', importedAt: '2026-04-02' },
      { kind: 'monthly', startedAt: '2026-05-01T10:00:00Z', importedAt: '2026-05-02' },
    ])
    const active = activeAt('ses.x', ['v1', 'v3'])

    const out = outstandingSince({ db, propertyId, active, keys: ['session/ses.x'], snapshot: {} })
    const run = out.since.get('session/ses.x')!
    assert.equal(run.basis, 'dated')
    assert.equal(run.date, '2026-03-01')
    assert.equal(run.runVisits, 2, 'the middle visit is stepped over, so it is not counted either')
  })

  /** An answer, however old, bounds the run. */
  it('breaks the run on an answer and does not look past it', () => {
    const { db, propertyId, importIds, visitIds } = record([
      { kind: 'baseline', startedAt: '2026-03-01T10:00:00Z', importedAt: '2026-03-02' },
      { kind: 'monthly', startedAt: '2026-04-01T10:00:00Z', importedAt: '2026-04-02' },
      { kind: 'monthly', startedAt: '2026-05-01T10:00:00Z', importedAt: '2026-05-02' },
    ])
    // Deferred on the baseline, satisfied in April, deferred again in May.
    resolve(db, { importId: importIds[0]!, visitId: visitIds[0]!, itemId: 'ses.x', kind: 'na', reasonId: 'deferred', feeds: 1 })
    resolve(db, { importId: importIds[1]!, visitId: visitIds[1]!, itemId: 'ses.x', kind: 'satisfied', feeds: 0 })
    resolve(db, { importId: importIds[2]!, visitId: visitIds[2]!, itemId: 'ses.x', kind: 'na', reasonId: 'deferred', feeds: 1 })

    const active = activeAt('ses.x', ['v1', 'v2', 'v3'])
    const run = outstandingSince({ db, propertyId, active, keys: ['session/ses.x'], snapshot: {} })
      .since.get('session/ses.x')!
    assert.equal(run.date, '2026-05-01', 'March is behind an answer and is a different run')
    assert.equal(run.runVisits, 1)
  })

  /**
   * **Membership is read from the import's own config, not today's.**
   *
   * `resolutions.feeds_gap_list` is written at import time. A reason that fed
   * the gap list two years ago fed it then, whatever the current config says —
   * re-deciding history with a newer config is the config-decides rule pointed
   * backwards.
   */
  it('reads each visit\'s own feedsGapList rather than re-deciding history', () => {
    const { db, propertyId, importIds, visitIds } = record([
      { kind: 'baseline', startedAt: '2026-03-01T10:00:00Z', importedAt: '2026-03-02' },
      { kind: 'monthly', startedAt: '2026-04-01T10:00:00Z', importedAt: '2026-04-02' },
    ])
    // The same reason id, recorded twice, and the two imports' configs disagreed
    // about whether it feeds the gap list. Both stored answers stand.
    resolve(db, { importId: importIds[0]!, visitId: visitIds[0]!, itemId: 'ses.x', kind: 'na', reasonId: 'held', feeds: 0 })
    resolve(db, { importId: importIds[1]!, visitId: visitIds[1]!, itemId: 'ses.x', kind: 'na', reasonId: 'held', feeds: 1 })

    // Today's config declares `held` and does not mark it gap-feeding, so the
    // unrecognised branch cannot be what carries this.
    const snapshot = { naReasons: [{ id: 'held', label: 'Held', feedsGapList: false }] }
    const run = outstandingSince({
      db, propertyId, active: activeAt('ses.x', ['v1', 'v2']), keys: ['session/ses.x'], snapshot,
    }).since.get('session/ses.x')!

    assert.equal(run.date, '2026-04-01', 'March was not a gap under March\'s config, so the run starts in April')
    assert.equal(run.runVisits, 1)
  })

  /**
   * **A run bounded by an answer is dated even where the record does not reach
   * the property's first visit**, and the two items in one record prove the
   * distinction is about evidence rather than about the record's edge.
   *
   * `ses.x` was answered on the record's earliest visit, so its run has a real
   * left edge and the date stands. `ses.y` was never answered, so its run runs
   * off the front of the record and cannot be dated.
   */
  it('dates a run an answer bounds, and refuses the one that runs off the record', () => {
    const { db, propertyId, importIds, visitIds } = record([
      { kind: 'monthly', startedAt: '2026-03-01T10:00:00Z', importedAt: '2026-03-02' },
      { kind: 'monthly', startedAt: '2026-04-01T10:00:00Z', importedAt: '2026-04-02' },
    ])
    resolve(db, { importId: importIds[0]!, visitId: visitIds[0]!, itemId: 'ses.x', kind: 'satisfied', feeds: 0 })
    resolve(db, { importId: importIds[1]!, visitId: visitIds[1]!, itemId: 'ses.x', kind: 'na', reasonId: 'deferred', feeds: 1 })

    const items = new Map([
      ...activeAt('ses.x', ['v1', 'v2']).items,
      ...activeAt('ses.y', ['v1', 'v2']).items,
    ])
    const out = outstandingSince({
      db,
      propertyId,
      active: { items, origins: { received: 0, computed: 2 }, warnings: [] },
      keys: ['session/ses.x', 'session/ses.y'],
      snapshot: {},
    })

    const bounded = out.since.get('session/ses.x')!
    assert.equal(bounded.basis, 'dated')
    assert.equal(bounded.date, '2026-04-01', 'March holds an answer, so the run genuinely began in April')

    const unbounded = out.since.get('session/ses.y')!
    assert.equal(unbounded.basis, 'predates-record')
    assert.equal(unbounded.date, null)
    assert.equal(out.recordReachesBack, false)
  })

  /** An `na` whose reason today's config cannot name is counted, matching `carriedItems`. */
  it('counts an unrecognised na reason as outstanding rather than deciding it away', () => {
    const { db, propertyId, importIds, visitIds } = record([
      { kind: 'baseline', startedAt: '2026-03-01T10:00:00Z', importedAt: '2026-03-02' },
    ])
    resolve(db, { importId: importIds[0]!, visitId: visitIds[0]!, itemId: 'ses.x', kind: 'na', reasonId: 'invented', feeds: 0 })

    const run = outstandingSince({
      db, propertyId, active: activeAt('ses.x', ['v1']), keys: ['session/ses.x'], snapshot: { naReasons: [] },
    }).since.get('session/ses.x')!
    assert.equal(run.basis, 'dated')
    assert.equal(run.date, '2026-03-01')
  })

  /** A visit-less import has no walk to date anything to, and says so under its own name. */
  it('names `no-visit` rather than returning a bare null', () => {
    const { db, propertyId } = record([
      { kind: 'baseline', startedAt: '2026-03-01T10:00:00Z', importedAt: '2026-03-02' },
    ])
    const run = outstandingSince({
      db, propertyId, active: activeAt('ses.x', []), keys: ['session/ses.x'], snapshot: {},
    }).since.get('session/ses.x')!
    assert.equal(run.basis, 'no-visit')
    assert.equal(run.date, null)
    assert.match(run.note, /no walk to date it to/)
  })

  /**
   * A gap the resolution history says is answered everywhere.
   *
   * The two streams disagree, and the emitter reports the disagreement instead
   * of inventing a date for it — the same treatment `zones[].audit` gets.
   */
  it('reports a gap whose history holds an answer at every visit, rather than dating it', () => {
    const { db, propertyId, importIds, visitIds } = record([
      { kind: 'baseline', startedAt: '2026-03-01T10:00:00Z', importedAt: '2026-03-02' },
    ])
    resolve(db, { importId: importIds[0]!, visitId: visitIds[0]!, itemId: 'ses.x', kind: 'satisfied', feeds: 0 })

    const out = outstandingSince({
      db, propertyId, active: activeAt('ses.x', ['v1']), keys: ['session/ses.x'], snapshot: {},
    })
    assert.equal(out.since.get('session/ses.x')!.basis, 'no-visit')
    assert.ok(out.warnings.some((w) => /carried as a gap but no visit on record has it outstanding/.test(w)))
  })

  /** A baseline that is not first is a record problem, and is said out loud. */
  it('flags a baseline sitting anywhere but first in the sequence', () => {
    const { db, propertyId } = record([
      { kind: 'monthly', startedAt: '2026-03-01T10:00:00Z', importedAt: '2026-03-02' },
      { kind: 'baseline', startedAt: '2026-04-01T10:00:00Z', importedAt: '2026-04-02' },
    ])
    const out = outstandingSince({
      db, propertyId, active: activeAt('ses.x', ['v1', 'v2']), keys: ['session/ses.x'], snapshot: {},
    })
    assert.ok(out.warnings.some((w) => /`baseline` sits at position 2 of 2/.test(w)))
    assert.equal(out.recordReachesBack, false)
  })

  /** `dueAt` is a history, not a first-or-last. Two imports on one visit are one visit. */
  it('accumulates every visit an item was due at, deduplicated by visit', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const second = addVisit(db, ids.propertyId, 'baseline')
    await runImport({
      actorId: TEST_OPERATOR, db, propertyId: ids.propertyId, visitId: second,
      raw: asWalk({ sessionId: 'session-2', startedAt: '2026-09-12T14:00:00.000Z' }),
      dataDir: scratchDir(),
    })

    const set = activeItemSet(db, ids.propertyId)
    const sample = [...set.items.values()].find((i) => i.scope.kind === 'zone')!
    assert.deepEqual(sample.dueAt, [ids.visitId, second])
    assert.equal(sample.dueSince.visitId, ids.visitId, 'dueSince still means the first, unchanged')
  })
})
