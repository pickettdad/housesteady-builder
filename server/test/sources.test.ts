/**
 * ⚑ **`Documented` becomes reachable honestly and stays unreachable dishonestly.**
 *
 * Binder 6b. Honesty-Label-Mapping v1.3 §8, owner ruling 2026-08-26.
 *
 * `Documented` has been structurally unreachable since migration 024 — there was
 * no column to write it into, which is a strong guarantee bought by having no
 * feature. §8 rules what counts as a source, so the guarantee now has to be made
 * by rules rather than by absence, and **a rule is only as good as the violation
 * it refuses.**
 *
 * ⚑ **Register rule 59: the proof is a planted violation caught, never the
 * absence of one that did not arrive.** So every path to a dishonest
 * `Documented` below is planted and refused, and the honest path is exercised
 * beside it — because a gate that refuses everything is not a gate either.
 *
 * ⛑ **Rule 44 — the blank input comes first.** A resolution with no source at
 * all is the ordinary state and the first thing asserted; a check that has never
 * been shown to be quiet is a check whose noise nobody has measured.
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, it } from 'node:test'
import { newId, now, type Db } from '../src/db/index.js'
import {
  honestyForImport, honestyOf, hostOf, qualify, recordSource, refusedOnModel, rulings,
  ruleHost, sameModel, underHost, unruledHosts, HONESTY_LABELS, HOST_TIERS, type HostRuling,
} from '../src/engine/sources.js'
import { writeResolutions } from '../src/ai/tasks/resolveProduct.js'
import { writeReadings } from '../src/ai/tasks/readSurfaces.js'
import { freshDb, repoRoot, TEST_OPERATOR } from './helpers.js'

const PROPERTY = 'prop-1'
const VISIT = 'visit-1'
const ZONE = 'zone-mech'
const PLATE = 'G9-50SDE-30'

let db: Db
let importId: string
let resolutionId: string

/** One resolved product, as passes 1 and 2 leave it. The starting state. */
beforeEach(() => {
  db = freshDb()
  db.prepare(`INSERT INTO properties (id, label, created_at, actor_id) VALUES (?, 'A house', ?, ?)`)
    .run(PROPERTY, now(), TEST_OPERATOR)
  db.prepare(`INSERT INTO visits (id, property_id, kind, created_at, actor_id) VALUES (?, ?, 'baseline', ?, ?)`)
    .run(VISIT, PROPERTY, now(), TEST_OPERATOR)
  importId = newId()
  db.prepare(
    `INSERT INTO imports (id, visit_id, property_id, imported_at, media_mode, raw_manifest,
                          validation_report, status, created_at, actor_id)
     VALUES (?, ?, ?, ?, 'full', '{}', '{}', 'ok', ?, ?)`,
  ).run(importId, VISIT, PROPERTY, now(), now(), TEST_OPERATOR)
  db.prepare(
    `INSERT INTO zones (zone_id, import_id, property_id, visit_id, type, label, level, created_at)
     VALUES (?, ?, ?, ?, 'mechanical', 'Mechanical room', 'basement', ?)`,
  ).run(ZONE, importId, PROPERTY, VISIT, now())
  db.prepare(
    `INSERT INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind, owner_zone_id,
                        owner_pin_id, owner_canvas_id, file, file_status, created_at)
     VALUES ('m1', ?, ?, ?, 'photo', 'zone', ?, NULL, NULL, 'm1.jpg', 'present', ?)`,
  ).run(importId, PROPERTY, VISIT, ZONE, now())

  const [readingId] = writeReadings(db, {
    propertyId: PROPERTY, importId, zoneId: ZONE, actorId: TEST_OPERATOR,
    labels: [{
      mediaId: 'm1', surface: 'nameplate', whereItIs: '',
      fields: [{ field: 'Model', value: PLATE, unreadable: false }],
    }],
  })
  const ids = writeResolutions(db, {
    propertyId: PROPERTY, importId, actorId: TEST_OPERATOR,
    queries: [{ readingId: readingId!, mediaId: 'm1', surface: 'nameplate', text: PLATE, specificity: 'line', why: '', from: [], models: [PLATE] }],
    resolutions: [{
      readingId: readingId!, product: 'A 50-gallon gas water heater', kind: 'equipment',
      recognisedFrom: 'the model number', resolved: true, specificity: 'line',
    }],
  })
  resolutionId = ids[0]!
})

