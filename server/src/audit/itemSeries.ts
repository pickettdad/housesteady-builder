/**
 * The cross-visit answer series for one checklist item — Increment 4 §4,
 * claiming Increment 3 §1d.
 *
 * **The rule was implemented in Increment 3; showing it to a person was not.**
 * `propertyEvidence` already detects §1k.1 supersession and refuses to join
 * across it. This is the surface that lets somebody *see* the break.
 *
 * ---
 *
 * ## Why a retirement ends a series rather than continuing it
 *
 * Checklist Master §2: *an item that **moves** keeps its id; an item that is
 * **redefined** retires, and the replacement takes a new id. A retired id is
 * never reissued.* The master's own reason is this module's whole job:
 *
 * > a resolution recorded against a retired id becoming attached to a
 * > differently-meaning item is false continuity, and a stale test result
 * > silently vouching for something nobody checked is worse than an honest
 * > orphan.
 *
 * `liv.egress` is the worked case. It retired at master v1.8 into four
 * successors, and it carried **a number** — so nobody can say which dimension a
 * past reading measured. A number carries false precision: it looks like data, so
 * nothing about it invites doubt. Showing `4, 4, 4` across three visits where the
 * question changed underneath is the failure.
 *
 * So: **the series ends at the break and the later answers start a new one.**
 * Never joined, never averaged, never drawn as one line.
 *
 * ---
 *
 * ## INTERNAL ONLY, and the spec is explicit
 *
 * > A retired item id is a discontinuity in **our record**, not something the
 * > client did or failed to do, and it must never reach the client-facing report.
 *
 * A doctrine scan keeps this module out of `report/`. Nothing here composes a
 * client sentence and nothing here carries a client-facing name.
 *
 * ---
 *
 * ## What this repo cannot show, and will not pretend to
 *
 * Increment 3 §1d asks for a Table F cross-check — *"this binding refers to an
 * item retired at v1.8; Table F records the successors."*
 *
 * **This repo cannot name the successors.** Table F lives in the Checklist
 * Master, which is read-only reference in `/docs/reference/` and which a doctrine
 * scan forbids any code path from reading. The binder schema records the *rule*
 * (`retirementLineage`) and not the *data*. So `successors` is not an empty array
 * here — it is `null`, with `lineageAvailable: false` beside it, because an empty
 * list would read as *this item has no successors* when the truth is *this repo
 * has never been given the lineage.*
 *
 * That is rule 7 in the shape it keeps taking: a field whose input is always
 * absent, reported as an answer. **The ask is Table F as a machine-readable file
 * in `/schema`, the way the maintenance schedule already is** — recorded in the
 * open items, not worked around here.
 */

import type { Db } from '../db/index.js'
import { itemScopeKey, type ItemScope } from './activeItems.js'
import { lineageFor, loadLineage, type Lineage } from './lineage.js'
import { visitSequence, type VisitPoint } from './visitSequence.js'

/** One recorded answer, at one visit. */
export interface SeriesPoint {
  visitId: string
  /** The walk date, where the manifest carries a session start. */
  date: string | null
  /** `satisfied` · `na` · whatever the field recorded. Verbatim. */
  kind: string | null
  reasonId: string | null
  result: string | null
  /** The config version this answer was recorded under. */
  configVersion: string | null
  /** The import it came from, so a person can open the evidence. */
  importId: string
}

/**
 * Where a series stops and why.
 *
 * **`retired` is the only reason today and the field is still a field**, because
 * the next reason — an item whose `measure` unit changed, say — is the same class
 * and would otherwise arrive as a second boolean.
 */
export interface SeriesBreak {
  reason: 'retired'
  /** The last visit before the break. The series ends here. */
  afterVisitId: string
  /** The config version under which the item was last declared. */
  lastDeclaredUnder: string | null
  /** The current config version, which no longer declares it. */
  notDeclaredUnder: string | null
  /**
   * **Null, not empty.** See the module note: Table F is not readable from here,
   * so this repo cannot say what the successors are — and an empty array would
   * say there are none.
   */
  successors: string[] | null
  /** False whenever `successors` is null, said out loud rather than inferred. */
  lineageAvailable: boolean
  note: string
}

