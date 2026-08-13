/**
 * Proposals as a portable fixture — the ruling of 2026-08-12.
 *
 * ⚑ **Generating proposals and scoring proposals are separate jobs.** The claim
 * the ruling rests on is that a fixture and a database produce **the same
 * score** — and if that is ever untrue the fixture is a second measurement
 * wearing the first one's name. *That equivalence is the first test here and it
 * is the one that matters.*
 *
 * **The personal-data scan is validated against known answers before its output
 * is trusted:** positives it must catch, and — more importantly — **negatives it
 * must not**, because a mechanical room is full of strings shaped exactly like
 * licence numbers.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { newId, now, type Db } from '../src/db/index.js'
import { proposalsForImport } from '../src/engine/compare.js'
import {
  buildFixture, parseFixture, proposalsOf, scanForPersonalData,
  type FixtureProposal,
} from '../src/engine/proposalFixture.js'
import { mediaIdOf, scoreRun, type RoomKey, type ScoredProposal } from '../src/engine/score.js'
import { freshDb, repoRoot, TEST_OPERATOR } from './helpers.js'

const key = JSON.parse(
  readFileSync(join(repoRoot, 'fixtures', 'room-records', 'mechanical-room_2026-08-10.json'), 'utf8'),
) as RoomKey

const STOP = new Set(['the', 'and', 'for', 'with', 'in', 'of', 'to', 'a', 'an', 'house', 'system'])
const matches = (expected: string, p: ScoredProposal): boolean => {
  const want = expected.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w))
  return want.length > 0 && want.every((w) => p.label.toLowerCase().includes(w))
}

const PROPERTY = 'prop-1', VISIT = 'visit-1', MECH = 'zone-mech'

/** A database holding the real key's room, so the equivalence is tested on it. */
function seededRun(): { db: Db; importId: string } {
  const db = freshDb()
  db.prepare(`INSERT INTO properties (id, label, created_at, actor_id) VALUES (?, 'A house', ?, ?)`).run(PROPERTY, now(), TEST_OPERATOR)
  db.prepare(`INSERT INTO visits (id, property_id, kind, created_at, actor_id) VALUES (?, ?, 'baseline', ?, ?)`).run(VISIT, PROPERTY, now(), TEST_OPERATOR)
  const importId = newId()
  db.prepare(
    `INSERT INTO imports (id, visit_id, property_id, imported_at, media_mode, raw_manifest, validation_report, status, created_at, actor_id)
     VALUES (?, ?, ?, ?, 'full', '{}', '{}', 'ok', ?, ?)`,
  ).run(importId, VISIT, PROPERTY, now(), now(), TEST_OPERATOR)
  db.prepare(
    `INSERT INTO zones (zone_id, import_id, property_id, visit_id, type, label, level, created_at)
     VALUES (?, ?, ?, ?, 'mechanical', 'Mechanical room', 'basement', ?)`,
  ).run(MECH, importId, PROPERTY, VISIT, now())

  const media = db.prepare(
    `INSERT OR IGNORE INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind, owner_zone_id,
                                  owner_pin_id, owner_canvas_id, file, file_status, created_at)
     VALUES (?, ?, ?, ?, 'photo', 'zone', ?, NULL, NULL, ?, 'absent', ?)`,
  )
  for (const f of new Set(key.confirmed_objects.flatMap((o) => o.photographs))) {
    media.run(mediaIdOf(f), importId, PROPERTY, VISIT, MECH, f, now())
  }

  const insert = db.prepare(
    `INSERT INTO objects (id, property_id, zone_id, import_id, class_id, label, actor_id, derived_from, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
  )
  const link = db.prepare('INSERT OR IGNORE INTO object_media (object_id, media_id, created_at) VALUES (?, ?, ?)')
  key.confirmed_objects.forEach((o, i) => {
    const id = newId()
    insert.run(id, PROPERTY, MECH, importId, o.role ?? o.product ?? '', TEST_OPERATOR, i % 2 ? 'plate' : 'appearance', now())
    link.run(id, mediaIdOf(o.photographs[0]!), now())
  })
  return { db, importId }
}

const fromDb = (db: Db, importId: string): ScoredProposal[] =>
  proposalsForImport(db, importId, MECH).map((p) => ({
    id: p.id, label: p.label, classId: p.classId, mediaIds: p.mediaIds, lane: p.derivedFrom, models: [],
  }))

describe('⚑ a fixture scores identically to the database it came from', () => {
  it('produces the same report through a JSON round trip', () => {
    // If this ever fails the ruling is unsound: the fixture would be a second
    // measurement wearing the first one's name, and every score taken from one
    // would be uncomparable with every score taken from the other.
    const { db, importId } = seededRun()
    const live = fromDb(db, importId)

    const fixture = parseFixture(
      JSON.parse(JSON.stringify(buildFixture({ visitId: VISIT, importId, zone: 'mech', producedAt: '2026-08-12T00:00:00Z' }, live))),
    )

    const a = scoreRun(key, live, matches)
    const b = scoreRun(key, proposalsOf(fixture), matches)
    assert.deepEqual(b.counts, a.counts)
    assert.deepEqual(b.byLane, a.byLane)
    assert.deepEqual(b.falsePositives, a.falsePositives)
    assert.deepEqual(b.judged.map((j) => [j.expected, j.outcome, j.lanes]), a.judged.map((j) => [j.expected, j.outcome, j.lanes]))
    assert.equal(a.counts.correct, 32, 'and it is the known answer, not merely a matching pair')
  })

  it('carries the provenance a score needs to name its run', () => {
    // Doctrine 3 — 32 correct against WHICH room, WHICH import, on what day.
    const f = buildFixture({ visitId: VISIT, importId: 'imp-9', zone: null, producedAt: '2026-08-12T00:00:00Z', note: 'fast tier' }, [])
    assert.equal(f.provenance.importId, 'imp-9')
    assert.equal(f.provenance.note, 'fast tier')
  })
})

describe('fail closed on structure, fail open on vocabulary — doctrine 7', () => {
  const ok = buildFixture({ visitId: 'v', importId: 'i', zone: null, producedAt: 'x' }, [
    { id: 'a', label: 'a water heater', classId: null, mediaIds: ['m1'], lane: 'plate', models: [] },
  ])

  it('refuses a schema version it does not read', () => {
    assert.throws(() => parseFixture({ ...ok, schemaVersion: 2 }), /schemaVersion is 2/)
  })

  it('refuses a fixture with no proposals array', () => {
    assert.throws(() => parseFixture({ schemaVersion: 1, provenance: ok.provenance }), /no proposals array/)
  })

  it('refuses a fixture whose provenance names no run', () => {
    assert.throws(() => parseFixture({ schemaVersion: 1, proposals: [], provenance: {} }), /names no run/)
  })

  it('refuses a proposal with no label', () => {
    assert.throws(() => parseFixture({ ...ok, proposals: [{ id: 'a', mediaIds: [] }] }), /no id or label/)
  })

  it('preserves a lane this build has never met', () => {
    // Fail open on vocabulary. A lane is a word, and the rule is the same one
    // that governs every other open vocabulary in this repo.
    const f = parseFixture({ ...ok, proposals: [{ ...ok.proposals[0], lane: 'a-lane-from-pass-4' }] })
    assert.equal(f.proposals[0]!.lane, 'a-lane-from-pass-4')
    assert.equal(proposalsOf(f)[0]!.lane, 'a-lane-from-pass-4')
  })
})

// ------------------------------------------------------------------- the scan

describe('the personal-data scan, validated against known answers', () => {
  const p = (label: string, models: string[] = []): FixtureProposal =>
    ({ id: 'x', label, classId: null, mediaIds: [], lane: null, models })

  it('catches the five shapes it claims to catch', () => {
    const cases: [string, string][] = [
      ['Pressure test tag at 1 Nowhere Road', 'address'],
      ['Installer 613-555-0142', 'phone'],
      ['Tag showing A1A 1A1', 'postal-code'],
      ['contact nobody@example.invalid', 'email'],
      ['Gas fitter licence 12345', 'licence-or-registration'],
    ]
    for (const [label, kind] of cases) {
      const hits = scanForPersonalData([p(label)])
      assert.equal(hits.length, 1, `"${label}" should produce one hit`)
      assert.equal(hits[0]!.kind, kind)
    }
  })

  it('⚑ does NOT fire on the model numbers a real mechanical room is full of', () => {
    // This is the half that decides whether the scan gets read. A scan that
    // flags every serial in the house is one nobody looks at by the third run —
    // and every string below is from the owner's own committed room record.
    const clean = [
      'TTV049BGC01ARKS', 'Q13734509', 'UP26-99F', 'UPS26-99U', '45MJH1B1STAA',
      '600545B', 'CH32197-1', '082312210030', 'EQ9685', 'WDBJ', 'PC1 / 153713',
      '0-100 psi', '40-60 psig', '120 gal / 454.3 L', '22,000 A at 120/240 V',
      'Waterite control valve head', '10% ethanol ground-loop makeup feeder',
    ]
    for (const s of clean) {
      assert.deepEqual(scanForPersonalData([p(s)]), [], `"${s}" must not be flagged`)
      assert.deepEqual(scanForPersonalData([p('a thing', [s])]), [], `"${s}" in a model field must not be flagged`)
    }
  })

  it('scans model fields as well as labels, and says which', () => {
    const hits = scanForPersonalData([p('a gas tag', ['reg no. AB1234'])])
    assert.equal(hits.length, 1)
    assert.equal(hits[0]!.where, 'model')
  })

  it('names the proposal, so a reviewer can go and look at it', () => {
    const hits = scanForPersonalData([{ ...p('at 1 Nowhere Road'), id: 'obj-7' }])
    assert.equal(hits[0]!.proposalId, 'obj-7')
  })

  it('is clean on the whole of a real run, which is why the caveat is printed', () => {
    // ⚑ And this is exactly why `npm run proposals` says a clean scan is NOT
    // permission to commit: the owner's mechanical room passes, and one of its
    // photographs carries an address, a name, a phone number and two licence
    // numbers. **Nothing in the labels happens to quote them today.**
    const { db, importId } = seededRun()
    const f = buildFixture({ visitId: VISIT, importId, zone: null, producedAt: 'x' }, fromDb(db, importId))
    assert.deepEqual(scanForPersonalData(f.proposals), [])
  })
})

describe('⚑ a re-run appends, and the fixture can name which run it holds', () => {
  it('carries the generation that proposed each object', () => {
    // The run discriminator. `import_id` and the lane are identical across runs,
    // so without this a fixture written after `--again` mixes two runs and
    // scores a number naming neither — `splitByPass`'s failure one level down.
    const f = buildFixture({ visitId: 'v', importId: 'i', zone: null, producedAt: 'x' }, [
      { id: 'a', label: 'run one', classId: null, mediaIds: ['m1'], lane: 'plate', generationId: 'gen-1' },
      { id: 'b', label: 'run two', classId: null, mediaIds: ['m1'], lane: 'plate', generationId: 'gen-2' },
    ])
    assert.deepEqual(f.proposals.map((p) => p.generationId), ['gen-1', 'gen-2'])
    const back = parseFixture(JSON.parse(JSON.stringify(f)))
    assert.deepEqual(back.proposals.map((p) => p.generationId), ['gen-1', 'gen-2'])
    assert.deepEqual(proposalsOf(back).map((p) => p.generationId), ['gen-1', 'gen-2'])
  })

  it('reads a fixture with no generations at all, because the 2026-08-13 one has none', () => {
    // Fail closed on structure, not on a field that post-dates a committed
    // artifact. The first real run's fixture predates this column.
    const f = parseFixture({
      schemaVersion: 1,
      provenance: { visitId: 'v', importId: 'i' },
      proposals: [{ id: 'a', label: 'x', mediaIds: [] }],
    })
    assert.equal(f.proposals[0]!.generationId, undefined)
    assert.equal(proposalsOf(f)[0]!.generationId, null)
  })
})