/** A source with everything §8c wants and the plate's own model. Vary one field per test. */
const good = (over: Partial<Parameters<typeof recordSource>[1]> = {}) => ({
  resolutionId,
  url: 'https://ahridirectory.org/listing/12345',
  retrievedAt: '2026-08-28',
  extractedClaim: 'Rated input 40,000 BTU/h; first-hour rating 90 gallons.',
  sourceModel: PLATE,
  plateModel: PLATE,
  actorId: TEST_OPERATOR,
  ...over,
})

const label = (): string => honestyForImport(db, importId)[0]!.honesty

// ============================================================ the blank input

describe('rule 44 — the state before anything has been read', () => {
  it('a resolution with no source is Inferred, and that is the ordinary case', () => {
    const [r] = honestyForImport(db, importId)
    assert.equal(r!.honesty, 'Inferred')
    assert.deepEqual(r!.sources, [])
  })

  it('an import with no resolutions reports nothing rather than failing', () => {
    const empty = newId()
    db.prepare(
      `INSERT INTO imports (id, visit_id, property_id, imported_at, media_mode, raw_manifest,
                            validation_report, status, created_at, actor_id)
       VALUES (?, ?, ?, ?, 'full', '{}', '{}', 'ok', ?, ?)`,
    ).run(empty, VISIT, PROPERTY, now(), now(), TEST_OPERATOR)
    assert.deepEqual(honestyForImport(db, empty), [])
  })

  it('honestyOf is a threshold, not a score — four bad sources are not half a good one', () => {
    assert.equal(honestyOf([]), 'Inferred')
    assert.equal(honestyOf([{ qualifies: false }, { qualifies: false }, { qualifies: false }]), 'Inferred')
    assert.equal(honestyOf([{ qualifies: false }, { qualifies: true }]), 'Documented')
  })
})

// ==================================================== the honest path works

describe('⚑ Documented is reachable — and if it were not, every refusal below would prove nothing', () => {
  it('a §8b regulator, the plate\'s own model, a date and an extracted claim', () => {
    assert.equal(label(), 'Inferred')
    const s = recordSource(db, good())
    assert.equal(s.qualifies, true, s.why)
    assert.equal(label(), 'Documented')
    assert.match(s.why, /regulator or certifier/)
  })

  it('a manufacturer host a PERSON ruled — the half of tier 1 that cannot be seeded', () => {
    ruleHost(db, {
      host: 'aosmith.com', tier: 'manufacturer', belongsTo: 'A. O. Smith',
      ruling: 'Confirmed by hand: this is A. O. Smith\'s own site.', actorId: TEST_OPERATOR,
    })
    const s = recordSource(db, good({ url: 'https://www.aosmith.com/spec/G9-50SDE-30.pdf' }))
    assert.equal(s.qualifies, true, s.why)
    assert.equal(s.host, 'aosmith.com', '`www.` is stripped, so a ruling covers both spellings')
    assert.equal(label(), 'Documented')
  })

  it('a subdomain of a ruled host is the same organisation', () => {
    ruleHost(db, {
      host: 'aosmith.com', tier: 'manufacturer', belongsTo: 'A. O. Smith',
      ruling: 'theirs', actorId: TEST_OPERATOR,
    })
    assert.equal(recordSource(db, good({ url: 'https://support.aosmith.com/x' })).qualifies, true)
  })

  it('and a second source never un-documents a resolution', () => {
    recordSource(db, good())
    recordSource(db, good({ url: 'https://a-shop.example/product/123' }))
    assert.equal(label(), 'Documented', 'sources accumulate; a worse one arriving later removes nothing')
  })
})

// ============================================ every dishonest path, planted