export interface ItemSeries {
  scope: ItemScope
  scopeKey: string
  itemId: string
  /** Desk display. May name a zone type; never reaches a client. */
  where: string
  /**
   * The answers, oldest first, **as separate runs.**
   *
   * One run for an unbroken item. Two or more where a retirement split it — and
   * they are separate arrays rather than one array with a marker in it, because a
   * consumer that renders a list would draw the marker as a row and the line as
   * continuous. **The shape refuses the join; a flag would only ask for it.**
   */
  runs: SeriesPoint[][]
  /** One entry per boundary between runs. `runs.length - 1` of them. */
  breaks: SeriesBreak[]
  /** True when anything broke. The cheap read for a list view. */
  discontinuous: boolean
}

export interface SeriesResult {
  series: ItemSeries[]
  sequence: VisitPoint[]
  /** Items whose series broke. Named, never only counted — rule 2. */
  discontinuities: string[]
  warnings: string[]
}

/**
 * Every item on this property that has more than one recorded answer, plus
 * every item whose series broke.
 *
 * **Single-answer items are excluded by default and that is a display decision,
 * not a data one.** A series of one is not a series, and on the reference export
 * it would return several hundred rows of noise around the interesting few.
 * `includeSingletons` turns it off for a caller that wants everything.
 */
