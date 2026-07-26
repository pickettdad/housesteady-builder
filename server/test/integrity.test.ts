import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Db } from '../src/db/index.js'
import { buildReport, type ImportReport } from '../src/import/report.js'
import { runImport } from '../src/import/runImport.js'
import { addVisit, freshDb, makePropertyAndVisit, readReference, scratchDir } from './helpers.js'

/**
 * The broken variants.
 *
 * Every one of these must import — the export is still 99% good — and every one
 * must say precisely what is wrong, naming both ends. A check that reports "3
 * problems found" has failed even when the count is right.
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

const codes = (r: ImportReport, prefix: string) =>
  r.validation.checks.filter((c) => c.code.startsWith(prefix))

describe('referential integrity', () => {
  it('names both ends of a dangling pin -> media reference', () => {
    const { report, db } = importMutated((m) => {
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

  it('catches a pin pointing at a zone that does not exist', () => {
    const { report, db } = importMutated((m) => {
      m.pins[0].zoneId = 'ghost-zone'
    })
    const found = codes(report, 'integrity.pin-zone')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /pin 1 sits in zone ghost-zone/)
    db.close()
  })

  it('catches an anchor on a canvas no zone declares', () => {
    const { report, db } = importMutated((m) => {
      m.pins[0].anchors[0].canvasId = 'ghost-canvas'
    })
    assert.equal(codes(report, 'integrity.anchor-canvas').length, 1)
    db.close()
  })

  it('catches a note attached to a pin that is not there', () => {
    const { report, db } = importMutated((m) => {
      m.notes[0].target.id = 'ghost-pin'
    })
    const found = codes(report, 'integrity.note-target')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /ghost-pin/)
    db.close()
  })

  it('catches media owned by a pin that is not in pins[]', () => {
    const { report, db } = importMutated((m) => {
      m.media[0].owner = { kind: 'pin', pinId: 'ghost-pin', pinNumber: 99 }
    })
    const found = codes(report, 'integrity.media-owner')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /belongs to pin 99/)
    db.close()
  })

  it('catches a resolution citing evidence that is not there', () => {
    const { report, db } = importMutated((m) => {
      const r = m.resolutions.find((x: Manifest) => x.itemId === 'int.alarms')
      r.resolution.evidence = { pinId: 'ghost-pin' }
    })
    const found = codes(report, 'integrity.resolution-scope')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /int\.alarms.*cites pin ghost-pin/)
    db.close()
  })

  it('catches an inbox holding a reference to nothing', () => {
    const { report, db } = importMutated((m) => {
      m.inbox.mediaIds = ['ghost-media']
    })
    assert.equal(codes(report, 'integrity.inbox-ref').length, 1)
    db.close()
  })

  it('reports each dangling reference separately rather than as a count', () => {
    const { report, db } = importMutated((m) => {
      m.pins[6].mediaIds = ['ghost-a', 'ghost-b']
      m.pins[7].noteIds = ['ghost-c']
    })
    assert.equal(codes(report, 'integrity.pin-media').length, 2)
    assert.equal(codes(report, 'integrity.pin-note').length, 1)
    db.close()
  })
})

describe('anchor bounds', () => {
  it('warns on an out-of-range anchor and stores it anyway', () => {
    const { report, db } = importMutated((m) => {
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

  it('accepts the exact boundaries', () => {
    const { report, db } = importMutated((m) => {
      m.pins[0].anchors[0].x = 0
      m.pins[0].anchors[0].y = 1
    })
    assert.equal(codes(report, 'anchor.out-of-bounds').length, 0)
    db.close()
  })
})

describe('event sequence', () => {
  it('names the missing sequence numbers', () => {
    const { report, db } = importMutated((m) => {
      m.events = m.events.filter((e: Manifest) => e.seq !== 40 && e.seq !== 41)
    })
    const found = codes(report, 'events.sequence-gap')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /40, 41/)
    assert.match(found[0]!.message, /audit trail for this visit is incomplete/)
    db.close()
  })

  it('notices a log that does not start at 1', () => {
    const { report, db } = importMutated((m) => {
      m.events = m.events.filter((e: Manifest) => e.seq > 5)
    })
    assert.equal(codes(report, 'events.does-not-start-at-one').length, 1)
    db.close()
  })

  it('notices duplicated sequence numbers', () => {
    const { report, db } = importMutated((m) => {
      m.events[10].seq = m.events[9].seq
    })
    assert.equal(codes(report, 'events.duplicate-seq').length, 1)
    db.close()
  })
})

describe('resolutions against the event log', () => {
  it('reports both numbers when they disagree, and judges neither', () => {
    const { report, db } = importMutated((m) => {
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

describe('pin numbers — the cross-visit join key', () => {
  it('warns when two pins in one export share a number', () => {
    const { report, db } = importMutated((m) => {
      m.pins[1].number = 1
    })
    const found = codes(report, 'pins.duplicate-number')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /Pin number 1 is used by 2 different pins/)
    db.close()
  })

  it('warns when a pin number means a different thing than it did last visit', () => {
    const db = freshDb()
    const dataDir = scratchDir()
    const ids = makePropertyAndVisit(db)

    // Visit one: the export as-is.
    runImport({ db, ...ids, raw: readReference(), dataDir })

    // Visit two: pin 7 is now a different pin object with the same number.
    const parsed = JSON.parse(readReference()) as Manifest
    parsed.session.sessionId = 'second-visit-session'
    parsed.pins[6].pinId = 'a-completely-different-pin'
    const visitTwo = addVisit(db, ids.propertyId, 'monthly')
    const { importId } = runImport({
      db,
      propertyId: ids.propertyId,
      visitId: visitTwo,
      raw: JSON.stringify(parsed),
      dataDir,
    })
    const report = buildReport(db, importId)!

    const found = codes(report, 'pins.cross-visit-collision')
    assert.ok(found.length >= 1)
    assert.match(found[0]!.message, /Pin 7 in this export/)
    assert.match(found[0]!.message, /identifies the same thing across years/)
    db.close()
  })

  it('says nothing when the same pin keeps its number across visits', () => {
    const db = freshDb()
    const dataDir = scratchDir()
    const ids = makePropertyAndVisit(db)
    runImport({ db, ...ids, raw: readReference(), dataDir })

    const parsed = JSON.parse(readReference()) as Manifest
    parsed.session.sessionId = 'second-visit-session'
    const visitTwo = addVisit(db, ids.propertyId, 'monthly')
    const { importId } = runImport({
      db,
      propertyId: ids.propertyId,
      visitId: visitTwo,
      raw: JSON.stringify(parsed),
      dataDir,
    })
    assert.equal(codes(buildReport(db, importId)!, 'pins.cross-visit-collision').length, 0)
    db.close()
  })

  it('flags a pin with no number at all', () => {
    const { report, db } = importMutated((m) => {
      delete m.pins[3].number
    })
    const found = codes(report, 'pins.no-number')
    assert.equal(found.length, 1)
    assert.match(found[0]!.message, /cannot be followed year to year/)
    db.close()
  })
})

describe('config hash across visits', () => {
  it('notes a checklist change between visits, informationally', () => {
    const db = freshDb()
    const dataDir = scratchDir()
    const ids = makePropertyAndVisit(db)
    runImport({ db, ...ids, raw: readReference(), dataDir })

    const parsed = JSON.parse(readReference()) as Manifest
    parsed.session.sessionId = 'second-visit-session'
    parsed.config.hash = 'a-different-hash'
    parsed.config.version = '1.3.0'
    const visitTwo = addVisit(db, ids.propertyId, 'monthly')
    const { importId } = runImport({
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
