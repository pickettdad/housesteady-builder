import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runAudit } from '../src/audit/run.js'
import type { Db } from '../src/db/index.js'
import { runImport } from '../src/import/runImport.js'
import { addManualRow, buildDraft, writeEdit } from '../src/report/draft.js'
import { HouseStyleRefused, lint } from '../src/report/houseStyle.js'
import { describeItems, loadClientNames, naLabelMap } from '../src/report/names.js'
import { editionHtml, editions, RenderRefused, signEdition } from '../src/report/render.js'
import { freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'

const NAMES = loadClientNames()
const LABELS = naLabelMap()

async function ready(): Promise<{ db: Db; propertyId: string }> {
  const db = freshDb()
  const ids = makePropertyAndVisit(db)
  await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
  runAudit({ db, propertyId: ids.propertyId, visitId: ids.visitId, visitKind: 'baseline', actorId: TEST_OPERATOR })
  return { db, propertyId: ids.propertyId }
}

const sign = (db: Db, propertyId: string) =>
  signEdition({
    db, propertyId,
    draft: buildDraft({ db, propertyId, describe: describeItems(db, NAMES), labels: LABELS }),
    describe: describeItems(db, NAMES), labels: LABELS, frames: NAMES.frames,
    signedBy: TEST_OPERATOR, signedByName: 'Test Operator',
    clientNames: { version: NAMES.version, hash: NAMES.hash },
    houseStyleVersion: 'house-style/v001',
    property: { label: 'A house', address: '14 Dundas Street West' },
    visitDate: '2026-07-24',
  })

/**
 * The grouping, which is the thing the first screenshot forced.
 *
 * Twenty rows reading *"X — in ensuite — was not covered on this visit"* is
 * machine output. The names were doing their job; the frame was the problem.
 */
describe('grouping', () => {
  it('carries the frame once and lists the items under it', async () => {
    const { db, propertyId } = await ready()
    const edition = sign(db, propertyId)
    const ours = edition.columns.find((c) => c.id === 'missing-from-us')!

    // Two groups, not twenty rows: nineteen unanswered in one room, and the
    // deferred close-out item, which is a different statement.
    assert.equal(ours.groups.length, 2)
    const unanswered = ours.groups.find((g) => g.reason === 'not-reached')!
    assert.equal(unanswered.items.length, 19)
    assert.equal(unanswered.frame, 'In the ensuite, we did not cover:')

    const deferred = ours.groups.find((g) => g.reason === 'deferred')!
    assert.equal(deferred.items.length, 1)
    assert.equal(deferred.frame, 'We have held these over to the next visit:')
  })

  /**
   * **The three corrections, pinned — each is a claim the data does not support.**
   *
   * `not-reached` may not say *we were not able to cover*: that claims we tried
   * and were blocked, which is the not-accessible claim made over not-inspected
   * data. Amendment 1 §A3's asymmetry, arriving through the frame instead of
   * through the label.
   */
  it('never lets a not-reached frame claim we tried and were blocked', async () => {
    const { db, propertyId } = await ready()
    const groups = sign(db, propertyId).columns.flatMap((c) => c.groups)
    for (const g of groups.filter((x) => x.reason === 'not-reached')) {
      assert.ok(!/not able|could not|unable/i.test(g.frame),
        `"${g.frame}" claims an obstruction the record does not carry`)
    }
  })

  /**
   * And `no-access` IS the place that wording is true.
   *
   * There was no frame for it at all, because the reference export produced
   * nineteen not-reached and one deferred and this reason never fired — a frame
   * nobody wrote because nothing exercised it. So the test supplies the locked
   * crawlspace the export does not have.
   */
  it('says we were not able to reach, for the one reason where that is true', async () => {
    const { db, propertyId } = await ready()
    db.prepare(
      `INSERT INTO audit_carried_items (audit_run_id, scope_kind, scope_zone_id, scope_pin_id,
        item_id, reason, na_reason_id, column_id, parts, origin, where_desk, where_label, created_at)
       SELECT audit_run_id, 'zone', 'z-crawl', NULL, 'int.surfaces', 'no-access', 'no-access',
              'missing-from-us', parts, 'computed', 'crawlspace', 'crawlspace', created_at
         FROM audit_carried_items LIMIT 1`,
    ).run()

    const g = sign(db, propertyId).columns.flatMap((c) => c.groups).find((x) => x.reason === 'no-access')!
    assert.equal(g.frame, 'In the crawlspace, we were not able to reach:')
    assert.equal(g.next, 'We will try again on the next visit.')
    assert.equal(g.label, 'not-accessible', 'and the label agrees with the frame')
  })

  /**
   * A deferral has no closer.
   *
   * *"No action is needed from you"* is false the moment the deferral depends on
   * the client — held until the well record turns up. The opener stands alone
   * rather than guessing which kind of deferral this was.
   */
  it('gives a deferral no closer, because it cannot know whose it is', async () => {
    const { db, propertyId } = await ready()
    const deferred = sign(db, propertyId).columns.flatMap((c) => c.groups)
      .find((g) => g.reason === 'deferred')!
    assert.equal(deferred.next, undefined)
    assert.ok(!/no action/i.test(deferred.frame))
  })

  /**
   * **Reason first, then room** — because *"we could not reach it"*, *"we did not
   * get to it"* and *"we have held it over"* are different statements and must
   * not interleave. On this export all nineteen collapse into one group; on a
   * real house there is a mix, and the grouping is what keeps them honest.
   */
  it('groups by reason before room, so two statements never interleave', async () => {
    const { db, propertyId } = await ready()
    // A second room with the same reason, and the same room with a second
    // reason — the shape a real house produces.
    db.prepare(
      `INSERT INTO audit_carried_items (audit_run_id, scope_kind, scope_zone_id, scope_pin_id,
        item_id, reason, na_reason_id, column_id, parts, origin, where_desk, where_label, created_at)
       SELECT audit_run_id, 'zone', 'z-hall', NULL, 'int.doors', 'no-access', 'no-access',
              'missing-from-us', parts, 'computed', 'hall', 'hall', created_at
         FROM audit_carried_items WHERE item_id = 'int.doors'`,
    ).run()
    db.prepare(
      `INSERT INTO audit_carried_items (audit_run_id, scope_kind, scope_zone_id, scope_pin_id,
        item_id, reason, na_reason_id, column_id, parts, origin, where_desk, where_label, created_at)
       SELECT audit_run_id, 'zone', 'z-hall2', NULL, 'int.lighting', 'not-reached', NULL,
              'missing-from-us', parts, 'computed', 'hall', 'hall', created_at
         FROM audit_carried_items WHERE item_id = 'int.lighting'`,
    ).run()

    const groups = sign(db, propertyId).columns.find((c) => c.id === 'missing-from-us')!.groups
    const reasons = groups.map((g) => g.reason)
    // Every group of one reason before any group of the next. Sorting by room
    // first would put the hall's no-access group between two not-reached ones.
    const firstOfEach = [...new Set(reasons)].map((r) => reasons.indexOf(r))
    const lastOfEach = [...new Set(reasons)].map((r) => reasons.lastIndexOf(r))
    for (let i = 0; i < firstOfEach.length - 1; i += 1) {
      assert.ok(lastOfEach[i]! < firstOfEach[i + 1]!,
        `groups of ${[...new Set(reasons)][i]} are interrupted by another reason`)
    }
  })

  it('keeps a reworded row whole rather than folding it into a list', async () => {
    const { db, propertyId } = await ready()
    const draft = buildDraft({ db, propertyId, describe: describeItems(db, NAMES), labels: LABELS })
    const row = draft.rows.find((r) => r.source?.itemId === 'wet.fan')!
    writeEdit({
      db, propertyId, rowKey: row.rowKey, kind: 'reword',
      payload: { text: 'We were not able to run the ensuite fan on this visit.' }, actorId: TEST_OPERATOR,
    })

    const ours = sign(db, propertyId).columns.find((c) => c.id === 'missing-from-us')!
    assert.ok(ours.typed.includes('We were not able to run the ensuite fan on this visit.'),
      'a person wrote a whole statement; folding it into a bulleted list would break it')
    const grouped = ours.groups.flatMap((g) => g.items.map((i) => i.itemId))
    assert.ok(!grouped.includes('wet.fan'), 'and it leaves the group it would otherwise have joined')
  })
})

/**
 * §6, gate two — the House Style lint, **in the render path.**
 *
 * Not in a test and not at author time. A lint in a test checks the sentences a
 * test happens to build; the sentence that reaches a client is the one a
 * concierge types into a box on a Friday afternoon.
 */
describe('the house style lint', () => {
  it('refuses a typed row carrying a banned word, and says why', async () => {
    const { db, propertyId } = await ready()
    addManualRow({
      db, propertyId, text: 'There is an issue with the basement stairs.',
      column: 'missing-from-you', actorId: TEST_OPERATOR,
    })

    assert.throws(
      () => sign(db, propertyId),
      (e: unknown) => {
        assert.ok(e instanceof HouseStyleRefused)
        assert.equal(e.violations.length, 1)
        assert.equal(e.violations[0]!.found, 'issue')
        // The reason in House Style's own words, not a rule number. Somebody
        // reading a refusal needs to know why rather than which regex.
        assert.match(e.violations[0]!.because, /asserts a defect/)
        assert.match(e.violations[0]!.where, /typed row/)
        return true
      },
    )

    // And nothing is stored. A refused render leaves no half-edition behind.
    assert.equal(editions(db, propertyId).length, 0)
  })

  /**
   * The monitor rule needs more than a word list.
   *
   * House Style §7: *"monitor" may take a component, a measurement or a reading
   * as its object. It may never take a home, a household, a person, or the
   * service.* A pattern that banned the word outright would fail the sentence
   * the house style holds up as correct.
   */
  it('allows "monitor the crack" and refuses "we monitor your home"', () => {
    assert.deepEqual(lint('We will monitor the crack every April and October.', 'x'), [])
    assert.deepEqual(lint('We measure and monitor the moisture reading each visit.', 'x'), [])

    const bad = lint('Our monitoring service keeps an eye on your home.', 'x')
    assert.ok(bad.some((v) => v.rule === 'the monitor rule'),
      'we check houses, not people — and the word choice is where that either holds or quietly stops holding')
  })

  it('catches every rule House Style §11 says is checkable', () => {
    const cases: [string, string][] = [
      ['There is a serious problem here.', 'a severity adjective'],
      ['It is just a small thing.', 'a diminisher'],
      ['We repaired the valve.', 'claiming work we did not do'],
      ['This ensures the basement stays dry.', 'an outcome promise'],
      ['The wiring is unsafe.', 'an assessment we are not licensed to make'],
      ['Condition: poor', 'a condition grade'],
      ['Good for seniors.', 'labelling a person rather than describing the situation'],
      ['It probably dates from 2004.', 'a hedge that outruns its label'],
      ['Recorded none-present on this visit.', 'internal vocabulary'],
      ['See wet.under-sink for details.', 'an item id'],
    ]
    for (const [text, rule] of cases) {
      const found = lint(text, 'x')
      assert.ok(found.some((v) => v.rule === rule), `"${text}" should trip ${rule}, got ${JSON.stringify(found.map((v) => v.rule))}`)
    }
  })

  /** The signature line is client-facing too, and the first render put an operator id in it. */
  it('lints the signature line', async () => {
    const { db, propertyId } = await ready()
    assert.throws(
      () => signEdition({
        db, propertyId,
        draft: buildDraft({ db, propertyId, describe: describeItems(db, NAMES), labels: LABELS }),
        describe: describeItems(db, NAMES), labels: LABELS, frames: NAMES.frames,
        signedBy: TEST_OPERATOR,
        // An id where a name belongs. `op.test` is shaped like an item id, which
        // is the check that catches it — internal vocabulary in a client's
        // document, whatever field it arrived in.
        signedByName: 'op.test-operator',
        clientNames: { version: NAMES.version, hash: NAMES.hash },
        houseStyleVersion: 'house-style/v001',
        property: { label: 'A house', address: '14 Dundas Street West' },
        visitDate: null,
      }),
      (e: unknown) => e instanceof HouseStyleRefused && e.violations.some((v) => v.where === 'the signature line'),
    )
  })
})

/** §0.1 — the signature is the render gate, not a step after it. */
describe('editions', () => {
  it('stores the bytes, because the document is the deliverable', async () => {
    const { db, propertyId } = await ready()
    const edition = sign(db, propertyId)

    assert.equal(edition.number, 1)
    assert.equal(edition.signedBy, TEST_OPERATOR)
    assert.equal(edition.contentHash.length, 64)

    const stored = editionHtml(db, edition.id)!
    assert.equal(stored, edition.html,
      'a re-render in September against September\'s names is not what was sent in July')
    assert.match(stored, /Prepared and signed by <b>Test Operator<\/b>/)
    // The delivered lockup, inlined. Never drawn — Brand Guide §04.
    assert.match(stored, /<img src="data:image\/png;base64,/)
    assert.ok(!/<path\s[^>]*\bd="[Mm]/.test(stored), 'nothing here draws the mark')
  })

  it('makes a second edition a new row rather than a replacement', async () => {
    const { db, propertyId } = await ready()
    const first = sign(db, propertyId)
    addManualRow({ db, propertyId, text: 'The deed.', column: 'missing-from-you', actorId: TEST_OPERATOR })
    const second = sign(db, propertyId)

    assert.equal(second.number, 2)
    assert.equal(editions(db, propertyId).length, 2)
    assert.notEqual(second.contentHash, first.contentHash)
    assert.equal(editionHtml(db, first.id), first.html,
      'Design v1 §6 — a client asking in September what their July report said gets the July bytes')
  })

  it('records what was held out rather than dropping it silently', async () => {
    const { db, propertyId } = await ready()
    // An item with no ratified name. It cannot be written for a client, so it
    // is withheld — and an edition that quietly omitted it would look identical
    // to one where everything was covered.
    db.prepare(
      `INSERT INTO audit_carried_items (audit_run_id, scope_kind, scope_zone_id, scope_pin_id,
        item_id, reason, na_reason_id, column_id, parts, origin, where_desk, where_label, created_at)
       SELECT audit_run_id, 'zone', 'z-attic', NULL, 'att.hatch', 'not-reached', NULL,
              'missing-from-us', parts, 'computed', 'attic', 'attic', created_at
         FROM audit_carried_items LIMIT 1`,
    ).run()

    const edition = sign(db, propertyId)
    assert.equal(edition.withheld.length, 1)
    assert.equal(edition.withheld[0]!.itemId, 'att.hatch')
    assert.match(edition.withheld[0]!.because, /no client-facing name/)
    assert.ok(!edition.html.includes('att.hatch'), 'and the id never reaches the document')
  })

  it('refuses an empty edition rather than signing a blank page', async () => {
    const { db, propertyId } = await ready()
    const draft = buildDraft({ db, propertyId, describe: describeItems(db, NAMES), labels: LABELS })
    for (const row of draft.rows) {
      writeEdit({ db, propertyId, rowKey: row.rowKey, kind: 'exclude', actorId: TEST_OPERATOR })
    }
    assert.throws(() => sign(db, propertyId), (e: unknown) =>
      e instanceof RenderRefused && e.code === 'render.nothing-included')
  })

  it('refuses before an audit exists', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    assert.throws(() => sign(db, ids.propertyId), (e: unknown) =>
      e instanceof RenderRefused && e.code === 'render.no-audit')
  })

  /** Increment 4 §2b — the whole reason the composer exists. */
  it('puts no item id, na reason or operator id into the document', async () => {
    const { db, propertyId } = await ready()
    const html = sign(db, propertyId).html
    const body = html.slice(html.indexOf('<body>'))
    for (const internal of ['not-reached', 'none-present', 'no-access', 'deferred', 'unknown-provenance', 'op-test']) {
      assert.ok(!body.includes(internal), `${internal} reached the document`)
    }
    assert.ok(!/\b[a-z]{2,4}\.[a-z][a-z-]{2,}\b/.test(body.replace(/<[^>]+>/g, '')),
      'no item id in the rendered text')
  })
})
