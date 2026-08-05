/**
 * The class frame — Increment 5 §1, Amendment 3 §B.
 *
 * **This file was written when the frame shipped empty, and the frame is not
 * empty any more.** Register #37 closed with 32 of 173 classes and all four
 * vocabularies populated, and four tests here failed. Every one of them deserved
 * to: they asserted *the file declares nothing*, which was true the day it was
 * written and is now false.
 *
 * ## Rule 11 pointed the other way, and that is the interesting part
 *
 * The original header said every check here is idle against the shipped file. It
 * no longer is — `checkVocabulary` now resolves ~200 real references and passes.
 * **But the reverse became true at the same instant:** `readClassFrame`'s
 * empty-classes branch and `auditClassFrame`'s empty-run branch are still live
 * code, and nothing in the repo reaches them any more. A check whose
 * distinguishing input has *left* is as idle as one whose input never arrived,
 * and the tests below therefore construct an empty frame file rather than
 * deleting those cases.
 *
 * ## And one test failed for the wrong reason, which is worth more than the fix
 *
 * `keeps the worked class out of the data` asserted `classes.length === 0`. That
 * is not what its name claims. It never checked whether the worked class leaked
 * into the array — it checked that the array was empty, which was a different
 * fact that happened to be true. **Rule 12: the name of an act is part of what it
 * claims.** The same body was written twice, here and for the wording file, so
 * the real property is now a scan over every schema file carrying an example —
 * `doctrine.test.ts`, rule 13.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  auditClassFrame,
  checkComponentTypes,
  checkAccess,
  checkUnits,
  checkVocabulary,
  ClassFrameUnreadable,
  DEFAULT_ACCESS,
  readClassFrame,
  type ClassEntry,
  type ClassFrame,
} from '../src/engine/classFrame.js'
import { readWalk, repoRoot, scratchDir } from './helpers.js'

/** The walk's own config snapshot — v1.11.0, 71 component types. */
const walkConfig = (): Record<string, unknown> =>
  (JSON.parse(readWalk()) as { config: { snapshot: Record<string, unknown> } }).config.snapshot

const frame = (over: Partial<ClassFrame> = {}): ClassFrame => ({
  version: 'test',
  careCategories: [], inspectionPoints: [], opportunityConditions: [], ownerQuestions: [], classes: [],
  absent: false, note: '', ...over,
})

const cls = (over: Partial<ClassEntry> = {}): ClassEntry => ({
  id: 'water-heater-gas', label: 'Gas water heater', systems: ['domestic-hot-water'],
  componentType: 'water-heater', careCategories: [], inspectionPoints: [],
  opportunityConditions: [], ownerQuestions: [], replacementHorizon: true, ...over,
})

/**
 * A frame file that parses and declares nothing. **The state the repo shipped in
 * and no longer holds**, so the only way to reach that branch is to build one.
 */
const emptyFrameFile = (): string => {
  const p = join(scratchDir(), 'empty-frame.json')
  writeFileSync(p, JSON.stringify({ version: 'empty-for-test', classes: [] }))
  return p
}

