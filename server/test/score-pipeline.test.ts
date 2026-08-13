/**
 * The scoring harness end to end, against the REAL room record.
 *
 * ⚑ **The rule this file exists for is unnumbered, and that is stated rather
 * than papered over:** *a measurement is validated against known answers before
 * its number is used.* The Verification Discipline note stops at rule 16 —
 * numbering past it is the owner's, not a code session's.
 *
 * **`score.test.ts` deliberately builds miniature keys**, and it is right to:
 * the six rules do not need a real basement to be checked, and a test that
 * loaded one would be checking a house rather than a rule.
 *
 * ⚑ **This file exists because that leaves something unchecked.** *A measurement
 * is validated against known answers before its number is used* — and the number
 * that will be used is the one `npm run score` prints, through the real SQL,
 * against the real 34-object key, with the real filename shapes. **None of that
 * chain was covered.** The rules were tested and the instrument was not.
 *
 * So every case here is a run whose score is derivable by hand before it is run:
 *
 * | the run | the answer, known in advance |
 * |---|---|
 * | one proposal per confirmed object, labelled with its role | **32 correct, 2 key-uncertain** — the key has 34 objects and two with no role |
 * | the same photographs, every label replaced by "a box" | **0 correct, 32 wrong** — same overlap, no role agrees |
 * | no proposals at all | **34 missed** |
 *
 * ⚑ **The second is the one that matters.** It is Verification Discipline rule 16
 * — *a check whose output does not depend on what it checks is not a check* —
 * pointed at the instrument instead of at a check: *a reading that does not move
 * when the thing it measures changes is not measuring it.* **The photographs are identical across the first
 * two runs and the score goes from 32/0 to 0/32**, which is the only way to know
 * the overlap is not doing all the work.
 *
 * **No photographs are read and no model is called.** The key names files; this
 * builds media rows with those ids and nothing else.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { newId, now, type Db } from '../src/db/index.js'
import { proposalsForImport } from '../src/engine/compare.js'
import {
  mediaIdOf, passOf, scoreRun, splitByPass, UNLANED,
  type RoomKey, type ScoredProposal,
} from '../src/engine/score.js'
import { freshDb, repoRoot, TEST_OPERATOR } from './helpers.js'

/** The owner's own mechanical room, committed by his ruling of 2026-08-11. */
const key = JSON.parse(
  readFileSync(join(repoRoot, 'fixtures', 'room-records', 'mechanical-room_2026-08-10.json'), 'utf8'),
) as RoomKey

const PROPERTY = 'prop-1'
const VISIT = 'visit-1'
const MECH = 'zone-mech'

/**
 * The matcher from `scripts/score.ts`, copied rather than imported.
 *
 * **The script cannot be imported** — it runs on import and calls `process.exit`.
 * *So this is a duplicate, which is the shape that has drifted four times in this
 * repo*, and the last test in this file is the guard: it reads the script's
 * source and fails if the two ever separate.
 */
const STOP = new Set(['the', 'and', 'for', 'with', 'in', 'of', 'to', 'a', 'an', 'house', 'system'])
const matches = (expected: string, p: ScoredProposal): boolean => {
  const want = expected.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w))
  const label = p.label.toLowerCase()
  return want.length > 0 && want.every((w) => label.includes(w))
}

/** A database holding the key's photographs as media rows, and nothing else. */
function seed(): { db: Db; importId: string } {
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
  db.prepare(
    `INSERT INTO zones (zone_id, import_id, property_id, visit_id, type, label, level, created_at)
     VALUES (?, ?, ?, ?, 'mechanical', 'Mechanical room', 'basement', ?)`,
  ).run(MECH, importId, PROPERTY, VISIT, now())

  const media = db.prepare(
    `INSERT OR IGNORE INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind,
                                  owner_zone_id, owner_pin_id, owner_canvas_id, file, file_status, created_at)
     VALUES (?, ?, ?, ?, 'photo', 'zone', ?, NULL, NULL, ?, 'absent', ?)`,
  )
  for (const f of new Set(key.confirmed_objects.flatMap((o) => o.photographs))) {
    media.run(mediaIdOf(f), importId, PROPERTY, VISIT, MECH, f, now())
  }
  return { db, importId }
}

