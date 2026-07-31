import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { runAudit } from '../src/audit/run.js'
import type { Db } from '../src/db/index.js'
import { runImport } from '../src/import/runImport.js'
import { buildSessionPlan, PLAN_SCHEMA_VERSION } from '../src/plan/sessionPlan.js'
import { addVisit, freshDb, makePropertyAndVisit, readReference, readReferenceAsRewalk, repoRoot, scratchDir, TEST_OPERATOR } from './helpers.js'

async function walked(): Promise<{ db: Db; propertyId: string; visitId: string }> {
  const db = freshDb()
  const ids = makePropertyAndVisit(db)
  await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
  runAudit({ db, propertyId: ids.propertyId, visitId: ids.visitId, visitKind: 'baseline', actorId: TEST_OPERATOR })
  return { db, propertyId: ids.propertyId, visitId: ids.visitId }
}

const plan = (db: Db, propertyId: string) =>
  buildSessionPlan({ db, propertyId, generatedBy: TEST_OPERATOR })

/**
 * §3a — decisions must travel, not just identity.
 *
 * > A concierge ticks `has_mechanicals` on the basement during the baseline.
 * > Visit two replays the zone as identity only. The attribute arrives absent,
 * > falls through to a default — and the mechanical checklist is empty on visit
 * > two, which reads as already handled.
 */
