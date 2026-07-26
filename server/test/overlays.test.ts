import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openDb, type Db } from '../src/db/index.js'
import { resolutionKey } from '../src/overlay/fields.js'
import { entityKey, resolveState, type Overlay } from '../src/overlay/model.js'
import {
  latestLiveDecision,
  OverlayRefused,
  readVisitOverlays,
  stateFor,
  visitState,
  writeOverlay,
} from '../src/overlay/store.js'
import { runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, readReference, scratchDir } from './helpers.js'

/**
 * The overlay layer — the desk's half of the record.
 *
 * Spec §8 asks for: each of the four acts writes an overlay and never mutates a
 * captured row; undo supersedes and the trail reads honestly; corrections retain
 * prior values; current state resolves latest-wins across mixed kinds.
 */

/** A visit with the reference export in it, so the targets below are real. */
async function importedVisit(): Promise<{
  db: Db
  propertyId: string
  visitId: string
  zoneId: string
  pinId: string
  typelessPinId: string
}> {
  const db = freshDb()
  const ids = makePropertyAndVisit(db)
  await runImport({ db, ...ids, raw: readReference(), dataDir: scratchDir() })

  const zone = db.prepare('SELECT zone_id FROM zones WHERE visit_id = ? LIMIT 1').get(ids.visitId) as {
    zone_id: string
  }
  const pin = db
    .prepare('SELECT pin_id FROM pins WHERE visit_id = ? AND type_kind IS NOT NULL ORDER BY number LIMIT 1')
    .get(ids.visitId) as { pin_id: string }
  const typeless = db
    .prepare('SELECT pin_id FROM pins WHERE visit_id = ? AND type_kind IS NULL ORDER BY number LIMIT 1')
    .get(ids.visitId) as { pin_id: string }

  return { db, ...ids, zoneId: zone.zone_id, pinId: pin.pin_id, typelessPinId: typeless.pin_id }
}

/** Everything the field app said, as one comparable blob. */
const CAPTURED_TABLES = [
  'imports', 'session_meta', 'config_snapshots', 'zones', 'canvases', 'pins',
  'anchors', 'media', 'notes', 'chat_threads', 'chat_messages', 'resolutions', 'events',
]

const snapshotCaptured = (db: Db): string =>
  JSON.stringify(
    CAPTURED_TABLES.map((t) => [t, db.prepare(`SELECT * FROM ${t}`).all()]),
  )

describe('the four acts', () => {
  it('writes an overlay for each act and mutates nothing the field captured', async () => {
    const { db, propertyId, visitId, zoneId, pinId, typelessPinId } = await importedVisit()
    const before = snapshotCaptured(db)

    const mediaId = (
      db.prepare('SELECT media_id FROM media WHERE visit_id = ? LIMIT 1').get(visitId) as { media_id: string }
    ).media_id

    const confirm = writeOverlay({
      db, propertyId, visitId, kind: 'confirm', targetKind: 'pin', targetId: pinId,
    })
    const correct = writeOverlay({
      db, propertyId, visitId, kind: 'correct', targetKind: 'pin', targetId: typelessPinId,
      field: 'type', newValue: { kind: 'component', componentType: 'junction-box', freeformLabel: null },
    })
    const assign = writeOverlay({
      db, propertyId, visitId, kind: 'assign', targetKind: 'media', targetId: mediaId,
      newValue: { toKind: 'pin', toId: pinId },
    })
    const flag = writeOverlay({
      db, propertyId, visitId, kind: 'flag', targetKind: 'zone', targetId: zoneId,
      reason: 'Second photo of the ceiling is out of focus.',
    })

    for (const o of [confirm, correct, assign, flag]) {
      assert.equal(o.visitId, visitId)
      assert.equal(o.actorContext, 'desk', 'the desk is where this was decided, and the record says so')
      assert.ok(o.createdAt)
    }
    assert.deepEqual(
      [confirm.kind, correct.kind, assign.kind, flag.kind],
      ['confirm', 'correct', 'assign', 'flag'],
      'four acts, four kinds — never collapsed into one verified flag',
    )

    assert.equal(snapshotCaptured(db), before, 'the manifest is immutable evidence')
    db.close()
  })

  it('refuses a flag with no reason', async () => {
    const { db, propertyId, visitId, pinId } = await importedVisit()
    assert.throws(
      () => writeOverlay({ db, propertyId, visitId, kind: 'flag', targetKind: 'pin', targetId: pinId }),
      (e: OverlayRefused) => e.code === 'overlay.flag-no-reason',
    )
    db.close()
  })

  it('refuses an overlay pointing at something this visit does not have', async () => {
    const { db, propertyId, visitId } = await importedVisit()
    assert.throws(
      () =>
        writeOverlay({
          db, propertyId, visitId, kind: 'confirm', targetKind: 'pin', targetId: 'not-a-pin',
        }),
      (e: OverlayRefused) => e.code === 'overlay.unknown-target',
    )
    db.close()
  })
})

