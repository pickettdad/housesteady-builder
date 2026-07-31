import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { activeItemKey, activeItemSet, itemScopeKey } from '../src/audit/activeItems.js'
import { carriedItems } from '../src/audit/carriedItems.js'
import { propertyEvidence } from '../src/audit/propertyEvidence.js'
import { runAudit, type AuditResult } from '../src/audit/run.js'
import type { Db } from '../src/db/index.js'
import { runImport } from '../src/import/runImport.js'
import { clientRow, describeFromConfig, withheld } from '../src/report/clientVoice.js'
import { addVisit, freshDb, makePropertyAndVisit, readReference, readReferenceAsRewalk, scratchDir, TEST_OPERATOR } from './helpers.js'

/**
 * §1a's twenty, and the derivation that produces it.
 *
 * Every number here was measured against the export BEFORE any of the stream was
 * written — the probe ran, printed nineteen ensuite items by id and one deferred
 * session item, and the code was built to that. If one of these changes, either
 * the export changed or the stream broke.
 */
describe('the field-checklist gap stream on the reference export', () => {
  let db: Db
  let propertyId: string
  let result: AuditResult

  before(async () => {
    db = freshDb()
    const ids = makePropertyAndVisit(db)
    propertyId = ids.propertyId
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    result = runAudit({
      db, propertyId, visitId: ids.visitId, visitKind: 'baseline', actorId: TEST_OPERATOR,
    })
  })

  it('carries twenty items — nineteen unresolved and one feedsGapList na', () => {
    assert.equal(result.carried.items.length, 20)

    const notReached = result.carried.items.filter((i) => i.reason === 'not-reached')
    const fromNa = result.carried.items.filter((i) => i.naReasonId !== null)
    assert.equal(notReached.length, 19)
    assert.equal(fromNa.length, 1)
    assert.equal(fromNa[0]!.itemId, 'ses.termination-reconcile')
    assert.equal(fromNa[0]!.naReasonId, 'deferred')
  })

  /**
   * The twenty spans all three scopes, and this is the assertion that matters
   * most.
   *
   * **Zone scope alone also produces twenty on this export** — the other two
   * scopes happen to be fully answered. So a stream that built only the zone
   * half would pass a bare total-of-twenty check while being two-thirds
   * unbuilt, and nothing would say so until an export arrived with an
   * unanswered component item. Asserting the breakdown is what makes the total
   * mean anything.
   */
  it('counts all three scopes, not only the one that produces the number', () => {
    assert.deepEqual(result.carried.byScope, { zone: 19, pin: 0, session: 1, other: 0 })

    const active = activeItemSet(db, propertyId)
    const scopes = { zone: 0, pin: 0, session: 0 }
    for (const item of active.items.values()) {
      if (item.scope.kind in scopes) scopes[item.scope.kind as keyof typeof scopes] += 1
    }
    assert.equal(scopes.zone, 30, 'bedroom 11 + ensuite 19 items were due')
    assert.equal(scopes.pin, 5, 'the one typed pin is a smoke alarm with five component items')
    assert.equal(scopes.session, 4, 'four of five session items apply to a baseline')
  })

  /** §8 — the derivation names its evidence, so an implausible result reads as implausible. */
  it('names its evidence rather than reporting a bare count', () => {
    const ensuite = result.carried.evidence.find((line) => line.includes('ensuite'))
    assert.ok(ensuite, `expected an evidence line for the ensuite, got ${JSON.stringify(result.carried.evidence)}`)
    assert.match(ensuite!, /19 of 19 applicable item\(s\) in ensuite/)

    assert.ok(
      result.carried.evidence.some((l) => /active item set: 0 received from the field, \d+ computed here/.test(l)),
      'the origin breakdown always renders — a computed set must never pass as the field\'s own answer',
    )
  })

  /**
   * §1a, pinned.
   *
   * The whole failure was that these two answers can both be right at once. If
   * a later change makes the slot report the gap or the gap stream report the
   * slot, this fails and somebody looks.
   */
  it('produces a complete slot and a gap simultaneously for a na / no-access item', () => {
    const ensuiteGaps = result.carried.items.filter((i) => i.where === 'ensuite')
    assert.equal(ensuiteGaps.length, 19)

    // Increment 3's own gap list carries none of them. That is §1a in one line.
    const slotGapText = JSON.stringify(result.gaps)
    for (const item of result.carried.items) {
      assert.ok(!slotGapText.includes(item.itemId),
        `${item.itemId} is a checklist gap, and binder-slot completeness does not carry it — these are two streams`)
    }
  })

  /**
   * **The two lists both come out at twenty on this export, and that is a
   * coincidence.**
   *
   * Twenty binder slots are short and twenty checklist items have no answer, and
   * the two sets do not overlap at all — the assertion above proves it item by
   * item. Pinned here because the coincidence is the most misleading fact on the
   * screen: two equal numbers side by side is exactly what would make a reader
   * conclude they are one list rendered twice, and then add them, or drop one.
   */
  it('is a different twenty from the binder-slot gap list', () => {
    assert.equal(result.gaps.length, 20)
    assert.equal(result.carried.items.length, 20)

    const slotIds = new Set(result.gaps.map((g) => g.slotId))
    const itemIds = new Set(result.carried.items.map((i) => i.itemId))
    for (const id of itemIds) {
      assert.ok(!slotIds.has(id), 'no member is shared — the equal totals are arithmetic accident, not identity')
    }
  })

  it('reads feedsGapList from the config rather than from a literal', () => {
    // The config declares no-access and deferred. Only `deferred` actually
    // fired on this export; `none-present` fired twice and feeds nothing,
    // which is the distinction the boolean makes and a reason-id list would not.
    const naRows = result.carried.items.filter((i) => i.naReasonId)
    assert.deepEqual(naRows.map((r) => r.naReasonId), ['deferred'])

    const nonePresent = result.carried.items.filter((i) => i.naReasonId === 'none-present')
    assert.equal(nonePresent.length, 0,
      'none-present is a confirmed absence — a finding, never a gap. A missing photograph is not a problem with the house.')
  })

  it('quotes the config\'s own label rather than paraphrasing the reason', () => {
    const deferred = result.carried.items.find((i) => i.naReasonId === 'deferred')!
    assert.equal(deferred.parts.why, 'Deferred to visit two',
      'the config wrote this for a person; quoting beats paraphrasing and it changes upstream in one place')
  })

  it('keeps the parts structured and composes nowhere in the stream', () => {
    for (const item of result.carried.items) {
      assert.equal(typeof item.parts.what, 'string')
      assert.ok(!item.parts.what.includes(' — '),
        `${item.itemId}: the parts must not arrive pre-joined — that is the dash failure, one layer out`)
    }
  })

  it('stores the rows so a rendered report is reproducible', () => {
    const stored = db
      .prepare('SELECT * FROM audit_carried_items WHERE audit_run_id = ?')
      .all(result.runId) as Record<string, unknown>[]
    assert.equal(stored.length, 20)
    assert.equal(stored.every((r) => r.origin === 'computed'), true, 'v3 export, so every row is computed here')
    assert.equal(stored.every((r) => r.column_id === 'missing-from-us'), true)
  })
})