describe('zone attributes as decided', () => {
  it('carries the recorded map verbatim, falses included', async () => {
    const { db, propertyId } = await walked()
    const zones = plan(db, propertyId).zones

    const bedroom = zones.find((z) => z.label === 'bedroom')!
    const ensuite = zones.find((z) => z.label === 'ensuite')!

    // Exactly what the field recorded. An emitter carrying truthy keys only
    // would send `{}` for the bedroom and lose three decisions.
    assert.deepEqual(bedroom.attributes, { finished: false, sleeping: false, has_stairs: false })
    assert.deepEqual(ensuite.attributes, { finished: true, sleeping: false, has_stairs: false })
  })

  /**
   * **The emitter does not send an unanswered list, and cannot honestly.**
   *
   * It was here, derived from this config's declared attributes minus the keys
   * the zone recorded. Field Code's evidence: **v1.2.1 declares five zone
   * attributes and v1.11 declares six, and the sixth is `has_mechanicals` — the
   * only attribute in the whole config carrying a `defaultsTrueFor`.**
   *
   * An emitter always reads a PAST config, so its list is systematically
   * under-inclusive, and across these two versions it is missing exactly the
   * attribute §3a is named after. The receiver has the current vocabulary and
   * derives it from the verbatim map.
   */
  it('sends no unanswered list, because an emitter always reads a past config', async () => {
    const { db, propertyId } = await walked()
    const zone = plan(db, propertyId).zones[0]!
    assert.ok(!('unanswered' in zone))
    assert.ok(!('neverAsked' in zone))
    assert.deepEqual(Object.keys(zone).sort(), ['attributes', 'label', 'type', 'zoneId'])

    // The verbatim map is what makes the receiver's own derivation possible:
    // its declared attributes minus these keys.
    assert.deepEqual(Object.keys(zone.attributes).sort(), ['finished', 'has_stairs', 'sleeping'])
  })

  /**
   * **A recorded `false` is NOT "somebody was asked and said no", and the
   * correction matters more than the conclusion.**
   *
   * Field Code: zone creation writes `attributes[a.id] = attrs.has(a.id)` for
   * every `askAtCreation: true` attribute, **and there is no skip path.** So an
   * untouched toggle and a considered *no* produce the same `false`, and the
   * bedroom's three falses are almost certainly three toggles nobody moved.
   *
   * The verbatim map is still right — **it preserves the field's own ambiguity
   * faithfully**, which is the most any emitter can do. But the earlier reason
   * licensed rendering `false` as *"we established there is none"*, which is the
   * proposed error a third time: a value read as more definite than its
   * provenance supports.
   *
   * What survives the correction: a recorded key and an absent key are different
   * things, and both must reach the receiver.
   */
  it('carries what the field wrote down without claiming it was deliberated', async () => {
    const { db, propertyId } = await walked()
    const bedroom = plan(db, propertyId).zones.find((z) => z.label === 'bedroom')!

    // Recorded false — the field wrote this. It does NOT say whether anybody
    // moved the toggle, and nothing downstream may claim it does.
    assert.equal(bedroom.attributes.sleeping, false)
    // Absent — `askAtCreation: false`, so zone creation never wrote a key at all.
    // A different state, and the one distinction the record genuinely supports.
    assert.ok(!('has_plumbing' in bedroom.attributes))
    assert.ok(!('exterior_wall' in bedroom.attributes))
  })

  /**
   * The failure, demonstrated on this export rather than described.
   *
   * The ensuite carries `finished: true`. Three items in this config are gated
   * on a zone attribute — `liv.egress` on `zone.sleeping`, `bsm.finished-behind`
   * on `zone.finished`, `cir.stairs-rails` on `zone.has_stairs`. Lose the
   * decided true and anything gated on it stops being due, in a room where it
   * applies, with nothing to say so.
   */
  it('carries the one decided true this export has, which is what gates three items', async () => {
    const { db, propertyId } = await walked()
    const decided = plan(db, propertyId).zones.flatMap((z) =>
      Object.entries(z.attributes).filter(([, v]) => v === true).map(([k]) => `${z.label}.${k}`))
    assert.deepEqual(decided, ['ensuite.finished'])

    const snapshot = JSON.parse(
      (db.prepare('SELECT snapshot FROM config_snapshots LIMIT 1').get() as { snapshot: string }).snapshot,
    ) as Record<string, unknown>

    // The gate is real: something in this config actually turns on it.
    const gated: string[] = []
    for (const key of ['baseLists', 'zoneLists', 'componentLists']) {
      for (const list of (snapshot[key] as { items?: { id: string; trigger?: unknown }[] }[] ?? [])) {
        for (const item of list.items ?? []) {
          if (JSON.stringify(item.trigger ?? null).includes('zone.finished')) gated.push(item.id)
        }
      }
    }
    assert.ok(gated.length > 0, `nothing gates on zone.finished, so this test proves nothing: ${gated}`)
  })

  /**
   * **And it is worse than the spec says — measured.**
   *
   * The spec says *"twelve of thirteen zone types have no default."* That is a
   * master-side figure. `defaultsTrueFor` appears nowhere in field config
   * v1.2.1, so **thirteen of thirteen have no default for anything** and an
   * attribute arriving absent has nothing to fall through to at all.
   */
  it('has no defaults to fall through to, which is why carrying is the only mechanism', async () => {
    const { db, propertyId } = await walked()
    const snapshot = JSON.parse(
      (db.prepare('SELECT snapshot FROM config_snapshots LIMIT 1').get() as { snapshot: string }).snapshot,
    ) as { zoneAttributes: unknown; zoneTypes: unknown[] }

    // THE NUMBER IS A RANGE ACROSS VERSIONS. Field Code reports twelve of
    // thirteen reading master v1.11; this measures thirteen of thirteen on
    // v1.2.1, where the key is absent entirely. Both are true of the version
    // they were read from, and citing one figure reads as a contradiction to
    // whoever finds it next.
    assert.ok(!JSON.stringify(snapshot.zoneAttributes).includes('defaultsTrueFor'),
      'v1.2.1 declares no defaults at all — if this ever changes, the range moves and the doc should say so')
    assert.equal((snapshot.zoneTypes as unknown[]).length, 13)
    assert.ok(plan(db, propertyId).zones.length > 0, 'and the plan carries the decisions instead')
  })

  it('keeps one zone per uuid across visits, not one per import', async () => {
    const { db, propertyId } = await walked()
    const second = addVisit(db, propertyId, 'baseline')
    await runImport({
      actorId: TEST_OPERATOR, db, propertyId, visitId: second,
      raw: readReferenceAsRewalk(), dataDir: scratchDir(),
    })
    const zones = plan(db, propertyId).zones
    assert.equal(zones.length, 2, 'the same ensuite seen twice is one ensuite — the uuid is the identity')
  })
})

/**
 * §3b — the payload, and what it says when a section is empty.
 *
 * **Three of five sections are empty on the reference export.** An empty section
 * looks identical whether the mechanism works and found nothing, or was never
 * built — Verification Discipline rule 7 at the payload level. So each one says
 * which, in the plan rather than only in a log.
 */
