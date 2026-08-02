/**
 * Increment 4 §4 and §7 — the two items claimed from Increment 3, and desk-work
 * timing. This closes Increment 4.
 *
 * §4 claims **§1d** (cross-visit discontinuity display, internal only) and
 * **§1f** (`answer.*` operators). §7 is the desk-work timestamps.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { answersForProperty } from '../src/audit/answers.js'
import { itemSeries } from '../src/audit/itemSeries.js'
import { evaluate, noFacts, parseCondition, ConditionRefused } from '../src/audit/triggers.js'
import { visitSequence } from '../src/audit/visitSequence.js'
import { deskWork, DeskWorkRefused, runningSpan, startWork, stopWork } from '../src/desk/work.js'
import type { Db } from '../src/db/index.js'
import { runImport } from '../src/import/runImport.js'
import { addVisit, freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'

/** The reference export, restamped, with items optionally removed from its config. */
function walk(opts: { sessionId: string; startedAt: string; dropItems?: string[] }): string {
  const m = JSON.parse(readReference()) as {
    session: { sessionId: string; startedAt: string; completedAt: string }
    config: { version: string; snapshot: Record<string, unknown> }
  }
  m.session.sessionId = opts.sessionId
  m.session.startedAt = opts.startedAt
  m.session.completedAt = opts.startedAt
  if (opts.dropItems?.length) {
    // A retirement, as the record sees one: the item is simply absent from the
    // later config. Version bumped so the break can name what changed.
    m.config.version = '1.9.0'
    const drop = new Set(opts.dropItems)
    const strip = (items: unknown): unknown =>
      Array.isArray(items) ? items.filter((i) => !drop.has((i as { id?: string })?.id ?? '')) : items
    for (const key of ['baseLists', 'zoneLists', 'componentLists']) {
      const lists = m.config.snapshot[key]
      if (Array.isArray(lists)) for (const l of lists) (l as { items?: unknown }).items = strip((l as { items?: unknown }).items)
    }
    m.config.snapshot.sessionItems = strip(m.config.snapshot.sessionItems)
  }
  return JSON.stringify(m)
}

// ---------------------------------------------------------------------- §1d

