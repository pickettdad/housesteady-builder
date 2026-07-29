import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildReport } from '../src/import/report.js'
import { checkPropertyLabel, MATCH_THRESHOLD, normalize, similarity } from '../src/import/propertyMatch.js'
import { runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, readReference, scratchDir, TEST_OPERATOR } from './helpers.js'
import { newId, now } from '../src/db/index.js'

/**
 * The guard on the one import error with no recovery.
 *
 * A false alarm is an annoyance. A missed misfile silently merges two houses'
 * pin histories forever. So the bar is: stay quiet through ordinary variation,
 * speak up when the house is genuinely different.
 */
describe('property label matching', () => {
  it('normalizes the abbreviations that vary between visits', async () => {
    assert.equal(normalize('443 Wannamaker Rd.'), '443 wannamaker road')
    assert.equal(normalize('12 Dundas St W'), '12 dundas street west')
  })

  const quiet = (a: string, b: string) =>
    assert.ok(similarity(a, b) >= MATCH_THRESHOLD, `expected quiet: "${a}" vs "${b}" = ${similarity(a, b)}`)
  const loud = (a: string, b: string) =>
    assert.ok(similarity(a, b) < MATCH_THRESHOLD, `expected a warning: "${a}" vs "${b}" = ${similarity(a, b)}`)

  it('stays quiet through ordinary variation', async () => {
    quiet('443 Wannamaker Rd', '443 Wannamaker Road')
    quiet('443 Wannamaker Road', '443 Wannamaker Rd, Belleville ON K8N 4Z5')
    quiet('Wannamaker 443', '443 Wannamaker Road')
    quiet('443 Wanamaker Road', '443 Wannamaker Road') // typo
    quiet('The Pickett house', 'The Pickett house — 443 Wannamaker Rd')
  })

  it('speaks up when the house is plainly different', async () => {
    loud('88 Bridge St', '443 Wannamaker Road')
    loud('Test build 7 web app 1', '443 Wannamaker Road')
  })

  it('catches the near-miss neighbour an absolute threshold cannot', async () => {
    // "12 Dundas St W" and "12 Dundas St E" are 90% alike, so no threshold
    // separates them. Comparing against every property on file does.
    const result = checkPropertyLabel({
      manifestLabel: '12 Dundas Street East',
      propertyLabel: '12 Dundas St W',
      propertyAddress: '12 Dundas Street West, Belleville ON',
      otherProperties: [{ id: 'east', label: '12 Dundas St E', address: '12 Dundas Street East' }],
    })
    assert.equal(result.looksWrong, false, 'the absolute check alone would have stayed quiet')
    assert.equal(result.betterMatch?.id, 'east')
  })

  it('does not invent a rival when the chosen property is the best fit', async () => {
    const result = checkPropertyLabel({
      manifestLabel: '443 Wannamaker Road',
      propertyLabel: 'Wannamaker',
      propertyAddress: '443 Wannamaker Rd',
      otherProperties: [{ id: 'other', label: '88 Bridge St', address: '88 Bridge Street' }],
    })
    assert.equal(result.betterMatch, null)
    assert.equal(result.looksWrong, false)
  })

  it('treats an empty manifest label as nothing to say, not as a mismatch', async () => {
    const result = checkPropertyLabel({ manifestLabel: '', propertyLabel: 'Wannamaker' })
    assert.equal(result.looksWrong, false)
    assert.equal(result.betterMatch, null)
  })
})

describe('the guard in a real import', () => {
  it('warns, but still imports, when the export names a different house', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { label: 'Wannamaker', address: '443 Wannamaker Rd' })
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const report = buildReport(db, importId)!

    assert.equal(report.import.status, 'ok_with_warnings')
    const warning = report.validation.checks.find((c) => c.code === 'property.label-mismatch')
    assert.ok(warning, 'a label this different must be flagged')
    assert.match(warning!.message, /corrupts the record of both/)
    assert.equal(report.counts.pins.total, 11, 'the warning is advisory — the import still happened')
    db.close()
  })

  it('points at the better-matching property when one exists', async () => {
    const db = freshDb()
    // A second property whose label is exactly what the export says.
    db.prepare('INSERT INTO properties (id, label, address, created_at, actor_id) VALUES (?, ?, ?, ?, ?)').run(
      newId(),
      'Test build 7 web app 1',
      null,
      now(),
      TEST_OPERATOR,
    )
    const ids = makePropertyAndVisit(db, { label: 'Somewhere else entirely', address: '88 Bridge St' })
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const report = buildReport(db, importId)!

    const warning = report.validation.checks.find((c) => c.code === 'property.better-match-elsewhere')
    assert.ok(warning)
    assert.match(warning!.message, /Test build 7 web app 1/)
    db.close()
  })

  it('says nothing when the label matches', async () => {
    const db = freshDb()
    const ids = makePropertyAndVisit(db, { label: 'Test build 7 web app 1' })
    const { importId } = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: readReference(), dataDir: scratchDir() })
    const report = buildReport(db, importId)!
    assert.ok(!report.validation.checks.some((c) => c.code.startsWith('property.') && c.severity === 'warning'))
    db.close()
  })
})
