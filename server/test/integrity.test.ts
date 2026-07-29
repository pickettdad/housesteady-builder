import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Db } from '../src/db/index.js'
import { buildReport, type ImportReport } from '../src/import/report.js'
import { runImport } from '../src/import/runImport.js'
import { addVisit, freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'

/**
 * The broken variants.
 *
 * Every one of these must import — the export is still 99% good — and every one
 * must say precisely what is wrong, naming both ends. A check that reports "3
 * problems found" has failed even when the count is right.
 */

type Manifest = Record<string, any>

async function importMutated(mutate: (m: Manifest) => void): Promise<{ report: ImportReport; db: Db }> {
  const db = freshDb()
  const ids = makePropertyAndVisit(db)
  const parsed = JSON.parse(readReference()) as Manifest
  mutate(parsed)
  const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: JSON.stringify(parsed), dataDir: scratchDir() })
  return { report: buildReport(db, importId)!, db }
}

const codes = (r: ImportReport, prefix: string) =>
  r.validation.checks.filter((c) => c.code.startsWith(prefix))

describe('referential integrity', () => {
  it('names both ends of a dangling pin -> media reference', async () => {
    const { report, db } = await importMutated((m) => {
      m.pins[6].mediaIds = ['019f9a35-DOES-NOT-EXIST']
    })
    const found = codes(report, 'integrity.pin-media')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /pin 7/)
    assert.match(found[0]!.message, /019f9a35-DOES-NOT-EXIST/)
    assert.notEqual(report.import.status, 'failed', 'a dangling reference never refuses the import')
    assert.equal(report.counts.pins.total, 11, 'and everything else still imports')
    db.close()
  })

  it('catches a pin pointing at a zone that does not exist', async () => {
    const { report, db } = await importMutated((m) => {
      m.pins[0].zoneId = 'ghost-zone'
    })
    const found = codes(report, 'integrity.pin-zone')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /pin 1 sits in zone ghost-zone/)
    db.close()
  })

  it('catches an anchor on a canvas no zone declares', async () => {
    const { report, db } = await importMutated((m) => {
      m.pins[0].anchors[0].canvasId = 'ghost-canvas'
    })
    assert.equal(codes(report, 'integrity.anchor-canvas').length, 1)
    db.close()
  })

  it('catches a note attached to a pin that is not there', async () => {
    const { report, db } = await importMutated((m) => {
      m.notes[0].target.id = 'ghost-pin'
    })
    const found = codes(report, 'integrity.note-target')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /ghost-pin/)
    db.close()
  })

  it('catches media owned by a pin that is not in pins[]', async () => {
    const { report, db } = await importMutated((m) => {
      m.media[0].owner = { kind: 'pin', pinId: 'ghost-pin', pinNumber: 99 }
    })
    const found = codes(report, 'integrity.media-owner')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /belongs to pin 99/)
    db.close()
  })

  it('catches a resolution citing evidence that is not there', async () => {
    const { report, db } = await importMutated((m) => {
      const r = m.resolutions.find((x: Manifest) => x.itemId === 'int.alarms')
      r.resolution.evidence = { pinId: 'ghost-pin' }
    })
    const found = codes(report, 'integrity.resolution-scope')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /int\.alarms.*cites pin ghost-pin/)
    db.close()
  })

  it('catches an inbox holding a reference to nothing', async () => {
    const { report, db } = await importMutated((m) => {
      m.inbox.mediaIds = ['ghost-media']
    })
    assert.equal(codes(report, 'integrity.inbox-ref').length, 1)
    db.close()
  })

  it('reports each dangling reference separately rather than as a count', async () => {
    const { report, db } = await importMutated((m) => {
      m.pins[6].mediaIds = ['ghost-a', 'ghost-b']
      m.pins[7].noteIds = ['ghost-c']
    })
    assert.equal(codes(report, 'integrity.pin-media').length, 2)
    assert.equal(codes(report, 'integrity.pin-note').length, 1)
    db.close()
  })
})

describe('anchor bounds', () => {
  it('warns on an out-of-range anchor and stores it anyway', async () => {
    const { report, db } = await importMutated((m) => {
      m.pins[0].anchors[0].x = 1.4
      m.pins[0].anchors[0].y = -0.2
    })
    const found = codes(report, 'anchor.out-of-bounds')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /x = 1\.4/)
    assert.match(found[0]!.message, /y = -0\.2/)

    const stored = db
      .prepare('SELECT x, y FROM anchors WHERE import_id = ? AND pin_id = ?')
      .get(report.import.id, '019f9a34-e419-7cba-9b86-201ae6282468') as { x: number; y: number }
    assert.equal(stored.x, 1.4, 'stored as given — the export is evidence, not something to correct')
    assert.equal(stored.y, -0.2)
    db.close()
  })

  it('accepts the exact boundaries', async () => {
    const { report, db } = await importMutated((m) => {
      m.pins[0].anchors[0].x = 0
      m.pins[0].anchors[0].y = 1
    })
    assert.equal(codes(report, 'anchor.out-of-bounds').length, 0)
    db.close()
  })
})