describe('corrections retain prior values', () => {
  it('reads the prior value out of storage rather than trusting the caller', async () => {
    const { db, propertyId, visitId, pinId } = await importedVisit()
    const captured = db.prepare('SELECT type_kind, freeform_label FROM pins WHERE visit_id = ? AND pin_id = ?')
      .get(visitId, pinId) as { type_kind: string; freeform_label: string }

    const o = writeOverlay({
      db, propertyId, visitId, kind: 'correct', targetKind: 'pin', targetId: pinId,
      field: 'type', newValue: { kind: 'component', componentType: 'junction-box', freeformLabel: null },
    })

    // "was freeform receptacle, corrected to component junction-box at the desk"
    assert.deepEqual(o.priorValue, {
      kind: captured.type_kind,
      componentType: null,
      freeformLabel: captured.freeform_label,
    })
    assert.deepEqual(o.newValue, { kind: 'component', componentType: 'junction-box', freeformLabel: null })
    db.close()
  })

  it('chains, so each correction names the value it actually replaced', async () => {
    const { db, propertyId, visitId, pinId } = await importedVisit()
    const first = writeOverlay({
      db, propertyId, visitId, kind: 'correct', targetKind: 'pin', targetId: pinId,
      field: 'type', newValue: { kind: 'freeform', componentType: null, freeformLabel: 'Outlet' },
    })
    const second = writeOverlay({
      db, propertyId, visitId, kind: 'correct', targetKind: 'pin', targetId: pinId,
      field: 'type', newValue: { kind: 'component', componentType: 'junction-box', freeformLabel: null },
    })

    assert.equal(second.supersedesId, first.id, 'a re-decision supersedes rather than piling up')
    assert.deepEqual(second.priorValue, first.newValue, 'the second correction replaced the first, not the original')

    const state = stateFor(visitState(db, visitId), 'pin', pinId)!
    assert.equal(Object.keys(state.corrections).length, 1, 'one live correction per field')
    assert.equal(state.corrections.type!.id, second.id)
    db.close()
  })

  it('records a typeless pin being typed as a correction from nothing', async () => {
    const { db, propertyId, visitId, typelessPinId } = await importedVisit()
    const o = writeOverlay({
      db, propertyId, visitId, kind: 'correct', targetKind: 'pin', targetId: typelessPinId,
      field: 'type', newValue: { kind: 'component', componentType: 'smoke-alarm', freeformLabel: null },
    })
    // An explicit null, not an omission. "Never typed" is information.
    assert.equal(o.priorValue, null)
    db.close()
  })

  it('corrects an na reason and a failed-check note, addressed by composite key', async () => {
    const { db, propertyId, visitId } = await importedVisit()
    const na = db
      .prepare(
        `SELECT scope_kind, scope_zone_id, scope_pin_id, item_id, reason_id
           FROM resolutions WHERE visit_id = ? AND kind = 'na' LIMIT 1`,
      )
      .get(visitId) as {
      scope_kind: string; scope_zone_id: string | null; scope_pin_id: string | null
      item_id: string; reason_id: string
    }

    const o = writeOverlay({
      db, propertyId, visitId, kind: 'correct', targetKind: 'resolution',
      targetId: resolutionKey(na), field: 'reasonId', newValue: 'no-access',
    })
    assert.equal(o.priorValue, na.reason_id)
    assert.equal(o.newValue, 'no-access')
    db.close()
  })
})