export function itemSeries(args: {
  db: Db
  propertyId: string
  includeSingletons?: boolean
  /** Injectable so a test can supply a filled table against an empty repo. */
  lineage?: Lineage
}): SeriesResult {
  const { db, propertyId, includeSingletons = false } = args
  const seq = visitSequence(db, propertyId)
  const warnings: string[] = [...seq.warnings]

  // F10. Empty today, and the reader ships anyway: the day the field session
  // supplies the table, this display gains successors with no code change.
  const lineage = args.lineage ?? loadLineage()
  warnings.push(...lineage.warnings)

  // Which items each import's config declared. A retirement is an item declared
  // under one config and absent from a later one — read per import, because the
  // config that recorded an answer is the config it must be interpreted under.
  const declaredPerImport = new Map<string, { items: Set<string>; version: string | null }>()
  const importRows = db
    .prepare(
      `SELECT i.id, i.config_version, c.snapshot
         FROM imports i LEFT JOIN config_snapshots c ON c.import_id = i.id
        WHERE i.property_id = ?`,
    )
    .all(propertyId) as { id: string; config_version: string | null; snapshot: string | null }[]

  for (const row of importRows) {
    declaredPerImport.set(row.id, {
      items: itemIdsOf(row.snapshot),
      version: row.config_version,
    })
  }

  // The newest import's config is the current definition — §1j.
  const newest = db
    .prepare(
      `SELECT id, config_version FROM imports WHERE property_id = ? ORDER BY imported_at DESC, id DESC LIMIT 1`,
    )
    .get(propertyId) as { id: string; config_version: string | null } | undefined
  const currentItems = newest ? declaredPerImport.get(newest.id)?.items ?? new Set<string>() : new Set<string>()

  // Labels for the desk. Latest label per zone and pin wins, same as everywhere.
  const zoneLabels = new Map(
    (db
      .prepare(
        `SELECT z.zone_id, z.label, z.type FROM zones z JOIN imports i ON i.id = z.import_id
          WHERE i.property_id = ? ORDER BY i.imported_at`,
      )
      .all(propertyId) as { zone_id: string; label: string | null; type: string | null }[])
      .map((z) => [z.zone_id, z.label ?? (z.type ? `the ${z.type}` : 'an unnamed zone')]),
  )
  const pinLabels = new Map(
    (db
      .prepare(
        `SELECT p.pin_id, p.number, p.component_type, p.freeform_label FROM pins p
           JOIN imports i ON i.id = p.import_id WHERE i.property_id = ? ORDER BY i.imported_at`,
      )
      .all(propertyId) as { pin_id: string; number: number | null; component_type: string | null; freeform_label: string | null }[])
      .map((p) => [p.pin_id, p.freeform_label ?? p.component_type ?? `pin ${p.number ?? '—'}`]),
  )

  const rows = db
    .prepare(
      `SELECT r.scope_kind, r.scope_zone_id, r.scope_pin_id, r.item_id, r.kind, r.reason_id,
              r.result, r.import_id, i.visit_id, i.imported_at
         FROM resolutions r JOIN imports i ON i.id = r.import_id
        WHERE r.property_id = ? ORDER BY i.imported_at, r.id`,
    )
    .all(propertyId) as {
    scope_kind: string | null; scope_zone_id: string | null; scope_pin_id: string | null
    item_id: string; kind: string | null; reason_id: string | null; result: string | null
    import_id: string; visit_id: string | null; imported_at: string
  }[]

  // Group by (scope, item), keeping the sequence's order.
  const grouped = new Map<string, { scope: ItemScope; itemId: string; points: SeriesPoint[] }>()
  for (const r of rows) {
    const scope: ItemScope = { kind: r.scope_kind ?? 'session', zoneId: r.scope_zone_id, pinId: r.scope_pin_id }
    const scopeKey = itemScopeKey(scope)
    const key = `${scopeKey}/${r.item_id}`
    const entry = grouped.get(key) ?? { scope, itemId: r.item_id, points: [] }
    const visit = r.visit_id ? seq.visits[seq.indexOf.get(r.visit_id) ?? -1] : undefined
    entry.points.push({
      visitId: r.visit_id ?? '',
      date: visit?.date ?? null,
      kind: r.kind,
      reasonId: r.reason_id,
      result: r.result,
      configVersion: declaredPerImport.get(r.import_id)?.version ?? null,
      importId: r.import_id,
    })
    grouped.set(key, entry)
  }

  const series: ItemSeries[] = []
  const discontinuities: string[] = []

  for (const [key, entry] of grouped) {
    // Ordered by the WALK, not by import. Two exports of one visit are one
    // point in the sequence; the later one wins for that visit.
    entry.points.sort((a, b) => {
      const ai = seq.indexOf.get(a.visitId) ?? -1
      const bi = seq.indexOf.get(b.visitId) ?? -1
      return ai - bi
    })

    /**
     * The break, and where it falls.
     *
     * An item declared under the config that recorded an answer and **absent
     * from the current config** retired between the two. The series ends at the
     * last answer recorded under a config that still declared it.
     */
    const breaks: SeriesBreak[] = []
    const runs: SeriesPoint[][] = []

    // The last answer recorded under a config that still declared the item. The
    // break falls after it — everything later is an answer to a question that no
    // longer exists under that id.
    const lastDeclared = [...entry.points]
      .reverse()
      .find((p) => declaredPerImport.get(p.importId)?.items.has(entry.itemId))

    if (lastDeclared && !currentItems.has(entry.itemId)) {
      // Everything up to and including the last answer under a declaring config
      // is run one; anything after it — there is normally nothing — is run two.
      const cut = entry.points.indexOf(lastDeclared) + 1
      runs.push(entry.points.slice(0, cut))
      const after = entry.points.slice(cut)
      if (after.length > 0) runs.push(after)
      /**
       * **`null` and `[]` are different answers, and this is the branch that
       * keeps them apart.**
       *
       * No entry means nobody has told us. An entry with no successors means the
       * question stopped being asked — a known none. A `?? []` here would
       * collapse the two and undo the entire lineage file.
       */
      const known = lineageFor(lineage, entry.itemId)
      const under = declaredPerImport.get(lastDeclared.importId)?.version ?? 'an earlier config'
      const stillIn = newest?.config_version ?? 'the current config'
      const ends = `this series ends here — \`${entry.itemId}\` was declared under ${under} and is ` +
        `absent from ${stillIn}. Checklist Master §2: a redefined item retires and the replacement takes ` +
        'a new id, so the answers before and after are answers to different questions.'

      breaks.push({
        reason: 'retired',
        afterVisitId: lastDeclared.visitId,
        lastDeclaredUnder: declaredPerImport.get(lastDeclared.importId)?.version ?? null,
        notDeclaredUnder: newest?.config_version ?? null,
        successors: known ? known.successors : null,
        lineageAvailable: known !== null,
        note: known === null
          ? `${ends} **Table F records where the content went; this builder has not been given it** — ` +
            'the master is reference-only by doctrine and `schema/retirement-lineage-v1.json` is still ' +
            'shape-only — so the successors are shown as unknown rather than as none. Open item F10.'
          : known.successors.length === 0
            ? `${ends} The master records it retiring at ${known.retiredAt} with **no replacement** — a ` +
              'question that stopped being asked, which is a known none rather than an unknown.' +
              (known.note ? ` ${known.note}` : '')
            : `${ends} The master records the content continuing at ${known.retiredAt} as ` +
              `${known.successors.join(', ')}. **Shown, never joined** — the successors are a different ` +
              'question and software does not draw one line through them.' +
              (known.note ? ` ${known.note}` : ''),
      })
      discontinuities.push(`${key} (last declared under ${declaredPerImport.get(lastDeclared.importId)?.version ?? '?'})`)
    } else {
      runs.push(entry.points)
    }

    const totalPoints = runs.reduce((n, r) => n + r.length, 0)
    if (!includeSingletons && totalPoints < 2 && breaks.length === 0) continue

    series.push({
      scope: entry.scope,
      scopeKey: itemScopeKey(entry.scope),
      itemId: entry.itemId,
      where: entry.scope.kind === 'zone'
        ? zoneLabels.get(entry.scope.zoneId ?? '') ?? 'a zone this property does not carry'
        : entry.scope.kind === 'pin'
          ? pinLabels.get(entry.scope.pinId ?? '') ?? 'a pin this property does not carry'
          : 'this visit',
      runs,
      breaks,
      discontinuous: breaks.length > 0,
    })
  }

  if (discontinuities.length > 0) {
    const unknown = series.filter((s) => s.breaks.some((b) => !b.lineageAvailable)).length
    warnings.push(
      `${discontinuities.length} item series end at a retirement and are NOT joined to any successor: ` +
        `${discontinuities.slice(0, 5).join(', ')}${discontinuities.length > 5 ? ', …' : ''}. ` +
        (unknown > 0
          ? `${unknown} of them have no recorded lineage, so their successors read as unknown rather ` +
            'than as none — see open item F10. '
          : '') +
        'Where lineage IS recorded it is shown to a person and never joined by software.',
    )
  }

  series.sort((a, b) =>
    a.discontinuous === b.discontinuous
      ? a.scopeKey.localeCompare(b.scopeKey) || a.itemId.localeCompare(b.itemId)
      : a.discontinuous ? -1 : 1)

  return { series, sequence: seq.visits, discontinuities, warnings }
}

/** Every checklist item id one config snapshot declares. */
function itemIdsOf(snapshot: string | null): Set<string> {
  const out = new Set<string>()
  if (!snapshot) return out
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(snapshot) as Record<string, unknown>
  } catch {
    return out
  }
  const collect = (items: unknown): void => {
    if (!Array.isArray(items)) return
    for (const i of items) {
      const id = (i as { id?: unknown })?.id
      if (typeof id === 'string') out.add(id)
    }
  }
  for (const key of ['baseLists', 'zoneLists', 'componentLists']) {
    const lists = parsed[key]
    if (Array.isArray(lists)) for (const entry of lists) collect((entry as { items?: unknown }).items)
  }
  collect(parsed.sessionItems)
  return out
}
