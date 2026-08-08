/**
 * The render gate — Honesty-Label Mapping §6a, ruled 2026-08-08.
 *
 * **The failure under test is a page that reads confidently.** A dollar figure
 * with no label, sitting among labelled values, reads as evidence-derived when
 * it is a judgement HouseSteady makes. Every test here is about that sentence
 * being impossible to omit rather than merely available.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadSchema } from '../src/audit/schema.js'
import { lint } from '../src/report/houseStyle.js'
import type { Slot } from '../src/audit/schema.js'
import {
  blockedSlots, gate, outsideVocabulary, outsideVocabularySlots, RenderGateRefused,
} from '../src/report/renderGate.js'

const withDeclaration = (renderNote: string | null, id = 's19.reserve-figure'): Slot =>
  ({
    id,
    kind: 'fixed',
    outsideHonestyVocabulary: { why: 'A judgement, not a measurement.', renderNote },
  }) as unknown as Slot

describe('the two slots that carry no honesty label', () => {
  it('are declared in the schema, and are exactly two', () => {
    const declared = outsideVocabularySlots(loadSchema())
    assert.deepEqual(
      declared.map((d) => d.slot.id).sort(),
      ['s19.reserve-figure', 's2.next-review'],
    )
  })

  it('each states why, because the reason is what a later reader checks', () => {
    for (const { slot, declared } of outsideVocabularySlots(loadSchema())) {
      assert.ok(declared.why.length > 40, `${slot.id} gives a reason worth reading`)
    }
  })

  it('both now carry their words, landed 2026-08-08', () => {
    // Written by the design session against each slot's own `why`. Until they
    // arrived the gate refused for want of words, which was the honest state.
    for (const { declared } of outsideVocabularySlots(loadSchema())) {
      assert.ok((declared.renderNote ?? '').length > 40)
    }
    assert.deepEqual(blockedSlots(loadSchema()).map((b) => b.blocking), ['gate.unrenderable-words'])
  })

  it('each sentence says the value is a judgement rather than a reading', () => {
    // The `why` on each slot states what its sentence has to convey. This is
    // that requirement as a check, so a later reword cannot quietly drop it.
    const byId = new Map(outsideVocabularySlots(loadSchema()).map((d) => [d.slot.id, d.declared.renderNote ?? '']))
    assert.match(byId.get('s19.reserve-figure')!, /not a measurement/)
    assert.match(byId.get('s19.reserve-figure')!, /may point somewhere different/)
    assert.match(byId.get('s2.next-review')!, /our judgement, not a date the house has set/)
  })

  it('the reserve sentence does not state the age of equipment as a fact', () => {
    // Ruled 2026-08-08e. The old wording — "how old it is" — asserted a firmer
    // basis than the record supports: doctrine 4 keeps install dates `unknown`
    // rather than guessing, so most are Inferred at best. That is
    // identification-never-assessment failing inside the copy written to
    // enforce it, which is why one word was worth a ruling.
    const reserve = new Map(
      outsideVocabularySlots(loadSchema()).map((d) => [d.slot.id, d.declared.renderNote ?? '']),
    ).get('s19.reserve-figure')!
    assert.doesNotMatch(reserve, /how old it is\b/)
  })
})

describe('the reserve sentence cannot render, and the reason is a document collision', () => {
  /**
   * **Two ratified documents disagree and neither is this repo's to amend.**
   *
   * House Style §6, carried verbatim in `prompts/house-style/v001.md`: *"Never
   * write a sentence whose confidence exceeds its label. Probably, **appears to
   * be**, seems are usually a sign that an `Inferred` value is trying to pass as
   * `Observed`. Either the evidence supports the claim or the label changes."*
   *
   * The reserve sentence, ruled 2026-08-08e, contains *"how old it appears to
   * be"* — and it is on a slot declared `outsideHonestyVocabulary`, so it has no
   * label to exceed and neither remedy the rule offers is available.
   *
   * **These tests pin the blocked state rather than approve it.** Every one goes
   * red the moment either side is resolved, which is correct: a resolution
   * should force a change here, not slip past. Rule 11b — a check whose two
   * sides cannot disagree has not been passing.
   */
  const reserveSlot = () => outsideVocabularySlots(loadSchema()).find((d) => d.slot.id === 's19.reserve-figure')!

  it('s2.next-review lints clean, so this is one sentence and not a broken lint', () => {
    const next = outsideVocabularySlots(loadSchema()).find((d) => d.slot.id === 's2.next-review')!
    assert.deepEqual(lint(next.declared.renderNote ?? '', next.slot.id), [])
  })

  it('the reserve sentence trips exactly one rule, and it is the hedge rule', () => {
    const { slot, declared } = reserveSlot()
    const violations = lint(declared.renderNote ?? '', slot.id)
    assert.equal(violations.length, 1)
    assert.equal(violations[0]?.rule, 'a hedge that outruns its label')
    assert.equal(violations[0]?.found, 'appears to be')
  })

  it('the gate refuses it, rather than clearing words the render will reject', () => {
    // The failure this closes: words that exist pass the words-are-written
    // check, get composed beside the figure, and die at the render lint with
    // nothing pointing back at the sentence that caused it.
    const { slot } = reserveSlot()
    assert.throws(
      () => gate(slot, '$4,200'),
      (e: unknown) =>
        e instanceof RenderGateRefused &&
        e.code === 'gate.unrenderable-words' &&
        e.violations.length === 1,
    )
  })

  it('blockedSlots names it, so a screen cannot report all-clear while the gate refuses', () => {
    const blocked = blockedSlots(loadSchema())
    assert.deepEqual(blocked.map((b) => b.slotId), ['s19.reserve-figure'])
    assert.equal(blocked[0]?.blocking, 'gate.unrenderable-words')
    assert.equal(blocked[0]?.violations[0]?.found, 'appears to be')
  })
})