describe('the reader reports what the file holds, whatever that is', () => {
  it('reads the shipped file and reports its real content', () => {
    // Was `reads the shipped file with no classes`. It has 32, and the note
    // counts rather than explaining an emptiness that is over.
    const f = readClassFrame()
    assert.equal(f.absent, false)
    assert.ok(f.classes.length > 0, 'the content pass has landed')
    assert.match(f.note, new RegExp(`^${f.classes.length} classes declared`))
    for (const v of [f.careCategories, f.inspectionPoints, f.opportunityConditions, f.ownerQuestions]) {
      assert.ok(v.length > 0, 'all four vocabularies are populated')
    }
  })

  it('still calls an empty file its honest state — constructed, because nothing ships that way now', () => {
    // Live code with no input left in the repo. Rule 11 does not only catch a
    // check that was never reached; it catches one that has stopped being.
    const f = readClassFrame(emptyFrameFile())
    assert.equal(f.absent, false)
    assert.equal(f.classes.length, 0)
    assert.match(f.note, /honest one/)
  })

  it('tells a missing file apart from a file declaring nothing', () => {
    // Opposite claims that look identical to a caller checking `classes.length`,
    // which is why both sides are built. Comparing absence against the *shipped*
    // file used to make this claim and now would not: that file declares 32
    // things, so it tests absent-versus-present and the name says more.
    const missing = readClassFrame(join(scratchDir(), 'no-such-frame.json'))
    const declaresNothing = readClassFrame(emptyFrameFile())
    assert.equal(missing.absent, true)
    assert.equal(declaresNothing.absent, false)
    assert.equal(missing.classes.length, declaresNothing.classes.length, 'indistinguishable by count')
    assert.match(missing.note, /Nothing is wrong/)
    assert.match(declaresNothing.note, /honest one/)
  })

  it('refuses a present file that will not parse', () => {
    // Fail open on absence, fail closed on structure — doctrine 7, and the same
    // split `lineage.ts` holds.
    const bad = join(scratchDir(), 'broken-frame.json')
    writeFileSync(bad, '{ "classes": [ ')
    assert.throws(() => readClassFrame(bad), (e: unknown) => {
      assert.ok(e instanceof ClassFrameUnreadable)
      assert.equal(e.code, 'class-frame.unparseable')
      return true
    })
  })

  it('reports an empty run as an empty run, never as a pass', () => {
    // The distinction rule 11 exists for, and it survives the content pass
    // because the input is built rather than read.
    const a = auditClassFrame(readClassFrame(emptyFrameFile()), walkConfig())
    assert.deepEqual(a.problems, [])
    assert.match(a.note, /not a pass — it is an empty run/)
  })

  it('and a real run counts what it checked, so the two can never read alike', () => {
    const a = auditClassFrame(readClassFrame(), walkConfig())
    assert.doesNotMatch(a.note, /empty run/)
    assert.match(a.note, /^\d+ classes checked/)
  })
})

/**
 * **The first time these checks have had real input.** Everything above and
 * below constructs its own, because a passing file cannot exercise a failure
 * path. This block does the opposite job: it runs the shipped checks over the
 * shipped content against the walk's own config, so the result is verified here
 * rather than carried across a handover.
 */
describe('the shipped content, checked rather than taken on trust', () => {
  it('audits clean against the walk’s own config snapshot', () => {
    const a = auditClassFrame(readClassFrame(), walkConfig())
    assert.deepEqual(a.problems.map((p) => `${p.code} · ${p.classId}`), [])
  })

  it('reports the classes that map to a stub, because a stub seeds an empty checklist', () => {
    // Not an error and never treated as one — the type is declared and its ids
    // are reserved. But a house with a cistern seeds nothing today, and that is
    // a fact for the field team rather than a silence. Doctrine 6.
    const r = checkComponentTypes(readClassFrame(), walkConfig())
    assert.deepEqual(r.problems, [])
    assert.ok(r.stubs.length > 0, 'idle if the content ever stops reaching a stub')
    for (const id of r.stubs) {
      assert.equal(r.resolved.find((x) => x.classId === id)?.state, 'stub')
    }
  })

  it('resolves every class to a declared type, an explicit none, or a stub — never an absence', () => {
    const r = checkComponentTypes(readClassFrame(), walkConfig())
    assert.equal(r.resolved.length, readClassFrame().classes.length, 'nothing dropped')
    assert.deepEqual([...new Set(r.resolved.map((x) => x.state))].sort(), ['none', 'stub', 'typed'])
  })

  it('never lets the file’s own bookkeeping disagree with its data', () => {
    // **The second instance in two days of a hand-kept restatement drifting.**
    // The heating-and-cooling delta shipped a `_replaceWholesale` block that was
    // byte-identical to the pre-delta text — cut from the same copy, never
    // updated — so applying it verbatim would have left the file saying *32 of
    // 173* over 68 classes, with heating and cooling still listed as remaining.
    // Same shape as the worked class one merge earlier: a second copy of a fact
    // the data already holds. Derived now, and asserted here.
    const f = readClassFrame()
    const raw = JSON.parse(
      readFileSync(join(repoRoot, 'schema', 'class-frame-v1.json'), 'utf8'),
    ) as { status: string; contentPassProgress: { written: string[] } }

    const claimed = /^[^0-9]*(\d+) of (\d+) classes/.exec(raw.status)
    assert.ok(claimed, 'the status names a count')
    assert.equal(Number(claimed[1]), f.classes.length, 'the status counts the classes it actually holds')
    assert.ok(Number(claimed[2]) >= f.classes.length, 'and the target is not behind the content')

    // Every `system (n)` line matches the array. A class with two system tags
    // counts in both, so these sum past the class total — deliberately.
    const real = new Map<string, number>()
    for (const c of f.classes) for (const s of c.systems) real.set(s, (real.get(s) ?? 0) + 1)
    const stated = raw.contentPassProgress.written.map((w) => /^(\S+) \((\d+)\)$/.exec(w))
    assert.ok(stated.every(Boolean), 'every written line parses as `system (n)`')
    for (const m of stated) {
      assert.equal(Number(m?.[2]), real.get(String(m?.[1])), `\`${String(m?.[1])}\` is miscounted`)
    }
    assert.equal(stated.length, real.size, 'and no system is written that the classes do not carry')
  })

  it('carries access events as open vocabulary, not a list this repo keeps', () => {
    // `well-pump-service` arrived with the content pass and nothing needed
    // changing, which is the property being asserted — a second event type is
    // ordinary. Doctrine 7: fail open on vocabulary.
    const events = new Set(
      readClassFrame().inspectionPoints.flatMap((p) => (p.accessEvent ? [p.accessEvent] : [])))
    assert.ok(events.size > 1, 'more than one event is in use')
    assert.deepEqual(checkAccess(readClassFrame()), [], 'and every one of them passes unrecognised')
  })
})