describe('⛑ and it stays unreachable dishonestly — one planted violation per rule', () => {
  const refuses = (over: Partial<Parameters<typeof recordSource>[1]>, expect: RegExp): void => {
    const s = recordSource(db, good(over))
    assert.equal(s.qualifies, false, `this should not have qualified: ${s.why}`)
    assert.match(s.why, expect)
    assert.equal(label(), 'Inferred')
  }

  it('no URL at all', () => refuses({ url: '' }, /no source URL/))
  it('a string that is not a URL', () => refuses({ url: 'ahridirectory.org' }, /not a URL/))

  it('plain http — a claim read over http is attributable to nobody', () =>
    refuses({ url: 'http://ahridirectory.org/listing/1' }, /not https/))

  /**
   * ⚑ **The one a regular expression gets wrong, and the reason `hostOf` parses.**
   * Everything before the `@` is userinfo. This URL fetches `retailer.example`
   * and a pattern looking for `ahridirectory.org` finds it in the string.
   */
  it('a ruled host smuggled into the userinfo', () =>
    refuses({ url: 'https://ahridirectory.org@retailer.example/listing/1' }, /nobody has ruled what `retailer\.example` is/))

  it('a ruled host as a prefix of somebody else\'s domain', () =>
    refuses({ url: 'https://ahridirectory.org.retailer.example/x' }, /nobody has ruled/))

  /**
   * ⛑ **Written second, because the case above does not test what its name says.**
   *
   * `ahridirectory.org.retailer.example` is caught by the unruled-host gate
   * whatever `underHost` does — it was a planted violation the wrong gate
   * refused, which is a passing test that proves nothing about the rule it
   * names. **Found by falsification:** rewriting `underHost` as a plain
   * `endsWith` failed only the pure-rule test and left this whole suite green.
   *
   * `fake-ahridirectory.org` is the shape that actually matters. A plain
   * `endsWith` accepts it, and whoever registers the domain inherits AHRI's
   * ruling.
   */
  it('somebody else\'s domain ENDING in a ruled one — the shape a plain endsWith accepts', () =>
    refuses({ url: 'https://fake-ahridirectory.org/listing/1' }, /nobody has ruled what `fake-ahridirectory\.org` is/))

  it('a host nobody has ruled — the ordinary case, and it names the work', () =>
    refuses({ url: 'https://some-supplier.example/part/9' }, /nobody has ruled what `some-supplier\.example` is/))

  it('a host ruled outside tier 1 — §8b: never Documented, however many URLs it has', () => {
    ruleHost(db, {
      host: 'a-forum.example', tier: 'excluded',
      ruling: 'An owners\' forum.', actorId: TEST_OPERATOR,
    })
    refuses({ url: 'https://a-forum.example/thread/7' }, /never `Documented`/)
  })

  it('§8c — a link with no claim extracted from it', () =>
    refuses({ extractedClaim: '' }, /record the extracted claim, not only the link/))

  it('§8c — a claim with no retrieval date', () =>
    refuses({ retrievedAt: '' }, /no retrieval date/))

  it('§8a rule 2 — a specification for a different unit', () =>
    refuses({ sourceModel: 'G9-40S40' }, /a source for the wrong model is not a source/))

  /**
   * ⛑ **This one refuses a match a person would probably accept, and it is
   * ruled.** *The model must match what the plate says, not resemble it.* The
   * cost is counted by `refusedOnModel` rather than argued about.
   */
  it('§8a rule 2 — and a near match is a mismatch, which is the ruled direction', () =>
    refuses({ sourceModel: `${PLATE} 250` }, /a source for the wrong model is not a source/))

  it('a page with no model number on it at all', () =>
    refuses({ sourceModel: '' }, /\(no model given\)/))
})

// ============================================ there is nowhere to write it