/** Write one object per confirmed key object, with a chosen label and lane. */
function writeRun(
  db: Db,
  importId: string,
  opts: { label: (role: string | null, product: string | null, i: number) => string; lane?: (i: number) => string | null },
): void {
  const insert = db.prepare(
    `INSERT INTO objects (id, property_id, zone_id, import_id, class_id, label, confirmed_by, confirmed_at,
                          actor_id, generation_id, derived_from, resolution_id, parent_object_id, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, NULL, NULL, ?, NULL, ?, NULL, NULL, ?)`,
  )
  const link = db.prepare('INSERT OR IGNORE INTO object_media (object_id, media_id, created_at) VALUES (?, ?, ?)')
  key.confirmed_objects.forEach((o, i) => {
    const id = newId()
    insert.run(id, PROPERTY, MECH, importId, opts.label(o.role, o.product, i), TEST_OPERATOR, opts.lane?.(i) ?? null, now())
    // Its FIRST photograph only. Enough for overlap, and it keeps the run's
    // media set a strict subset of the key's so a false positive can only come
    // from a proposal this test deliberately added.
    const first = o.photographs[0]
    if (first !== undefined) link.run(id, mediaIdOf(first), now())
  })
}

/** Exactly what `scripts/score.ts` builds, minus the plate models. */
const proposalsOf = (db: Db, importId: string): ScoredProposal[] =>
  proposalsForImport(db, importId, 'every-pass', MECH).map((p) => ({
    id: p.id, label: p.label, classId: p.classId, mediaIds: p.mediaIds, lane: p.derivedFrom,
  }))

// --------------------------------------------------------------- known answers

describe('the harness is validated against known answers before its number is used', () => {
  it('the key is 34 confirmed objects, two of them without a role', () => {
    // Every expected count below is derived from these two numbers, so they are
    // asserted rather than assumed. If the key gains an object this fails first
    // and says which arithmetic to redo.
    assert.equal(key.confirmed_objects.length, 34)
    assert.equal(key.confirmed_objects.filter((o) => o.role === null).length, 2)
  })

  it('scores a perfect run 32 correct and 2 key-uncertain, with nothing missed', () => {
    const { db, importId } = seed()
    writeRun(db, importId, { label: (role, product) => role ?? product ?? '' })
    const r = scoreRun(key, proposalsOf(db, importId), matches)

    assert.equal(r.counts.correct, 32)
    assert.equal(r.counts['key-uncertain'], 2)
    assert.equal(r.counts.wrong, 0)
    assert.equal(r.missed.length, 0)
    assert.equal(r.falsePositives.length, 0)
    assert.equal(r.matched, 34)
  })

  it('⚑ moves to 0 correct and 32 wrong on the SAME photographs when the labels change', () => {
    // Rule 16 in the harness's own terms. If the score did not move, the overlap
    // would be doing all the work and the labels none of it — and a run that
    // named every object "a box" would score as well as one that read them.
    const { db, importId } = seed()
    writeRun(db, importId, { label: () => 'a box' })
    const r = scoreRun(key, proposalsOf(db, importId), matches)

    assert.equal(r.counts.correct, 0)
    assert.equal(r.counts.wrong, 32)
    assert.equal(r.counts['key-uncertain'], 2)
    assert.equal(r.missed.length, 0, 'the photographs still overlap, so nothing is missed')
    assert.equal(r.falsePositives.length, 0, 'every proposal still answers some key object')
  })

  it('scores an empty run as 34 missed rather than as nothing to report', () => {
    const { db, importId } = seed()
    const r = scoreRun(key, proposalsOf(db, importId), matches)
    assert.equal(r.missed.length, 34)
    assert.equal(r.counts.wrong, 34)
    assert.equal(r.matched, 0)
  })

  it('counts a proposal citing a photograph the key does not name as a false positive', () => {
    const { db, importId } = seed()
    writeRun(db, importId, { label: (role, product) => role ?? product ?? '' })
    db.prepare(
      `INSERT INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind, owner_zone_id,
                          owner_pin_id, owner_canvas_id, file, file_status, created_at)
       VALUES ('m-not-in-key', ?, ?, ?, 'photo', 'zone', ?, NULL, NULL, 'x.jpg', 'absent', ?)`,
    ).run(importId, PROPERTY, VISIT, MECH, now())
    const id = newId()
    db.prepare(
      `INSERT INTO objects (id, property_id, zone_id, import_id, class_id, label, actor_id, derived_from, created_at)
       VALUES (?, ?, ?, ?, NULL, 'a thing nobody confirmed', ?, 'appearance', ?)`,
    ).run(id, PROPERTY, MECH, importId, TEST_OPERATOR, now())
    db.prepare('INSERT INTO object_media (object_id, media_id, created_at) VALUES (?, ?, ?)')
      .run(id, 'm-not-in-key', now())

    const r = scoreRun(key, proposalsOf(db, importId), matches)
    assert.equal(r.falsePositives.length, 1)
    assert.equal(r.falsePositives[0]!.label, 'a thing nobody confirmed')
    assert.equal(r.falsePositives[0]!.lane, 'appearance', 'a false positive names the lane that produced it')
  })

  it('strips the download suffix on every filename the real key carries', () => {
    // The `(1)` is a browser de-duplication suffix, not part of the id. Getting
    // this wrong would score every duplicated photograph as a miss, silently,
    // and the harness would read as an engine failure.
    const suffixed = key.confirmed_objects.flatMap((o) => o.photographs).filter((f) => /\(\d+\)\./.test(f))
    assert.ok(suffixed.length > 0, 'the real key does carry suffixed filenames')
    for (const f of suffixed) assert.doesNotMatch(mediaIdOf(f), /[()]|\./)
  })
})