describe('§1a · component types, against the import’s own config', () => {
  it('catches a class naming a type this config does not declare', () => {
    // **Constructed, because the shipped file has no classes and can never
    // exercise this.** Amendment 1 §F, and rule 11.
    const f = frame({ classes: [cls({ id: 'wine-fridge', componentType: 'wine-cooler' })] })
    const r = checkComponentTypes(f, walkConfig())
    assert.equal(r.problems.length, 1)
    assert.equal(r.problems[0]?.code, 'component-type-undeclared')
    assert.match(r.problems[0]?.problem ?? '', /session plan seeded from this would carry the wrong checklist/)
  })

  it('accepts a type the config really declares', () => {
    const r = checkComponentTypes(frame({ classes: [cls()] }), walkConfig())
    assert.deepEqual(r.problems, [])
    assert.equal(r.resolved[0]?.state, 'typed')
  })

  it('treats an explicit `none` as ordinary and an absent key as an error', () => {
    // Eighth instance of the distinction. A pod coffee maker is on no checklist
    // and never will be; a class nobody filled in is a different fact.
    const declared = checkComponentTypes(
      frame({ classes: [cls({ id: 'pod-coffee-maker', componentType: 'none' })] }), walkConfig())
    assert.deepEqual(declared.problems, [])
    assert.equal(declared.resolved[0]?.state, 'none')

    const absent = checkComponentTypes(
      frame({ classes: [{ ...cls({ id: 'nobody-filled-this-in' }), componentType: undefined as unknown as string }] }),
      walkConfig())
    assert.equal(absent.problems[0]?.code, 'component-type-absent')
  })

  it('separates a stub from a typed component rather than passing it silently', () => {
    // `ev-charger` is one of config v1.11's nine stubs — declared, ids reserved,
    // no items. A class mapping to it seeds an empty checklist today.
    const r = checkComponentTypes(
      frame({ classes: [cls({ id: 'ev-charger-l2', componentType: 'ev-charger' })] }), walkConfig())
    assert.deepEqual(r.problems, [], 'a stub is not an error')
    assert.deepEqual(r.stubs, ['ev-charger-l2'], 'but it is reported')
    assert.equal(r.resolved[0]?.state, 'stub')
  })

  it('reads the config it is given, never a list kept in this repo', () => {
    // The whole point of §1a. Give it a config declaring nothing and the same
    // class fails — so the answer is the config's, not this module's.
    const f = frame({ classes: [cls()] })
    assert.deepEqual(checkComponentTypes(f, walkConfig()).problems, [])
    assert.equal(checkComponentTypes(f, { componentLists: [] }).problems[0]?.code, 'component-type-undeclared')
  })
})