describe('event sequence', () => {
  it('names the missing sequence numbers', async () => {
    const { report, db } = await importMutated((m) => {
      m.events = m.events.filter((e: Manifest) => e.seq !== 40 && e.seq !== 41)
    })
    const found = codes(report, 'events.sequence-gap')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /40, 41/)
    assert.match(found[0]!.message, /audit trail for this visit is incomplete/)
    db.close()
  })

  it('notices a log that does not start at 1', async () => {
    const { report, db } = await importMutated((m) => {
      m.events = m.events.filter((e: Manifest) => e.seq > 5)
    })
    assert.equal(codes(report, 'events.does-not-start-at-one').length, 1)
    db.close()
  })

  it('notices duplicated sequence numbers', async () => {
    const { report, db } = await importMutated((m) => {
      m.events[10].seq = m.events[9].seq
    })
    assert.equal(codes(report, 'events.duplicate-seq').length, 1)
    db.close()
  })
})

describe('resolutions against the event log', () => {
  it('reports both numbers when they disagree, and judges neither', async () => {
    const { report, db } = await importMutated((m) => {
      m.resolutions.pop()
    })
    const found = codes(report, 'resolutions.reconciliation')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /21 items resolved and 1 reopened/)
    assert.match(found[0]!.message, /resolutions\[\] lists 19/)
    assert.match(found[0]!.message, /not necessarily an error/)
    db.close()
  })
})

describe('pin numbers are a session-scoped display label', () => {
  it('warns when two pins in one export share a number', async () => {
    const { report, db } = await importMutated((m) => {
      m.pins[1].number = 1
    })
    const found = codes(report, 'pins.duplicate-number')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /Pin number 1 is used by 2 different pins/)
    assert.match(found[0]!.message, /unique within a visit/)
    db.close()
  })

  it('says NOTHING when a number describes a different pin on a later visit', async () => {
    // The counter restarts at 1 every visit, so pin 1 next visit being a
    // different pin is correct behaviour. An earlier version of this code
    // reported it as an anomaly; that check is deleted, not softened.
    const db = freshDb()
    const dataDir = scratchDir()
    const ids = makePropertyAndVisit(db)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir })

    const parsed = JSON.parse(readReference()) as Manifest
    parsed.session.sessionId = 'second-visit-session'
    // Every pin is a brand new object reusing the same numbers — an ordinary
    // second visit.
    parsed.pins.forEach((p: Manifest, i: number) => {
      p.pinId = `visit-two-pin-${i}`
    })
    const visitTwo = addVisit(db, ids.propertyId, 'monthly')
    const { importId } = await runImport({ actorId: TEST_OPERATOR,
      db,
      propertyId: ids.propertyId,
      visitId: visitTwo,
      raw: JSON.stringify(parsed),
      dataDir,
    })
    const report = buildReport(db, importId)!

    assert.equal(codes(report, 'pins.cross-visit').length, 0)
    assert.equal(codes(report, 'pins.identity').length, 0, 'new uuids describe new things')
    db.close()
  })

  it('flags a pin with no number at all', async () => {
    const { report, db } = await importMutated((m) => {
      delete m.pins[3].number
    })
    const found = codes(report, 'pins.no-number')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /no human-facing label/)
    db.close()
  })
})