describe('⚑ nothing anywhere can set the label directly', () => {
  const migration = readFileSync(
    join(repoRoot, 'server', 'src', 'db', 'migrations', '027_resolution_sources.sql'), 'utf8',
  )

  it('`product_resolutions.honesty` still says Inferred on every row', () => {
    recordSource(db, good())
    const stored = db.prepare('SELECT DISTINCT honesty FROM product_resolutions').all() as { honesty: string }[]
    assert.deepEqual(stored.map((r) => r.honesty), ['Inferred'],
      'that column records what the MODEL said, and a model recalling training data has read nothing')
    assert.equal(label(), 'Documented', 'and the derived label disagrees with it, which is the whole design')
  })

  /**
   * ⚑ **The strongest form of the guarantee, and it is the one migration 024
   * used: a caller cannot write a false verdict because there is no verdict
   * column to write.**
   *
   * The first version of 027 stored `qualifies` with a CHECK constraint behind
   * it. Removing the column is strictly stronger than guarding it — and it was
   * forced by the registry rather than chosen for elegance: a stored verdict
   * freezes, so ruling a host would not have promoted anything already recorded.
   */
  it('a source row holds facts read off a page and no verdict at all', () => {
    const cols = (db.prepare('PRAGMA table_info(resolution_sources)').all() as { name: string }[])
      .map((c) => c.name).sort()
    for (const forbidden of ['qualifies', 'why', 'honesty', 'tier', 'documented']) {
      assert.ok(!cols.includes(forbidden), `\`${forbidden}\` would be a verdict a caller could write: ${cols.join(', ')}`)
    }
    assert.deepEqual(cols, [
      'actor_id', 'claim', 'created_at', 'extracted_claim', 'generation_id', 'id',
      'plate_model', 'resolution_id', 'retrieved_at', 'source_host', 'source_model', 'source_url',
    ])
  })

  it('and the migration says so where a person will read it', () => {
    assert.match(migration, /no `qualifies` column and no `why` column/,
      'the absence is the mechanism, so it is stated rather than left to be noticed')
  })

  /**
   * ⚑ **The registry's whole argument, asserted: one judgement settles every
   * resolution citing the host, with nothing rewritten.**
   */
  it('a ruling made after the fact promotes what was already recorded, touching no row', () => {
    const s = recordSource(db, good({ url: 'https://newmaker.example/spec' }))
    assert.equal(s.qualifies, false)
    assert.equal(label(), 'Inferred')

    const before = db.prepare('SELECT * FROM resolution_sources').all()
    ruleHost(db, {
      host: 'newmaker.example', tier: 'manufacturer', belongsTo: 'Newmaker',
      ruling: 'Checked by hand — their own site.', actorId: TEST_OPERATOR,
    })
    assert.equal(label(), 'Documented')
    assert.deepEqual(db.prepare('SELECT * FROM resolution_sources').all(), before,
      'the source row is evidence and evidence does not change when a judgement about it does')
  })

  it('and a ruling withdrawn takes the label back with it', () => {
    recordSource(db, good())
    assert.equal(label(), 'Documented')
    ruleHost(db, {
      host: 'ahridirectory.org', tier: 'excluded',
      ruling: 'Withdrawn — this host was seeded by a document, not confirmed by a person.',
      actorId: TEST_OPERATOR,
    })
    assert.equal(label(), 'Inferred',
      'a correction that could not un-claim would be a one-way ratchet on the strongest claim this repo makes')
  })

  /**
   * ⚑ **The class-level half — the thing that notices a SECOND place deciding.**
   *
   * `recordSource` computing the verdict is one function, and every test above
   * goes through it. Whoever writes the second path will not be thinking about
   * §8, which is exactly why this is a scan rather than a review.
   *
   * ⛑ **Residual limit, stated:** it reads for the literal word next to a write.
   * A path that assembled the string, or stored a flag and rendered the word
   * later, still slips.
   *
   * ⛑ **And a WRITE, never a comparison.** The first version read `[:=]` and
   * fired on `r.honesty === 'Documented'` in the reader — which is the reader
   * doing its job. A scan that cannot tell reading a label from setting one
   * would be turned off within a week, and then it would be a check nobody runs
   * rather than a check that works.
   */
  it('lets nothing outside engine/sources.ts write the word Documented', () => {
    const ASSIGN = String.raw`\bhonesty\s*(?::|(?<![=!<>])=(?!=))`
    const WRITES_IT = new RegExp(`(INSERT\\s+INTO|UPDATE\\s|${ASSIGN})[\\s\\S]{0,240}?['"\`]Documented['"\`]`, 'i')
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) { walk(p); continue }
        if (!e.name.endsWith('.ts')) continue
        if (p.endsWith(join('engine', 'sources.ts'))) continue
        const code = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        if (WRITES_IT.test(code)) offenders.push(relative(repoRoot, p))
      }
    }
    walk(join(repoRoot, 'server', 'src'))
    walk(join(repoRoot, 'server', 'scripts'))
    assert.deepEqual(offenders, [],
      'a resolution becomes Documented by acquiring a source that qualifies under §8 — never by anything setting it')
  })

  it('the label vocabulary is exactly the two §8 uses', () => {
    assert.deepEqual([...HONESTY_LABELS], ['Documented', 'Inferred'])
  })
})