describe('the gate refuses rather than rendering bare', () => {
  it('refuses when the words have not been written', () => {
    assert.throws(
      () => gate(withDeclaration(null), '$4,200'),
      (e: unknown) => e instanceof RenderGateRefused && e.code === 'gate.no-words',
    )
  })

  it('refuses an empty note as firmly as a null one', () => {
    // Otherwise the gate is opened by typing a space, which is worse than no
    // gate: it looks satisfied.
    assert.throws(
      () => gate(withDeclaration('   '), '$4,200'),
      (e: unknown) => e instanceof RenderGateRefused && e.code === 'gate.no-words',
    )
  })

  it('passes once the words exist, carrying them with the value', () => {
    const cleared = gate(withDeclaration('A figure HouseSteady sets, not one the house reports.'), '$4,200')
    assert.equal(cleared.value, '$4,200')
    assert.match(cleared.note, /HouseSteady sets/)
    assert.equal(cleared.slotId, 's19.reserve-figure')
  })

  it('refuses a blank value, because silence where a figure belongs is its own wrong answer', () => {
    assert.throws(
      () => gate(withDeclaration('Some words.'), '  '),
      (e: unknown) => e instanceof RenderGateRefused && e.code === 'gate.no-value',
    )
  })

  it('refuses a slot that never declared itself outside the vocabulary', () => {
    // Such a slot carries a label like every other. Letting it through here
    // would make the gate a way to render anything unlabelled.
    assert.throws(
      () => gate({ id: 's7.components', kind: 'record-set' } as unknown as Slot, 'x'),
      (e: unknown) => e instanceof RenderGateRefused && e.code === 'gate.not-declared',
    )
  })
})

describe('a malformed declaration is not an absent one', () => {
  /**
   * **Absent means an ordinary labelled slot**, which is a value that goes
   * straight past this gate. So a declaration the gate cannot read has to
   * refuse rather than fall through to the safe-looking reading.
   */
  it('refuses a declaration that is not an object', () => {
    assert.throws(
      () => outsideVocabulary({ id: 's19.reserve-figure', outsideHonestyVocabulary: 'yes' } as unknown as Slot),
      (e: unknown) => e instanceof RenderGateRefused && e.code === 'gate.unreadable-declaration',
    )
  })

  it('refuses a declaration with no reason', () => {
    assert.throws(
      () => outsideVocabulary({
        id: 's2.next-review', outsideHonestyVocabulary: { renderNote: 'words' },
      } as unknown as Slot),
      (e: unknown) => e instanceof RenderGateRefused && e.code === 'gate.no-reason',
    )
  })

  it('refuses a renderNote that is neither a sentence nor null', () => {
    assert.throws(
      () => outsideVocabulary({
        id: 's2.next-review', outsideHonestyVocabulary: { why: 'because', renderNote: 0 },
      } as unknown as Slot),
      (e: unknown) => e instanceof RenderGateRefused && e.code === 'gate.bad-render-note',
    )
  })

  it('reads an absent declaration as absent, which is the ordinary case', () => {
    assert.equal(outsideVocabulary({ id: 's7.components' } as unknown as Slot), null)
    assert.equal(
      outsideVocabulary({ id: 's7.components', outsideHonestyVocabulary: null } as unknown as Slot),
      null,
    )
  })
})

