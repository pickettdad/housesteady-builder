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
    // arrived the gate refused, which was the honest state and the point of it.
    assert.deepEqual(blockedSlots(loadSchema()), [])
    for (const { declared } of outsideVocabularySlots(loadSchema())) {
      assert.ok((declared.renderNote ?? '').length > 40)
    }
  })

  it('each sentence says the value is a judgement rather than a reading', () => {
    // The `why` on each slot states what its sentence has to convey. This is
    // that requirement as a check, so a later reword cannot quietly drop it.
    const byId = new Map(outsideVocabularySlots(loadSchema()).map((d) => [d.slot.id, d.declared.renderNote ?? '']))
    assert.match(byId.get('s19.reserve-figure')!, /not a measurement/)
    assert.match(byId.get('s19.reserve-figure')!, /may point somewhere different/)
    assert.match(byId.get('s2.next-review')!, /our judgement, not a date the house has set/)
  })

  it('both pass the House Style lint, because the render would otherwise refuse them', () => {
    // Client copy the render rejects is worse than no copy: it passes this gate
    // and dies at the next one, with the figure already composed.
    for (const { slot, declared } of outsideVocabularySlots(loadSchema())) {
      assert.deepEqual(lint(declared.renderNote ?? '', slot.id), [], `${slot.id} is renderable`)
    }
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
    assert.deepEqual(blockedSlots(schema), [{ slotId: 's2.next-review', why: 'A date we choose.' }])
  })
})