// ==================================================================== registry

describe('the registry — one judgement per host, made by a person', () => {
  it('seeds the five organisations §8b names, and says a document ruled them', () => {
    const seeded = db
      .prepare(`SELECT host, tier, ruled_by AS ruledBy, ruling FROM source_hosts ORDER BY host`)
      .all() as { host: string; tier: string; ruledBy: string | null; ruling: string }[]
    assert.deepEqual(seeded.map((r) => r.host),
      ['ahridirectory.org', 'csagroup.org', 'energystar.gov', 'nrcan.gc.ca', 'ul.com'])
    for (const r of seeded) {
      assert.equal(r.tier, 'regulator')
      assert.equal(r.ruledBy, null, 'seeded by a document, not by a person — and the row says so')
      assert.match(r.ruling, /has not been confirmed by a person/,
        '§8b names the organisation; the host was written here, and that step is not part of the ruling')
    }
  })

  it('surfaces a host that was read and never ruled, once however many sources cite it', () => {
    recordSource(db, good({ url: 'https://some-supplier.example/a' }))
    recordSource(db, good({ url: 'https://some-supplier.example/b' }))
    recordSource(db, good({ url: 'https://other.example/c' }))
    assert.deepEqual(unruledHosts(db), [
      { host: 'some-supplier.example', sources: 2 },
      { host: 'other.example', sources: 1 },
    ])
  })

  it('and stops surfacing it the moment somebody rules it', () => {
    recordSource(db, good({ url: 'https://some-supplier.example/a' }))
    assert.equal(unruledHosts(db).length, 1)
    ruleHost(db, { host: 'some-supplier.example', tier: 'excluded', ruling: 'A distributor.', actorId: TEST_OPERATOR })
    assert.deepEqual(unruledHosts(db), [])
  })

  /**
   * ⚑ **The half `operators.test.ts` had to exempt, made here instead.**
   *
   * `source_hosts` carries `ruled_by` rather than `actor_id`, and it is nullable
   * — because the five §8b rows were ruled by a document and inventing an
   * operator for them would claim a decision nobody made. That exemption is a
   * hole, and this is what fills it: **every ruling beyond those five names a
   * person, and the five say in their own text that they were not made by one.**
   */
  it('every ruling a PERSON makes names them, and only the seeded five do not', () => {
    ruleHost(db, { host: 'a.example', tier: 'excluded', ruling: 'Retail.', actorId: TEST_OPERATOR })
    ruleHost(db, {
      host: 'b.example', tier: 'manufacturer', belongsTo: 'B Co', ruling: 'Theirs.', actorId: TEST_OPERATOR,
    })
    const unattributed = db
      .prepare('SELECT host, ruling FROM source_hosts WHERE ruled_by IS NULL ORDER BY host')
      .all() as { host: string; ruling: string }[]
    assert.equal(unattributed.length, 5, 'only the rows migration 027 seeds may have no person behind them')
    for (const r of unattributed) {
      assert.match(r.ruling, /Honesty-Label-Mapping v1\.3 §8b/,
        'a ruling with nobody behind it has to say which document made it')
    }
    assert.throws(
      () => ruleHost(db, { host: 'c.example', tier: 'excluded', ruling: 'Retail.', actorId: '' }),
      /operator/i,
      'and a ruling with an empty actor is refused rather than stored as another anonymous one',
    )
  })

  it('a ruling records who made it and why — an unexplained ruling is one nobody can disagree with', () => {
    ruleHost(db, { host: 'x.example', tier: 'excluded', ruling: 'Retail.', actorId: TEST_OPERATOR })
    const r = db.prepare('SELECT ruled_by AS by, ruling FROM source_hosts WHERE host = ?').get('x.example') as
      { by: string; ruling: string }
    assert.equal(r.by, TEST_OPERATOR)
    assert.equal(r.ruling, 'Retail.')
    assert.throws(() => ruleHost(db, { host: 'y.example', tier: 'excluded', ruling: '  ', actorId: TEST_OPERATOR }),
      /records why/)
  })

  it('a manufacturer host must say whose it is', () => {
    assert.throws(
      () => ruleHost(db, { host: 'z.example', tier: 'manufacturer', ruling: 'theirs', actorId: TEST_OPERATOR }),
      /CHECK constraint failed/,
    )
  })

  it('a later ruling replaces an earlier one rather than duplicating it', () => {
    ruleHost(db, { host: 'q.example', tier: 'excluded', ruling: 'Looks like a shop.', actorId: TEST_OPERATOR })
    ruleHost(db, {
      host: 'q.example', tier: 'manufacturer', belongsTo: 'Quinte Heating',
      ruling: 'Checked — it is their own site.', actorId: TEST_OPERATOR,
    })
    const all = rulings(db).filter((r) => r.host === 'q.example')
    assert.equal(all.length, 1)
    assert.equal(all[0]!.tier, 'manufacturer')
  })

  it('counts what §8a rule 2 costs, and counts only what it actually decided', () => {
    // A tier-1 host refused on the model alone — the case worth knowing about.
    recordSource(db, good({ sourceModel: `${PLATE} 250` }))
    // An excluded host, refused for being excluded. Not rule 2's doing.
    ruleHost(db, { host: 'shop.example', tier: 'excluded', ruling: 'Retail.', actorId: TEST_OPERATOR })
    recordSource(db, good({ url: 'https://shop.example/p', sourceModel: 'something-else' }))
    // An unruled host. Also not rule 2's doing.
    recordSource(db, good({ url: 'https://nobody.example/p', sourceModel: 'something-else' }))

    assert.deepEqual(refusedOnModel(db), [
      { host: 'ahridirectory.org', sourceModel: `${PLATE} 250`, plateModel: PLATE },
    ])
  })
})

