/**
 * Reading nameplates, and the golden set that decides whether a prompt ships.
 *
 * Every model call here is a stub. §10 requires the pass to be fully usable with
 * no API key, and a suite that needed one would stop being runnable — which is
 * how a doctrine test quietly becomes a thing people skip.
 */

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { join } from 'node:path'
import { newId, now, openDb, type Db } from '../src/db/index.js'
import { loadPrompts, promptsRoot, currentPrompt } from '../src/ai/prompts.js'
import type { ModelConfig } from '../src/ai/models.js'
import type { RunArgs } from '../src/ai/client.js'
import { claimNext, enqueue, queueProgress } from '../src/ai/queue.js'
import {
  CLASSIFY_TASK, EXTRACT_TASK, isAbstention, queueNameplateReading, runClassify, runExtract,
  type Classification, type Extraction, type TaskDeps,
} from '../src/ai/tasks/nameplate.js'
import {
  compareField, compareImage, formatReport, loadExpected, summarise,
  type ExpectedImage,
} from '../src/ai/golden.js'
import { findGeneration } from '../src/ai/accept.js'

const FIXTURE = join(import.meta.dirname, '..', '..', 'fixtures', 'nameplates', 'images', 'IMG_0004.jpeg')

const MODEL: ModelConfig = {
  tier: 'fast', id: 'a-pinned-fast-model', inputPerMTok: 1, outputPerMTok: 5, maxImageEdge: 1568,
}

let db: Db
const PROPERTY = 'prop-1'
const VISIT = 'visit-1'

function seed(): { importId: string } {
  db = openDb(':memory:')
  db.prepare(`INSERT INTO properties (id, label, created_at) VALUES (?, 'A house', ?)`).run(PROPERTY, now())
  db.prepare(`INSERT INTO visits (id, property_id, kind, created_at) VALUES (?, ?, 'baseline', ?)`)
    .run(VISIT, PROPERTY, now())
  const importId = newId()
  db.prepare(
    `INSERT INTO imports (id, visit_id, property_id, imported_at, media_mode, raw_manifest,
                          validation_report, status, created_at)
     VALUES (?, ?, ?, ?, 'manifest_only', '{}', '{}', 'ok', ?)`,
  ).run(importId, VISIT, PROPERTY, now(), now())
  db.prepare(
    `INSERT INTO zones (zone_id, import_id, property_id, visit_id, label, created_at)
     VALUES ('zone-1', ?, ?, ?, 'Utility room', ?)`,
  ).run(importId, PROPERTY, VISIT, now())
  db.prepare(
    `INSERT INTO pins (pin_id, import_id, property_id, visit_id, number, zone_id, created_at)
     VALUES ('pin-1', ?, ?, ?, 1, 'zone-1', ?)`,
  ).run(importId, PROPERTY, VISIT, now())
  return { importId }
}

function addMedia(importId: string, mediaId: string, owner: { pin?: string; zone?: string }): void {
  db.prepare(
    `INSERT INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind, owner_pin_id,
                        owner_zone_id, file, file_status, created_at)
     VALUES (?, ?, ?, ?, 'photo', ?, ?, ?, ?, 'present', ?)`,
  ).run(
    mediaId, importId, PROPERTY, VISIT, owner.pin ? 'pin' : 'zone',
    owner.pin ?? null, owner.zone ?? null, `${mediaId}.jpg`, now(),
  )
}

/** A stub model. Records what it was asked, answers what the test dictates. */
function stub(answers: unknown[]): TaskDeps & { asked: RunArgs[] } {
  const asked: RunArgs[] = []
  let i = 0
  return {
    asked,
    prompts: loadPrompts(promptsRoot),
    model: MODEL,
    resolvePath: () => FIXTURE,
    run: async <T,>(args: RunArgs) => {
      asked.push(args)
      return { output: answers[i++] as T, inputTokens: 1500, outputTokens: 60 }
    },
  }
}

const CLASSIFY_YES: Classification = { isNameplate: 'yes', orientation: 'upright', reason: 'a ClimateMaster data plate' }
const CLASSIFY_NO: Classification = { isNameplate: 'no', orientation: 'unknown', reason: 'a brand badge on a green cover' }

const extraction = (fields: Partial<Extraction['fields']>, legible = true): Extraction => ({
  fields: {
    make: 'unknown', model: 'unknown', serial: 'unknown', capacity: 'unknown', installDate: 'unknown',
    ...fields,
  },
  legible,
  notes: '',
})