describe('§1d — a retirement ends the series, it does not continue it', () => {
  /**
   * The worked case, from Checklist Master §2 and Table F.
   *
   * `int.canvas` is answered on the baseline. Visit two arrives under a config
   * that no longer declares it. The answers before and after are answers to
   * different questions, and **software must never join them.**
   */
  async function retired(): Promise<{ db: Db; propertyId: string }> {
    const db = freshDb()
    const dir = scratchDir()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: dir })

    const second = addVisit(db, ids.propertyId, 'baseline')
    await runImport({
      actorId: TEST_OPERATOR, db, propertyId: ids.propertyId, visitId: second,
      raw: walk({ sessionId: 's2', startedAt: '2026-09-12T14:00:00.000Z', dropItems: ['int.canvas'] }),
      dataDir: dir,
    })
    return { db, propertyId: ids.propertyId }
  }

  it('ends the run at the last answer recorded under a config that declared the item', async () => {
    const { db, propertyId } = await retired()
    const found = itemSeries({ db, propertyId, includeSingletons: true })
      .series.filter((s) => s.itemId === 'int.canvas')

    assert.ok(found.length > 0, 'the reference export answers int.canvas, so there is a series to break')
    for (const s of found) {
      assert.equal(s.discontinuous, true)
      assert.equal(s.breaks.length, 1)
      assert.equal(s.breaks[0]!.reason, 'retired')
      assert.equal(s.breaks[0]!.lastDeclaredUnder, '1.2.1')
      assert.equal(s.breaks[0]!.notDeclaredUnder, '1.9.0')
    }
  })

  /**
   * **The shape refuses the join; a flag would only ask for it.**
   *
   * Runs are separate arrays rather than one array with a marker, because a
   * consumer rendering a list would draw the marker as a row and the line as
   * continuous — which is the false continuity the master's rule exists to stop.
   */
  it('returns separate runs rather than one series with a marker in it', async () => {
    const { db, propertyId } = await retired()
    const s = itemSeries({ db, propertyId, includeSingletons: true })
      .series.find((x) => x.itemId === 'int.canvas' && x.discontinuous)!

    assert.ok(Array.isArray(s.runs[0]), 'runs is an array of arrays')
    // Nothing in a run is a marker — every entry is an answer.
    for (const run of s.runs) for (const point of run) assert.ok('kind' in point && 'visitId' in point)
    const flattened = s.runs.flat()
    assert.equal(flattened.length, s.runs.reduce((n, r) => n + r.length, 0), 'no entry belongs to two runs')
  })

  /**
   * **`successors: null`, not `[]`** — and this is rule 7 in the one place the
   * input genuinely is always absent.
   *
   * Table F lives in the Checklist Master, which is read-only reference and which
   * a doctrine scan forbids any code path from reading. An empty array would say
   * *this item has no successors*; null says *this repo has never been given the
   * lineage*, which is the truth.
   */
  it('says the lineage is unavailable rather than reporting no successors', async () => {
    const { db, propertyId } = await retired()
    const result = itemSeries({ db, propertyId, includeSingletons: true })
    const broken = result.series.find((s) => s.discontinuous)!

    assert.equal(broken.breaks[0]!.successors, null, 'null, because unknown is not the same as none')
    assert.equal(broken.breaks[0]!.lineageAvailable, false)
    assert.match(broken.breaks[0]!.note, /Table F records where the content went/)
    assert.ok(result.warnings.some((w) => /never been given it in machine-readable form/.test(w)))
  })

  /** Named, never only counted — rule 2. */
  it('names the discontinuous items in its evidence', async () => {
    const { db, propertyId } = await retired()
    const { discontinuities } = itemSeries({ db, propertyId, includeSingletons: true })
    assert.ok(discontinuities.length > 0)
    assert.ok(discontinuities.every((d) => /int\.canvas/.test(d)))
    assert.ok(discontinuities.every((d) => /1\.2\.1/.test(d)), 'and says which config last declared it')
  })

  it('leaves an unbroken series unbroken', async () => {
    const db = freshDb()
    const dir = scratchDir()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: dir })
    const second = addVisit(db, ids.propertyId, 'baseline')
    await runImport({
      actorId: TEST_OPERATOR, db, propertyId: ids.propertyId, visitId: second,
      raw: walk({ sessionId: 's2', startedAt: '2026-09-12T14:00:00.000Z' }), dataDir: dir,
    })

    const { series, discontinuities } = itemSeries({ db, propertyId: ids.propertyId })
    assert.equal(discontinuities.length, 0)
    assert.ok(series.length > 0, 'two visits answering the same items produce real series')
    for (const s of series) {
      assert.equal(s.discontinuous, false)
      assert.equal(s.runs.length, 1, 'one run when nothing broke')
      assert.ok(s.runs[0]!.length >= 2, 'and a series of one is not a series')
    }
  })

  it('excludes single-answer items by default and includes them on request', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })

    assert.equal(itemSeries({ db, propertyId: ids.propertyId }).series.length, 0,
      'one visit produces no series at all — a series of one is not a series')
    assert.ok(itemSeries({ db, propertyId: ids.propertyId, includeSingletons: true }).series.length > 0)
  })
})

// ---------------------------------------------------------------------- §1f

