import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { activeItemKey, activeItemSet } from '../src/audit/activeItems.js'
import { carriedItems } from '../src/audit/carriedItems.js'
import { propertyEvidence } from '../src/audit/propertyEvidence.js'
import { newId } from '../src/db/index.js'
import type { CanonicalActiveItem } from '../src/import/adapters/canonical.js'
import { parseToCanonical } from '../src/import/adapters/parse.js'
import { persistImport } from '../src/import/persist.js'
import { finalize } from '../src/import/validate.js'
import { runImport } from '../src/import/runImport.js'
import { addVisit, freshDb, makePropertyAndVisit, readReference, readReferenceAsRewalk, scratchDir, TEST_OPERATOR } from './helpers.js'

/**
 * §3c — the received path and the computed path, side by side.
 *
 * **There is deliberately no v4 adapter in the registry, and that is a decision
 * rather than an omission.** A partial v4 adapter would make `parseToCanonical`
 * *accept* a real v4 export and silently drop everything v4 adds beyond this one
 * array — concerns as entities above all. Today's refusal — *"this builder reads
 * version 3"* — is correct, and it stays correct until v4 is actually built.
 *
 * So these drive the seam where it really lives: `persistImport` reads
 * `canonical.activeItems` without knowing which version produced it, and
 * `activeItemSet` prefers received rows over computing. A v4 adapter that fills
 * that array is then the only new code, which is the claim §C3 makes.
 */
