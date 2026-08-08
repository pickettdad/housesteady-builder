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

  it('both are blocked today, and that is the honest state', () => {
    // The words are client-facing copy and this repo does not invent it. A gate
    // that passed by default would be the field it was built instead of.
    assert.deepEqual(
      blockedSlots(loadSchema()).map((b) => b.slotId).sort(),
      ['s19.reserve-figure', 's2.next-review'],
    )
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
  it('blockedSlots clears nothing — it only says what is blocking', () => {
    // The distinction that makes this a gate rather than a field: a screen may
    // report the state, and reporting it must not become a way to render.
    const blocked = blockedSlots(loadSchema())
    assert.ok(blocked.length > 0)
    for (const b of blocked) {
      const slot = loadSchema().slots.find((s) => s.id === b.slotId)!
      assert.throws(() => gate(slot, '$4,200'), RenderGateRefused, `${b.slotId} still refuses`)
    }
  })
})
