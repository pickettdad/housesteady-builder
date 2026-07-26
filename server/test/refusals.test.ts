import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildReport } from '../src/import/report.js'
import { ImportRefused, runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, readReference, scratchDir } from './helpers.js'

/**
 * Fail closed on structure, fail open on vocabulary.
 *
 * The tests below draw the line: a refused import must leave NO trace, and a
 * warned import must keep everything.
 */
describe('structural failures refuse the import', () => {
  const attempt = async (mutate: (m: Record<string, unknown>) => void | string) => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const parsed = JSON.parse(readReference()) as Record<string, unknown>
    const replaced = mutate(parsed)
    const raw = typeof replaced === 'string' ? replaced : JSON.stringify(parsed)
    let error: ImportRefused | null = null
    try {
      await runImport({ db, ...ids, raw, dataDir: scratchDir() })
    } catch (e) {
      error = e as ImportRefused
    }
    const importCount = (db.prepare('SELECT COUNT(*) AS n FROM imports').get() as { n: number }).n
    const zoneCount = (db.prepare('SELECT COUNT(*) AS n FROM zones').get() as { n: number }).n
    db.close()
    return { error, importCount, zoneCount }
  }

  it('refuses a wrong schema version and names the version found', async () => {
    const { error, importCount } = await attempt((m) => {
      m.manifestSchemaVersion = 2
    })
    assert.ok(error instanceof ImportRefused)
    assert.match(error!.message, /not a manifest version this builder can read/)
    assert.ok(error!.checks.some((c) => c.code === 'structure.schema-version' && /version 2 found/.test(c.message)))
    assert.equal(importCount, 0, 'a refused import must leave nothing behind')
  })

  it('refuses unparseable JSON and says so plainly', async () => {
    const { error, importCount } = await attempt(() => 'this is not json')
    assert.ok(error instanceof ImportRefused)
    assert.match(error!.message, /could not be read as JSON/)
    assert.equal(importCount, 0)
  })

  it('refuses a missing required section', async () => {
    const { error, importCount, zoneCount } = await attempt((m) => {
      delete m.resolutions
    })
    assert.ok(error instanceof ImportRefused)
    assert.match(error!.message, /missing sections/)
    assert.equal(importCount, 0)
    assert.equal(zoneCount, 0, 'nothing is written before structure is checked')
  })

  it('reports every structural problem at once rather than one per attempt', async () => {
    const { error } = await attempt((m) => {
      delete m.totals
      delete m.events
    })
    const codes = error!.checks.map((c) => c.code)
    assert.equal(codes.filter((c) => c === 'structure.missing-section').length, 2)
  })

  it('stops at the version when there is no adapter, rather than guessing at the shape', async () => {
    // With no adapter there is no basis for saying which sections a file of that
    // version should have. Reporting them missing would be inventing a standard.
    const { error } = await attempt((m) => {
      m.manifestSchemaVersion = 99
      delete m.totals
    })
    assert.deepEqual(error!.checks.map((c) => c.code), ['structure.schema-version'])
  })
})

describe('content problems warn, they do not refuse', () => {
  const importWith = async (mutate: (m: Record<string, unknown>) => void) => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const parsed = JSON.parse(readReference()) as Record<string, unknown>
    mutate(parsed)
    const { importId } = await runImport({ db, ...ids, raw: JSON.stringify(parsed), dataDir: scratchDir() })
    const report = buildReport(db, importId)!
    db.close()
    return report
  }

  it('warns on a totals mismatch and still imports everything', async () => {
    const report = await importWith((m) => {
      ;(m.totals as Record<string, number>).photos = 99
    })
    assert.equal(report.import.status, 'ok_with_warnings')
    assert.ok(
      report.validation.checks.some(
        (c) => c.code === 'totals.mismatch' && /says 99 .* actually contains 37/.test(c.message),
      ),
    )
    assert.equal(report.counts.media.total, 37, 'the real files are all still imported')
  })

  it('reports each mismatching total separately', async () => {
    const report = await importWith((m) => {
      const t = m.totals as Record<string, number>
      t.pins = 1
      t.notes = 500
      t.mediaBytes = 7
    })
    const mismatches = report.validation.checks.filter((c) => c.code === 'totals.mismatch')
    assert.equal(mismatches.length, 3)
  })

  it('imports an unfamiliar resolution kind and keeps it verbatim', async () => {
    // config v1.3 adds `choice`. It must not break anything today.
    const report = await importWith((m) => {
      const resolutions = m.resolutions as { resolution: Record<string, unknown> }[]
      resolutions[0]!.resolution = { kind: 'choice', via: 'check', selected: 'copper' }
    })
    assert.notEqual(report.import.status, 'failed')
    assert.ok(report.checklist.byKind.some((k) => k.kind === 'choice'))
  })

  it('imports an unfamiliar media kind without switching on a known list', async () => {
    const report = await importWith((m) => {
      const media = m.media as Record<string, unknown>[]
      media[0]!.kind = 'video'
    })
    const kinds = report.counts.media.byKind.map((k) => k.kind).sort()
    assert.deepEqual(kinds, ['photo', 'video'])
    // A video reclassified out of `photo` makes totals.photos disagree — which
    // is exactly the signal we want, not a crash.
    assert.equal(report.counts.media.total, 37)
  })
})

describe('the derived gap and finding columns come from the config, never from the builder', () => {
  const importWithConfig = async (mutate: (reasons: Record<string, unknown>[]) => void) => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db)
    const parsed = JSON.parse(readReference()) as Record<string, unknown>
    const config = parsed.config as { snapshot: { naReasons: Record<string, unknown>[] } }
    mutate(config.snapshot.naReasons)
    const { importId } = await runImport({ db, ...ids, raw: JSON.stringify(parsed), dataDir: scratchDir() })
    const report = buildReport(db, importId)!
    db.close()
    return report
  }

  it('follows the config when a reason starts feeding the gap list', async () => {
    // Baseline: 1 gap (deferred). Flip none-present to feed gaps too -> 3.
    const report = await importWithConfig((reasons) => {
      reasons.find((r) => r.id === 'none-present')!.feedsGapList = true
    })
    assert.equal(report.checklist.gaps.count, 3)
  })

  it('follows the config when a reason stops recording findings', async () => {
    // Baseline: 4 findings (2 fail + 2 none-present). Turn none-present off ->
    // only the 2 failed checks remain.
    const report = await importWithConfig((reasons) => {
      reasons.find((r) => r.id === 'none-present')!.recordsFinding = false
    })
    assert.equal(report.checklist.findings.total, 2)
    assert.equal(report.checklist.findings.failedChecks, 2)
    assert.equal(report.checklist.findings.confirmedAbsences, 0)
  })

  it('still records a failed check as a finding whatever the config says about reasons', async () => {
    const report = await importWithConfig((reasons) => {
      for (const r of reasons) {
        r.recordsFinding = false
        r.feedsGapList = false
      }
    })
    assert.equal(report.checklist.gaps.count, 0)
    assert.equal(report.checklist.findings.total, 2)
    assert.equal(report.checklist.findings.failedChecks, 2)
  })

  it('handles a reason the builder has never met', async () => {
    const report = await importWithConfig((reasons) => {
      reasons.push({ id: 'weather', label: 'Weather', feedsGapList: true, recordsFinding: false })
    })
    assert.notEqual(report.import.status, 'failed')
    assert.equal(report.checklist.gaps.count, 1) // unchanged; nothing used it
  })
})
