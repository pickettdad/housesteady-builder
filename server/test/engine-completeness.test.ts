/**
 * §E — the property pass cannot run against a half-loaded house.
 *
 * **The walk fixture is the hardest case and it was already sitting there.** It
 * imports `manifest_only`, so 163 media rows are declared and none is on disk.
 * That reads identically to a house nobody photographed, which is precisely why
 * completeness cannot be derived from an empty work queue.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  candidateReasons,
  declareNoMedia,
  liveNoMediaDeclarations,
  NO_MEDIA_KIND,
  propertyReadiness,
  refusalNote,
} from '../src/engine/completeness.js'
import { writeOverlay } from '../src/overlay/store.js'
import type { Db } from '../src/db/index.js'
import { runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, readWalk, repoRoot, scratchDir, TEST_OPERATOR } from './helpers.js'

interface Walked {
  db: Db
  propertyId: string
  visitId: string
  importId: string
}

async function walked(): Promise<Walked> {
  const db = freshDb()
  const ids = makePropertyAndVisit(db, { kind: 'baseline' })
  const { importId } = await runImport({
    actorId: TEST_OPERATOR, db, ...ids, raw: readWalk(), dataDir: scratchDir(),
  })
  return { db, ...ids, importId }
}

/** Every zone that has media, marked loaded — the state the owner's machine is in. */
const loadAll = (w: Walked): void => {
  w.db.prepare("UPDATE media SET file_status = 'present' WHERE import_id = ?").run(w.importId)
}

const zoneIds = (w: Walked): { zone_id: string; label: string | null }[] =>
  w.db.prepare('SELECT zone_id, label FROM zones WHERE import_id = ?').all(w.importId) as {
    zone_id: string
    label: string | null
  }[]

const allIdentified = (w: Walked): Set<string> => new Set(zoneIds(w).map((z) => z.zone_id))