describe('§1f — answer.* operators', () => {
  const facts = (answers: Record<string, unknown>) => ({ ...noFacts(), answers: new Map(Object.entries(answers)) })

  it('parses both of the spec\'s live forms', () => {
    const a = parseCondition('answer.fc.width > 5')
    assert.deepEqual(a, { kind: 'compare', ref: 'answer.fc.width', op: '>', values: [5] })

    const b = parseCondition('answer.utl.drain-material-id in (clay, orangeburg)')
    assert.deepEqual(b, {
      kind: 'compare', ref: 'answer.utl.drain-material-id', op: 'in', values: ['clay', 'orangeburg'],
    })
  })

  it('compares numbers and membership against a recorded value', () => {
    assert.equal(evaluate('answer.fc.width > 5', facts({ 'fc.width': 7 })).applies, true)
    assert.equal(evaluate('answer.fc.width > 5', facts({ 'fc.width': 4 })).applies, false)
    assert.equal(
      evaluate('answer.utl.drain-material-id in (clay, orangeburg)', facts({ 'utl.drain-material-id': 'clay' })).applies,
      true)
    assert.equal(
      evaluate('answer.utl.drain-material-id in (clay, orangeburg)', facts({ 'utl.drain-material-id': 'pvc' })).applies,
      false)
  })

  /**
   * **A value that has not arrived is unknown, not false.**
   *
   * §1f exists because half these inputs arrive late — a radon result comes in
   * three months. Reading "not recorded" as "does not exceed the threshold" is
   * the failure the whole class was carved out to prevent.
   */
  it('treats an unrecorded answer as unknown and fails open', () => {
    const v = evaluate('answer.fc.width > 5', noFacts())
    assert.equal(v.certain, false)
    assert.equal(v.applies, true, 'fail open — wrongly asking is better than wrongly skipping')
    assert.deepEqual(v.unrecognised, ['answer.fc.width'])
  })

  /**
   * **The one that would otherwise ship silently.**
   *
   * `"hairline" > 5` is `false` in JavaScript and reads as *the crack is not over
   * 5mm* — a decision about a house made by a coercion rule. Reported under its
   * own name, because *the word is unfamiliar* and *the value cannot be ordered*
   * send a person to different places.
   */
  it('refuses to order a value that is not a number, and says so under its own name', () => {
    const v = evaluate('answer.fc.width > 5', facts({ 'fc.width': 'hairline' }))
    assert.equal(v.applies, true, 'unknown fails open')
    assert.equal(v.certain, false)
    assert.deepEqual(v.unrecognised, [], 'the word was met — this is not a vocabulary miss')
    assert.equal(v.uncomparable.length, 1)
    assert.match(v.uncomparable[0]!, /answer\.fc\.width > 5 — recorded value is "hairline"/)
  })

  /** A numeric string IS orderable. The guard is against nonsense, not against strings. */
  it('orders a numeric string, because it is a number written down', () => {
    assert.equal(evaluate('answer.fc.width > 5', facts({ 'fc.width': '7' })).applies, true)
    assert.equal(evaluate('answer.fc.width > 5', facts({ 'fc.width': '7' })).uncomparable.length, 0)
  })

  /**
   * §1f: *"the master's `choice` option values are now this repo's condition
   * vocabulary. Renaming or removing an option is a breaking change here, not a
   * content edit."* The evaluator cannot check them — it reads no config, by
   * doctrine — so it reports which ones a condition depends on.
   */
  it('reports the option values a condition depends on', () => {
    const v = evaluate('answer.utl.drain-material-id in (clay, orangeburg)', facts({ 'utl.drain-material-id': 'pvc' }))
    assert.deepEqual(v.compared, ['clay', 'orangeburg'])
  })

  it('does not equate a recorded string to a written number', () => {
    // The master's option ids are strings. A config writing 5 where it means the
    // option "5" is a config to fix, not a coercion to absorb.
    assert.equal(evaluate('answer.x = 5', facts({ x: '5' })).applies, false)
    assert.equal(evaluate('answer.x = 5', facts({ x: 5 })).applies, true)
  })

  it('supports the rest of the operator set, and refuses one it does not have', () => {
    assert.equal(evaluate('answer.x >= 5', facts({ x: 5 })).applies, true)
    assert.equal(evaluate('answer.x <= 5', facts({ x: 6 })).applies, false)
    assert.equal(evaluate('answer.x != 5', facts({ x: 6 })).applies, true)
    assert.equal(evaluate('answer.x not in (a, b)', facts({ x: 'c' })).applies, true)
    assert.throws(() => parseCondition('answer.x ~ 5'), ConditionRefused)
  })

  /**
   * Structure fails closed. A comparison against a flag asks a boolean how big
   * it is, and answering either way would be inventing a meaning.
   */
  it('refuses a comparison against a namespace that carries no values', () => {
    assert.throws(() => evaluate('property.gas > 5', noFacts()), ConditionRefused)
  })

  it('composes with the rest of the grammar', () => {
    assert.equal(evaluate('all(answer.x > 5, answer.y = a)', facts({ x: 9, y: 'a' })).applies, true)
    assert.equal(evaluate('not(answer.x > 5)', facts({ x: 9 })).applies, false)
    assert.equal(
      evaluate('any(answer.x > 5, always)', facts({ x: 1 })).applies, true,
      'the tokenizer still handles nested operators around a comparison')
  })
})

