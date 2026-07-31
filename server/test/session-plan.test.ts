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
   * `unanswered`, not `neverAsked` — the word was claiming a history the
   * derivation does not have.
   *
   * The list is today's `zoneAttributes[]` minus what the zone recorded, so an
   * attribute added to the config between visits appears here. That is correct
   * for the purpose — nobody has answered it and somebody should — and it is
   * exactly what *never* would misdescribe.
   */
  it('names the field for what it is: unanswered as of this plan, not never asked', async () => {
    const { db, propertyId } = await walked()
    const zone = plan(db, propertyId).zones[0]!
    assert.ok('unanswered' in zone)
    assert.ok(!('neverAsked' in zone),
      'a historical quantifier on a current fact is the same failure as "we were not able to cover"')

    // The derivation follows the config, which is the behaviour the name has to
    // describe: add an attribute to the vocabulary and it becomes unanswered.
    const snap = JSON.parse(
      (db.prepare('SELECT snapshot FROM config_snapshots LIMIT 1').get() as { snapshot: string }).snapshot,
    ) as Record<string, unknown>
    ;(snap.zoneAttributes as unknown[]).push({ id: 'has_mechanicals', label: 'Mechanicals', askAtCreation: true })
    db.prepare('UPDATE config_snapshots SET snapshot = ?').run(JSON.stringify(snap))

    assert.ok(plan(db, propertyId).zones.every((z) => z.unanswered.includes('has_mechanicals')),
      'an attribute the config gains between visits is unanswered, and should be asked')
  })

  /**
   * **The trap inside "carry the attributes."**
   *
   * A recorded `false` is a decision — somebody was asked and said no. An absent
   * attribute is not: this config sets `askAtCreation: false` on `has_plumbing`
   * and `exterior_wall`, so nobody was ever asked. An emitter that drops falsy
   * values makes the two identical on the receiving end, and visit two cannot
   * tell *"we established there is no plumbing here"* from *"nobody has
   * considered it."*
   *
   * Third instance of the same distinction after declared-and-false in the
   * trigger evaluator and the three-state component types.
   */
  it('keeps a decided false distinguishable from a question nobody asked', async () => {
    const { db, propertyId } = await walked()
    const bedroom = plan(db, propertyId).zones.find((z) => z.label === 'bedroom')!

    assert.equal(bedroom.attributes.sleeping, false, 'decided — somebody said no')
    assert.ok(!('has_plumbing' in bedroom.attributes), 'never asked — askAtCreation is false for it')
    assert.deepEqual(bedroom.unanswered, ['exterior_wall', 'has_plumbing'],
      'and the unanswered ones are named rather than merely absent')
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
    // `since` is the VISIT DATE. An import timestamp has no meaning in the
    // field — this export was visited on the 24th and imported later — and one
    // field standing for two facts is how a zone `type` ended up doing a
    // nickname's job.
    assert.ok(gaps.every((g) => typeof g.sinceImportedAt === 'string' && g.sinceImportedAt !== ''))
  })

  it('sends the visit date as `since`, and the import timestamp under its own name', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    db.prepare('UPDATE visits SET visit_date = ? WHERE id = ?').run('2026-07-24', ids.visitId)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    runAudit({ db, propertyId: ids.propertyId, visitId: ids.visitId, visitKind: 'baseline', actorId: TEST_OPERATOR })

    const gaps = plan(db, ids.propertyId).carriedGaps
    assert.ok(gaps.every((g) => g.since === '2026-07-24'), 'what the field can say out loud')
    assert.ok(gaps.every((g) => g.sinceImportedAt !== '2026-07-24'), 'and a different fact, named separately')
  })

  it('sends a null `since` rather than falling back, when the visit has no date', async () => {
    const { db, propertyId } = await walked()
    // The helper creates visits with no date, which is the honest case here.
    const p = plan(db, propertyId)
    assert.ok(p.carriedGaps.every((g) => g.since === null))
    assert.ok(p.carriedGaps.every((g) => g.sinceImportedAt !== null))
    assert.match(p.sections.carriedGaps.note, /carry no `since` because the visit .* has no date recorded/)
    assert.match(p.sections.carriedGaps.note, /not defaulted to the import timestamp/)
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
    assert.ok(p.warnings.some((w) => /`\.unit` items/.test(w) && /master declares 23/.test(w)),
      'and it says so loudly enough to reach whoever wonders why the section is empty')
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