describe('§E — completeness is derived from facts, never from an empty queue', () => {
  it('refuses a house whose photographs are declared but not loaded', async () => {
    // The fixture's own state, and the failure §E exists for: nothing is queued
    // and nothing has been looked at.
    const w = await walked()
    const r = propertyReadiness({ db: w.db, importId: w.importId, identifiedZones: allIdentified(w) })
    assert.equal(r.ready, false)
    assert.ok(r.ready === false)
    assert.ok(r.blockers.length > 0)
    assert.ok(
      r.blockers.filter((b) => b.state === 'media-not-loaded').length >= 5,
      'every zone with declared media blocks while its files are missing',
    )
  })

  it('says which rooms and why, rather than only that it refused', async () => {
    const w = await walked()
    const r = propertyReadiness({ db: w.db, importId: w.importId, identifiedZones: allIdentified(w) })
    assert.ok(r.ready === false)
    const note = refusalNote(r)
    assert.match(note, /The property pass did not run/)
    assert.match(note, /mechanical room declares 59 files and 0 are on this machine/)
    assert.match(note, /confident absences about rooms nobody has looked at/)
  })

  it('still refuses once media loads, until identification has run', async () => {
    const w = await walked()
    loadAll(w)
    const r = propertyReadiness({ db: w.db, importId: w.importId, identifiedZones: new Set() })
    assert.ok(r.ready === false)
    assert.ok(r.blockers.every((b) => b.state === 'awaiting-identification' || b.state === 'empty-undeclared'))
  })

  it('will not treat an empty zone as captured without somebody saying so', async () => {
    // The attic has no media at all. A room that was visited and had nothing to
    // photograph and a room nobody entered look identical here.
    const w = await walked()
    loadAll(w)
    const r = propertyReadiness({ db: w.db, importId: w.importId, identifiedZones: allIdentified(w) })
    assert.ok(r.ready === false)
    const attic = r.blockers.find((b) => b.label === 'attic')
    assert.ok(attic, 'the attic blocks')
    assert.equal(attic.state, 'empty-undeclared')
    assert.match(attic.note, /nobody has recorded why/)
  })

  it('is ready once every zone is identified or recorded as having nothing', async () => {
    const w = await walked()
    loadAll(w)
    // Taken from the readiness result rather than from a query of its own — the
    // ownership rule has one home, and a test asking it a second way would be
    // the same drift this module was just corrected for.
    const first = propertyReadiness({ db: w.db, importId: w.importId, identifiedZones: allIdentified(w) })
    const empties = first.zones.filter((z) => z.state === 'empty-undeclared')
    assert.equal(empties.length, 1, 'only the attic carries no media at all')
    for (const z of empties) {
      declareNoMedia({
        db: w.db, propertyId: w.propertyId, visitId: w.visitId, importId: w.importId,
        zoneId: z.zoneId, reason: 'nothing to photograph on this visit', actorId: TEST_OPERATOR,
      })
    }

    const r = propertyReadiness({ db: w.db, importId: w.importId, identifiedZones: allIdentified(w) })
    assert.ok(r.ready === true, 'ready')
    assert.equal(r.zones.length, 8)
    assert.equal(r.zones.filter((z) => z.state === 'empty-declared').length, 1)
    assert.equal(
      r.zones.find((z) => z.label === 'attic')?.declaredReason,
      'nothing to photograph on this visit',
    )
  })

  it('needs a reason, because the reason is the data', async () => {
    const w = await walked()
    const z = zoneIds(w)[0]!
    assert.throws(
      () =>
        declareNoMedia({
          db: w.db, propertyId: w.propertyId, visitId: w.visitId, importId: w.importId,
          zoneId: z.zone_id, reason: '   ', actorId: TEST_OPERATOR,
        }),
      /has to say why/,
    )
  })

  it('lets a declaration be taken back, and stops counting it', async () => {
    // Nothing is deleted. A zone declared empty and then corrected reads as
    // undeclared again rather than staying stale.
    const w = await walked()
    loadAll(w)
    const attic = zoneIds(w).find((z) => z.label === 'attic')!
    declareNoMedia({
      db: w.db, propertyId: w.propertyId, visitId: w.visitId, importId: w.importId,
      zoneId: attic.zone_id, reason: 'nothing up there', actorId: TEST_OPERATOR,
    })
    assert.equal(liveNoMediaDeclarations(w.db, w.importId).size, 1)

    const written = w.db
      .prepare('SELECT id FROM overlays WHERE kind = ? AND target_id = ?')
      .get(NO_MEDIA_KIND, attic.zone_id) as { id: string }
    writeOverlay({
      db: w.db, propertyId: w.propertyId, visitId: w.visitId,
      kind: 'undo', targetKind: 'zone', targetId: attic.zone_id,
      supersedesId: written.id, actorId: TEST_OPERATOR,
    })

    assert.equal(liveNoMediaDeclarations(w.db, w.importId).size, 0, 'the retraction takes effect')
    const r = propertyReadiness({ db: w.db, importId: w.importId, identifiedZones: allIdentified(w) })
    assert.ok(r.ready === false)
    assert.equal(r.zones.find((z) => z.label === 'attic')?.state, 'empty-undeclared')
    // And the act itself is still in the record — undo is a row, never a delete.
    assert.equal(
      (w.db.prepare('SELECT COUNT(*) n FROM overlays WHERE kind = ?').get(NO_MEDIA_KIND) as { n: number }).n,
      1,
    )
  })

  it('refuses a partly-loaded zone, not just an empty one', async () => {
    const w = await walked()
    loadAll(w)
    const mech = zoneIds(w).find((z) => z.label === 'mechanical room')!
    w.db
      .prepare(
        `UPDATE media SET file_status = 'absent'
          WHERE import_id = ? AND owner_zone_id = ? AND media_id IN (
            SELECT media_id FROM media WHERE import_id = ? AND owner_zone_id = ? LIMIT 3)`,
      )
      .run(w.importId, mech.zone_id, w.importId, mech.zone_id)

    const r = propertyReadiness({ db: w.db, importId: w.importId, identifiedZones: allIdentified(w) })
    assert.ok(r.ready === false)
    const b = r.blockers.find((x) => x.label === 'mechanical room')!
    assert.equal(b.state, 'media-not-loaded')
    assert.match(b.note, /declares 59 files and 56 are on this machine/)
  })

  it('treats an empty identified-zone set as not ready, rather than as nothing to do', async () => {
    // The exact confusion §E names: an empty set of completed work is not
    // evidence that the work was done.
    const w = await walked()
    loadAll(w)
    const r = propertyReadiness({ db: w.db, importId: w.importId, identifiedZones: new Set() })
    assert.ok(r.ready === false)
    assert.ok(r.blockers.some((b) => b.state === 'awaiting-identification'))
  })
})