describe('§1f — the reader, and why it can report nothing honestly', () => {
  /**
   * **Both of the spec's live cases are unexercisable, for different reasons**,
   * and an empty answer map cannot tell them apart.
   */
  it('reports that value-recording items exist and none has been answered', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })

    const a = answersForProperty(db, ids.propertyId)
    assert.equal(a.values.size, 0)
    assert.match(a.note, /11 item\(s\) record a value in this config and none has ever been measured/)
    // The reference export resolves `int.moisture-suspect` — a `measure` item —
    // as `na / none-present`. **No moisture suspected is a confirmed absence,
    // not a failed reading**, and counting it as an attempt that yielded nothing
    // made the report accuse the reader of failing on a visit where there was
    // nothing to measure.
    assert.match(a.note, /1 resolved `na` — a confirmed absence, not a failed reading/)
    assert.match(a.note, /the export being thin rather than the reader being wrong/)
  })

  it('distinguishes a config that declares no value-recording item at all', () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    db.prepare('INSERT INTO properties (id, label, created_at, actor_id) VALUES (?, ?, ?, ?)')
      .run('p2', 'Empty', new Date().toISOString(), TEST_OPERATOR)
    const a = answersForProperty(db, 'p2')
    assert.match(a.note, /declares no `measure` or `choice` item/)
    assert.match(a.note, /unexercised rather than empty/)
    assert.ok(ids.propertyId)
  })

  /**
   * The wire shape has never been observed, so the reader reads the STRUCTURE
   * and records which key supplied the value. On the first real measure export
   * the report names it — instead of a guessed field name silently missing it.
   */
  it('reads a lone scalar from evidence and records which key carried it', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })

    const importId = (db.prepare('SELECT id FROM imports LIMIT 1').get() as { id: string }).id
    db.prepare(
      `INSERT INTO resolutions (import_id, property_id, visit_id, scope_kind, item_id, kind, evidence,
        at, is_recognized, feeds_gap_list, records_finding, created_at)
       VALUES (?, ?, ?, 'zone', 'fc.width', 'satisfied', ?, ?, 1, 0, 0, ?)`,
    ).run(importId, ids.propertyId, ids.visitId, JSON.stringify({ reading: 7 }),
      new Date().toISOString(), new Date().toISOString())

    const a = answersForProperty(db, ids.propertyId)
    assert.equal(a.values.get('fc.width'), 7)
    assert.equal(a.found[0]!.carrier, 'evidence.reading', 'the key is recorded, because it is unverified')
    assert.match(a.note, /evidence\.reading \(1\)/)
  })

  /**
   * **The observed shape, from the first real walk (2026-07-31).**
   *
   * `{ "value": "26", "unit": "in" }` on a measure and `{ "value": "no access" }`
   * on a choice. Read by name now that the name is known — and the refusal is
   * how it became known: two scalars were reported as ambiguous rather than
   * guessed, and the warning named `unit, value`.
   *
   * **`value` is a string even when it is a number.** Kept verbatim; the
   * evaluator already orders a numeric string, and coercing here would make the
   * stored value disagree with the manifest over nothing.
   */
  it('reads evidence.value by name, keeps it verbatim, and carries the unit', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const importId = (db.prepare('SELECT id FROM imports LIMIT 1').get() as { id: string }).id
    db.prepare(
      `INSERT INTO resolutions (import_id, property_id, visit_id, scope_kind, item_id, kind, evidence,
        at, is_recognized, feeds_gap_list, records_finding, created_at)
       VALUES (?, ?, ?, 'zone', 'fc.width', 'satisfied', ?, ?, 1, 0, 0, ?)`,
    ).run(importId, ids.propertyId, ids.visitId, JSON.stringify({ value: '26', unit: 'mm' }),
      new Date().toISOString(), new Date().toISOString())

    const a = answersForProperty(db, ids.propertyId)
    assert.equal(a.values.get('fc.width'), '26', 'verbatim — the manifest says "26", not 26')
    assert.equal(a.found[0]!.carrier, 'evidence.value')
    assert.equal(a.found[0]!.unit, 'mm')
    assert.equal(a.found[0]!.declaredUnit, 'mm', 'and the config declares mm for fc.width')
    assert.deepEqual(a.ambiguous, [], 'two scalars is no longer ambiguous once one of them is named')

    // And it still orders, because the evaluator reads a numeric string.
    assert.equal(evaluate('answer.fc.width > 5', { ...noFacts(), answers: a.values }).applies, true)
  })

  /**
   * **A reading in one unit against an item declared in another is reported and
   * never converted.**
   *
   * Master Table H: a wrong unit declaration corrupts the series. A converted
   * number is one no instrument produced, and the honest failure is a person
   * looking at two units rather than software quietly picking one.
   */
  it('reports a unit mismatch rather than converting it', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const importId = (db.prepare('SELECT id FROM imports LIMIT 1').get() as { id: string }).id
    db.prepare(
      `INSERT INTO resolutions (import_id, property_id, visit_id, scope_kind, item_id, kind, evidence,
        at, is_recognized, feeds_gap_list, records_finding, created_at)
       VALUES (?, ?, ?, 'zone', 'fc.width', 'satisfied', ?, ?, 1, 0, 0, ?)`,
    ).run(importId, ids.propertyId, ids.visitId, JSON.stringify({ value: '1.2', unit: 'in' }),
      new Date().toISOString(), new Date().toISOString())

    const a = answersForProperty(db, ids.propertyId)
    assert.equal(a.values.get('fc.width'), '1.2', 'the reading stands, unconverted')
    assert.ok(a.warnings.some((w) => /recorded in in, declared mm/.test(w)))
    assert.ok(a.warnings.some((w) => /NOT converted — a converted number is one no instrument produced/.test(w)))
  })

  /** Two scalars is ambiguity. Which one is the value is the question it refuses. */
  it('refuses to pick when evidence carries more than one scalar', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const importId = (db.prepare('SELECT id FROM imports LIMIT 1').get() as { id: string }).id
    db.prepare(
      `INSERT INTO resolutions (import_id, property_id, visit_id, scope_kind, item_id, kind, evidence,
        at, is_recognized, feeds_gap_list, records_finding, created_at)
       VALUES (?, ?, ?, 'zone', 'fc.width', 'satisfied', ?, ?, 1, 0, 0, ?)`,
    ).run(importId, ids.propertyId, ids.visitId, JSON.stringify({ reading: 7, depth: 2 }),
      new Date().toISOString(), new Date().toISOString())

    const a = answersForProperty(db, ids.propertyId)
    assert.equal(a.values.size, 0, 'nothing taken')
    assert.deepEqual(a.ambiguous, ['fc.width (depth, reading)'])
    assert.ok(a.warnings.some((w) => /refuses to guess at/.test(w)))
  })

  /** A `result` of `pass` is a state. Reading it as a value makes every check an answer. */
  it('does not read a non-numeric result as a recorded value', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const importId = (db.prepare('SELECT id FROM imports LIMIT 1').get() as { id: string }).id
    db.prepare(
      `INSERT INTO resolutions (import_id, property_id, visit_id, scope_kind, item_id, kind, result,
        at, is_recognized, feeds_gap_list, records_finding, created_at)
       VALUES (?, ?, ?, 'zone', 'fc.width', 'satisfied', 'pass', ?, 1, 0, 0, ?)`,
    ).run(importId, ids.propertyId, ids.visitId, new Date().toISOString(), new Date().toISOString())

    assert.equal(answersForProperty(db, ids.propertyId).values.size, 0)
  })
})

