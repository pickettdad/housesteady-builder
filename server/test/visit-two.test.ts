/**
 * §1k — the two things that only surface on visit two.
 *
 * Both invisible with one import, both consequential once a property has a
 * history. Which is why they get a fixture that builds one: the reference export
 * as a Baseline, then a re-walk that could not reach half of it.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  identityPersists, itemsOf, propertyEvidence,
} from '../src/audit/propertyEvidence.js'
import { runAudit } from '../src/audit/run.js'
import { runImport } from '../src/import/runImport.js'
import {
  addVisit, freshDb, makePropertyAndVisit, readReference, readReferenceAsRewalk, scratchDir, TEST_OPERATOR,
} from './helpers.js'
import type { Db } from '../src/db/index.js'

/**
 * A second capture where named items could not be reached.
 *
 * `no-access` is chosen deliberately over `none-present`: one is a failure to
 * reach and the other is a substantive finding. §1k.2 turns on exactly that
 * difference, and the config declares which is which.
 */
function rewalkWithNoAccess(itemIds: string[], sessionId = 'session-rewalk-1'): string {
  const manifest = JSON.parse(readReferenceAsRewalk(sessionId)) as {
    resolutions: { itemId: string; resolution: Record<string, unknown> }[]
  }
  for (const r of manifest.resolutions) {
    if (itemIds.includes(r.itemId)) r.resolution = { kind: 'na', reasonId: 'no-access' }
  }
  return JSON.stringify(manifest)
}

/** Which items the reference config marks evidence, and which action. */
function classify(db: Db, propertyId: string): { evidence: string[]; action: string[] } {
  const items = itemsOf(propertyEvidence(db, propertyId).snapshot)
  const evidence: string[] = []
  const action: string[] = []
  for (const [id, item] of items) (item.attest === 'evidence' ? evidence : action).push(id)
  return { evidence, action }
}

describe('§1k.2 — latest-answer-wins is right for state and wrong for identity', () => {
  /**
   * **The spec says the config does not appear to declare which is which. It
   * does, under a different name: `attest`.**
   *
   * `evidence` marks an item that captures something — a nameplate
   * photographed, an age decoded from a serial. `action` marks one where the
   * concierge looked and judged. The rule follows from what those words mean:
   * evidence, once captured, does not un-capture.
   */
  it('finds the distinction already declared in the config', () => {
    const db = freshDb()
    const { propertyId } = makePropertyAndVisit(db)
    assert.equal(identityPersists('evidence'), true)
    assert.equal(identityPersists('action'), false)
    assert.equal(identityPersists(undefined), false, 'an item declaring nothing is treated as state')
  })

  it('classifies every nameplate and age item as evidence', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })

    const { evidence, action } = classify(db, ids.propertyId)
    for (const id of ['wh.nameplate', 'fur.nameplate', 'wh.age', 'ft.age']) {
      assert.ok(evidence.includes(id), `${id} should be evidence`)
    }
    // And the state checks are not.
    for (const id of ['rgh.storage-hazard', 'ses.alarm-coverage']) {
      assert.ok(action.includes(id), `${id} should be action`)
    }
  })

  /**
   * The failure §1k.2 prevents: **a serial number does not become unknown
   * because nobody could reach the unit.** §19's capital plan depends on install
   * dates, and they must not evaporate on a no-access visit.
   */
  it('keeps an identity value standing through a later no-access', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })

    const { evidence } = classify(db, ids.propertyId)
    const before = propertyEvidence(db, ids.propertyId)
    const identityItem = [...before.resolutions.values()]
      .find((r) => r.kind === 'satisfied' && evidence.includes(r.itemId))
    assert.ok(identityItem, 'the Baseline satisfied at least one evidence item')

    const second = addVisit(db, ids.propertyId, 'monthly')
    await runImport({
      db, propertyId: ids.propertyId, visitId: second,
      raw: rewalkWithNoAccess([identityItem.itemId]),
      dataDir: scratchDir(), actorId: TEST_OPERATOR,
    })

    const after = propertyEvidence(db, ids.propertyId).resolutions.get(identityItem.itemId)!
    assert.equal(after.kind, 'satisfied', 'the reading stands')
    assert.equal(after.at, identityItem.at, 'and it is still the Baseline reading, not a new one')
    assert.ok(after.carriedForward, 'recorded as carried forward, never silently')
    assert.equal(after.carriedForward.blockedBy, 'no-access',
      'and says what stopped it being re-confirmed')
  })

  /** A judgement made in January is not still true in March. */
  it('reverts a state value on the same no-access', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })

    const { action } = classify(db, ids.propertyId)
    const before = propertyEvidence(db, ids.propertyId)
    const stateItem = [...before.resolutions.values()]
      .find((r) => r.kind === 'satisfied' && action.includes(r.itemId))
    assert.ok(stateItem, 'the Baseline satisfied at least one action item')

    const second = addVisit(db, ids.propertyId, 'monthly')
    await runImport({
      db, propertyId: ids.propertyId, visitId: second,
      raw: rewalkWithNoAccess([stateItem.itemId]),
      dataDir: scratchDir(), actorId: TEST_OPERATOR,
    })

    const after = propertyEvidence(db, ids.propertyId).resolutions.get(stateItem.itemId)!
    assert.equal(after.kind, 'na', 'a check that could not be reached is genuinely unknown now')
    assert.equal(after.reasonId, 'no-access')
    assert.equal(after.carriedForward, undefined)
  })

  /**
   * A confirmed absence is a substantive answer, not a failure to reach — so it
   * replaces an earlier reading even on an evidence item. The config draws that
   * line with `feedsGapList`, and the builder reads it rather than deciding.
   */
  it('lets a substantive later answer replace an identity value', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })

    const { evidence } = classify(db, ids.propertyId)
    const item = [...propertyEvidence(db, ids.propertyId).resolutions.values()]
      .find((r) => r.kind === 'satisfied' && evidence.includes(r.itemId))!

    const manifest = JSON.parse(readReferenceAsRewalk('session-absent')) as {
      resolutions: { itemId: string; resolution: Record<string, unknown> }[]
    }
    for (const r of manifest.resolutions) {
      // `none-present` does NOT feed the gap list — a confirmed absence.
      if (r.itemId === item.itemId) r.resolution = { kind: 'na', reasonId: 'none-present' }
    }

    const second = addVisit(db, ids.propertyId, 'monthly')
    await runImport({
      db, propertyId: ids.propertyId, visitId: second, raw: JSON.stringify(manifest),
      dataDir: scratchDir(), actorId: TEST_OPERATOR,
    })

    const after = propertyEvidence(db, ids.propertyId).resolutions.get(item.itemId)!
    assert.equal(after.reasonId, 'none-present', 'a finding replaces a reading; only a blocked reach does not')
    assert.equal(after.carriedForward, undefined)
  })

  /** PROVISIONAL — the rule is proposed, not invented, and says so on the run. */
  it('records every carried-forward value as provisional on the run', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })

    const { evidence } = classify(db, ids.propertyId)
    const item = [...propertyEvidence(db, ids.propertyId).resolutions.values()]
      .find((r) => r.kind === 'satisfied' && evidence.includes(r.itemId))!

    const second = addVisit(db, ids.propertyId, 'monthly')
    await runImport({
      db, propertyId: ids.propertyId, visitId: second, raw: rewalkWithNoAccess([item.itemId]),
      dataDir: scratchDir(), actorId: TEST_OPERATOR,
    })

    const result = runAudit({
      db, propertyId: ids.propertyId, visitId: second, visitKind: 'monthly', actorId: TEST_OPERATOR,
    })
    const note = result.warnings.find((w) => /carried forward/.test(w))
    assert.ok(note, 'the run says a value was carried forward')
    assert.match(note, /PROVISIONAL/, 'and that the rule is proposed rather than settled')
    assert.match(note, /attest/, 'naming what it was classified by, so the field session can confirm it')
  })
})

