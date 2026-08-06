/**
 * Increment 5 §6 — the confirmation surface, and §7's freeform-label input.
 *
 * **Against constructed objects, deliberately.** §6 is buildable without the
 * photographs because what it decides is the *shape* of a signature, not what is
 * in a picture — so none of this waits on the real media.
 */

import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { now, type Db } from '../src/db/index.js'
import { ACT_LABEL, ConfirmationRefused, confirmObject } from '../src/engine/confirm.js'
import { freeformLabelProposals } from '../src/engine/reviewQueue.js'
import { TEST_OPERATOR, freshDb } from './helpers.js'

let db: Db
const PROPERTY = 'prop-1'
const IMPORT = 'imp-1'

const object = (id: string, classId: string | null = 'water-heater-gas'): string => {
  db.prepare(
    `INSERT INTO objects (id, property_id, zone_id, class_id, label, actor_id, created_at)
     VALUES (?, ?, 'zone-1', ?, 'The water heater', ?, ?)`,
  ).run(id, PROPERTY, classId, TEST_OPERATOR, now())
  return id
}

const pin = (pinId: string, label: string | null, opts: { property?: string; retired?: boolean } = {}): void => {
  db.prepare(
    `INSERT INTO pins (pin_id, import_id, property_id, number, zone_id, type_kind, freeform_label, retired_at, created_at)
     VALUES (?, ?, ?, 1, 'zone-1', 'freeform', ?, ?, ?)`,
  ).run(pinId, IMPORT, opts.property ?? PROPERTY, label, opts.retired ? now() : null, now())
}

beforeEach(() => {
  db = freshDb()
  db.prepare(`INSERT INTO properties (id, label, created_at, actor_id) VALUES (?, 'A house', ?, ?)`)
    .run(PROPERTY, now(), TEST_OPERATOR)
  db.prepare(`INSERT INTO properties (id, label, created_at, actor_id) VALUES ('prop-2', 'Another', ?, ?)`)
    .run(now(), TEST_OPERATOR)
  db.prepare(
    `INSERT INTO imports (id, property_id, actor_id, imported_at, media_mode, raw_manifest, validation_report, status, created_at)
     VALUES (?, ?, ?, ?, 'manifest-only', '{}', '{}', 'ok', ?)`,
  ).run(IMPORT, PROPERTY, TEST_OPERATOR, now(), now())
})

describe('one click, two provenance records — Amendment 1 §B', () => {
  it('signs the identification and adopts the research, from a single act', () => {
    // The whole ruling in one assertion. A concierge confirms *this is a gas
    // water heater* — checkable against the photograph — and the descaling
    // interval rides the same click without acquiring a signature nobody gave.
    const id = object('obj-1')
    const r = confirmObject(db, {
      objectId: id,
      operatorId: TEST_OPERATOR,
      decision: 'confirmed',
      derived: [
        { stream: 'care', ref: 'descale', checkableOnScreen: false },
        { stream: 'horizon', ref: 'replacement-band', checkableOnScreen: false },
      ],
    })

    assert.deepEqual(
      r.records.map((x) => [x.stream, x.act, x.honestyLabel]),
      [
        ['identification', 'confirmed', 'Observed'],
        ['care', 'adopted', 'Inferred'],
        ['horizon', 'adopted', 'Inferred'],
      ],
    )
  })

  it('the database refuses a research output stored as confirmed, however it is labelled', () => {
    // **Doctrine 2's laundered inference arrives through a button label, which is
    // why no scan would catch it and why this is a constraint instead.** Written
    // directly against the table, bypassing `confirmObject` entirely — because
    // the guard has to hold against the author who does not use the front door.
    const id = object('obj-1')
    const { decisionId } = confirmObject(db, { objectId: id, operatorId: TEST_OPERATOR, decision: 'confirmed' })
    const insert = (act: string, label: string) =>
      db.prepare(
        `INSERT INTO object_provenance (id, decision_id, object_id, stream, act, honesty_label, ref, actor_id, created_at)
         VALUES (?, ?, ?, 'care', ?, ?, 'descale', ?, ?)`,
      ).run(`p-${act}-${label}`, decisionId, id, act, label, TEST_OPERATOR, now())

    assert.throws(() => insert('confirmed', 'Inferred'), /CHECK/)
    assert.throws(() => insert('adopted', 'Observed'), /CHECK/)
    assert.throws(() => insert('confirmed', 'Reported by homeowner'), /CHECK/)
    // And the two legal pairings still go in, so the check is not simply refusing.
    assert.doesNotThrow(() => insert('adopted', 'Inferred'))
  })

  it('the pairing is declared once, so nothing writes the labels as literals', () => {
    assert.deepEqual(ACT_LABEL, { confirmed: 'Observed', adopted: 'Inferred' })
  })
})