// ------------------------------------------------------------------------ §7

describe('§7 — desk-work timing', () => {
  const property = (db: Db): string => {
    const ids = makePropertyAndVisit(db)
    return ids.propertyId
  }

  it('records a span with its section, its actor, and no duration until it stops', () => {
    const db = freshDb()
    const p = property(db)
    const { span, alreadyRunning } = startWork({ db, propertyId: p, sectionId: 's7', actorId: TEST_OPERATOR })

    assert.equal(alreadyRunning, false)
    assert.equal(span.sectionId, 's7')
    assert.equal(span.actorId, TEST_OPERATOR)
    assert.equal(span.endedAt, null)
    assert.equal(span.elapsedMs, null, 'a span in progress has no duration — a growing number is not a measurement')

    const stopped = stopWork({ db, spanId: span.id })
    assert.ok(stopped.endedAt)
    assert.ok(typeof stopped.elapsedMs === 'number' && stopped.elapsedMs >= 0)
  })

  /** A double-click must not cost an hour of the pricing basis. */
  it('returns the running span rather than opening a second', () => {
    const db = freshDb()
    const p = property(db)
    const first = startWork({ db, propertyId: p, sectionId: 's7', actorId: TEST_OPERATOR })
    const again = startWork({ db, propertyId: p, sectionId: 's12', actorId: TEST_OPERATOR })

    assert.equal(again.alreadyRunning, true)
    assert.equal(again.span.id, first.span.id)
    assert.equal(again.span.sectionId, 's7', 'the running span is returned unchanged, not retargeted')
    assert.equal(deskWork(db, p).spans.length, 1)
  })

  /** A second stop means a screen disagrees with the record. Silence would hide that. */
  it('refuses to stop a span that has already stopped', () => {
    const db = freshDb()
    const p = property(db)
    const { span } = startWork({ db, propertyId: p, sectionId: 's7', actorId: TEST_OPERATOR })
    stopWork({ db, spanId: span.id })
    assert.throws(() => stopWork({ db, spanId: span.id }), (e: unknown) =>
      e instanceof DeskWorkRefused && e.code === 'desk-work.already-stopped')
  })

  /**
   * **Nothing auto-closes a running span.** Somebody who started at four and went
   * home has a row with no end, and that is true — closing it at a guessed time
   * would put an invented number into the pricing basis wearing measured clothes.
   */
  it('leaves a running span running, and names it rather than counting it', () => {
    const db = freshDb()
    const p = property(db)
    const { span } = startWork({ db, propertyId: p, sectionId: 's7', actorId: TEST_OPERATOR })

    const report = deskWork(db, p)
    assert.equal(report.running.length, 1)
    assert.equal(report.running[0]!.id, span.id)
    assert.match(report.note, /1 still running/)
    assert.equal(runningSpan(db, p, TEST_OPERATOR)!.id, span.id)
  })

  /**
   * §7: *"Recorded, not specced: what gets reported from it. Collect first."*
   *
   * No total, no rate. A number reported before anyone has said what it is for
   * fixes the shape of the answer early, which is why the effort map has no hour
   * figures either.
   */
  it('reports no total, and says why', () => {
    const db = freshDb()
    const p = property(db)
    const { span } = startWork({ db, propertyId: p, sectionId: 's7', actorId: TEST_OPERATOR })
    stopWork({ db, spanId: span.id })

    const report = deskWork(db, p)
    assert.match(report.note, /Deliberately no total/)
    assert.ok(!('totalMs' in report) && !('total' in report) && !('rate' in report))
  })

  it('refuses a span with no section, and one on a property that does not exist', () => {
    const db = freshDb()
    const p = property(db)
    assert.throws(() => startWork({ db, propertyId: p, sectionId: '  ', actorId: TEST_OPERATOR }),
      (e: unknown) => e instanceof DeskWorkRefused && e.code === 'desk-work.no-section')
    assert.throws(() => startWork({ db, propertyId: 'nope', sectionId: 's7', actorId: TEST_OPERATOR }),
      (e: unknown) => e instanceof DeskWorkRefused && e.code === 'desk-work.no-property')
  })

  /** Open vocabulary — the schema declares which sections exist, not this table. */
  it('accepts a section id this database has never met', () => {
    const db = freshDb()
    const p = property(db)
    const { span } = startWork({ db, propertyId: p, sectionId: 's99.not-a-real-section', actorId: TEST_OPERATOR })
    assert.equal(span.sectionId, 's99.not-a-real-section')
  })
})

// ------------------------------------------------------------- the extraction

describe('the visit sequence, now shared', () => {
  /**
   * `outstandingSince` and `itemSeries` both need the visit order. Two modules
   * deriving one independently is the shape rule 4 forbids — *"which visit came
   * before which"* is exactly the kind of question that quietly gets two answers.
   */
  it('orders by the walk and reports when import order disagrees', async () => {
    const db = freshDb()
    const dir = scratchDir()
    const ids = makePropertyAndVisit(db, { kind: 'baseline' })
    const second = addVisit(db, ids.propertyId, 'monthly')

    // The monthly is uploaded first, though it was walked second.
    await runImport({
      actorId: TEST_OPERATOR, db, propertyId: ids.propertyId, visitId: second,
      raw: walk({ sessionId: 's2', startedAt: '2026-09-12T14:00:00.000Z' }), dataDir: dir,
    })
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: dir })

    const seq = visitSequence(db, ids.propertyId)
    assert.deepEqual(seq.visits.map((v) => v.visitId), [ids.visitId, second])
    assert.equal(seq.reachesBack, true, 'the earliest visit is a baseline')
    assert.ok(seq.warnings.some((w) => /sort differently by walk date than by import order/.test(w)))
  })
})
