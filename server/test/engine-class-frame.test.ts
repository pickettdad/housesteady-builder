/**
 * The class frame — Increment 5 §1, Amendment 3 §B.
 *
 * **Every check in this module is idle against the shipped file**, because the
 * shipped file has no classes. So almost every test here constructs its input.
 * That is not test convenience — it is rule 11 written down: *a check whose
 * distinguishing input is never present has not been passing, it has been idle*,
 * and the shipped frame can never supply that input by design.
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

describe('the class frame ships empty, and says so', () => {
  it('reads the shipped file with no classes and calls that its honest state', () => {
    const f = readClassFrame()
    assert.equal(f.absent, false)
    assert.equal(f.classes.length, 0)
    assert.deepEqual(
      [f.careCategories.length, f.inspectionPoints.length, f.opportunityConditions.length, f.ownerQuestions.length],
      [0, 0, 0, 0])
    assert.match(f.note, /honest one/)
  })

  it('tells a missing file apart from a file declaring nothing', () => {
    // Opposite claims that look identical to a caller checking `classes.length`.
    const missing = readClassFrame(join(scratchDir(), 'no-such-frame.json'))
    assert.equal(missing.absent, true)
    assert.equal(readClassFrame().absent, false)
    assert.match(missing.note, /Nothing is wrong/)
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
    const a = auditClassFrame(readClassFrame(), walkConfig())
    assert.deepEqual(a.problems, [])
    assert.match(a.note, /not a pass — it is an empty run/)
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

  it('is idle against the shipped file, which is why every test above builds its own', () => {
    // Rule 11 made explicit. If this ever stops being true the shipped file has
    // gained classes and these tests should be re-read, not deleted.
    assert.deepEqual(checkVocabulary(readClassFrame()), [])
    assert.equal(readClassFrame().classes.length, 0)
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

  it('keeps the worked example out of the data', () => {
    // Same guard `retirement-lineage-v1.json` uses: an example inside the array
    // would be read as a ratified question by anything that iterates it.
    const w = wording()
    assert.ok('workedExample' in w)
    assert.deepEqual(w.wording, [])
    assert.match(JSON.stringify(w.workedExample), /NOT AN ENTRY/)
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

  it('keeps the worked class out of the data', () => {
    // Same guard as the wording file's example and the lineage file's: a class
    // inside `classes` would be read as declared by anything iterating it.
    const raw = JSON.parse(
      readFileSync(join(repoRoot, 'schema', 'class-frame-v1.json'), 'utf8'),
    ) as Record<string, unknown>
    assert.ok('workedClass' in raw)
    assert.deepEqual(raw.classes, [])
    assert.match(JSON.stringify(raw.workedClass), /NOT AN ENTRY/)
    assert.equal(readClassFrame().classes.length, 0, 'and the reader still sees none')
  })
})