describe('confirmation is per object, never per output', () => {
  it('refuses a second decision on the same object', () => {
    // *Confirming a class four times gets a weaker signature each time.* The
    // second act is refused rather than recorded, and the message says what the
    // right act would be instead.
    const id = object('obj-1')
    confirmObject(db, { objectId: id, operatorId: TEST_OPERATOR, decision: 'confirmed' })
    assert.throws(
      () => confirmObject(db, { objectId: id, operatorId: TEST_OPERATOR, decision: 'confirmed' }),
      (e: unknown) => {
        assert.ok(e instanceof ConfirmationRefused)
        assert.equal(e.code, 'confirm.already-decided')
        assert.match(e.message, /weaker than the first/)
        return true
      },
    )
  })

  it('a second record for one stream cannot be written even by hand', () => {
    const id = object('obj-1')
    const { decisionId } = confirmObject(db, {
      objectId: id,
      operatorId: TEST_OPERATOR,
      decision: 'confirmed',
      derived: [{ stream: 'care', ref: 'descale', checkableOnScreen: false }],
    })
    assert.throws(
      () =>
        db.prepare(
          `INSERT INTO object_provenance (id, decision_id, object_id, stream, act, honesty_label, ref, actor_id, created_at)
           VALUES ('dup', ?, ?, 'care', 'adopted', 'Inferred', 'descale', ?, ?)`,
        ).run(decisionId, id, TEST_OPERATOR, now()),
      /UNIQUE/,
    )
  })

  it('names an object that does not exist rather than writing a decision about nothing', () => {
    assert.throws(
      () => confirmObject(db, { objectId: 'ghost', operatorId: TEST_OPERATOR, decision: 'confirmed' }),
      (e: unknown) => {
        assert.equal((e as ConfirmationRefused).code, 'confirm.object-absent')
        return true
      },
    )
    assert.equal((db.prepare('SELECT COUNT(*) c FROM object_decisions').get() as { c: number } | undefined)?.c ?? 0, 0)
  })
})

describe('rejection is an act, and nothing follows from it', () => {
  it('records the rejection and writes no provenance at all', () => {
    // Abstention ends in an explicit act — 2b's rule. And a rejection is recorded
    // rather than deleted for the same reason a discard is: a model that keeps
    // proposing the same wrong thing is a prompt problem, and this is the evidence.
    const id = object('obj-1')
    const r = confirmObject(db, {
      objectId: id,
      operatorId: TEST_OPERATOR,
      decision: 'rejected',
      note: 'That is the neighbour’s.',
      derived: [{ stream: 'care', ref: 'descale', checkableOnScreen: false }],
    })
    assert.deepEqual(r.records, [], 'nothing follows from an object that is not there')
    const row = db.prepare('SELECT decision, note FROM object_decisions WHERE id = ?')
      .get(r.decisionId) as { decision: string; note: string } | undefined
    assert.equal(row?.decision, 'rejected')
    assert.match(row?.note ?? '', /neighbour/)
    assert.equal((db.prepare('SELECT confirmed_by FROM objects WHERE id = ?')
      .get(id) as { confirmed_by: string | null } | undefined)?.confirmed_by, null)
  })

  it('unanimity — one corrected character marks the whole reading edited', () => {
    const id = object('obj-1')
    const r = confirmObject(db, { objectId: id, operatorId: TEST_OPERATOR, decision: 'confirmed', edited: true })
    assert.equal(
      (db.prepare('SELECT edited FROM object_decisions WHERE id = ?').get(r.decisionId) as { edited: number } | undefined)?.edited,
      1,
    )
  })
})

describe('§7 — freeform labels, aggregated for the first time', () => {
  it('groups case- and whitespace-insensitively, and displays verbatim', () => {
    // Normalise at query time, never at write time. `Receptacle ` and
    // `receptacle` are the same proposal; the label shown is the one most often
    // typed, and the original is never altered in storage.
    pin('p1', 'Receptacle')
    pin('p2', 'receptacle')
    pin('p3', 'Receptacle ')
    pin('p4', 'Receptacle')
    const { proposals } = freeformLabelProposals(db)
    assert.equal(proposals.length, 1)
    assert.equal(proposals[0]!.label, 'Receptacle', 'the most-typed spelling, unaltered')
    assert.equal(proposals[0]!.count, 4)
  })

  it('ranks a label seen at several houses above one seen often at a single house', () => {
    // **A property count of one is a different fact from a count of one.** Six
    // receptacles in one house is a concierge's habit; the same label at two
    // houses is a gap in the frame.
    pin('a1', 'Ceiling light')
    pin('a2', 'Ceiling light', { property: 'prop-2' })
    for (const n of [1, 2, 3, 4, 5]) pin(`b${n}`, 'Floor')
    const { proposals, note } = freeformLabelProposals(db)
    assert.deepEqual(proposals.map((p) => [p.label, p.properties, p.count]), [
      ['Ceiling light', 2, 2],
      ['Floor', 1, 5],
    ])
    assert.match(note, /appear at more than one property/)
  })

  it('counts a retired pin and marks it, rather than dropping it', () => {
    // Doctrine 6. A label that keeps being typed and keeps being retired is a
    // different signal from one that sticks, and both are worth reading.
    pin('r1', 'Zone notes', { retired: true })
    pin('r2', 'Zone notes')
    const p = freeformLabelProposals(db).proposals[0]!
    assert.equal(p.count, 2)
    assert.equal(p.retired, 1)
    assert.deepEqual(p.pins.map((x) => x.retired).sort(), [false, true])
  })

  it('ignores a pin with no label, and a blank one', () => {
    pin('n1', null)
    pin('n2', '   ')
    pin('n3', 'Return')
    assert.deepEqual(freeformLabelProposals(db).proposals.map((p) => p.label), ['Return'])
  })

  it('an empty queue says it is an empty run, not a clean frame', () => {
    // Rule 11, and it matters here more than most: this queue is at its most
    // productive when the frame is emptiest, so zero must never read as *nothing
    // to propose*.
    assert.match(freeformLabelProposals(db).note, /empty run rather than a clean frame/)
  })
})