describe('undo supersedes, and the trail reads honestly', () => {
  it('reads assigned, unassigned, reassigned', async () => {
    const { db, propertyId, visitId, pinId } = await importedVisit()
    const mediaId = (
      db.prepare('SELECT media_id FROM media WHERE visit_id = ? LIMIT 1').get(visitId) as { media_id: string }
    ).media_id

    const assigned = writeOverlay({
      db, propertyId, visitId, kind: 'assign', targetKind: 'media', targetId: mediaId,
      newValue: { toKind: 'pin', toId: pinId },
    })
    const undone = writeOverlay({
      db, propertyId, visitId, kind: 'undo', targetKind: 'overlay', targetId: assigned.id,
      supersedesId: assigned.id,
    })
    const reassigned = writeOverlay({
      db, propertyId, visitId, kind: 'assign', targetKind: 'media', targetId: mediaId,
      newValue: { toKind: 'zone', toId: (db.prepare('SELECT zone_id FROM zones WHERE visit_id = ? LIMIT 1')
        .get(visitId) as { zone_id: string }).zone_id },
      supersedesId: undone.id,
    })

    const state = stateFor(visitState(db, visitId), 'media', mediaId)!
    assert.deepEqual(
      state.trail.map((t) => t.verb),
      ['assigned', 'unassigned', 'reassigned'],
      'the trail is the sentence the spec asks for',
    )
    assert.deepEqual(state.trail.map((t) => t.live), [false, false, true])
    assert.equal(state.assign!.id, reassigned.id)
    db.close()
  })

  it('never deletes — the undone row is still there', async () => {
    const { db, propertyId, visitId, pinId } = await importedVisit()
    const confirm = writeOverlay({
      db, propertyId, visitId, kind: 'confirm', targetKind: 'pin', targetId: pinId,
    })
    writeOverlay({
      db, propertyId, visitId, kind: 'undo', targetKind: 'overlay', targetId: confirm.id,
      supersedesId: confirm.id,
    })

    assert.equal(readVisitOverlays(db, visitId).length, 2, 'a retraction is a row, not an absence')
    const state = stateFor(visitState(db, visitId), 'pin', pinId)!
    assert.equal(state.confirm, null, 'and the confirmation no longer stands')
    assert.equal(state.decision, null, 'so the pin is undecided again')
    db.close()
  })

  it('undoes the most recent act when nothing is named — the one keystroke', async () => {
    const { db, propertyId, visitId, pinId, zoneId } = await importedVisit()
    writeOverlay({ db, propertyId, visitId, kind: 'confirm', targetKind: 'pin', targetId: pinId })
    const flag = writeOverlay({
      db, propertyId, visitId, kind: 'flag', targetKind: 'zone', targetId: zoneId, reason: 'Blurry',
    })

    assert.equal(latestLiveDecision(db, visitId)!.id, flag.id)
    writeOverlay({
      db, propertyId, visitId, kind: 'undo', targetKind: 'overlay', targetId: flag.id, supersedesId: flag.id,
    })

    const states = visitState(db, visitId)
    assert.equal(stateFor(states, 'zone', zoneId)!.flag, null, 'the flag went')
    assert.ok(stateFor(states, 'pin', pinId)!.confirm, 'the confirmation before it stayed')
    db.close()
  })

  it('refuses to undo the same decision twice', async () => {
    const { db, propertyId, visitId, pinId } = await importedVisit()
    const confirm = writeOverlay({
      db, propertyId, visitId, kind: 'confirm', targetKind: 'pin', targetId: pinId,
    })
    writeOverlay({
      db, propertyId, visitId, kind: 'undo', targetKind: 'overlay', targetId: confirm.id,
      supersedesId: confirm.id,
    })
    assert.throws(
      () =>
        writeOverlay({
          db, propertyId, visitId, kind: 'undo', targetKind: 'overlay', targetId: confirm.id,
          supersedesId: confirm.id,
        }),
      (e: OverlayRefused) => e.code === 'overlay.already-superseded',
      'supersession is a chain, never a tree',
    )
    db.close()
  })

  it('files the undo against the entity, not against the overlay it retracts', async () => {
    const { db, propertyId, visitId, pinId } = await importedVisit()
    const confirm = writeOverlay({
      db, propertyId, visitId, kind: 'confirm', targetKind: 'pin', targetId: pinId,
    })
    const undo = writeOverlay({
      db, propertyId, visitId, kind: 'undo', targetKind: 'overlay', targetId: confirm.id,
      supersedesId: confirm.id,
    })
    // Otherwise the retraction files itself somewhere the pin's own trail will
    // never show it.
    assert.equal(undo.targetKind, 'pin')
    assert.equal(undo.targetId, pinId)
    db.close()
  })
})