describe('reporting is not the gate', () => {
  /**
   * The distinction that makes this a gate rather than a field: a screen may
   * report the state, and reporting it must never become a way to render.
   * **Constructed rather than read from the schema, deliberately** — both real
   * slots now carry their words, so a test that read them would assert nothing
   * and pass forever. Rule 11b: a check whose two sides cannot disagree has not
   * been passing.
   */
  it('a slot blockedSlots names still refuses when handed to the gate', () => {
    const unwritten = { id: 's19.reserve-figure', outsideHonestyVocabulary: { why: 'A judgement.', renderNote: null } } as unknown as Slot
    const schema = { slots: [unwritten] } as unknown as Parameters<typeof blockedSlots>[0]

    assert.deepEqual(blockedSlots(schema).map((b) => b.slotId), ['s19.reserve-figure'])
    assert.throws(() => gate(unwritten, '$4,200'), RenderGateRefused)
  })

  it('reports the reason, so a screen can say why without reaching for the value', () => {
    const unwritten = { id: 's2.next-review', outsideHonestyVocabulary: { why: 'A date we choose.', renderNote: null } } as unknown as Slot
    const schema = { slots: [unwritten] } as unknown as Parameters<typeof blockedSlots>[0]
    assert.deepEqual(blockedSlots(schema), [
      { slotId: 's2.next-review', why: 'A date we choose.', blocking: 'gate.no-words', violations: [] },
    ])
  })

  it('says nothing about a slot whose words are written and renderable', () => {
    // The converse, and it is the half that keeps the report honest: a slot that
    // clears must not appear, or every screen shows a permanent false alarm.
    const fine = withDeclaration('A figure HouseSteady sets, not one the house reports.')
    const schema = { slots: [fine] } as unknown as Parameters<typeof blockedSlots>[0]
    assert.deepEqual(blockedSlots(schema), [])
    assert.equal(gate(fine, '$4,200').value, '$4,200')
  })
})

describe('the gate lints the words it clears', () => {
  /**
   * Constructed rather than read from the schema, so these survive the reserve
   * sentence's collision being resolved. The schema-backed tests above pin
   * today's blocked state; these pin the behaviour that outlives it.
   */
  it('refuses a note carrying a banned word, naming the rule and not the regex', () => {
    assert.throws(
      () => gate(withDeclaration('We fixed the issue, which was serious.'), '$4,200'),
      (e: unknown) =>
        e instanceof RenderGateRefused &&
        e.code === 'gate.unrenderable-words' &&
        e.violations.length === 3 &&
        /House Style/.test(e.message),
    )
  })

  it('refuses before it looks at the value, because the words are the slot-level fault', () => {
    // A blank value and unrenderable words together must report the words: the
    // value is this call's problem, the sentence is everyone's.
    assert.throws(
      () => gate(withDeclaration('This guarantees no issues.'), '  '),
      (e: unknown) => e instanceof RenderGateRefused && e.code === 'gate.unrenderable-words',
    )
  })

  it('carries the violations on the error, so a screen shows what to fix', () => {
    try {
      gate(withDeclaration('Condition: poor, and we monitor your home.'), '$4,200')
      assert.fail('expected a refusal')
    } catch (e) {
      assert.ok(e instanceof RenderGateRefused)
      assert.deepEqual(e.violations.map((v) => v.rule).sort(), ['a condition grade', 'the monitor rule'])
      assert.ok(e.violations.every((v) => v.where === 's19.reserve-figure'))
    }
  })

  it('clears a note that lints clean, and hands back the words with the value', () => {
    const cleared = gate(withDeclaration('A date we choose, and you can tell us to come sooner.'), '2027-03-01')
    assert.equal(cleared.value, '2027-03-01')
    assert.match(cleared.note, /a date we choose/i)
  })
})