describe('§B3 · vocabulary references, and what this check cannot do', () => {
  it('catches a class naming a term the file does not declare', () => {
    // Constructed. This is the drift the vocabulary exists for: `filter change`
    // written three ways across 172 classes with nothing noticing.
    const f = frame({
      careCategories: [{ id: 'filter-change', label: 'Filter change' }],
      classes: [cls({ careCategories: ['filter-change', 'filter replacement'] })],
    })
    const p = checkVocabulary(f)
    assert.equal(p.length, 1)
    assert.equal(p[0]?.code, 'undeclared-care-category')
    assert.match(p[0]?.problem ?? '', /the vocabulary is missing an entry — and the second is the interesting case/)
  })

  it('checks all four vocabularies, not only the first', () => {
    const f = frame({
      classes: [cls({
        careCategories: ['nope-a'], inspectionPoints: ['nope-b'],
        opportunityConditions: ['nope-c'], ownerQuestions: ['nope-d'],
      })],
    })
    assert.deepEqual(checkVocabulary(f).map((x) => x.code).sort(), [
      'undeclared-care-category', 'undeclared-inspection-point',
      'undeclared-opportunity-condition', 'undeclared-owner-question',
    ])
  })

  it('passes a class whose every term is declared', () => {
    const f = frame({
      careCategories: [{ id: 'descale', label: 'Descale' }],
      inspectionPoints: [{ id: 'tpr-discharge', label: 'TPR discharge piping', kind: 'look' }],
      opportunityConditions: [{ id: 'past-half-life', label: 'Past half its expected life' }],
      ownerQuestions: [{ id: 'tpr-last-tested', label: 'Has the relief valve ever been tested?' }],
      classes: [cls({
        careCategories: ['descale'], inspectionPoints: ['tpr-discharge'],
        opportunityConditions: ['past-half-life'], ownerQuestions: ['tpr-last-tested'],
      })],
    })
    assert.deepEqual(checkVocabulary(f), [])
  })

  it('cannot catch a declared term that is simply wrong — stated, not assumed', () => {
    // Amendment 3 §B3's first weakness, pinned so nobody over-trusts the check.
    // `descale` on an electrical panel is nonsense and this check is silent,
    // because both sides live in one file and one session wrote them.
    const f = frame({
      careCategories: [{ id: 'descale', label: 'Descale' }],
      classes: [cls({ id: 'electrical-panel', componentType: 'electrical-panel', careCategories: ['descale'] })],
    })
    assert.deepEqual(checkVocabulary(f), [], 'silent — and that is the documented limit, not a bug')
  })

  it('is no longer idle — the shipped file resolves real references and passes', () => {
    // This test used to assert the opposite, and its comment said: *if this ever
    // stops being true the shipped file has gained classes and these tests should
    // be re-read, not deleted.* It has, and they were.
    //
    // The re-read: every test above still builds its own input, because they
    // exercise failures and a clean file cannot produce one. What changed is
    // this test's own claim. `checkVocabulary` against the shipped file used to
    // iterate nothing and report green; it now resolves every reference 32
    // classes make and reports green. **Those are the same output from opposite
    // causes**, which is the entire distinction rule 11 draws, so the assertion
    // is that the run is not vacuous rather than that it is empty.
    const f = readClassFrame()
    const references = f.classes.flatMap((c) => [
      ...c.careCategories, ...c.inspectionPoints, ...c.opportunityConditions, ...c.ownerQuestions])
    assert.ok(references.length > 50, `only ${references.length} references — has the content pass been reverted?`)
    assert.deepEqual(checkVocabulary(f), [])
  })

  it('would still catch drift in the shipped file, proved by breaking a copy of it', () => {
    // The check passing on real content is worth less than it looks: a check
    // that resolves 200 references and one that resolves none both return `[]`.
    // So take the real classes and misspell one declared term.
    const f = readClassFrame()
    const first = f.classes[0]
    assert.ok(first, 'the content pass has landed')
    const term = first.careCategories[0] ?? first.inspectionPoints[0]
    assert.ok(term, 'and its first class references something')
    const broken = {
      ...f,
      classes: [{ ...first, careCategories: [...first.careCategories, `${term} `] }, ...f.classes.slice(1)],
    }
    assert.equal(checkVocabulary(broken).length, 1)
    assert.equal(checkVocabulary(broken)[0]?.code, 'undeclared-care-category')
  })
})