// ------------------------------------------------------------ rule 7, the lanes

describe('rule 7 — a score names the lane that earned it', () => {
  it('attributes each outcome to the lane whose proposal answered', () => {
    const { db, importId } = seed()
    // Odd objects plate-derived, even appearance-derived — an arbitrary split
    // whose only job is to make the two lanes distinguishable in the output.
    writeRun(db, importId, {
      label: (role, product) => role ?? product ?? '',
      lane: (i) => (i % 2 === 0 ? 'plate' : 'appearance'),
    })
    const r = scoreRun(key, proposalsOf(db, importId), matches)

    assert.deepEqual(Object.keys(r.byLane).sort(), ['appearance', 'plate'])
    assert.equal(r.byLane.plate!.proposals + r.byLane.appearance!.proposals, 34)

    // ⚑ The rows do NOT sum to the totals, and this is the assertion that says
    // so with a reason rather than an inequality: every credit is one lane on
    // one judgement, and a judgement two lanes answered credits both.
    const correct = r.judged.filter((j) => j.outcome === 'correct')
    const credits = correct.reduce((n, j) => n + j.lanes.length, 0)
    assert.equal(r.byLane.plate!.correct + r.byLane.appearance!.correct, credits)
    assert.equal(correct.length, r.counts.correct)
    assert.ok(credits > correct.length, 'the real key does contain objects two proposals answer')
  })

  it('⚑ names the two objects the crude matcher lets a second proposal answer', () => {
    // Found by this file rather than reasoned about: on a run where every label
    // is exactly the key's role, TWO key objects are matched by a second
    // proposal as well as their own — because the matcher asks whether the
    // role's words appear in the label, and a PART named after its WHOLE
    // contains them all.
    //
    // **The score is unaffected** — the right proposal matched too, so the
    // outcome is `correct` either way. **The lane attribution is not**: a lane
    // that produced only the brine tank is credited with identifying the
    // softener. *Recorded here because a number used to judge a scaffold should
    // not carry an unnamed way of being generous to it.*
    const { db, importId } = seed()
    writeRun(db, importId, { label: (role, product) => role ?? product ?? '' })
    const r = scoreRun(key, proposalsOf(db, importId), matches)

    const doubled = r.judged.filter((j) => j.outcome === 'correct' && j.proposalLabels.filter((l) => matches(j.expected!, { id: '', label: l, classId: null, mediaIds: [] })).length > 1)
    assert.deepEqual(doubled.map((j) => j.expected).sort(), [
      '10% ethanol ground-loop makeup feeder',
      'water softener',
    ])
  })

  it('credits a correct answer to the lane that matched, not to one standing beside it', () => {
    // Two proposals on one photograph: one answers the key, one does not. The
    // second must not be credited with the first's correct answer — otherwise a
    // lane that produced noise scores as a lane that produced the identification.
    const k: RoomKey = {
      confirmed_objects: [{ product: null, role: 'sewage ejector', photographs: ['m1.jpg'] }],
    }
    const r = scoreRun(
      k,
      [
        { id: 'a', label: 'sewage ejector', classId: null, mediaIds: ['m1'], lane: 'plate' },
        { id: 'b', label: 'a pipe', classId: null, mediaIds: ['m1'], lane: 'appearance' },
      ],
      matches,
    )
    assert.equal(r.counts.correct, 1)
    assert.deepEqual(r.judged[0]!.lanes, ['plate'])
    assert.equal(r.byLane.plate!.correct, 1)
    assert.equal(r.byLane.appearance!.correct, 0)
    assert.equal(r.byLane.appearance!.proposals, 1, 'it still shows up as having proposed something')
  })

  it('credits a wrong answer to every lane that cited the photograph', () => {
    // The reverse: when nothing matched, both lanes share the failure, because
    // both looked at the photograph and neither named the thing.
    const k: RoomKey = {
      confirmed_objects: [{ product: null, role: 'sewage ejector', photographs: ['m1.jpg'] }],
    }
    const r = scoreRun(
      k,
      [
        { id: 'a', label: 'a box', classId: null, mediaIds: ['m1'], lane: 'plate' },
        { id: 'b', label: 'a pipe', classId: null, mediaIds: ['m1'], lane: 'appearance' },
      ],
      matches,
    )
    assert.deepEqual(r.judged[0]!.lanes, ['appearance', 'plate'])
    assert.equal(r.byLane.plate!.wrong, 1)
    assert.equal(r.byLane.appearance!.wrong, 1)
  })

  it('credits no lane with a miss, and says so by leaving the list empty', () => {
    const k: RoomKey = { confirmed_objects: [{ product: null, role: 'a well pump', photographs: ['m9.jpg'] }] }
    const r = scoreRun(k, [{ id: 'a', label: 'a box', classId: null, mediaIds: ['m1'], lane: 'plate' }], matches)
    assert.deepEqual(r.missed[0]!.lanes, [])
    assert.equal(r.byLane.plate!.wrong, 0, 'nothing proposed it, so no lane is wrong about it')
    assert.equal(r.counts.wrong, 1, 'the total still carries it')
  })

  it('names the unlaned lane rather than leaving the column blank', () => {
    const k: RoomKey = { confirmed_objects: [{ product: null, role: 'a well pump', photographs: ['m1.jpg'] }] }
    const r = scoreRun(k, [{ id: 'a', label: 'a well pump', classId: null, mediaIds: ['m1'] }], matches)
    assert.deepEqual(Object.keys(r.byLane), [UNLANED])
  })
})