describe('pin identity across visits — the uuid, not the number', () => {
  /** Import the reference, then a second visit mutated however the test wants. */
  const twoVisits = async (mutateSecond: (m: Manifest) => void) => {
    const db = freshDb()
    const dataDir = scratchDir()
    const ids = makePropertyAndVisit(db)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir })

    const parsed = JSON.parse(readReference()) as Manifest
    parsed.session.sessionId = 'second-visit-session'
    mutateSecond(parsed)
    const visitTwo = addVisit(db, ids.propertyId, 'monthly')
    const { importId } = await runImport({ actorId: TEST_OPERATOR,
      db,
      propertyId: ids.propertyId,
      visitId: visitTwo,
      raw: JSON.stringify(parsed),
      dataDir,
    })
    return { report: buildReport(db, importId)!, db }
  }

  it('warns when the same uuid is now a different component type', async () => {
    const { report, db } = await twoVisits((m) => {
      // Pin 8 was a smoke-alarm last visit.
      m.pins[7].type = { kind: 'component', componentType: 'co-alarm' }
    })
    const found = codes(report, 'pins.identity-changed')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /component type was "smoke-alarm" and is now "co-alarm"/)
    assert.match(found[0]!.message, /ties a thing to itself across years/)
    db.close()
  })

  it('warns when the same uuid is now labelled something else', async () => {
    const { report, db } = await twoVisits((m) => {
      m.pins[0].type = { kind: 'freeform', label: 'Light switch' }
    })
    const found = codes(report, 'pins.identity-changed')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /label was "Receptacle" and is now "Light switch"/)
    db.close()
  })

  it('warns when the same uuid has moved to a different zone', async () => {
    const { report, db } = await twoVisits((m) => {
      m.pins[0].zoneId = m.zones[1].zoneId
    })
    const found = codes(report, 'pins.identity-changed')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /was in "bedroom" and is now in "ensuite"/)
    db.close()
  })

  it('says nothing when a typeless pin finally gets a type', async () => {
    // Gaining a value where there was none is progress, not a contradiction.
    const { report, db } = await twoVisits((m) => {
      m.pins[10].type = { kind: 'component', componentType: 'smoke-alarm' }
    })
    assert.equal(codes(report, 'pins.identity-changed').length, 0)
    db.close()
  })

  it('says nothing when nothing about the pin changed', async () => {
    const { report, db } = await twoVisits(() => {})
    assert.equal(codes(report, 'pins.identity-changed').length, 0)
    db.close()
  })

  it('reports each changed pin separately, listing what changed', async () => {
    const { report, db } = await twoVisits((m) => {
      m.pins[7].type = { kind: 'component', componentType: 'co-alarm' }
      m.pins[0].type = { kind: 'freeform', label: 'Light switch' }
      m.pins[0].zoneId = m.zones[1].zoneId
    })
    const found = codes(report, 'pins.identity-changed')
    assert.equal(found.length, 2)
    const both = found.find((c) => /Light switch/.test(c.message))!
    assert.match(both.message, /label was .* and is now .*; it was in "bedroom"/)
    db.close()
  })
})

describe('capture window — were these files taken during the visit?', () => {
  it('warns about a file captured before the visit started', async () => {
    const { report, db } = await importMutated((m) => {
      m.media[0].capturedAt = '2025-01-04T09:00:00.000Z'
    })
    const found = codes(report, 'capture.before-session')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /1 file was captured before this visit started/)
    assert.match(found[0]!.message, /evidence of something else/)
    db.close()
  })

  it('warns about a file captured after the visit ended', async () => {
    const { report, db } = await importMutated((m) => {
      m.media[0].capturedAt = '2026-08-30T09:00:00.000Z'
    })
    const found = codes(report, 'capture.after-session')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /should not be/)
    db.close()
  })

  it('counts them all but names the worst offender', async () => {
    const { report, db } = await importMutated((m) => {
      m.media[0].capturedAt = '2025-01-04T09:00:00.000Z'
      m.media[1].capturedAt = '2026-07-25T16:00:00.000Z'
      m.media[2].capturedAt = '2026-07-25T16:30:00.000Z'
    })
    const found = codes(report, 'capture.before-session')
    assert.equal(found.length, 1, 'one entry, not one per file')
    assert.match(found[0]!.message, /3 files were captured before/)
    assert.match(found[0]!.message, /2025-01-04/, 'the earliest is the one worth naming')
    db.close()
  })

  it('tolerates a minute of clock drift rather than crying wolf', async () => {
    const { report, db } = await importMutated((m) => {
      // 30 seconds before the session start.
      m.media[0].capturedAt = '2026-07-25T16:54:44.515Z'
    })
    assert.equal(codes(report, 'capture.before-session').length, 0)
    db.close()
  })

  it('flags a timestamp that is not a date at all', async () => {
    const { report, db } = await importMutated((m) => {
      m.media[0].capturedAt = 'sometime tuesday'
    })
    assert.equal(codes(report, 'capture.unparseable-timestamp').length, 1)
    db.close()
  })

  it('says it could not check when the export declares no window', async () => {
    const { report, db } = await importMutated((m) => {
      delete m.session.startedAt
      delete m.session.completedAt
      delete m.session.exportedAt
    })
    const found = codes(report, 'capture.no-session-window')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /could not be verified/)
    db.close()
  })
})

describe('config hash across visits', () => {
  it('notes a checklist change between visits, informationally', async () => {
    const db = freshDb()
    const dataDir = scratchDir()
    const ids = makePropertyAndVisit(db)
    await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir })

    const parsed = JSON.parse(readReference()) as Manifest
    parsed.session.sessionId = 'second-visit-session'
    parsed.config.hash = 'a-different-hash'
    parsed.config.version = '1.3.0'
    const visitTwo = addVisit(db, ids.propertyId, 'monthly')
    const { importId } = await runImport({ actorId: TEST_OPERATOR,
      db,
      propertyId: ids.propertyId,
      visitId: visitTwo,
      raw: JSON.stringify(parsed),
      dataDir,
    })
    const report = buildReport(db, importId)!

    const found = codes(report, 'config.changed-since-last-visit')
    assert.equal(found.length, 1)
    assert.equal(found[0]!.severity, 'info', 'a config change is news, not a fault')
    assert.match(found[0]!.message, /v1\.3\.0/)
    assert.equal(report.import.status, 'ok_with_warnings') // from media.absent only
    db.close()
  })
})