describe('the boundary — a zone with media cannot be declared empty', () => {
  it('refuses the declaration outright', async () => {
    // Nothing stopped this before. It is the one route by which capture-none
    // could launder a hole into an explanation: a zone with 59 photographs that
    // have not been loaded would go from "the files are not here" to "there is
    // nothing to load", and readiness would pass over a room whose photographs
    // exist and are simply elsewhere.
    const w = await walked()
    const mech = zoneIds(w).find((z) => z.label === 'mechanical room')!
    assert.throws(
      () =>
        declareNoMedia({
          db: w.db, propertyId: w.propertyId, visitId: w.visitId, importId: w.importId,
          zoneId: mech.zone_id, reason: 'nothing in there', actorId: TEST_OPERATOR,
        }),
      /declares 59 media files, so it cannot be recorded as having none/,
    )
  })

  it('refuses it whether or not the files have been loaded', async () => {
    // The declaration is about what the manifest says exists, not about what is
    // on this machine today. Loading the files changes neither answer.
    const w = await walked()
    loadAll(w)
    const kitchen = zoneIds(w).find((z) => z.label === 'kitchen')!
    assert.throws(
      () =>
        declareNoMedia({
          db: w.db, propertyId: w.propertyId, visitId: w.visitId, importId: w.importId,
          zoneId: kitchen.zone_id, reason: 'empty', actorId: TEST_OPERATOR,
        }),
      /cannot be recorded as having none/,
    )
  })

  it('still allows it on a zone the manifest gives nothing', async () => {
    const w = await walked()
    const attic = zoneIds(w).find((z) => z.label === 'attic')!
    declareNoMedia({
      db: w.db, propertyId: w.propertyId, visitId: w.visitId, importId: w.importId,
      zoneId: attic.zone_id, reason: 'no access', actorId: TEST_OPERATOR,
    })
    assert.equal(liveNoMediaDeclarations(w.db, w.importId).get(attic.zone_id), 'no access')
  })
})

describe('candidate reasons — the record already answered this', () => {
  it('offers what the field said about the attic', async () => {
    // att.access-honesty resolved `via choice` with the value "no access",
    // minutes before the zone closed with no photographs in it.
    const w = await walked()
    const attic = zoneIds(w).find((z) => z.label === 'attic')!
    const candidates = candidateReasons(w.db, w.importId, attic.zone_id)
    assert.equal(candidates.length, 1, 'an empty zone has few resolutions by construction')
    const c = candidates[0]!
    assert.equal(c.itemId, 'att.access-honesty')
    assert.equal(c.value, 'no access')
    assert.equal(c.kind, 'satisfied')
    assert.match(c.suggestion, /no access$/)
    assert.ok(c.itemText, 'the item’s own words, not its id')
  })

  it('reads the recorded value through the module that owns that rule', () => {
    // A second reader of `evidence` here would be a second answer to a question
    // that already has a careful one — and would agree on this export.
    const code = readFileSync(
      join(repoRoot, 'server', 'src', 'engine', 'completeness.ts'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    assert.match(code, /answersForProperty\(/)
    assert.ok(!code.includes('evidence'), 'nothing here parses evidence itself')
  })

  it('returns candidates rather than writing one', async () => {
    // §9's third guard: shown, never pre-filled. A reason sitting in the input
    // box makes acceptance the default and rejection work.
    const w = await walked()
    const attic = zoneIds(w).find((z) => z.label === 'attic')!
    candidateReasons(w.db, w.importId, attic.zone_id)
    assert.equal(liveNoMediaDeclarations(w.db, w.importId).size, 0, 'offering wrote nothing')
  })

  it('offers a candidate that explains nothing, rather than deciding for the concierge', async () => {
    // The bedroom's one resolution is a sill height. It says nothing about why
    // the room has no photographs — and it is still what the field recorded, so
    // it is still what gets shown. Working out which resolution "explains" an
    // empty zone would mean hardcoding a vocabulary that belongs to the config,
    // and being wrong about that is worse than one unhelpful line.
    //
    // This is why §9's second guard matters as much as the third: "none of
    // these" has to be exactly as easy as the top option.
    const w = await walked()
    const bedroom = zoneIds(w).find((z) => z.label === 'bedroom')!
    const candidates = candidateReasons(w.db, w.importId, bedroom.zone_id)
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0]?.itemId, 'liv.egress-sill')
    assert.equal(candidates[0]?.suggestion, 'Sill height above finished floor — 26')
  })

  it('offers nothing where the field recorded nothing', async () => {
    const w = await walked()
    const silent = zoneIds(w).find(
      (z) =>
        (
          w.db
            .prepare("SELECT COUNT(*) n FROM resolutions WHERE import_id = ? AND scope_kind = 'zone' AND scope_zone_id = ?")
            .get(w.importId, z.zone_id) as { n: number }
        ).n === 0,
    )!
    assert.ok(silent, 'this export has zones with no zone-scoped resolution')
    assert.deepEqual(candidateReasons(w.db, w.importId, silent.zone_id), [])
  })
})