describe('the prompt library on disk', () => {
  it('carries a loadable prompt for each nameplate task', () => {
    const library = loadPrompts(promptsRoot)
    for (const task of [CLASSIFY_TASK, EXTRACT_TASK]) {
      const p = currentPrompt(library, task)
      assert.equal(p.id, task)
      assert.match(p.version, /^v\d{3}$/)
      assert.ok(p.text.length > 200, 'a prompt this short would not be doing the job asked of it')
    }
  })

  it('tells the model that unknown is a correct answer, in the extraction prompt', () => {
    // The single most consequential line in the repo. If a prompt edit ever
    // drops it, the abstention discipline goes with it and nothing else here
    // would notice until a wrong serial reached a binder.
    const text = currentPrompt(loadPrompts(promptsRoot), EXTRACT_TASK).text.toLowerCase()
    assert.ok(text.includes('unknown'), 'the extraction prompt must ask for unknown explicitly')
    assert.ok(
      text.includes('worse than') || text.includes('far worse'),
      'it must say plainly that a wrong value is worse than a blank one',
    )
  })
})

describe('classification gates extraction', () => {
  beforeEach(() => seed())

  it('queues classification for pin-attached photos and never for room photos', () => {
    const { importId } = seed()
    addMedia(importId, 'media-pin', { pin: 'pin-1' })
    addMedia(importId, 'media-room-1', { zone: 'zone-1' })
    addMedia(importId, 'media-room-2', { zone: 'zone-1' })

    assert.equal(queueNameplateReading(db, PROPERTY, VISIT), 1)
    assert.equal(queueProgress(db, VISIT).queued, 1,
      '200+ room photos through extraction is the bill this split exists to avoid')
  })

  it('leaves a skipped extraction row when the photo is not a nameplate', async () => {
    const { importId } = seed()
    addMedia(importId, 'media-1', { pin: 'pin-1' })
    queueNameplateReading(db, PROPERTY, VISIT)

    const deps = stub([CLASSIFY_NO])
    const job = claimNext(db, VISIT)!
    await runClassify(db, job, deps)

    const progress = queueProgress(db, VISIT)
    assert.equal(progress.skipped, 1, 'the decision not to extract must be a row, not an absence')
    assert.equal(progress.queued, 0, 'and nothing is left owed for this photo')
    assert.equal(deps.asked.length, 1, 'the non-nameplate is not extracted at all')
  })

  it('queues extraction when a plate is there', async () => {
    const { importId } = seed()
    addMedia(importId, 'media-1', { pin: 'pin-1' })
    queueNameplateReading(db, PROPERTY, VISIT)

    await runClassify(db, claimNext(db, VISIT)!, stub([CLASSIFY_YES]))
    const next = claimNext(db, VISIT)
    assert.equal(next?.task, EXTRACT_TASK)
  })

  it('still extracts when classification is unsure', async () => {
    const { importId } = seed()
    addMedia(importId, 'media-1', { pin: 'pin-1' })
    queueNameplateReading(db, PROPERTY, VISIT)

    await runClassify(db, claimNext(db, VISIT)!, stub([{ ...CLASSIFY_YES, isNameplate: 'unsure' }]))
    assert.equal(queueProgress(db, VISIT).queued, 1,
      'skipping a real plate costs a serial nobody ever captures; reading a non-plate costs one cheap call')
  })
})

describe('extraction records what it read, and what it declined to', () => {
  beforeEach(() => seed())

  const generationOf = (jobId: string) =>
    findGeneration(db, (db.prepare('SELECT generation_id AS g FROM ai_jobs WHERE id = ?').get(jobId) as { g: string }).g)!

  const runOne = async (result: Extraction) => {
    const { importId } = seed()
    addMedia(importId, 'media-1', { pin: 'pin-1' })
    const job = enqueue({ db, propertyId: PROPERTY, visitId: VISIT, task: EXTRACT_TASK, targetKind: 'media', targetId: 'media-1' })
    const claimed = claimNext(db, VISIT)!
    const out = await runExtract(db, claimed, stub([result]))
    return { out, job: claimed }
  }

  it('marks a fully unreadable plate as abstained, which is a success', async () => {
    const { out, job } = await runOne(extraction({}, false))
    assert.equal(isAbstention(out), true)

    const gen = generationOf(job.id)
    assert.equal(gen.abstained, 1)
    assert.equal(gen.human_decision, 'pending', 'an abstention is still a decision the concierge has to make')
    assert.equal(queueProgress(db, VISIT).failed, 0, 'abstaining is never a failure')
  })

  it('counts every-field-unknown as an abstention too', async () => {
    const { out } = await runOne(extraction({}))
    assert.equal(isAbstention(out), true, 'legible with nothing read is the same outcome by another route')
  })

  it('is not an abstention when any single field was read', async () => {
    const { out } = await runOne(extraction({ serial: 'B10208434' }))
    assert.equal(isAbstention(out), false, 'a half-readable plate is a partial reading, not a refusal')
    assert.equal(out.fields.model, 'unknown')
  })

  it('normalises an empty answer to unknown so nothing downstream has to know both', async () => {
    const { out } = await runOne(extraction({ make: '   ', model: 'UNKNOWN', serial: 'Q13734509' }))
    assert.equal(out.fields.make, 'unknown')
    assert.equal(out.fields.model, 'unknown')
    assert.equal(out.fields.serial, 'Q13734509')
  })

  it('records the prompt version and hash that produced it', async () => {
    const { job } = await runOne(extraction({ serial: 'X' }))
    const gen = generationOf(job.id)
    assert.equal(gen.prompt_id, EXTRACT_TASK)
    assert.match(gen.prompt_version!, /^v\d{3}$/)
    assert.match(gen.prompt_hash!, /^[0-9a-f]{64}$/)
    assert.equal(gen.model, MODEL.id)
  })

  it('records what was done to the image, so a poor read can be explained', async () => {
    const { job } = await runOne(extraction({ serial: 'X' }))
    const refs = JSON.parse(generationOf(job.id).input_refs ?? '{}') as { image: string; mediaId: string }
    assert.equal(refs.mediaId, 'media-1')
    assert.match(refs.image, /upright/,
      'a plate rotated and shrunk before reading is a fact about the reading, not a detail')
  })
})