/**
 * The scope key is the whole reason this stream works.
 *
 * `int.canvas` is satisfied in the bedroom and unanswered in the ensuite. A
 * property-wide map keyed on item id alone reports it answered, and nineteen of
 * the twenty vanish. This is the one mistake that would look like a working
 * implementation.
 */
describe('scope keys', () => {
  it('distinguishes the same item id in two rooms', () => {
    const a = activeItemKey({ kind: 'zone', zoneId: 'bedroom-uuid', pinId: null }, 'int.canvas')
    const b = activeItemKey({ kind: 'zone', zoneId: 'ensuite-uuid', pinId: null }, 'int.canvas')
    assert.notEqual(a, b)
  })

  it('gives session scope no discriminator, so a deferral can be answered later', () => {
    const first = itemScopeKey({ kind: 'session', zoneId: null, pinId: null })
    const second = itemScopeKey({ kind: 'session', zoneId: null, pinId: null })
    assert.equal(first, second,
      'keying session items per import would make a baseline deferral permanently unanswerable — ' +
      'visit two would resolve a different key and the deferral would sit in the gap list forever')
  })

  it('keeps an unrecognised scope kind rather than folding it into one of the three', () => {
    const key = itemScopeKey({ kind: 'building', zoneId: 'b1', pinId: null })
    assert.ok(key.startsWith('building:'), 'fail open on vocabulary — a scope we have not met is still a scope')
    assert.notEqual(key, itemScopeKey({ kind: 'zone', zoneId: 'b1', pinId: null }))
  })
})

/**
 * §1a again, from the other direction: a gap that a later visit answers closes,
 * and one it does not stays open with its original date.
 */
describe('carrying across visits', () => {
  it('keeps the first-due date when a second visit re-asks the same item', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const first = activeItemSet(db, ids.propertyId)
    const sample = [...first.items.values()].find((i) => i.scope.kind === 'zone')!

    const visitTwo = addVisit(db, ids.propertyId, 'baseline')
    await runImport({
      actorId: TEST_OPERATOR, db, propertyId: ids.propertyId, visitId: visitTwo,
      raw: readReferenceAsRewalk(), dataDir: scratchDir(),
    })

    const second = activeItemSet(db, ids.propertyId)
    const again = second.items.get(activeItemKey(sample.scope, sample.itemId))!
    assert.equal(again.dueSince.importId, sample.dueSince.importId,
      'a later visit re-asking an item does not reset when it was first due — "open since the baseline" has to stay sayable')
  })
})

/**
 * §2 — the composer boundary.
 *
 * These assert the OUTPUT is client-readable. The doctrine scans assert the
 * mechanism, which is the durable half: a test can be satisfied by a lint over
 * an internal sentence, and a scan cannot.
 */
