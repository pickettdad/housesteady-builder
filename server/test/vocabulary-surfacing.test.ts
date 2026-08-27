/**
 * ⚑ Fail open on vocabulary — **and the second half, which was missing.**
 *
 * `vocabulary.ts` states the rule itself: *"The test for fail-open is not that
 * unknown words are tolerated — it is that they are tolerated AND surfaced. A
 * silently swallowed word is the same failure as a crash, just slower."*
 *
 * **Three vocabularies were tolerated and not surfaced.** Measured through the
 * real import path against the real walk export, by planting a value and asking
 * whether the validation report ever mentions it:
 *
 * | field | before |
 * |---|---|
 * | `media.kind` | surfaced |
 * | `zone.type` | surfaced |
 * | **`media.intent`** | ⛑ **swallowed** — and this is exactly how `floorplan` and `mesh` arrived without a word being said |
 * | **`canvas.kind`** | ⛑ **swallowed** |
 * | **`session.propertyFlag`** | ⛑ **swallowed — and it is the serious one.** A flag gates an item or a whole list; `base:mechanical-base` is gated on `has_mechanicals`. **A flag this build has never met changes the scope of a visit's checklist and says nothing** |
 *
 * ⚑ **Register rule 59: the proof a widened check works is a planted value it
 * catches, never the absence of one it did not.** So every case here plants.
 *
 * *Prerequisite for the Capture-Kind Contract Note, 2026-08-26.*
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runImport } from '../src/import/runImport.js'
import { freshDb, makePropertyAndVisit, readWalk, scratchDir, TEST_OPERATOR } from './helpers.js'

/**
 * Every open vocabulary the canonical import carries, and how it is settled.
 *
 * ⚑ **Declared here because a scan cannot derive it** — `CanonicalImport` is a
 * TypeScript type and its fields carry no runtime mark saying *this one is a
 * word from the field app*. **So the inventory is written down and every entry
 * is exercised below.**
 *
 * ⛑ **The residual limit, stated rather than discovered:** a NEW open vocabulary
 * added to the adapter and to neither this list nor `vocabulary.ts` still slips.
 * *This list makes the existing ones provable; it does not make the next one
 * impossible.* **The tell that one is missing is a field the adapter reads whose
 * values never appear in any import report.**
 */
const OPEN_VOCABULARY: { field: string; plant: (m: Record<string, unknown>) => string }[] = [
  {
    field: 'media.kind',
    plant: (m) => { (m.media as Record<string, unknown>[])[1]!.kind = 'zz-mediakind'; return 'zz-mediakind' },
  },
  {
    field: 'media.intent',
    plant: (m) => { (m.media as Record<string, unknown>[])[0]!.intent = 'zz-intent'; return 'zz-intent' },
  },
  {
    field: 'zone.type',
    plant: (m) => { (m.zones as Record<string, unknown>[])[0]!.type = 'zz-zonetype'; return 'zz-zonetype' },
  },
  {
    field: 'canvas.kind',
    plant: (m) => {
      const z = (m.zones as Record<string, unknown>[])[0]!
      const canvases = z.canvases as Record<string, unknown>[]
      canvases[0]!.kind = 'zz-canvaskind'
      return 'zz-canvaskind'
    },
  },
  {
    field: 'session.propertyFlag',
    plant: (m) => {
      const s = m.session as { flags?: string[] }
      s.flags = [...(s.flags ?? []), 'zz-propflag']
      return 'zz-propflag'
    },
  },
]

let seq = 0
async function importWith(mutate: (m: Record<string, unknown>) => string): Promise<{ planted: string; report: string; status: string }> {
  const m = JSON.parse(readWalk()) as Record<string, unknown>
  // A new session id per import — migration 011 refuses the same capture twice.
  ;(m.session as { sessionId: string }).sessionId = `01a02616-0000-7000-8000-00000000${String(++seq).padStart(4, '0')}`
  const planted = mutate(m)
  const db = freshDb()
  const ids = makePropertyAndVisit(db)
  const r = await runImport({ actorId: TEST_OPERATOR, db, ...ids, raw: JSON.stringify(m), dataDir: scratchDir() })
  const row = db.prepare('SELECT validation_report AS v, status FROM imports WHERE id = ?').get(r.importId) as
    { v: string; status: string }
  db.close()
  return { planted, report: row.v, status: row.status }
}

describe('⚑ every open vocabulary surfaces an unknown word', () => {
  for (const { field, plant } of OPEN_VOCABULARY) {
    it(`${field} — a word this build has never met reaches the report`, async () => {
      const { planted, report } = await importWith(plant)
      assert.ok(
        report.includes(planted),
        `an unknown ${field} was accepted and never mentioned — tolerated is half the rule, surfaced is the other half`,
      )
    })
  }

  it('and none of them fails the import — tolerated AND surfaced, not one or the other', async () => {
    // Fail open on vocabulary is the first half and it must survive the second.
    const { status } = await importWith((m) => {
      (m.media as Record<string, unknown>[])[0]!.intent = 'zz-intent'
      ;(m.session as { flags?: string[] }).flags = ['zz-propflag']
      return 'zz'
    })
    assert.notEqual(status, 'refused', 'an unmet word is never a reason to refuse an import')
  })
})

describe('the check is not noise — the words the field actually sends stay quiet', () => {
  /**
   * A check that fires on everything trains people past it — the same rule the
   * field repo wrote after three diagnostics spoke on the majority case.
   */
  it('accepts the intents Field 6 emits without flagging them', async () => {
    const { report } = await importWith((m) => {
      const media = m.media as Record<string, unknown>[]
      media[0]!.intent = 'floorplan'
      media[1]!.intent = 'mesh'
      media[2]!.intent = 'room-shot'
      return 'floorplan'
    })
    const terms = (JSON.parse(report) as { unrecognizedTerms?: { field: string }[] }).unrecognizedTerms ?? []
    assert.deepEqual(terms.filter((t) => t.field === 'media.intent'), [],
      'floorplan, mesh and room-shot are known words and must not be reported as unmet')
  })

  it('accepts the property flags the walk actually declares', async () => {
    const { report } = await importWith(() => 'well')
    const terms = (JSON.parse(report) as { unrecognizedTerms?: { field: string }[] }).unrecognizedTerms ?? []
    assert.deepEqual(terms.filter((t) => t.field === 'session.propertyFlag'), [],
      'the config declares these — reading them from the config is what keeps this quiet')
  })
})
