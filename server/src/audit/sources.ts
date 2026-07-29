/**
 * The seam — schema source vocabulary on one side, this repo's tables on the
 * other.
 *
 * **This is the one module allowed to name both**, and it exists as its own file
 * for that reason. A mapping has to name both sides; the failure to avoid is
 * that knowledge being *scattered* — a source prefix tested inline here, another
 * assumed there, and no single place to look when the schema adds one. The
 * audit-engine doctrine scan exempts this file by name and nothing else.
 *
 * CLAUDE.md §3: the builder has six inputs and a field visit populates maybe
 * eight of twenty-three sections. **Most of these are not wired yet, and that is
 * the normal state rather than a defect.** What matters is that a slot the
 * builder cannot see says so, instead of reporting a bare gap that reads as
 * *the client owes us this*.
 */

import type { Db } from '../db/index.js'
import type { Slot } from './schema.js'

export interface ReadContext {
  visitId: string
  importId: string
}

interface SourceReader {
  /** The schema's own prefix, matched against `sources[]` before any dot or colon. */
  prefix: string
  /** In plain words, for the note on an unwired slot. */
  label: string
  /**
   * How many entries this repo holds for a slot fed by this source.
   *
   * Absent means **not wired**: the input is real and this builder does not read
   * it yet. Never a zero — a zero would say *nothing was captured* where the
   * truth is *nothing can be captured here yet*, and those have different fixes.
   */
  count?: (db: Db, ctx: ReadContext) => number
}

const READERS: SourceReader[] = [
  {
    prefix: 'field',
    label: 'the field manifest',
    count: (db, { importId }) =>
      (db.prepare('SELECT COUNT(*) AS n FROM notes WHERE import_id = ?').get(importId) as { n: number }).n,
  },
  {
    prefix: 'desk',
    label: 'desk capture',
    count: (db, { visitId }) =>
      (db.prepare(
        `SELECT COUNT(*) AS n FROM overlays WHERE visit_id = ? AND kind = 'memory'`,
      ).get(visitId) as { n: number }).n,
  },
  {
    prefix: 'ai',
    label: 'AI extraction',
    // Deliberately no reader, and NOT because it is unbuilt.
    //
    // An AI value reaches the binder as an OVERLAY A HUMAN SIGNED, never as a
    // generation row — doctrine 5, and the reason the acceptance path is the
    // only thing in the codebase allowed to read `ai_generations` at all. The
    // audit counting proposals would be a second route by which an unsigned
    // reading could reach a rendered page, so where an AI-sourced value is
    // wanted here it arrives through `desk` like every other signed act.
  },

  // Declared, deliberately unread. Naming them is the point: an unwired slot
  // that says which input it is waiting on is a different message from one that
  // says nothing, and the six inputs are a design fact rather than a backlog.
  { prefix: 'intake', label: 'the client intake form' },
  { prefix: 'documents', label: "the client's own documents" },
  { prefix: 'lab', label: 'lab results' },
  { prefix: 'research', label: 'research' },
  { prefix: 'reference', label: 'reference data' },
  { prefix: 'human', label: 'human judgement' },
  { prefix: 'template', label: 'a template' },
  { prefix: 'trigger-set', label: 'the property trigger set' },
  { prefix: 'business-data', label: 'business data' },
  { prefix: 'client-data', label: 'client data' },
  { prefix: 'property', label: 'property triggers' },
  { prefix: 'edition', label: 'the edition record' },
]

/** The prefix of a source, before any dot or colon. `field.pin.layer:shutoffs` → `field`. */
export const prefixOf = (source: string): string => source.split(/[.:]/)[0] ?? source

/** A source naming a binder slot or section rather than an external input. */
export const isSlotReference = (source: string): boolean => /^s\d+/.test(source)

const readerFor = (source: string): SourceReader | undefined =>
  READERS.find((r) => r.prefix === prefixOf(source))

/** Can this builder read anything that feeds this slot? */
export const isWired = (source: string): boolean =>
  isSlotReference(source) || readerFor(source)?.count !== undefined

/**
 * Why a slot has nothing behind it, in the words a person needs.
 *
 * *"no source wired yet: this slot comes from the client intake form"* sends
 * somebody to the right place. *"empty"* sends them to the house.
 */
export function unwiredNote(slot: Slot): string | undefined {
  const sources = slot.sources ?? []
  if (sources.length === 0) return undefined
  if (sources.some(isWired)) return undefined

  const named = [...new Set(sources.map((s) => readerFor(s)?.label ?? prefixOf(s)))]
  return `no source wired yet: this slot comes from ${named.join(', ')}, which this builder does not read`
}

/** How many entries this repo holds for a slot, across every source it can read. */
export function countEntries(db: Db, slot: Slot, ctx: ReadContext): number {
  const seen = new Set<string>()
  let total = 0
  for (const source of slot.sources ?? []) {
    const reader = readerFor(source)
    if (!reader?.count || seen.has(reader.prefix)) continue
    seen.add(reader.prefix)
    total += reader.count(db, ctx)
  }
  return total
}