// ================================================================ the pure rules

describe('the rules on their own, where a planted case costs nothing', () => {
  const RULED: HostRuling[] = [
    { host: 'ahridirectory.org', tier: 'regulator', belongsTo: '', ruling: 'AHRI.' },
    { host: 'parts.example.com', tier: 'excluded', belongsTo: '', ruling: 'Their parts shop.' },
    { host: 'example.com', tier: 'manufacturer', belongsTo: 'Example Co', ruling: 'Theirs.' },
  ]

  it('the most specific ruling wins, so a shop inside a manufacturer\'s domain stays a shop', () => {
    const v = qualify(
      { url: 'https://parts.example.com/x', retrievedAt: '2026-08-28', extractedClaim: 'c', sourceModel: 'A', plateModel: 'A' },
      RULED,
    )
    assert.equal(v.qualifies, false)
    assert.match(v.why, /never `Documented`/)
    // And the general ruling still covers the rest of the domain.
    assert.equal(
      qualify({ url: 'https://example.com/spec', retrievedAt: '2026-08-28', extractedClaim: 'c', sourceModel: 'A', plateModel: 'A' }, RULED).qualifies,
      true,
    )
  })

  it('underHost matches on a dot boundary and nowhere else', () => {
    assert.equal(underHost('aosmith.com', 'aosmith.com'), true)
    assert.equal(underHost('support.aosmith.com', 'aosmith.com'), true)
    assert.equal(underHost('aosmith.com.evil.example', 'aosmith.com'), false)
    assert.equal(underHost('notaosmith.com', 'aosmith.com'), false)
  })

  it('hostOf folds case and www., and keeps the rest verbatim', () => {
    assert.deepEqual(hostOf('https://WWW.AOSmith.COM/x'), { host: 'aosmith.com' })
    assert.deepEqual(hostOf('https://a.b.example:8443/x'), { host: 'a.b.example' })
  })

  it('sameModel folds case and whitespace and nothing else', () => {
    assert.equal(sameModel('g9-50sde-30', 'G9-50SDE-30'), true)
    assert.equal(sameModel('G9-50SDE-30', 'G9-50SDE-30  '), true)
    assert.equal(sameModel('G9 50SDE 30', 'G9  50SDE  30'), true)
    // Ruled: not resemble. Both of these are refusals on purpose.
    assert.equal(sameModel('G950SDE30', 'G9-50SDE-30'), false)
    assert.equal(sameModel('', ''), false, 'two blanks are not a match; they are two absences')
  })

  it('the tier vocabulary is closed, because a tier is a ruling and not a word', () => {
    assert.deepEqual([...HOST_TIERS], ['regulator', 'manufacturer', 'excluded'])
  })
})