describe('§B2 · a measure point declares a unit, or declares it has none', () => {
  it('accepts a declared unit', () => {
    assert.deepEqual(
      checkUnits(frame({ inspectionPoints: [{ id: 'delivery-temperature', label: 'Delivery temperature', kind: 'measure', unit: '°C' }] })),
      [])
  })

  it('accepts an explicit null — deliberately unitless is a real answer', () => {
    // The field app carries three such items because %WME, %MC and relative
    // 0–100 are different scales and the instrument decides which.
    assert.deepEqual(
      checkUnits(frame({ inspectionPoints: [{ id: 'moisture-relative', label: 'Relative moisture', kind: 'measure', unit: null }] })),
      [])
  })

  it('refuses an absent key, which is neither', () => {
    const p = checkUnits(frame({ inspectionPoints: [{ id: 'expansion-tank-charge', label: 'Charge', kind: 'measure' }] }))
    assert.equal(p.length, 1)
    assert.equal(p[0]?.code, 'measure-point-no-unit')
    assert.match(p[0]?.problem ?? '', /a reading whose scale nobody recorded is worse than no reading/)
  })

  it('leaves a look point alone — it records a state, not a value', () => {
    assert.deepEqual(
      checkUnits(frame({ inspectionPoints: [{ id: 'tpr-discharge', label: 'TPR discharge piping', kind: 'look' }] })),
      [])
  })
})

describe('§B1 · system membership is a set', () => {
  it('holds two without either being exceptional', () => {
    // `water-heater-indirect` is domestic hot water AND hydronic, and dropping
    // either loses a real property-pass question.
    const c = cls({ id: 'water-heater-indirect', systems: ['domestic-hot-water', 'hydronic-heating'] })
    assert.equal(c.systems.length, 2)
    const f = frame({ classes: [c] })
    assert.deepEqual(checkComponentTypes(f, walkConfig()).problems, [])
  })

  it('holds none — a pod coffee maker belongs to no system', () => {
    const f = frame({ classes: [cls({ id: 'pod-coffee-maker', componentType: 'none', systems: [] })] })
    assert.deepEqual(auditClassFrame(f, walkConfig()).problems, [])
  })
})

describe('the shipped file says what it is for', () => {
  const raw = (): Record<string, unknown> =>
    JSON.parse(readFileSync(join(repoRoot, 'schema', 'class-frame-v1.json'), 'utf8')) as Record<string, unknown>

  it('records that the vocabularies must be authored before the classes', () => {
    // The §B3 weakness no code can enforce: harvest the vocabulary from the
    // classes afterwards and the check is idle from birth. It is recorded where
    // the person who would do that will be reading.
    const v = JSON.stringify(raw().theVocabulariesMustComeFirst)
    assert.match(v, /never harvested from the classes afterwards/)
    assert.match(v, /idle from birth/)
  })

  it('records the join with the maintenance schedule, and that it needs no new field', () => {
    const j = JSON.stringify(raw().howThisMeetsTheMaintenanceSchedule)
    assert.match(j, /Granularity, not rhythm/)
    assert.match(j, /No new field and no mapping layer/)
    // And that an interval conflict is an override rather than a second item.
    assert.match(j, /must be written as one/)
  })

  it('cites an override rule that the schedule file really declares', () => {
    // Checked rather than carried: Amendment 3 §A2 cites the schedule's design
    // note. The rule is in the machine-readable file too, which is stronger.
    const sched = JSON.parse(
      readFileSync(join(repoRoot, 'schema', 'reference', 'maintenance-schedule-v1.json'), 'utf8'),
    ) as { overrideRule?: string }
    assert.match(sched.overrideRule ?? '', /override generic intervals/)
    assert.match(sched.overrideRule ?? '', /carry a reason and a source/)
    assert.match(sched.overrideRule ?? '', /never edit this file/)
  })
})