describe('the golden set compares against approved values only', () => {
  it('treats a value where none was approved as the cardinal error', () => {
    assert.equal(compareField('unknown', 'Q13734509'), 'invented')
    assert.equal(compareField(undefined, 'B10208434'), 'invented')
  })

  it('treats declining to read an approved value as safe, not equal to inventing one', () => {
    assert.equal(compareField('Q13734509', 'unknown'), 'missed')
    assert.notEqual(compareField('Q13734509', 'unknown'), compareField('unknown', 'Q13734509'))
  })

  it('separates a misreading from a formatting difference', () => {
    assert.equal(compareField('Q13734509', 'Q13734S09'), 'misread')
    assert.equal(compareField('4.8 gal / 18 L', '4.8 Gal / 18 L'), 'match-but-formatting')
    assert.equal(compareField('HTX 30', 'HTX 30'), 'match')
    assert.equal(compareField('HTX 30', ' HTX  30 '), 'match')
  })

  const entry: ExpectedImage = {
    file: 'images/IMG_0029.jpeg', classification: 'yes', abstains: false,
    fields: { make: 'Waterite Inc', model: 'unknown', serial: '153713', capacity: 'unknown', installDate: 'unknown' },
  }

  it('passes a run that read what was approved and declined the rest', () => {
    const result = compareImage(entry, {
      classification: 'yes', extracted: true, abstained: false,
      fields: { make: 'Waterite Inc', model: 'unknown', serial: '153713', capacity: 'unknown', installDate: 'unknown' },
    })
    const report = summarise(true, [result])
    assert.equal(report.totals.invented, 0)
    assert.equal(report.clean, true)
  })

  it('fails a run that guessed the worn handwriting', () => {
    const result = compareImage(entry, {
      classification: 'yes', extracted: true, abstained: false,
      fields: { make: 'Waterite Inc', model: 'WDBT PC1', serial: '153713', capacity: 'unknown', installDate: 'unknown' },
    })
    const report = summarise(true, [result])
    assert.equal(report.totals.invented, 1)
    assert.equal(report.clean, false)
    assert.match(formatReport(report), /INVENTED/)
  })

  it('does not fail a run that merely declined to read something', () => {
    const result = compareImage(entry, {
      classification: 'yes', extracted: true, abstained: false,
      fields: { make: 'unknown', model: 'unknown', serial: '153713', capacity: 'unknown', installDate: 'unknown' },
    })
    const report = summarise(true, [result])
    assert.equal(report.totals.missed, 1)
    assert.equal(report.clean, true,
      'penalising a decline would push the next prompt edit toward guessing')
  })

  it('accepts a non-nameplate that was never extracted as having abstained correctly', () => {
    const nonPlate: ExpectedImage = {
      file: 'images/IMG_0009.jpeg', classification: 'no', abstains: true,
      fields: { make: 'unknown', model: 'unknown', serial: 'unknown', capacity: 'unknown', installDate: 'unknown' },
    }
    const report = summarise(true, [compareImage(nonPlate, { classification: 'no', extracted: false })])
    assert.equal(report.clean, true, '§11: not extracted at all is the correct outcome, not a missing record')
  })

  // The rule the owner set: ground truth comes from a human, not from a model.
  it('refuses to gate anything while the expectations are unratified', () => {
    const perfect = compareImage(entry, {
      classification: 'yes', extracted: true, abstained: false, fields: entry.fields,
    })
    const report = summarise(false, [perfect])
    assert.equal(report.clean, false, 'an unapproved set cannot certify a prompt change even when nothing differs')
    assert.match(formatReport(report), /NOT RATIFIED/)
  })

  it('reads the real expected.json, which is not yet ratified', () => {
    const expected = loadExpected()
    assert.equal(expected.images.length, 15)
    assert.equal(expected.approved, false, 'the readings are proposed until David has approved them')
    const nonPlate = expected.images.filter((i) => i.classification === 'no')
    assert.equal(nonPlate.length, 1, 'exactly one photo in the set is not a nameplate')
  })
})
