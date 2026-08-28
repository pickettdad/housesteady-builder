/**
 * Pass 2 · Resolve — Amendment 11 §C, the keystone.
 *
 * **Every case is one of the eight confident wrong classes measured on the
 * owner's mechanical room**, plus the one correction that reshaped the pass:
 * *count the evidence, not the column.*
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { newId, now, type Db } from '../src/db/index.js'
import { loadPrompts, promptsRoot } from '../src/ai/prompts.js'
import type { ModelConfig } from '../src/ai/models.js'
import type { RunArgs } from '../src/ai/client.js'
import { claimNext } from '../src/ai/queue.js'
import { runnerFor } from '../src/ai/tasks/index.js'
import { writeReadings } from '../src/ai/tasks/readSurfaces.js'
import {
  knownInventory, normaliseResolve, planResolution, queueResolution, RESOLVE_SCHEMA, RESOLVE_TASK,
  resolutionFacts, runResolveProduct, type ResolveOutput,
} from '../src/ai/tasks/resolveProduct.js'
import { buildQuery, partNumberShaped, shippable, MODEL_HONESTY_LABELS } from '../src/engine/lookup.js'
import { fieldKey, type FieldClaim } from '../src/engine/surfaces.js'
import { freshDb, TEST_OPERATOR } from './helpers.js'

const MODEL: ModelConfig = {
  tier: 'fast', id: 'a-pinned-fast-model', inputPerMTok: 1, outputPerMTok: 5,
  maxImageEdge: 1568, maxOutputTokens: 4096,
}
const PROPERTY = 'prop-1'
const VISIT = 'visit-1'
const ZONE = 'zone-mech'

const claim = (field: string, value: string, over: Partial<FieldClaim> = {}): FieldClaim => ({
  readingId: 'r1', mediaId: 'm1', surface: 'nameplate',
  field, value, fieldKey: fieldKey(field), unreadable: false, ...over,
})

// ---------------------------------------------------------------- the pure half

describe('count the evidence, not the column', () => {
  it('finds a part number sitting in a PRODUCT NAME — the Franklin cartridge', () => {
    // The measured origin of the correction: this string is in the record's
    // `product` field and not its `model` field, and a count of populated model
    // fields scored it as nothing to resolve.
    const q = buildQuery('r1', 'm1', 'nameplate', [
      claim('product', 'Franklin Water Treatment FWPS20B20 polypropylene cartridge'),
    ])
    assert.equal(q.specificity, 'line', 'a part-number-shaped token makes this a line, not a family')
    assert.match(q.text, /FWPS20B20/)
  })

  it('reads a model and a serial as the unit', () => {
    const q = buildQuery('r1', 'm1', 'nameplate', [
      claim('Model', 'G9-50SDE-30 250'), claim('Serial', 'Q1373559'),
    ])
    assert.equal(q.specificity, 'unit')
    assert.match(q.why, /date of manufacture/)
    assert.doesNotMatch(q.text, /Q1373559/, 'a serial does not identify a product line, so it is not asked about')
  })

  it('reads a brand with no model as a FAMILY, which is a real answer', () => {
    // `Siemens EQ Loadcentre, Type 1` names the maker and a line and no
    // catalogue number — enough to know it is a load centre and not a water
    // treatment vessel, which is the error class this pass kills.
    const q = buildQuery('r1', 'm1', 'nameplate', [claim('brand', 'Siemens EQ Loadcentre')])
    assert.equal(q.specificity, 'family')
    assert.match(q.why, /which is a real answer/)
  })

  it('reports a label with nothing identifying rather than inventing a query', () => {
    const q = buildQuery('r1', 'm1', 'nameplate', [
      claim('Maximum Operating Pressure', '75 psig'), claim('Tank Volume', '120 gallons'),
    ])
    assert.equal(q.specificity, 'none')
    assert.equal(q.text, '')
  })

  it('ignores an illegible field rather than asking about a partial read', () => {
    const q = buildQuery('r1', 'm1', 'nameplate', [claim('Model', 'Q13__5_9', { unreadable: true })])
    assert.equal(q.specificity, 'none')
  })

  it('knows a part number from a measurement, including a RANGE', () => {
    for (const s of ['600545B', 'UT-450 CE', 'PP20B-20', 'TSMS-4/8', 'FWPS20B20', '45MHP2', 'G9-50SDE-30 250', '1054PB']) {
      assert.ok(partNumberShaped(s), s)
    }
    // ⚑ The range form was a false positive until the negatives were tested.
    // `40-60 psig` is one of the WellMate's three drawdown columns, and reading
    // it as a part number would send a pressure range to a product lookup —
    // from the very plate whose empty cells this pipeline exists to preserve.
    for (const s of ['75 psig', '20 micron', '2011', 'N/A', 'CLIMATEMASTER', '120',
                     '40-60 psig', '20-40 psig', '30-50 psig', '120 gallons', 'Made in Canada']) {
      assert.equal(partNumberShaped(s), false, s)
    }
  })
})

describe('the honesty label is what this build can actually support', () => {
  it('offers Inferred and nothing else, because a model recalling is not a model reading', () => {
    // ⚑ Binder 6b made `Documented` reachable and did NOT change this.
    // `engine/sources.ts` offers it to the EVIDENCE; this pass is the MODEL, and
    // a model recognising text from training has read nothing. A resolution
    // becomes `Documented` by acquiring a source that qualifies under §8 — never
    // by this pass saying so.
    assert.deepEqual([...MODEL_HONESTY_LABELS], ['Inferred'])
  })

  it('has no field in the schema where a source could be claimed', () => {
    // A model asked where it read something will invent a URL. The way to stop
    // that is to give it nowhere to put one.
    const props = (RESOLVE_SCHEMA.properties as { resolutions: { items: { properties: Record<string, unknown> } } })
      .resolutions.items.properties
    assert.deepEqual(Object.keys(props).sort(), ['kind', 'product', 'readingId', 'recognisedFrom', 'resolved'])
    for (const forbidden of ['source', 'sourceUrl', 'url', 'documentation']) {
      assert.equal(forbidden in props, false, `pass 2 must not be able to claim a \`${forbidden}\``)
    }
  })

  it('refuses a resolved answer with nothing behind it', () => {
    // *If it cannot say how it knows, it does not know.*
    assert.equal(shippable({ readingId: 'r', product: 'A tank', kind: 'equipment', recognisedFrom: '', resolved: true, specificity: 'line' }), false)
    assert.equal(shippable({ readingId: 'r', product: '', kind: 'unknown', recognisedFrom: '', resolved: false, specificity: 'line' }), true)
  })
})

// ---------------------------------------------------------------- the database

describe('the pass', () => {
  let db: Db
  let importId: string

  const stub = (answers: ResolveOutput[]): {
    asked: RunArgs[]
    prompts: ReturnType<typeof loadPrompts>
    model: ModelConfig
    resolvePath: () => string
    run: <T>(args: RunArgs) => Promise<{ output: T; inputTokens: number; outputTokens: number }>
  } => {
    const asked: RunArgs[] = []
    let i = 0
    return {
      asked, prompts: loadPrompts(promptsRoot), model: MODEL, resolvePath: () => '',
      run: async <T,>(args: RunArgs) => {
        asked.push(args)
        return { output: answers[i++] as T, inputTokens: 900, outputTokens: 400 }
      },
    }
  }

  const label = (fields: { field: string; value: string; unreadable?: boolean }[]): string => {
    const [id] = writeReadings(db, {
      propertyId: PROPERTY, importId, zoneId: ZONE, actorId: TEST_OPERATOR,
      labels: [{
        mediaId: 'm1', surface: 'nameplate', whereItIs: '',
        fields: fields.map((f) => ({ ...f, unreadable: f.unreadable ?? false })),
      }],
    })
    return id!
  }

  beforeEach(() => {
    db = freshDb()
    db.prepare(`INSERT INTO properties (id, label, created_at, actor_id) VALUES (?, 'A house', ?, ?)`)
      .run(PROPERTY, now(), TEST_OPERATOR)
    db.prepare(`INSERT INTO visits (id, property_id, kind, created_at, actor_id) VALUES (?, ?, 'baseline', ?, ?)`)
      .run(VISIT, PROPERTY, now(), TEST_OPERATOR)
    importId = newId()
    db.prepare(
      `INSERT INTO imports (id, visit_id, property_id, imported_at, media_mode, raw_manifest,
                            validation_report, status, created_at, actor_id)
       VALUES (?, ?, ?, ?, 'full', '{}', '{}', 'ok', ?, ?)`,
    ).run(importId, VISIT, PROPERTY, now(), now(), TEST_OPERATOR)
  })

  it('sends NO IMAGES, which is the whole cost argument', async () => {
    const r1 = label([{ field: 'Model', value: '600545B' }, { field: 'brand', value: 'Burcam' }])
    const deps = stub([{
      resolutions: [{
        readingId: r1, resolved: true, product: 'Burcam Series 600 captive-air pressure tank',
        kind: 'equipment', recognisedFrom: 'Burcam 600-series are captive-air pressure tanks.',
      }],
    }])

    queueResolution(db, PROPERTY, VISIT, TEST_OPERATOR)
    const job = claimNext(db, VISIT)!
    assert.equal(job.task, RESOLVE_TASK)
    const out = await runResolveProduct(db, job, deps)

    assert.ok(out)
    assert.deepEqual(deps.asked[0]!.images, [], 'text only')
    const gen = db.prepare('SELECT input_refs AS refs FROM ai_generations').get() as { refs: string }
    assert.equal(JSON.parse(gen.refs).imagesSent, 0, 'stated, not inferred from a zero')

    const row = db.prepare('SELECT product, kind, honesty, resolved FROM product_resolutions').get() as {
      product: string; kind: string; honesty: string; resolved: number
    }
    assert.deepEqual(row, {
      product: 'Burcam Series 600 captive-air pressure tank', kind: 'equipment', honesty: 'Inferred', resolved: 1,
    })
  })

  it('sorts a consumable out of the object channel — PP20B-20', async () => {
    // The reverse-osmosis false positive, killed. A cartridge is a consumable
    // and must never reach the binder as equipment with a maintenance rhythm.
    const r1 = label([{ field: 'part number', value: 'PP20B-20' }, { field: 'product', value: 'Excelpure sediment filter cartridge' }])
    queueResolution(db, PROPERTY, VISIT, TEST_OPERATOR)
    await runResolveProduct(db, claimNext(db, VISIT)!, stub([{
      resolutions: [{
        readingId: r1, resolved: true, product: 'spun polypropylene sediment filter cartridge, 20 micron',
        kind: 'consumable', recognisedFrom: 'PP20B-20 is a 20-inch 20-micron spun poly cartridge.',
      }],
    }]))
    const row = db.prepare('SELECT kind FROM product_resolutions').get() as { kind: string }
    assert.equal(row.kind, 'consumable')
    assert.equal(knownInventory(db, importId)[0]!.kind, 'consumable')
  })

  it('keeps an unresolved row rather than deleting it', async () => {
    // `resolved: false` is expected. The next run against a better model wants
    // to know which ones were unresolved before.
    const r1 = label([{ field: 'Model', value: 'ZZQ-9911' }])
    queueResolution(db, PROPERTY, VISIT, TEST_OPERATOR)
    const out = await runResolveProduct(db, claimNext(db, VISIT)!, stub([{
      resolutions: [{ readingId: r1, resolved: false, product: '', kind: 'unknown', recognisedFrom: '' }],
    }]))
    assert.equal(out!.resolutions[0]!.resolved, false)
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM product_resolutions').get() as { n: number }).n, 1)
    assert.equal(knownInventory(db, importId).length, 0, 'and it is not in the known inventory')
    const gen = db.prepare('SELECT abstained FROM ai_generations').get() as { abstained: number }
    assert.equal(gen.abstained, 1, 'a batch that recognised nothing is an abstention, not an error')
  })

  it('demotes a resolved answer with no recognition note, and counts it', () => {
    const q = [buildQuery('r1', 'm1', 'nameplate', [claim('Model', '600545B')])]
    const stored = normaliseResolve({
      resolutions: [{ readingId: 'r1', resolved: true, product: 'A pressure tank', kind: 'equipment', recognisedFrom: '' }],
    }, q)
    assert.deepEqual(stored.demoted, ['r1'])
    assert.equal(stored.resolutions[0]!.resolved, false)
  })

  it('separates an answer nobody gave from an answer of "no"', () => {
    const q = [
      buildQuery('r1', 'm1', 'nameplate', [claim('Model', 'A-1')]),
      buildQuery('r2', 'm2', 'nameplate', [claim('Model', 'B-2')]),
    ]
    const stored = normaliseResolve({
      resolutions: [
        { readingId: 'r1', resolved: false, product: '', kind: 'unknown', recognisedFrom: '' },
        { readingId: 'nope', resolved: true, product: 'x', kind: 'equipment', recognisedFrom: 'y' },
      ],
    }, q)
    assert.deepEqual(stored.unanswered, ['r2'], 'a hole, not a no')
    assert.deepEqual(stored.strayAnswers, ['nope'])
  })

  it('does not pay to ask about a label with nothing identifying on it', () => {
    label([{ field: 'Maximum Operating Pressure', value: '75 psig' }])
    label([{ field: 'Model', value: '600545B' }])
    const plan = planResolution(db, importId)
    assert.equal(plan.asked, 1)
    assert.equal(plan.skipped.length, 1)
    assert.match(plan.note, /capture finding/)
  })

  it('is registered with the worker, and is NOT queued by an import', async () => {
    assert.equal(runnerFor(RESOLVE_TASK), runResolveProduct)
    const { queueAssists } = await import('../src/ai/tasks/index.js')
    label([{ field: 'Model', value: '600545B' }])
    queueAssists(db, PROPERTY, VISIT, TEST_OPERATOR)
    const n = db.prepare('SELECT COUNT(*) AS n FROM ai_jobs WHERE task = ?').get(RESOLVE_TASK) as { n: number }
    assert.equal(n.n, 0)
  })

  it('refuses at the storage layer too, so a caller cannot smuggle one past', () => {
    assert.throws(
      () =>
        db.prepare(
          `INSERT INTO product_resolutions (id, property_id, import_id, reading_id, query, specificity,
             resolved, product, kind, recognised_from, honesty, actor_id, created_at)
           VALUES (?, ?, ?, ?, 'q', 'line', 1, '', 'equipment', '', 'Inferred', ?, ?)`,
        ).run(newId(), PROPERTY, importId, label([{ field: 'Model', value: 'X-1' }]), TEST_OPERATOR, now()),
      /CHECK constraint failed/,
    )
  })

  it('puts every query in the facts block and requires each to be answered', () => {
    const facts = resolutionFacts([buildQuery('r1', 'm1', 'nameplate', [claim('Model', '45MHP2'), claim('brand', 'Stenner')])])
    assert.match(facts, /id: r1/)
    assert.match(facts, /45MHP2/)
    assert.match(facts, /specificity: line/)
    assert.match(facts, /must appear exactly once/)
    assert.match(facts, /`resolved: false` is a complete answer/)
  })
})

describe('⚑ stranded queries — the plan grew and its batches already ran', () => {
  /** A visit with one readable label, which is enough to plan a query. */
  function seeded(): { db: Db; importId: string } {
    const db = freshDb()
    db.prepare(`INSERT INTO properties (id, label, created_at, actor_id) VALUES (?, 'A house', ?, ?)`)
      .run(PROPERTY, now(), TEST_OPERATOR)
    db.prepare(`INSERT INTO visits (id, property_id, kind, created_at, actor_id) VALUES (?, ?, 'baseline', ?, ?)`)
      .run(VISIT, PROPERTY, now(), TEST_OPERATOR)
    const importId = newId()
    db.prepare(
      `INSERT INTO imports (id, visit_id, property_id, imported_at, media_mode, raw_manifest,
                            validation_report, status, created_at, actor_id)
       VALUES (?, ?, ?, ?, 'full', '{}', '{}', 'ok', ?, ?)`,
    ).run(importId, VISIT, PROPERTY, now(), now(), TEST_OPERATOR)
    writeReadings(db, {
      propertyId: PROPERTY, importId, zoneId: ZONE, actorId: TEST_OPERATOR,
      labels: [{
        mediaId: 'm1', surface: 'nameplate', whereItIs: '',
        fields: [
          { field: 'Model', value: '600545B', unreadable: false },
          { field: 'brand', value: 'Burcam', unreadable: false },
        ],
      }],
    })
    return { db, importId }
  }

  it('says how many queries can never be asked, rather than reporting a clean re-plan', () => {
    // The 2026-08-13 defect. A retried pass-1 batch adds labels; pass 2 re-plans
    // to cover them; `enqueue` is idempotent on a POSITIONAL target id, so the
    // new labels land in a batch whose job is already `done` and are never sent.
    // The run reported "planned 45 queries, ran 0" and read as success.
    const { db } = seeded()

    const first = queueResolution(db, PROPERTY, VISIT, TEST_OPERATOR)
    assert.ok(first.jobs > 0, 'there is something to resolve')
    assert.equal(first.strandedQueries, 0, 'nothing is stranded while the work is still queued')

    // The batch reaches a terminal state having written no resolutions — what a
    // completed job leaves behind when the queries it covered arrived later.
    db.prepare(`UPDATE ai_jobs SET status = 'done' WHERE task = ?`).run(RESOLVE_TASK)

    const second = queueResolution(db, PROPERTY, VISIT, TEST_OPERATOR)
    assert.equal(second.strandedQueries, second.queries, 'every query is stranded, and it is counted')
    assert.match(second.note, /STRANDED/)
    assert.match(second.note, /--again/)
  })

  it('says nothing while a batch is still queued, because the work is coming', () => {
    // The half that lets the check fail. Without the terminal-status test this
    // would warn on every first run, and a warning that always fires is noise.
    const { db } = seeded()
    const q = queueResolution(db, PROPERTY, VISIT, TEST_OPERATOR)
    assert.equal(q.strandedQueries, 0)
    assert.doesNotMatch(q.note, /STRANDED/)
  })
})