describe('the client-facing composer', () => {
  let db: Db
  let result: AuditResult
  let describe_: ReturnType<typeof describeFromConfig>

  before(async () => {
    db = freshDb()
    const ids = makePropertyAndVisit(db)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    result = runAudit({ db, propertyId: ids.propertyId, visitId: ids.visitId, visitKind: 'baseline', actorId: TEST_OPERATOR })
    describe_ = describeFromConfig(propertyEvidence(db, ids.propertyId).snapshot)
  })

  it('never puts an item id, an na reason id or a provenance state into a client sentence', () => {
    const rows = result.carried.items.map((i) => clientRow(i, describe_)).filter((r) => r !== null)
    assert.ok(rows.length > 0, 'the reference export must produce client rows, or this asserts nothing')

    for (const row of rows) {
      assert.ok(!/\b[a-z]{2,4}\.[a-z-]+\b/.test(row!.text), `item id leaked into a client sentence: ${row!.text}`)
      for (const enumish of ['none-present', 'no-access', 'not-applicable', 'deferred', 'unknown-provenance', 'unverifiable']) {
        assert.ok(!row!.text.includes(enumish), `internal vocabulary leaked: ${row!.text}`)
      }
    }
  })

  it('carries only the two labels a gap row may carry', () => {
    const rows = result.carried.items.map((i) => clientRow(i, describe_)).filter((r) => r !== null)
    for (const row of rows) {
      assert.ok(row!.label === 'not-inspected' || row!.label === 'not-accessible',
        `a gap report asserts nothing about the house, and ${row!.label} would`)
    }
  })

  it('reads structured parts, not the internal sentence', () => {
    // Handed an item whose composed sentence would be useless, the client row is
    // still right — because it never saw the sentence.
    const row = clientRow(
      {
        scope: { kind: 'zone', zoneId: 'z1', pinId: null }, itemId: 'wh.nameplate', tier: 'core',
        reason: 'no-access', naReasonId: 'no-access', column: 'missing-from-us',
        parts: { what: 'wh.nameplate in the utility room', why: 'Not accessible today' },
        status: null, origin: 'computed',
        dueSince: { importId: 'i1', visitId: 'v1', at: '2026-07-30' },
        where: 'the utility room', certain: true, unrecognised: [],
      },
      () => 'The water heater data plate',
    )
    assert.equal(row!.text, 'The water heater data plate — in the utility room — could not be reached on this visit.')
    assert.equal(row!.label, 'not-accessible')
  })

  it('defaults to not-inspected for a reason nothing declares as an access problem', () => {
    const row = clientRow(
      {
        scope: { kind: 'zone', zoneId: 'z1', pinId: null }, itemId: 'x.y', tier: 'core',
        reason: 'weather-window', naReasonId: 'weather-window', column: 'missing-from-us',
        parts: { what: 'x.y in the roof', why: 'Waiting on weather' },
        status: null, origin: 'computed',
        dueSince: { importId: 'i1', visitId: 'v1', at: '2026-07-30' },
        where: 'the roof', certain: true, unrecognised: [],
      },
      () => 'The roof edge',
    )
    assert.equal(row!.label, 'not-inspected',
      '"we could not reach it" claims we tried and were blocked; an undeclared reason must not make that claim')
  })

  it('withholds a row it cannot name, and says so rather than rendering the id', () => {
    const item = {
      scope: { kind: 'zone' as const, zoneId: 'z1', pinId: null }, itemId: 'zzz.unknown', tier: 'core',
      reason: 'not-reached', naReasonId: null, column: 'missing-from-us' as const,
      parts: { what: 'zzz.unknown in the attic' }, status: null, origin: 'computed' as const,
      dueSince: { importId: 'i1', visitId: 'v1', at: '2026-07-30' },
      where: 'the attic', certain: true, unrecognised: [],
    }
    assert.equal(clientRow(item, () => undefined), null)
    const held = withheld([item], () => undefined)
    assert.equal(held.length, 1)
    assert.match(held[0]!.because, /no plain-language name/)
  })

  it('keeps a proposed item out of the client render and on the desk', () => {
    const item = {
      scope: { kind: 'pin' as const, zoneId: null, pinId: 'p1' }, itemId: 'wh.nameplate', tier: 'core',
      reason: 'not-reached', naReasonId: null, column: 'missing-from-us' as const,
      parts: { what: 'wh.nameplate on the water heater' }, status: 'proposed', origin: 'received' as const,
      dueSince: { importId: 'i1', visitId: 'v1', at: '2026-07-30' },
      where: 'the water heater', certain: true, unrecognised: [],
    }
    assert.equal(clientRow(item, () => 'The water heater data plate'), null,
      'a photograph is sitting on the pin — telling the client we did not capture it would be false')
    assert.match(withheld([item], () => 'The water heater data plate')[0]!.because, /awaiting confirmation/)
  })
})
