/**
 * ⚑ The golden session plan — this repo's half of a two-repo tripwire.
 *
 * The session plan is described in four places: the `SessionPlan` interface, the
 * prose contract in `/docs`, the field side's receiver, and the field side's
 * copy of the contract. **Nothing bound any of them.** The first thing that
 * would have noticed a drift is an import failing weeks later, with no way to
 * tell which side moved.
 *
 * So one committed artifact binds both sides: this repo tests that the emitter
 * still produces it, and the field repo tests that its receiver still parses it.
 *
 * **What this does NOT do, stated here because a green tick is exactly how a
 * tripwire gets mistaken for a guarantee:** nothing here can see the field repo,
 * run its tests, or stop it merging. The whole mechanism is *when the shape
 * changes, this suite fails first* — which forces a regenerate, and the
 * regenerate is what forces a note to the field side. **A note a person still
 * has to send.** If nobody sends it, this file does nothing at all.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import {
  emitGoldenPlan,
  GOLDEN_PATH,
  readGolden,
  serialise,
  stabilise,
} from '../src/plan/goldenFixture.js'
import { PLAN_SCHEMA_VERSION } from '../src/plan/sessionPlan.js'

const scratch = (): string => mkdtempSync(join(tmpdir(), 'housesteady-golden-'))

describe('⚑ the emitter still produces the committed artifact', () => {
  it('reproduces it byte for byte', async () => {
    /**
     * **Two independent sides.** The committed file was written by a previous
     * run and is read from disk; the other side is emitted now, from the walk
     * export, through the real import and audit. *A test that regenerated and
     * compared the regeneration to itself could not fail* — which is the shape
     * this whole exercise is about.
     *
     * When this fails: if the new shape is the one you meant, run
     * `npm run plan-fixture` and **send the field side the new artifact.**
     */
    const { plan, volatile } = await emitGoldenPlan(scratch())
    const fresh = serialise(stabilise(plan, volatile))
    const committed = readFileSync(GOLDEN_PATH, 'utf8')

    if (fresh !== committed) {
      const a = JSON.parse(committed) as Record<string, unknown>
      const b = JSON.parse(fresh) as Record<string, unknown>
      const moved = [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
        .join(', ')
      assert.fail(
        `the emitted session plan no longer matches ${basename(GOLDEN_PATH)}. Changed: ${moved || '(ordering only)'}. ` +
          'Run `npm run plan-fixture` if the new shape is intended — and send it to the field side, ' +
          'because nothing here can fail their build.',
      )
    }
  })

  it('stabilises everything that varies between runs, and nothing that does not', async () => {
    /**
     * The stabiliser substitutes run-dependent VALUES rather than a list of
     * field paths, so a value landing in a new field is still caught. This is
     * the check that the substitution list is complete **today**: two separate
     * emissions mint different uuids and different timestamps, and if any of
     * them survives into the payload unsubstituted, the two disagree.
     *
     * A new volatile field therefore fails here rather than churning the
     * committed file on every regenerate. **The fix is to add it to
     * `stabilise`, never to loosen this comparison.**
     */
    const first = await emitGoldenPlan(scratch())
    const second = await emitGoldenPlan(scratch())
    assert.equal(
      serialise(stabilise(first.plan, first.volatile)),
      serialise(stabilise(second.plan, second.volatile)),
      'two runs stabilise differently, so something run-dependent is not being substituted',
    )
  })
})