// -------------------------------------------------- two passes, never one number

describe('⚑ two passes are scored apart, because their union names neither', () => {
  it('reads the lane out of the database rather than inferring it from a label', () => {
    const { db, importId } = seed()
    writeRun(db, importId, { label: (role, product) => role ?? product ?? '', lane: () => 'plate' })
    assert.ok(proposalsForImport(db, importId, 'every-pass', MECH).every((p) => p.derivedFrom === 'plate'))
  })

  it('splits an import both passes wrote into two runs, each with the whole key', () => {
    const { db, importId } = seed()
    writeRun(db, importId, { label: (role, product) => role ?? product ?? '', lane: () => 'plate' })
    writeRun(db, importId, { label: (role, product) => role ?? product ?? '' }) // stage 4: no lane

    const all = proposalsOf(db, importId)
    assert.equal(all.length, 68, 'both passes wrote the room')

    const split = splitByPass(all)
    assert.equal(split.match.length, 34)
    assert.equal(split.identify.length, 34)

    // Each pass scores as itself. Together they would report 68 proposals
    // against 34 objects — two shots at every one, and a number naming neither.
    for (const run of [split.match, split.identify]) {
      const r = scoreRun(key, run, matches)
      assert.equal(r.counts.correct, 32)
      assert.equal(r.falsePositives.length, 0)
    }
  })

  it('shows what the blended number would have said, which is why it is not printed', () => {
    // Not an aspiration — this is what `npm run score` printed until 2026-08-12
    // on any machine where `npm run identify` had ever been typed.
    const { db, importId } = seed()
    writeRun(db, importId, { label: (role, product) => role ?? product ?? '', lane: () => 'plate' })
    writeRun(db, importId, { label: () => 'a box' })

    const blended = scoreRun(key, proposalsOf(db, importId), matches)
    assert.equal(blended.counts.correct, 32, 'the good pass carries the bad one entirely')
    assert.equal(blended.counts.wrong, 0, '⚑ 34 useless proposals cost the score nothing')

    const split = splitByPass(proposalsOf(db, importId))
    assert.equal(scoreRun(key, split.identify, matches).counts.correct, 0, 'scored apart, the bad pass is visibly bad')
  })

  it('assigns a pass from the lane alone', () => {
    assert.equal(passOf(null), 'identify')
    assert.equal(passOf(undefined), 'identify')
    assert.equal(passOf('plate'), 'match')
    assert.equal(passOf('appearance'), 'match')
    // Fail open: a lane this build has not met is still pass 3's, because pass 3
    // is the only thing that writes the column.
    assert.equal(passOf('a-lane-nobody-has-added-yet'), 'match')
  })
})

// ------------------------------------------------------------------- the guard

describe('the duplicated matcher, guarded', () => {
  it('is still the matcher the script uses', () => {
    // ⚑ Any hand-kept copy of something in another file gets a check that fails,
    // not a comment saying keep in sync. The script cannot be imported — it runs
    // on import — so the source is read instead.
    const src = readFileSync(join(repoRoot, 'server', 'scripts', 'score.ts'), 'utf8')
    const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()
    const inScript = /const STOP = new Set\(\[[^\]]*\]\)[\s\S]*?const matches = [^\n]*\n(?:[^\n]*\n){2}[^\n]*/.exec(src)
    assert.ok(inScript, 'the script still defines STOP and matches')
    for (const word of ['the', 'and', 'for', 'with', 'in', 'of', 'to', 'a', 'an', 'house', 'system']) {
      assert.ok(new RegExp(`'${word}'`).test(inScript[0]), `the script's STOP list still holds "${word}"`)
    }
    assert.ok(norm(inScript[0]).includes('w.length > 3'), "the script still drops words of three characters or fewer")
  })
})