describe('current state — latest wins across mixed kinds', () => {
  it('keeps a confirmation and a flag standing together', async () => {
    const { db, propertyId, visitId, pinId } = await importedVisit()
    writeOverlay({ db, propertyId, visitId, kind: 'confirm', targetKind: 'pin', targetId: pinId })
    const flag = writeOverlay({
      db, propertyId, visitId, kind: 'flag', targetKind: 'pin', targetId: pinId,
      reason: 'Worth a second look on the next visit.',
    })

    const state = stateFor(visitState(db, visitId), 'pin', pinId)!
    // Both are true statements about the same pin: the label reads what the
    // field says it reads, AND somebody should look again.
    assert.ok(state.confirm, 'the confirmation stands')
    assert.ok(state.flag, 'and so does the flag')
    assert.equal(state.decision!.id, flag.id, 'the latest act is the standing decision')
    db.close()
  })

  it('replaces only within one kind and field', async () => {
    const { db, propertyId, visitId, pinId } = await importedVisit()
    const first = writeOverlay({
      db, propertyId, visitId, kind: 'flag', targetKind: 'pin', targetId: pinId, reason: 'Blurry',
    })
    const second = writeOverlay({
      db, propertyId, visitId, kind: 'flag', targetKind: 'pin', targetId: pinId, reason: 'Wrong room',
    })
    assert.equal(second.supersedesId, first.id)
    const state = stateFor(visitState(db, visitId), 'pin', pinId)!
    assert.equal(state.flag!.reason, 'Wrong room')
    assert.equal(state.trail.length, 2, 'the first reason is still in the record')
    db.close()
  })

  it('resolves state from rows alone, with no stored derived column', () => {
    // resolveState is pure: give it overlays, get state. Nothing to keep in step.
    const mk = (over: Partial<Overlay>): Overlay => ({
      id: 'x', propertyId: 'p', visitId: 'v', seq: 1, kind: 'confirm', targetKind: 'pin', targetId: 'pin-1',
      field: null, priorValue: null, newValue: null, reason: null, supersedesId: null,
      actor: 'concierge', actorContext: 'desk', createdAt: '2026-07-26T10:00:00.000Z', ...over,
    })

    const a = mk({ id: 'a', seq: 1 })
    const b = mk({ id: 'b', seq: 2, kind: 'undo', supersedesId: 'a' })
    const c = mk({ id: 'c', seq: 3, supersedesId: 'b' })

    const state = resolveState([a, b, c]).get(entityKey('pin', 'pin-1'))!
    assert.deepEqual(state.trail.map((t) => t.verb), ['confirmed', 'unconfirmed', 'reconfirmed'])
    assert.equal(state.confirm!.id, 'c')
  })

  it('preserves a kind it has never met rather than dropping it', () => {
    const o: Overlay = {
      id: 'a', propertyId: 'p', visitId: 'v', seq: 1, kind: 'transcribe', targetKind: 'zone', targetId: 'z1',
      field: null, priorValue: null, newValue: { text: 'from 2b' }, reason: null, supersedesId: null,
      actor: 'concierge', actorContext: 'desk', createdAt: '2026-07-26T10:00:00.000Z',
    }
    const state = resolveState([o]).get(entityKey('zone', 'z1'))!
    assert.equal(state.unrecognized.length, 1, 'fail open on vocabulary — surface it, never swallow it')
    assert.equal(state.decision, null, 'but an unrecognized kind is not silently counted as a decision')
    assert.equal(state.trail[0]!.verb, 'transcribe')
  })
})

describe('no overlay may record a judgement', () => {
  it('refuses a condition, grade or adequacy field however it is spelled', async () => {
    const { db, propertyId, visitId, pinId } = await importedVisit()
    for (const field of ['condition', 'Condition', 'condition_note', 'overallGrade', 'safety_rating', 'severity']) {
      assert.throws(
        () =>
          writeOverlay({
            db, propertyId, visitId, kind: 'correct', targetKind: 'pin', targetId: pinId,
            field, newValue: 'poor',
          }),
        (e: OverlayRefused) => e.code === 'overlay.forbidden-field',
        `"${field}" must be refused — the concierge identifies, specialists assess`,
      )
    }
    db.close()
  })

  it('refuses to correct anything the desk has no business correcting', async () => {
    const { db, propertyId, visitId, pinId } = await importedVisit()
    // Spec §2: adding new evidence or spatial data is field work. There is no
    // correctable field for a coordinate or a measurement, so there is no way in.
    for (const field of ['x', 'y', 'anchor', 'measurement', 'pressurePsi']) {
      assert.throws(
        () =>
          writeOverlay({
            db, propertyId, visitId, kind: 'correct', targetKind: 'pin', targetId: pinId,
            field, newValue: 0.5,
          }),
        (e: OverlayRefused) => e.code === 'overlay.uncorrectable-field',
      )
    }
    db.close()
  })
})

describe('the overlay table itself', () => {
  it('carries no column that could hold a derived or client-facing state', () => {
    const db = openDb(':memory:')
    const columns = (db.prepare('SELECT name FROM pragma_table_info(?)').all('overlays') as { name: string }[])
      .map((c) => c.name)

    for (const forbidden of ['status', 'current', 'is_current', 'state', 'published', 'signed', 'condition', 'grade']) {
      assert.ok(!columns.includes(forbidden), `overlays must not carry a "${forbidden}" column`)
    }
    for (const required of ['kind', 'target_kind', 'target_id', 'field', 'prior_value', 'new_value', 'supersedes_id']) {
      assert.ok(columns.includes(required), `overlays.${required} exists`)
    }
    db.close()
  })

  it('replaces the two tables Increment 1 guessed at', () => {
    const db = openDb(':memory:')
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((t) => t.name)
    assert.ok(!tables.includes('verifications'))
    assert.ok(!tables.includes('field_fixes'))
    assert.ok(tables.includes('overlays'))
    db.close()
  })
})