/**
 * Owner questions — Amendment 4.
 *
 * The fifth output, and the second file to ship deliberately empty on the same
 * day. Its wording lives beside `client-names-v1.json` by that amendment's own
 * naming, and inherits that file's rules rather than restating them differently.
 */
describe('§A · owner questions, the fifth output', () => {
  const wording = (): Record<string, unknown> =>
    JSON.parse(readFileSync(join(repoRoot, 'schema', 'owner-question-wording-v1.json'), 'utf8')) as Record<string, unknown>

  it('is a fourth declared vocabulary, not a new mechanism', () => {
    // Amendment 4 §A1 — same shape as the other three, so a class naming an
    // undeclared question is a visible error by the same code path.
    const f = frame({
      ownerQuestions: [{ id: 'last-serviced', label: 'When was this last serviced?' }],
      classes: [cls({ ownerQuestions: ['last-serviced', 'when-was-it-pumped'] })],
    })
    const p = checkVocabulary(f)
    assert.equal(p.length, 1)
    assert.equal(p[0]?.code, 'undeclared-owner-question')
  })

  it('ships its wording empty, and withholds rather than rendering an id', () => {
    // §2b's rule, generalised unchanged by Amendment 4 §A2. Today it withholds
    // every question there could be, which makes it load-bearing rather than
    // theoretical — the same state `client-names-v1.json` shipped in.
    const w = wording()
    assert.deepEqual(w.wording, [])
    assert.match(String(w.howAnAbsenceBehaves), /WITHHELD/)
    assert.match(String(w.howAnAbsenceBehaves), /NEVER rendered as its id/)
    assert.match(String(w.howAnAbsenceBehaves), /loud rather than invisible/)
  })

  it('carries the owner’s tone constraint verbatim rather than paraphrased', () => {
    // The constraint is the owner's own words and a paraphrase would soften it.
    const tone = JSON.stringify(wording().theTone)
    assert.match(tone, /not hard homework questions/)
    assert.match(tone, /what do you know about it/)
    // And the render rule that keeps the Home Profile from becoming a form.
    assert.match(tone, /NEVER collected into a questionnaire section/)
  })

  it('makes “I don’t know” an explicit unknown rather than an absence', () => {
    // Amendment 4 §B1, and it is the nameplate abstention rule one surface out.
    const idk = JSON.stringify(wording().iDontKnowIsAnAnswer)
    assert.match(idk, /EXPLICIT UNKNOWN rather than as an absence/)
    assert.match(idk, /a blank one gets chased and a wrong one gets believed/)
    // An unanswered question and one answered "I don't know" are different facts.
    assert.match(idk, /different facts/)
  })

  it('holds the same authorship rule as client names, not a looser one', () => {
    // Doctrine 5. Checked against the sibling rather than asserted, because
    // "same discipline as" is the kind of claim that drifts.
    const mine = String(wording().authorship)
    const theirs = String(
      (JSON.parse(readFileSync(join(repoRoot, 'schema', 'client-names-v1.json'), 'utf8')) as Record<string, unknown>)
        .authorship,
    )
    for (const clause of ['A human writes these and a human signs them', 'nothing client-facing is AI-signed']) {
      assert.ok(mine.includes(clause), `owner questions state: ${clause}`)
      assert.ok(theirs.includes(clause), `and client names already did: ${clause}`)
    }
  })

  it('marks its example as not an entry, and ships with nothing to collide with yet', () => {
    // **This test used to be called `keeps the worked example out of the data`
    // over a body asserting `wording === []`.** Those are different claims and
    // the class frame proved it: the same body under the same name failed the
    // day content arrived, not because an example leaked but because the array
    // stopped being empty. Rule 12, instance 4.
    //
    // The collision property now belongs to the rule-13 scan in
    // `doctrine.test.ts`, which holds it over all three schema files — including
    // this one, whose content has not landed yet. What is left here is the
    // narrower thing this test can actually see.
    const w = wording()
    assert.ok('workedExample' in w)
    assert.match(JSON.stringify(w.workedExample), /NOT AN ENTRY/)
    assert.deepEqual(w.wording, [], 'still empty — and when it is not, this line is the one to re-read')
  })
})

