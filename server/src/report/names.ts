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
import type { Db } from '../db/index.js'
import { newId, now } from '../db/index.js'
import type { DescribeItem, GapLabel, ItemName } from './clientVoice.js'
import { describeFromNames, mergeNames } from './clientVoice.js'

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
 * Names written inline in the editor — company-wide, and unratified until confirmed.
 *
 * **The gate exists because the table is company-wide.** A name is keyed on the
 * item id rather than on the property, because the name of a thing does not
 * change between houses — which is precisely why one person's first draft
 * silently becoming everyone's needs to be visible. Same pattern as the golden
 * set: written, usable, and marked until the design session confirms it.
 *
 * **The file wins over an inline name.** A ratified name is house style; an
 * inline one is a proposal. Letting the proposal shadow it would be a text box
 * quietly overriding a reviewed decision.
 */
export function writtenNames(db: Db): DescribeItem {
  const rows = db
    .prepare(
      `SELECT item_id, name, actor_id, ratified_at, created_at FROM client_names ORDER BY seq`,
    )
    .all() as { item_id: string; name: string; actor_id: string; ratified_at: string | null; created_at: string }[]

  // Latest wins per item. Append-only in, one answer out — a rewrite is a new
  // row and the old one stays, so *what did this say in March* is answerable.
  const latest = new Map<string, ItemName>()
  for (const r of rows) {
    latest.set(r.item_id, {
      text: r.name,
      ratified: r.ratified_at !== null,
      writtenBy: r.actor_id,
      writtenAt: r.created_at,
    })
  }
  return (itemId) => latest.get(itemId)
}

/** Write a name from the editor. Unratified by construction — nothing here sets `ratified_at`. */
export function writeName(args: {
  db: Db
  itemId: string
  name: string
  actorId: string
  propertyId?: string | null
}): string {
  const id = newId()
  const at = now()
  const next = (args.db
    .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM client_names')
    .get() as { n: number }).n
  args.db
    .prepare(
      `INSERT INTO client_names (id, item_id, name, actor_id, property_id, ratified_at, ratified_by, seq, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    )
    .run(id, args.itemId, args.name.trim(), args.actorId, args.propertyId ?? null, next, at)
  return id
}

/**
 * Every unratified name, for whoever is doing the confirming.
 *
 * **Never summon a human to a blank space** — CLAUDE.md §9. A ratification queue
 * that says *"3 names await review"* and nothing else makes somebody go and find
 * them. This carries the wording, who wrote it, when, and which house they were
 * looking at, because that context is what makes a name judgeable.
 */
export function unratifiedNames(db: Db): {
  id: string; itemId: string; name: string; actorId: string; propertyId: string | null; at: string
}[] {
  return (db
    .prepare(
      `SELECT n.id, n.item_id, n.name, n.actor_id, n.property_id, n.created_at
         FROM client_names n
        WHERE n.ratified_at IS NULL
          AND n.seq = (SELECT MAX(m.seq) FROM client_names m WHERE m.item_id = n.item_id)
        ORDER BY n.seq DESC`,
    )
    .all() as { id: string; item_id: string; name: string; actor_id: string; property_id: string | null; created_at: string }[])
    .map((r) => ({
      id: r.id, itemId: r.item_id, name: r.name, actorId: r.actor_id,
      propertyId: r.property_id, at: r.created_at,
    }))
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

/**
 * The lookup the whole report uses: the reviewed file, then anything written inline.
 *
 * One call site, so nothing can accidentally consult only half of it — a
 * composer reading the file alone would withhold rows a concierge has already
 * named, and one reading the database alone would let a proposal shadow house
 * style.
 */
export function describeItems(db: Db, file = loadClientNames()): DescribeItem {
  return mergeNames(file.describe, writtenNames(db))
}