describe('the payload', () => {
  it('carries the gap stream with the config\'s own reasons', async () => {
    const { db, propertyId } = await walked()
    const gaps = plan(db, propertyId).carriedGaps
    assert.equal(gaps.length, 20)
    assert.equal(gaps.filter((g) => g.reason === 'not-reached').length, 19)
    assert.equal(gaps.filter((g) => g.reason === 'deferred').length, 1)
    // Scope travels, because the same item id in two rooms is two gaps.
    assert.ok(gaps.every((g) => g.scopeKind === 'zone' ? g.zoneId !== null : true))
    assert.ok(gaps.every((g) => typeof g.firstDueImportedAt === 'string' && g.firstDueImportedAt !== ''))
  })

  /**
   * **`since` reads the manifest, not the hand-typed field — and this is the one
   * that had already gone wrong in a client's document.**
   *
   * `visits.visit_date` comes from a request body and **no import path writes
   * it.** The first signed edition rendered *"visited 2026-07-24"* against a
   * session that began 2026-07-25T16:55Z, because a seed script typed a date
   * nothing checked.
   */
  it('reads the session start, not the typed visit date', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    // A typed date that disagrees with the manifest, exactly as happened.
    db.prepare('UPDATE visits SET visit_date = ? WHERE id = ?').run('2026-07-24', ids.visitId)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    runAudit({ db, propertyId: ids.propertyId, visitId: ids.visitId, visitKind: 'baseline', actorId: TEST_OPERATOR })

    const p = plan(db, ids.propertyId)
    assert.ok(p.carriedGaps.every((g) => g.since === '2026-07-25'),
      'the session began on the 25th; the typed 24th is not evidence')
    assert.ok(p.warnings.some((w) => /typed date of 2026-07-24/.test(w) && /began 2026-07-25/.test(w)),
      'and the disagreement is reported rather than silently preferred')
  })

  /**
   * `startedAt`, not `completedAt`.
   *
   * A reopened session has more than one completion. This export reads
   * *completed 17:41 · reopened "Test ai" 17:42 · completed 17:45* — so
   * `completedAt` is when somebody stopped editing, and `startedAt` is when the
   * house was walked.
   */
  it('reads startedAt, which a reopening does not move', async () => {
    const { db, propertyId } = await walked()
    const session = db.prepare('SELECT started_at, completed_at, lifecycle FROM session_meta LIMIT 1')
      .get() as { started_at: string; completed_at: string; lifecycle: string }

    const lifecycle = JSON.parse(session.lifecycle) as { type: string }[]
    assert.equal(lifecycle.filter((l) => l.type === 'completed').length, 2,
      'this export really was reopened, so the distinction is exercised rather than asserted')
    assert.notEqual(session.started_at, session.completed_at)

    assert.ok(plan(db, propertyId).carriedGaps.every((g) => g.since === session.started_at.slice(0, 10)))
  })

  it('sends a null `since` rather than falling back, when no session start exists', async () => {
    const { db, propertyId } = await walked()
    db.prepare('UPDATE session_meta SET started_at = NULL').run()
    const p = plan(db, propertyId)
    assert.ok(p.carriedGaps.every((g) => g.since === null))
    assert.ok(p.carriedGaps.every((g) => g.firstDueImportedAt !== null))
    assert.match(p.sections.carriedGaps.note, /no import for the visit that made them due records a session start/)
    assert.match(p.sections.carriedGaps.note, /not defaulted to the import timestamp/)
  })

  /**
   * §C5's failure one artifact out.
   *
   * Design record §1 retires `monitor` at v4. *"The mechanism ran and found
   * none"* is then true and misleading — it reads as *nothing is being watched*
   * when the truth is *the word is gone.* Three states, not two.
   *
   * **The successor is settled and the sentence now says it.** Field Code: at
   * Increment 5 this section is re-sourced as a query over this repo's own open
   * concerns with no field input, so the flag is not replaced by another flag —
   * the section stops reading a flag. The problem dissolves rather than defers.
   */
  it('says the vocabulary may be retired, rather than reporting a confident empty', async () => {
    const { db, propertyId } = await walked()
    assert.match(plan(db, propertyId).sections.monitorsDue.note, /the mechanism ran and found none/)

    db.prepare('UPDATE imports SET manifest_schema_version = 4').run()
    const note = plan(db, propertyId).sections.monitorsDue.note
    assert.match(note, /retires\s+the `monitor` flag/)
    assert.match(note, /re-sourced as a query over this repo's own open concerns/)
    assert.match(note, /the section stops reading a flag/)
    assert.ok(!/found none/.test(note), 'the confident empty must not survive alongside it')
  })

  /**
   * Observed Addendum §5 — preserve, display, count, mark unrecognised.
   *
   * **Silently ignoring a flag this builder does not act on is none of those.**
   * It is the safe branch that never announces itself, which is rule 7 in one
   * line of filtering.
   */
  it('counts every flag value present, including ones it does not act on', async () => {
    const { db, propertyId } = await walked()
    const note = plan(db, propertyId).sections.monitorsDue.note
    // This export carries two pins flagged `issue` and none flagged `monitor`.
    assert.match(note, /flags on live pins: 2 issue/,
      'a flag this build does not treat as a monitor is still counted and displayed')
  })

  it('marks a flag value it has never met, rather than dropping it', async () => {
    const { db, propertyId } = await walked()
    db.prepare("UPDATE pins SET flag = 'watch-list' WHERE flag = 'issue'").run()

    const p = plan(db, propertyId)
    assert.match(p.sections.monitorsDue.note, /does not recognise \(watch-list\)/)
    assert.match(p.sections.monitorsDue.note, /not treated as monitors/)
    assert.ok(p.warnings.some((w) => /watch-list \(2\)/.test(w) && /not dropped/.test(w)),
      'preserved, displayed, counted, marked — "ignored" is none of those')
    assert.equal(p.monitorsDue.length, 0, 'and still not a monitor, because nobody said it was')
  })

  it('distinguishes "found none" from "cannot be expressed by this config"', async () => {
    const { db, propertyId } = await walked()
    const p = plan(db, propertyId)

    // The mechanism ran and found nothing. Two pins carry `issue`; neither is a monitor.
    assert.equal(p.monitorsDue.length, 0)
    assert.match(p.sections.monitorsDue.note, /found none, which is not the same as it being unbuilt/)

    // The config cannot express the thing at all — a different statement.
    assert.equal(p.comparisonPositionsDue.length, 0)
    assert.match(p.sections.comparisonPositionsDue.note, /declares no `\.unit` items/)
    assert.match(p.sections.comparisonPositionsDue.note, /unexercised rather than empty/)
    assert.ok(p.warnings.some((w) => /`\.unit` items/.test(w)),
      'and it says so loudly enough to reach whoever wonders why the section is empty')
    assert.ok(!p.warnings.some((w) => /declares 23|27 `\.unit`/.test(w)),
      'the master-side count is disputed between two readings — 27 + 5 `.wide` against 23 — and nothing ' +
      'binds to it, so no figure is cited')
  })

  /** §B3's two canonical photographs stay distinct and are never conflated. */
  it('never invents a comparison position from an arbitrary photograph', async () => {
    const { db, propertyId } = await walked()
    const p = plan(db, propertyId)
    // The one typed pin holds five satisfied component items and photographs.
    // A prior UNIT photo is still null, because no `.unit` item declares one —
    // the unit shot and the nameplate shot are different things, and falling
    // back to "the most recent photo" would conflate them.
    assert.ok(p.objects.length > 0, 'there is a typed pin to get this wrong about')
    assert.equal(p.objects.every((o) => o.priorUnitPhoto === null), true)
  })

  it('leaves room for concerns without building any', async () => {
    const { db, propertyId } = await walked()
    const p = plan(db, propertyId)
    assert.deepEqual(p.openConcerns, [])
    assert.match(p.sections.openConcerns.note, /Increment 5 and gated on manifest v4/)
  })
})