/**
 * Access conditions — Amendment 5.
 *
 * **Raised by the owner from field experience rather than from the documents**,
 * and it is the case that shows why: a concierge will not ask an owner to unbury
 * septic lids for Discovery photographs and then not really do anything.
 */
describe('§B · an inspection point declares its access condition', () => {
  const point = (over: Partial<import('../src/engine/classFrame.js').InspectionPoint> = {}) => ({
    id: 'sludge-and-scum-depth', label: 'Sludge and scum depth', kind: 'measure' as const,
    unit: 'cm', ...over,
  })

  it('defaults to direct, because most points are', () => {
    // Unlike `unit`, whose absence is an error. The asymmetry is deliberate:
    // requiring every direct point to say so would be noise.
    assert.equal(DEFAULT_ACCESS, 'direct')
    assert.deepEqual(checkAccess(frame({ inspectionPoints: [point({ access: undefined })] })), [])
  })

  it('refuses a gated point that cannot name its event', () => {
    // A point nobody can schedule would sit on the Inspection Visit list forever
    // looking like work.
    const p = checkAccess(frame({
      inspectionPoints: [point({ access: 'requires-access-event' })],
    }))
    assert.equal(p.length, 1)
    assert.equal(p[0]?.code, 'access-event-unnamed')
    assert.match(p[0]?.problem ?? '', /nobody can schedule/)
  })

  it('accepts a gated point that names its event', () => {
    assert.deepEqual(
      checkAccess(frame({
        inspectionPoints: [point({ access: 'requires-access-event', accessEvent: 'septic-pump-out' })],
      })), [])
  })

  it('catches an event left behind by an edit', () => {
    // `requires-access-found` with a pump-out attached means either the access
    // condition is wrong or the event is stale. Both are worth surfacing.
    const p = checkAccess(frame({
      inspectionPoints: [point({ access: 'requires-access-found', accessEvent: 'septic-pump-out' })],
    }))
    assert.equal(p[0]?.code, 'access-event-orphaned')
  })

  it('carries all three values, and the septic case is the worked one', () => {
    // From Amendment 5 §B1, which is ratified content rather than an invention.
    const f = frame({
      inspectionPoints: [
        point({ id: 'bed-surface-condition', kind: 'look', unit: undefined, access: 'direct' }),
        point({ id: 'riser-and-access-condition', kind: 'look', unit: undefined, access: 'requires-access-found' }),
        point({ access: 'requires-access-event', accessEvent: 'septic-pump-out' }),
      ],
    })
    assert.deepEqual(checkAccess(f), [])
    assert.deepEqual(auditClassFrame(f, walkConfig()).problems, [])
  })

  it('records that a gated point is not a gap, where a reader will find it', () => {
    // The distinction Amendment 5 §B turns on. It is not enforceable by a check
    // here — the gap report is elsewhere — so it is written where the person
    // building that render will be reading.
    const raw = JSON.parse(
      readFileSync(join(repoRoot, 'schema', 'class-frame-v1.json'), 'utf8'),
    ) as Record<string, unknown>
    const a = JSON.stringify(raw.accessConditions)
    assert.match(a, /is not a failure to inspect/)
    assert.match(a, /must never render as a gap/)
    assert.match(a, /COORDINATION item, not a visit item/)
  })

  it('records that nothing the engine produces can direct a Discovery capture', () => {
    // Amendment 5 §C, stated for the whole engine. An access condition is
    // exactly the thing that reads like a capture instruction, which is why the
    // boundary is in this file rather than only in the amendment.
    const raw = JSON.parse(
      readFileSync(join(repoRoot, 'schema', 'class-frame-v1.json'), 'utf8'),
    ) as Record<string, unknown>
    const d = JSON.stringify(raw.discoveryIsNotOursToDirect)
    assert.match(d, /Discovery precedes identification/)
    assert.match(d, /NOTHING THE ENGINE PRODUCES CAN DIRECT A DISCOVERY CAPTURE/)
    assert.match(d, /Checklist Master, driven by a property flag/)
  })

  it('points at the real class rather than carrying a second copy of it', () => {
    // **This test used to assert `classes` was empty and was named for a
    // property it did not check.** Rule 12. The worked class carried a full
    // `shape` because the file shipped with no classes and nothing else could
    // show one — and within a day of the content landing that copy said
    // `componentType: none` while `componentTypeRules.septicTankResolved`, in
    // the same file, had resolved it to `septic-lid`. One file, two answers to
    // its own question. A pointer cannot drift, so it points.
    const raw = JSON.parse(
      readFileSync(join(repoRoot, 'schema', 'class-frame-v1.json'), 'utf8'),
    ) as { workedClass: Record<string, unknown> }
    const w = raw.workedClass
    assert.match(JSON.stringify(w.note), /NOT AN ENTRY/)
    assert.ok(!('shape' in w), 'no second copy of the class')
    assert.ok(
      readClassFrame().classes.some((c) => c.id === w.walksThrough),
      `workedClass.walksThrough names \`${String(w.walksThrough)}\`, which is not a declared class`)
  })

  it('names three inspection points in prose, and every claim it makes about them is true', () => {
    // It used to quote all three as objects. The rule-13 scan in `doctrine.test.ts`
    // fired on that and was right: an example carrying an id plus fields is a
    // second declaration, which is the shape that had already drifted once here.
    // So the block names them and the claims are checked instead — the same
    // treatment `theContrastWorthSeeing` gets below.
    const story = JSON.stringify(
      (JSON.parse(readFileSync(join(repoRoot, 'schema', 'class-frame-v1.json'), 'utf8')) as
        { workedClass: Record<string, unknown> }).workedClass.theAccessStoryItIsHereToTell)
    const f = readClassFrame()
    const declared = new Map(f.inspectionPoints.map((p) => [p.id, p]))

    for (const id of ['tank-lid-security', 'riser-and-access-condition']) {
      assert.ok(story.includes(id), `the story names \`${id}\``)
      assert.equal(declared.get(id)?.access, 'requires-access-found', `and calls \`${id}\` access-found`)
    }
    const gated = declared.get('sludge-and-scum-depth')
    assert.ok(story.includes('sludge-and-scum-depth'))
    assert.equal(gated?.access, 'requires-access-event')
    assert.equal(gated?.accessEvent, 'septic-pump-out', 'the story names the event it rides')
    assert.ok(story.includes('septic-pump-out'))

    // And all three belong to the class the block points at, which is the only
    // reason naming them here teaches anything.
    const tank = f.classes.find((c) => c.id === 'septic-tank')
    for (const id of ['tank-lid-security', 'riser-and-access-condition', 'sludge-and-scum-depth']) {
      assert.ok(tank?.inspectionPoints.includes(id), `\`${id}\` is one of septic-tank's own points`)
    }
  })

  it('and the contrast paragraph’s claim about the bed is true of the bed’s own points', () => {
    // `theContrastWorthSeeing` supplies the third condition the tank cannot show:
    // *every one of septic-bed's points is direct.* That is a claim about data
    // sitting in prose, which is the shape that goes stale silently — the bed
    // gaining one gated point would make the file wrong with nothing objecting.
    const f = readClassFrame()
    const bed = f.classes.find((c) => c.id === 'septic-bed')
    assert.ok(bed, 'the contrast names a real class')
    const declared = new Map(f.inspectionPoints.map((p) => [p.id, p]))
    assert.ok(bed.inspectionPoints.length > 0)
    for (const id of bed.inspectionPoints) {
      assert.equal(declared.get(id)?.access ?? DEFAULT_ACCESS, 'direct',
        `the file says every septic-bed point is direct; \`${id}\` is not`)
    }
  })
})
