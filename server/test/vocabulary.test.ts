import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Db } from '../src/db/index.js'
import { buildReport, type ImportReport } from '../src/import/report.js'
import { runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, readReference, scratchDir } from './helpers.js'

/**
 * Fail open on vocabulary.
 *
 * The field session has said outright that config v1.3 adds a `choice` satisfy
 * type and a new resolution kind, that `video` is coming, and that `voice` may
 * become `audio`. None of it may break an import. The test for "fail open" is
 * not that unknown words are tolerated — it is that they are tolerated AND
 * surfaced, because a silently swallowed word is the same failure as a crash,
 * just slower.
 */

type Manifest = Record<string, any>

function importMutated(mutate: (m: Manifest) => void): { report: ImportReport; db: Db } {
  const db = freshDb()
  const ids = makePropertyAndVisit(db)
  const parsed = JSON.parse(readReference()) as Manifest
  mutate(parsed)
  const { importId } = runImport({ db, ...ids, raw: JSON.stringify(parsed), dataDir: scratchDir() })
  return { report: buildReport(db, importId)!, db }
}

const term = (r: ImportReport, field: string, value: string) =>
  r.validation.unrecognizedTerms.find((t) => t.field === field && t.value === value)

describe('unfamiliar words import cleanly and are listed', () => {
  it('accepts the `choice` resolution kind that config v1.3 will bring', () => {
    const { report, db } = importMutated((m) => {
      m.resolutions[0].resolution = { kind: 'choice', via: 'check', selected: 'copper' }
    })

    assert.notEqual(report.import.status, 'failed')
    const t = term(report, 'resolution.kind', 'choice')
    assert.ok(t, '`choice` must appear in the unrecognized list')
    assert.equal(t!.count, 1)
    assert.equal(report.unrecognized.resolutions, 1, 'the row is flagged, not dropped')

    // Stored verbatim — the word survives the round trip.
    const row = db
      .prepare('SELECT kind, is_recognized FROM resolutions WHERE import_id = ? AND item_id = ?')
      .get(report.import.id, 'int.canvas') as { kind: string; is_recognized: number }
    assert.equal(row.kind, 'choice')
    assert.equal(row.is_recognized, 0)
    db.close()
  })

  it('accepts a `measure` resolution, which the reference export never exercises', () => {
    const { report, db } = importMutated((m) => {
      m.resolutions[0].resolution = { kind: 'satisfied', via: 'measure', note: '52 psi' }
    })
    // `measure` is a satisfy type in the config, so it must NOT be flagged.
    assert.equal(term(report, 'resolution.via', 'measure'), undefined)
    assert.equal(report.unrecognized.resolutions, 0)
    db.close()
  })

  it('accepts a video without switching on an exhaustive media list', () => {
    const { report, db } = importMutated((m) => {
      m.media[0].kind = 'video'
      m.media[0].durationMs = 42_000
    })
    assert.equal(term(report, 'media.kind', 'video'), undefined, 'video is known by name')
    const kinds = report.counts.media.byKind.map((k) => k.kind).sort()
    assert.deepEqual(kinds, ['photo', 'video'])
    db.close()
  })

  it('accepts `voice` renamed to `audio` — flagged, counted, never fatal', () => {
    const { report, db } = importMutated((m) => {
      m.media[0].kind = 'audio'
    })
    assert.notEqual(report.import.status, 'failed')
    const t = term(report, 'media.kind', 'audio')
    assert.ok(t)
    assert.ok(report.counts.media.byKind.some((k) => k.kind === 'audio'))
    db.close()
  })

  it('breaks bytes out by kind so a new heavy media type is visible arriving', () => {
    const { report, db } = importMutated((m) => {
      m.media[0].kind = 'video'
      m.media[0].bytes = 900_000_000
    })
    const video = report.counts.media.byKind.find((k) => k.kind === 'video')!
    assert.equal(video.bytes, 900_000_000)
    assert.equal(video.count, 1)
    // And it dwarfs the photos, which is exactly the thing to see coming.
    const photo = report.counts.media.byKind.find((k) => k.kind === 'photo')!
    assert.ok(video.bytes > photo.bytes * 5)
    db.close()
  })

  it('accepts an unfamiliar component type', () => {
    const { report, db } = importMutated((m) => {
      m.pins[7].type = { kind: 'component', componentType: 'heat-recovery-widget' }
    })
    const t = term(report, 'pin.type.componentType', 'heat-recovery-widget')
    assert.ok(t)
    assert.match(t!.examples[0]!, /pin 8/)
    db.close()
  })

  it('accepts an unfamiliar event type', () => {
    const { report, db } = importMutated((m) => {
      m.events[50].type = 'MeasurementRecorded'
    })
    assert.ok(term(report, 'event.type', 'MeasurementRecorded'))
    assert.equal(report.unrecognized.events, 1)
    db.close()
  })

  it('leaves freeform pin labels alone — open vocabulary is the point of them', () => {
    const { report, db } = importMutated((m) => {
      m.pins[0].type = { kind: 'freeform', label: 'mystery box' }
    })
    assert.deepEqual(report.validation.unrecognizedTerms, [])
    db.close()
  })

  it('counts repeats rather than listing the same word over and over', () => {
    const { report, db } = importMutated((m) => {
      for (const r of m.resolutions) r.resolution = { kind: 'choice', via: 'check' }
    })
    const t = term(report, 'resolution.kind', 'choice')!
    assert.equal(t.count, 20)
    assert.equal(t.examples.length, 5, 'a handful of examples, not twenty')
    db.close()
  })
})

describe('an na reason the config does not declare', () => {
  it('warns loudly, because it lands in neither the gaps nor the findings', () => {
    const { report, db } = importMutated((m) => {
      const r = m.resolutions.find((x: Manifest) => x.itemId === 'liv.fireplace')
      r.resolution = { kind: 'na', reasonId: 'weather' }
    })

    const warning = report.validation.checks.find((c) => c.code === 'vocabulary.undeclared-na-reason')
    assert.ok(warning, 'this one must not be quiet — the item would otherwise vanish')
    assert.equal(warning!.severity, 'warning')
    assert.match(warning!.message, /counted in neither/)

    // Baseline is 1 gap and 4 findings. Removing a none-present leaves 3 findings.
    assert.equal(report.checklist.gaps.count, 1)
    assert.equal(report.checklist.findings.total, 3)
    assert.ok(term(report, 'resolution.reasonId', 'weather'))
    db.close()
  })

  it('honours a NEW reason the config does declare, with no warning at all', () => {
    const { report, db } = importMutated((m) => {
      m.config.snapshot.naReasons.push({
        id: 'weather',
        label: 'Weather prevented access',
        feedsGapList: true,
        recordsFinding: false,
      })
      const r = m.resolutions.find((x: Manifest) => x.itemId === 'liv.fireplace')
      r.resolution = { kind: 'na', reasonId: 'weather' }
    })

    assert.ok(!report.validation.checks.some((c) => c.code === 'vocabulary.undeclared-na-reason'))
    assert.equal(report.checklist.gaps.count, 2, 'the config said it feeds gaps, so it feeds gaps')
    assert.equal(report.checklist.findings.total, 3)
    db.close()
  })
})

describe('an item id the config does not define', () => {
  it('imports and is listed', () => {
    const { report, db } = importMutated((m) => {
      m.resolutions[0].itemId = 'int.something-new'
    })
    assert.ok(term(report, 'resolution.itemId', 'int.something-new'))
    assert.equal(report.checklist.total, 20, 'nothing is dropped')
    db.close()
  })
})