describe('the artifact says what it is', () => {
  const golden = readGolden()

  it('carries the schema version its filename claims', () => {
    // A version bump would otherwise overwrite `…_v1.json` with v2 content, and
    // the field side would hold a file whose name and contents disagree.
    assert.equal(golden.planSchemaVersion, PLAN_SCHEMA_VERSION)
    assert.match(basename(GOLDEN_PATH), new RegExp(`_v${PLAN_SCHEMA_VERSION}\\.json$`),
      'the version moved — rename the artifact and tell the field side, do not overwrite this one')
  })

  it('is a real house rather than an empty shape', () => {
    // A fixture that parses but contains nothing would let a receiver claim
    // coverage of a payload it has never seen populated.
    assert.equal(golden.kind, 'session-plan')
    assert.equal(golden.zones.length, 8)
    assert.equal(golden.typedPins.length, 9)
    assert.equal(golden.carriedGaps.length, 208)
    assert.ok(golden.zones.some((z) => Object.values(z.attributes).includes(true)), 'a decided-true attribute travels')
    assert.ok(golden.zones.some((z) => Object.values(z.attributes).includes(false)), 'and a decided-false one')
  })

  it('carries the field\'s flag on every typed pin, verbatim and uninterpreted', () => {
    /**
     * Cloud Field's review: the plan carried only `monitorsDue`, a *derivation*
     * of the flag. So visit two could say *check this one* and never *you
     * flagged this an issue last time* — and the field app cannot recover it,
     * because nothing about a house survives a visit on that side.
     *
     * **The raw value outlives the derivation.** At Increment 5 `monitorsDue`
     * stops reading flags entirely; this field is unaffected, because it is what
     * the field recorded rather than what this repo concluded.
     */
    const flags = golden.typedPins.map((p) => p.flag)
    assert.equal(flags.filter((f) => f === 'fine').length, 3)
    assert.equal(flags.filter((f) => f === 'issue').length, 1)
    assert.equal(flags.filter((f) => f === null).length, 5, 'null where there is no flag — never an absent key')
    assert.ok(golden.typedPins.every((p) => 'flag' in p), 'always present, so absent and none are not one state')

    // `fine` is not in KNOWN_FLAGS and travels anyway. The filtering happens in
    // `monitorsDue`, which is a conclusion; this array is evidence.
    assert.deepEqual(golden.monitorsDue, [], 'and none of them is promoted to a monitor')
  })

  it('says that flags on UNTYPED pins do not travel in this array', () => {
    // ⚑ Six live pins carry `fine`; only three are typed. A receiver reading
    // `typedPins[].flag` as the property's whole flag record would conclude the
    // other three were never flagged.
    assert.match(golden.sections.typedPins.note, /3 live pin\(s\) carry a flag and have no component type/)
    assert.match(golden.sections.typedPins.note, /not the property's whole flag record/)
  })

  it('does not claim a recorded false was a decision', () => {
    /**
     * ⚑ **This one was an overclaim in the payload, not a missing caveat.**
     *
     * The sentence read *"a recorded false is a decision and must not arrive as
     * an absence"* — half right. Cloud Field F-20: the July walk's bedroom
     * recorded `finished: false, sleeping: false` **from toggles nobody
     * touched**, and capture mode now refuses to ask attributes at zone creation
     * for that reason. So this fixture — the artifact that proves the emitter
     * works — carries decisions that were never made, on all eight zones.
     *
     * The format is unchanged and still right. What was wrong was the sentence
     * asserting an ambiguity away, **in the payload**, which is the one place an
     * overclaim reaches a reader who never opens the contract.
     */
    const note = golden.sections.zones.note
    assert.doesNotMatch(note, /a recorded false is a decision and/i)
    assert.match(note, /A recorded FALSE is not necessarily a decision/)
    assert.match(note, /before the field-side capture-mode fix/)
    assert.match(note, /a considered no and an untouched control are indistinguishable/)
    // And the half that was always right survives.
    assert.match(note, /A recorded key and an absent key are different things/)
  })

  it('carries the empty sections a receiver must not read as working mechanisms', () => {
    /**
     * Four sections are empty here and they are empty for **four different
     * reasons**, which is why `sections` carries a sentence and not just a
     * count. A receiver building against this file needs the empties as much as
     * the populated ones — they are the states it will see most often.
     */
    assert.deepEqual(golden.openConcerns, [], 'typed `never[]` — Increment 5, gated on manifest v4')
    assert.match(golden.sections.openConcerns.note, /recorded, not specced/)

    assert.deepEqual(golden.monitorsDue, [], 'no pin carries `monitor`')
    assert.match(golden.sections.monitorsDue.note, /6 fine/, 'but six carry `fine`, counted and not dropped')
    assert.ok(golden.warnings.some((w) => /does not recognise: fine \(6\)/.test(w)))

    assert.deepEqual(golden.comparisonPositionsDue, [], 'a baseline has no prior visit to compare against')
    assert.match(
      golden.sections.comparisonPositionsDue.note,
      /27 `\.unit` item\(s\) declared/,
      'and the note says the mechanism RAN — empty here is not unbuilt',
    )
  })
})