describe('§1k.1 — the recording config governs interpretation', () => {
  /**
   * A Baseline answer against an item the current config has retired is **not
   * unrecognised vocabulary.** It is a valid answer to a question that has since
   * changed, and the two carry opposite implications: unrecognised says the
   * record is malformed, superseded says the question moved.
   */
  it('reports an answer under a retired item as superseded, not unrecognised', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir(), actorId: TEST_OPERATOR })

    // A later capture whose config has dropped an item the Baseline answered.
    const baseline = propertyEvidence(db, ids.propertyId)
    const retiring = [...baseline.resolutions.values()].find((r) => r.kind === 'satisfied')!

    const manifest = JSON.parse(readReferenceAsRewalk('session-newer-config')) as {
      config: { snapshot: Record<string, unknown>; version: string }
      resolutions: { itemId: string }[]
    }
    // Drop the item from the newer config, and stop answering it.
    for (const key of ['baseLists', 'zoneLists', 'componentLists']) {
      for (const entry of manifest.config.snapshot[key] as { items?: { id: string }[] }[]) {
        if (entry.items) entry.items = entry.items.filter((i) => i.id !== retiring.itemId)
      }
    }
    manifest.config.version = '9.9.9'
    manifest.resolutions = manifest.resolutions.filter((r) => r.itemId !== retiring.itemId)

    const second = addVisit(db, ids.propertyId, 'monthly')
    await runImport({
      db, propertyId: ids.propertyId, visitId: second, raw: JSON.stringify(manifest),
      dataDir: scratchDir(), actorId: TEST_OPERATOR,
    })

    const after = propertyEvidence(db, ids.propertyId)
    const answer = after.resolutions.get(retiring.itemId)!
    assert.ok(answer.supersededSince, 'the answer is marked as recorded under a superseded item')
    assert.equal(answer.kind, 'satisfied', 'and the answer itself is not discarded')

    const note = after.warnings.find((w) => /superseded item/.test(w))
    assert.ok(note, 'and the run says so')
    assert.match(note, /not unrecognised vocabulary/)
    assert.match(note, /never joined by software/, 'the successors are shown to a person')
  })

  /** An item neither config ever declared is genuinely unrecognised. */
  it('does not call an unknown item superseded', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)

    const manifest = JSON.parse(readReference()) as {
      resolutions: { itemId: string; scope: unknown; resolution: unknown; at: string; source: unknown }[]
    }
    const first = manifest.resolutions[0]!
    manifest.resolutions.push({ ...first, itemId: 'nothing.ever-declared-this' })

    await runImport({
      db, ...ids, raw: JSON.stringify(manifest), dataDir: scratchDir(), actorId: TEST_OPERATOR,
    })

    const evidence = propertyEvidence(db, ids.propertyId)
    const unknown = evidence.resolutions.get('nothing.ever-declared-this')
    assert.ok(unknown, 'fail open — it is imported and counted')
    assert.equal(unknown.supersededSince, undefined,
      'never declared is not the same as declared and retired')
  })
})
