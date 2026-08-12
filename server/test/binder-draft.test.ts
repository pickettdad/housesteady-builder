/**
 * The Home Binder draft — stage 12.
 *
 * **Three kinds of empty, and the whole point is that not all of them are gaps.**
 * A binder showing thirteen legitimately-empty sections as thirteen holes gets
 * reviewed on the wrong thirteen things.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildDraft, renderDraft, type BinderProfile, type BinderSchema } from '../src/report/binderDraft.js'
import { repoRoot } from './helpers.js'

const schema = JSON.parse(readFileSync(join(repoRoot, 'schema', 'binder-schema-v1.json'), 'utf8')) as BinderSchema
const profile = JSON.parse(
  readFileSync(join(repoRoot, 'schema', 'profiles', 'baseline-v1.json'), 'utf8'),
) as BinderProfile

const empty = { counts: new Map<string, number>(), noProducer: new Set<string>() }

describe('the spine is derived, never authored', () => {
  it('renders all 23 sections and all 41 slots from the schema', () => {
    const d = buildDraft(schema, profile, empty)
    assert.equal(d.counts.sections, 23)
    assert.equal(d.counts.slots, 41)
  })

  it('classifies every slot — the profile leaves none undeclared', () => {
    // If this fails the profile and the schema have drifted, and the draft can
    // no longer say which kind of empty a section is.
    assert.deepEqual(buildDraft(schema, profile, empty).undeclared, [])
  })

  it('partitions an empty house into 28 gaps, 7 correctly empty and 6 out of scope', () => {
    const d = buildDraft(schema, profile, empty)
    assert.equal(d.counts.gaps, 28)
    assert.equal(d.counts.correctlyEmpty, 7)
    assert.equal(d.counts.outOfScope, 6)
    assert.equal(d.counts.filled, 0)
    assert.equal(d.counts.gaps + d.counts.correctlyEmpty + d.counts.outOfScope, d.counts.slots)
  })
})

describe('⚑ not all empty is a gap', () => {
  const d = buildDraft(schema, profile, empty)
  const slot = (id: string) => d.sections.flatMap((s) => s.slots).find((s) => s.id === id)!

  it('calls a required empty slot a gap', () => {
    assert.equal(slot('s7.components').expectation, 'required')
    assert.match(slot('s7.components').says, /GAP/)
  })

  it('calls a present-when-populated empty slot CORRECT, not a gap', () => {
    // `s9.finishes` is empty when the house has no finishes register, which is
    // an ordinary state and not something owed.
    assert.equal(slot('s9.finishes').expectation, 'presentWhenPopulated')
    assert.match(slot('s9.finishes').says, /correctly so/)
    assert.doesNotMatch(slot('s9.finishes').says, /GAP/)
  })

  it('calls an out-of-scope slot not a hole at all', () => {
    // Rendering these six as gaps would manufacture six problems.
    assert.equal(slot('s18.projects').expectation, 'outOfScope')
    assert.match(slot('s18.projects').says, /not a gap/)
  })

  it('the six out-of-scope slots are the profile\'s six, not a guess', () => {
    const oos = d.sections.flatMap((s) => s.slots).filter((s) => s.expectation === 'outOfScope').map((s) => s.id)
    assert.deepEqual(oos.sort(), [...profile.outOfScope].sort())
  })
})

describe('a gap says WHY it is empty, and one reason is the reviewable one', () => {
  it('separates a missing producer from a missing fact', () => {
    // *Nothing here because nobody built the producer* is the only one an
    // outside reviewer can critique — no visit to this house would close it.
    const d = buildDraft(schema, profile, {
      counts: new Map(),
      noProducer: new Set(['s10.concerns']),
      awaiting: new Set(['s13.tests']),
    })
    const slot = (id: string) => d.sections.flatMap((s) => s.slots).find((s) => s.id === id)!

    assert.equal(slot('s10.concerns').emptyReason, 'no-producer')
    assert.match(slot('s10.concerns').says, /nothing in the builder can fill this yet/)

    assert.equal(slot('s13.tests').emptyReason, 'no-data-yet')
    assert.match(slot('s13.tests').says, /input has not arrived/)

    assert.equal(slot('s7.components').emptyReason, 'not-captured')
  })

  it('gives no reason to a slot that is not a gap', () => {
    const d = buildDraft(schema, profile, { counts: new Map(), noProducer: new Set(['s18.projects']) })
    const oos = d.sections.flatMap((s) => s.slots).find((s) => s.id === 's18.projects')!
    // Out of scope outranks having no producer: it is not owed, so it is not a gap.
    assert.equal(oos.emptyReason, undefined)
  })

  it('a filled slot is filled whatever the profile says', () => {
    const d = buildDraft(schema, profile, { counts: new Map([['s7.components', 34]]), noProducer: new Set() })
    const s = d.sections.flatMap((x) => x.slots).find((x) => x.id === 's7.components')!
    assert.equal(s.filled, true)
    assert.equal(s.count, 34)
    assert.match(s.says, /34 entries/)
    assert.equal(buildDraft(schema, profile, { counts: new Map([['s7.components', 34]]), noProducer: new Set() }).counts.gaps, 27)
  })
})

describe('the render puts every heading in, including the empty ones', () => {
  const md = renderDraft(buildDraft(schema, profile, empty), { house: 'A house', date: '2026-08-12' })

  it('carries all 23 section headings', () => {
    for (const sec of schema.sections) {
      assert.ok(md.includes(`### ${sec.number}. ${sec.title}`), `${sec.id} heading missing`)
    }
  })

  it('carries all 41 slot titles', () => {
    for (const sec of schema.sections) {
      for (const s of sec.slots ?? []) {
        assert.ok(md.includes(`**${s.title ?? s.id}**`), `${s.id} slot missing`)
      }
    }
  })

  it('tells the reviewer the three kinds apart in the header', () => {
    assert.match(md, /28 gaps/)
    assert.match(md, /7 correctly empty/)
    assert.match(md, /6 out of scope/)
    assert.match(md, /manufacture 6 problems that do not exist/)
  })

  it('says what to critique, and points at the missing producers', () => {
    assert.match(md, /nothing in the builder can fill this yet/)
    assert.match(md, /are the ones worth your time/)
    assert.match(md, /missing producers rather than missing data/)
  })

  it('reports an undeclared slot rather than defaulting it', () => {
    // If the profile ever drifts from the schema, the document says so instead
    // of quietly calling the slot a gap.
    const drifted: BinderProfile = { ...profile, required: profile.required.filter((s) => s !== 's7.components') }
    const d = buildDraft(schema, drifted, empty)
    assert.deepEqual(d.undeclared, ['s7.components'])
    assert.match(renderDraft(d, { house: 'x', date: 'y' }), /the profile does not classify/)
  })
})
