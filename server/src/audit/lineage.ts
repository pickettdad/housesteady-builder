/**
 * Retirement lineage — open item F10.
 *
 * **The consumer of a file that is deliberately empty.** Increment 3 §1d asks the
 * builder to cross-check a retirement against Table F and say where the content
 * went. It cannot: Table F lives in the Checklist Master, which is read-only
 * reference and which a doctrine scan forbids any code path from reading.
 *
 * So `schema/retirement-lineage-v1.json` is the shape that data would take, with
 * no entries in it. This module reads it. **Both halves ship now, and neither is
 * speculative work** — the change request going to the field session has a
 * concrete artifact to ask for instead of a description, and the day the file is
 * filled the display works with no code change.
 *
 * ---
 *
 * ## The distinction this module exists to preserve
 *
 * | | `successors` | `lineageAvailable` | Means |
 * |---|---|---|---|
 * | no entry for the id | `null` | `false` | **we have never been told** |
 * | entry, empty `successors` | `[]` | `true` | **we know there is no replacement** |
 *
 * Those are opposite claims and they look identical to a consumer that checks
 * length. A question that stopped being asked and a question whose answer nobody
 * gave us are different facts about the record, and a homeowner's binder is the
 * wrong place to discover that they were merged.
 *
 * **Sixth instance** of declared-versus-absent deciding a design here, after
 * declared-and-false in the trigger evaluator, typed/stub/undeclared for
 * component types, the verbatim zone-attribute map, `since`'s four bases, and
 * `defaultLabel: null`.
 *
 * ---
 *
 * ## Fail open on a missing file, fail closed on a broken one
 *
 * The file being absent is the ordinary state today and must not stop an audit —
 * so a missing file yields an empty lineage and a note saying so. A file that is
 * present and unparseable is structure, and refuses loudly: doctrine 7, and the
 * same split `loadSchema` already makes.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { schemaRoot } from './schema.js'

export interface LineageEntry {
  retiredId: string
  /** The master version at which it retired. */
  retiredAt: string
  /** **Empty is a value.** See the module note. */
  successors: string[]
  /** Open vocabulary — displayed verbatim, never mapped onto a reason we know. */
  reason: string | null
  note: string | null
}

export interface Lineage {
  /** Keyed by retired item id. */
  entries: Map<string, LineageEntry>
  version: string | null
  /**
   * True when the file exists and parsed — **not when it has entries in it.**
   *
   * A present, empty file still knows nothing about any particular id, so this
   * says the source was readable and nothing more. `lookup()` is what decides
   * whether a given id has an answer.
   */
  loaded: boolean
  note: string
  warnings: string[]
}

export class LineageRefused extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'LineageRefused'
  }
}

/** What is known about one retired id. Null where nothing is. */
export interface LineageAnswer {
  successors: string[]
  retiredAt: string
  reason: string | null
  note: string | null
}

export function loadLineage(path = join(schemaRoot, 'retirement-lineage-v1.json')): Lineage {
  const warnings: string[] = []
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    // Ordinary, today. An audit must not stop because a file nobody has been
    // given yet is not there.
    return {
      entries: new Map(),
      version: null,
      loaded: false,
      note: 'no retirement-lineage file is present, so where a retired item\'s content went is unknown ' +
        'for every id — not "no item has successors"',
      warnings,
    }
  }

  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch (e) {
    // Structure. A file that is present and broken is a different thing from a
    // file that is absent, and swallowing it would make a typo look like an
    // empty table.
    throw new LineageRefused(`${path} is not readable JSON: ${(e as Error).message}`, 'lineage.unparseable')
  }

  const entries = new Map<string, LineageEntry>()
  const rows = Array.isArray(raw.entries) ? (raw.entries as Record<string, unknown>[]) : []

  for (const row of rows) {
    const retiredId = typeof row.retiredId === 'string' ? row.retiredId : null
    const retiredAt = typeof row.retiredAt === 'string' ? row.retiredAt : null
    if (!retiredId || !retiredAt) {
      warnings.push(
        `a lineage entry is missing ${!retiredId ? 'retiredId' : 'retiredAt'} and was not loaded: ` +
          `${JSON.stringify(row).slice(0, 120)}. "This series ends" is only useful with a where.`,
      )
      continue
    }

    /**
     * **`successors` absent is not `successors: []`.**
     *
     * An entry that cannot say what happened is not an entry — it claims
     * knowledge it does not have, and the whole file exists to keep those apart.
     * So it is refused as a row rather than defaulted to empty.
     */
    if (!Array.isArray(row.successors)) {
      warnings.push(
        `the lineage entry for ${retiredId} declares no \`successors\` array and was not loaded. An ` +
          'empty array means "no replacement" and is legitimate; an absent key claims to know something ' +
          'it does not, and would read as "no replacement" downstream.',
      )
      continue
    }

    if (entries.has(retiredId)) {
      warnings.push(
        `${retiredId} appears twice in the lineage file. A retired id is never reissued (master §2), so ` +
          'two entries is a data problem — the first was kept and the second ignored rather than merged.',
      )
      continue
    }

    entries.set(retiredId, {
      retiredId,
      retiredAt,
      successors: row.successors.filter((s): s is string => typeof s === 'string'),
      reason: typeof row.reason === 'string' ? row.reason : null,
      note: typeof row.note === 'string' ? row.note : null,
    })
  }

  const version = typeof raw.version === 'string' ? raw.version : null
  const terminal = [...entries.values()].filter((e) => e.successors.length === 0).length

  return {
    entries,
    version,
    loaded: true,
    note: entries.size === 0
      ? 'the retirement-lineage file is present and declares no entries, so where a retired item\'s ' +
        'content went is unknown for every id. **Shape only** — F10 asks the field session for the data; ' +
        'this is the artifact the request points at.'
      : `${entries.size} retirement(s) with recorded lineage` +
        (terminal > 0 ? `, ${terminal} of which retired with no replacement — a known none, not an unknown` : ''),
    warnings,
  }
}

/**
 * What happened to one retired id, or null where nothing is known.
 *
 * **Null and `{successors: []}` are the two answers this function exists to keep
 * apart.** A caller doing `lookup(id)?.successors ?? []` collapses them and
 * undoes the whole file.
 */
export const lineageFor = (lineage: Lineage, itemId: string): LineageAnswer | null => {
  const entry = lineage.entries.get(itemId)
  if (!entry) return null
  return {
    successors: entry.successors,
    retiredAt: entry.retiredAt,
    reason: entry.reason,
    note: entry.note,
  }
}