/** §3 — session data, never config. */
describe('what a plan is and is not', () => {
  it('is provenance-tagged system, with what produced it', async () => {
    const { db, propertyId } = await walked()
    const p = plan(db, propertyId)

    assert.equal(p.planSchemaVersion, PLAN_SCHEMA_VERSION)
    assert.equal(p.kind, 'session-plan')
    assert.equal(p.source.actor, 'system')
    assert.equal(p.source.binderId, propertyId)
    assert.ok(p.source.auditRunId, 'and which audit run it was composed from')
    assert.equal(p.source.generatedBy, TEST_OPERATOR)
  })

  it('carries no config and no config hash', async () => {
    const { db, propertyId } = await walked()
    const text = JSON.stringify(plan(db, propertyId))
    for (const forbidden of ['configId', 'configVersion', 'configHash', 'baseLists', 'zoneLists', 'componentLists', 'naReasons']) {
      assert.ok(!text.includes(forbidden),
        `${forbidden} is config — a plan that carried it would make the config a function of what the builder thinks`)
    }
  })

  /**
   * The naming trap, held by a check rather than a memory.
   *
   * The field repo's `src/engine/plan.ts` exports `SessionPlan` and
   * `compilePlan`, and **that is the v1 slot-model plan compiler, unrelated to
   * this.** Nothing here may mirror its shape, because two things with one name
   * is how somebody eventually binds to the wrong one.
   */
  it('does not mirror the field repo\'s unrelated plan compiler', () => {
    const source = readFileSync(join(repoRoot, 'server', 'src', 'plan', 'sessionPlan.ts'), 'utf8')
    assert.ok(!/\bcompilePlan\b/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')),
      'compilePlan belongs to the field\'s slot-model compiler and means something else there')
  })
})
