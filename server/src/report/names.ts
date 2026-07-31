/**
 * Loading the client-facing name table and the na-reason label mapping.
 *
 * Both are **binder vocabulary** — decisions this repo makes about what a
 * homeowner reads — and both are versioned, content-hashed config rather than
 * literals in code, for the reason every other config file here is: *"why does
 * this March gap report say something different from September's"* has to be
 * answerable from the record.
 *
 * **Why they are not in the field config**, which is Amendment 1 §B's ruling and
 * the reasoning generalises: an honesty label is a claim the BINDER makes about
 * what kind of knowing a statement rests on. The field app makes no such claim —
 * it records that a concierge chose a reason. Deciding that `no-access` reads as
 * *Not accessible* **to a homeowner** is a binder-voice decision, and pushing it
 * into the field config would put a downstream concern onto a session that
 * cannot validate it.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadSchema, schemaRoot, type LoadedSchema } from '../audit/schema.js'
import type { DescribeItem, GapLabel } from './clientVoice.js'
import { describeFromNames } from './clientVoice.js'

export interface ClientNames {
  version: string
  hash: string
  describe: DescribeItem
  /** How many names are declared. Reported, because today it is zero. */
  declared: number
}

export function loadClientNames(path = join(schemaRoot, 'client-names-v1.json')): ClientNames {
  const text = readFileSync(path, 'utf8')
  const raw = JSON.parse(text) as Record<string, unknown>
  const names = raw.names && typeof raw.names === 'object' && !Array.isArray(raw.names)
    ? (raw.names as Record<string, unknown>)
    : {}
  return {
    version: typeof raw.version === 'string' ? raw.version : '',
    // Hashed as read, before parsing — the same discipline the schema loader
    // uses. A hash taken after a round-trip through JSON.parse is a hash of this
    // process's serializer, not of the file somebody edited.
    hash: createHash('sha256').update(text).digest('hex'),
    describe: describeFromNames(raw),
    declared: Object.values(names).filter((v) => typeof v === 'string' && v.trim() !== '').length,
  }
}

/**
 * Which honesty label an `na` reason reads as — from the schema, per §B.
 *
 * **An unmapped reason is not an error.** It takes the declared default and the
 * caller reports it. The asymmetry is the whole point: *we did not inspect it*
 * is true of every gap in the report, while *we could not reach it* additionally
 * claims we tried and were blocked. A reason defaulting to `not-accessible`
 * would put a claim about the visit into a client's document that nobody made.
 *
 * **Only the honesty class comes from here.** Membership in the gap list still
 * comes from the config's own `feedsGapList` boolean, and the row's words still
 * come from the config's own `label` — so a fifth gap-feeding reason needs no
 * code change and no entry here.
 */
export interface NaLabelMap {
  labelFor: (naReasonId: string | null) => GapLabel
  /** True where the reason has no entry and took the default. For reporting. */
  isDefaulted: (naReasonId: string | null) => boolean
  declared: Record<string, string>
}

export function naLabelMap(schema: LoadedSchema = loadSchema()): NaLabelMap {
  const rules = schema.raw.labelRules
  const section = rules && typeof rules === 'object' ? (rules as Record<string, unknown>).naReasonLabels : undefined
  const body = section && typeof section === 'object' ? (section as Record<string, unknown>) : {}

  const declared: Record<string, string> = {}
  const map = body.map
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    for (const [reason, label] of Object.entries(map as Record<string, unknown>)) {
      if (typeof label === 'string') declared[reason] = label
    }
  }

  /**
   * The default is read from the schema, not defaulted in code.
   *
   * A schema that declares no default is a schema defect, and the fallback here
   * is the SAFE label rather than a refusal — this runs while composing a
   * client's document, and failing the render over a missing config line would
   * trade a true-but-generic sentence for no document at all.
   */
  const fallback = typeof body.default === 'string' ? body.default : 'not-inspected'

  const asGapLabel = (value: string): GapLabel =>
    value === 'not-accessible' ? 'not-accessible' : 'not-inspected'

  return {
    labelFor: (reason) => asGapLabel(reason !== null && reason in declared ? declared[reason]! : fallback),
    isDefaulted: (reason) => reason === null || !(reason in declared),
    declared,
  }
}