describe('the active item set, received versus computed', () => {
  /**
   * The reference export persisted with an active item set attached, exactly as
   * a v4 adapter would emit one.
   *
   * `persistImport` is called directly rather than through `runImport`, because
   * `runImport` runs `parseToCanonical` and the v3 adapter correctly emits an
   * empty array. This is the one seam a v4 adapter changes, so it is the one the
   * test drives.
   */
  const withReceivedSet = (
    activeItems: CanonicalActiveItem[],
  ): { db: ReturnType<typeof freshDb>; propertyId: string; visitId: string; importId: string } => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const raw = readReference()
    const { canonical, checks } = parseToCanonical(raw)
    assert.ok(canonical)

    canonical.activeItems = activeItems

    const importId = newId()
    persistImport({
      db, propertyId: ids.propertyId, visitId: ids.visitId, raw, canonical,
      report: finalize(checks, [], []), mediaMode: 'manifest_only',
      actorId: TEST_OPERATOR, importId,
    })
    return { db, propertyId: ids.propertyId, visitId: ids.visitId, importId }
  }

  /** Ids only, keyed identically to resolutions[], with an advisory group and a status. */
  const SET: CanonicalActiveItem[] = [
    { scopeKind: 'session', scopeZoneId: null, scopePinId: null, itemId: 'ses.alarm-coverage', group: 'close-out', status: 'satisfied' },
    { scopeKind: 'session', scopeZoneId: null, scopePinId: null, itemId: 'ses.termination-reconcile', group: 'close-out', status: 'na' },
    { scopeKind: 'session', scopeZoneId: null, scopePinId: null, itemId: 'ses.below-recheck', group: 'close-out', status: 'proposed' },
  ]

  it('prefers the field\'s own answer and marks every item received', () => {
    const { db, propertyId } = withReceivedSet(SET)
    const set = activeItemSet(db, propertyId)

    assert.equal(set.origins.received, 3)
    assert.equal(set.origins.computed, 0, 'a received set is not supplemented by a computed one — that would be two answers')
    for (const item of set.items.values()) assert.equal(item.origin, 'received')
  })

  it('produces the same downstream shape from both paths, differing only in origin', async () => {
    const received = withReceivedSet(SET)
    const computedDb = freshDb()
    const ids = makePropertyAndVisit(computedDb)
    await runImport({ actorId: TEST_OPERATOR, db: computedDb, ...ids, raw: readReference(), dataDir: scratchDir() })

    const a = activeItemSet(received.db, received.propertyId).items.get(
      activeItemKey({ kind: 'session', zoneId: null, pinId: null }, 'ses.termination-reconcile'),
    )!
    const b = activeItemSet(computedDb, ids.propertyId).items.get(
      activeItemKey({ kind: 'session', zoneId: null, pinId: null }, 'ses.termination-reconcile'),
    )!

    assert.ok(a && b, 'both paths find the same item under the same key')
    const shapeOf = (x: typeof a): string[] => Object.keys(x).sort()
    assert.deepEqual(shapeOf(a), shapeOf(b), 'nothing downstream may need to know which path produced an item')
    assert.equal(a.itemId, b.itemId)
    assert.equal(a.tier, b.tier, 'tier comes from the config snapshot either way — the field sends ids, not bodies')
    assert.notEqual(a.origin, b.origin)
    assert.equal(a.origin, 'received')
    assert.equal(b.origin, 'computed')
  })

  /**
   * §1c — `proposed` is a fourth state, and the failure it prevents.
   *
   * *A photograph of the water heater nameplate is sitting on the pin,
   * unconfirmed. Without `proposed`, it is indistinguishable from an item nobody
   * touched, and the client reads "we did not capture this" about a photograph we
   * are holding.*
   */
  it('keeps a proposed item distinguishable from an unresolved one at every layer', () => {
    const { db, propertyId } = withReceivedSet(SET)
    const set = activeItemSet(db, propertyId)

    const proposed = set.items.get(activeItemKey({ kind: 'session', zoneId: null, pinId: null }, 'ses.below-recheck'))!
    assert.equal(proposed.status, 'proposed')

    const evidence = propertyEvidence(db, propertyId)
    const { carried } = carriedItems({ evidence, active: set, resolutions: new Map() })
    const row = carried.items.find((i) => i.itemId === 'ses.below-recheck')!
    assert.ok(row, 'a proposed item is still a carried item — it is desk work, not nothing')
    assert.equal(row.status, 'proposed', 'and the status survives into the stream, or the client render cannot filter it')
  })

  /**
   * §1c's cross-check. The duplication is used as an oracle, never as a source.
   *
   * `ses.alarm-coverage` really is satisfied on this export, so that one agrees.
   * `ses.termination-reconcile` really is `na`, so that agrees too. Change one and
   * the disagreement has to surface rather than one side quietly winning.
   */
  it('reports a status that disagrees with resolutions rather than picking a winner', () => {
    // The export's own resolutions say this one is `satisfied`.
    const { db, propertyId } = withReceivedSet([
      { scopeKind: 'session', scopeZoneId: null, scopePinId: null, itemId: 'ses.alarm-coverage', group: null, status: 'na' },
    ])

    const evidence = propertyEvidence(db, propertyId)
    const set = activeItemSet(db, propertyId)
    const { statusDisagreements } = carriedItems({
      evidence, active: set,
      resolutions: new Map([[activeItemKey({ kind: 'session', zoneId: null, pinId: null }, 'ses.alarm-coverage'),
        { kind: 'satisfied', reasonId: null, at: '2026-07-30' }]]),
    })

    assert.equal(statusDisagreements.length, 1)
    assert.equal(statusDisagreements[0]!.declared, 'na')
    assert.equal(statusDisagreements[0]!.derived, 'satisfied')
  })

  it('reports the origin breakdown when a property holds both kinds', async () => {
    const received = withReceivedSet(SET)

    // A second import with no received set — the v3-baseline-plus-v4-monthly case
    // that makes a single origin field on the set impossible to state honestly.
    const second = addVisit(received.db, received.propertyId, 'baseline')
    await runImport({
      actorId: TEST_OPERATOR, db: received.db, propertyId: received.propertyId, visitId: second,
      raw: readReferenceAsRewalk(), dataDir: scratchDir(),
    })

    const set = activeItemSet(received.db, received.propertyId)
    assert.ok(set.origins.received > 0 && set.origins.computed > 0,
      'a property with a v3 baseline and a v4 monthly holds both at once — which is why origin rides on the item')
  })

  it('does not count a visit-less import as due, and says why', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })

    // §1j — an import with no visit. A drone run over six properties three weeks
    // after an inspection has no visit kind, and `scope[]` filtering turns on it.
    db.prepare('UPDATE imports SET visit_id = NULL WHERE property_id = ?').run(ids.propertyId)
    const set = activeItemSet(db, ids.propertyId)

    assert.equal(set.items.size, 0)
    assert.ok(set.warnings.some((w) => /no visit kind/.test(w)),
      'guessing baseline makes every seasonal item due and guessing monthly makes most vanish — so it is said out loud')
  })
})
