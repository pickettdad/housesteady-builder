import type { Db } from '../db/index.js'
import type { ValidationReport } from './validate.js'

const parse = <T,>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string') return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

/** One row per media kind. Bytes are broken out because video changes the arithmetic. */
export interface MediaKindRow {
  kind: string | null
  count: number
  bytes: number
}

export interface ZoneRow {
  zoneId: string
  type: string | null
  label: string | null
  level: string | null
  closedAt: string | null
  pinCount: number
  mediaCount: number
  canvasCount: number
  resolutionCount: number
  coreUnresolved: string[]
  standardUnresolved: number
  naCount: number
  /** From events[] — the zone record keeps only the final close. */
  closeCount: number
  reopenCount: number
  reopenReasons: string[]
  /** Closed with nothing resolved in it. What a rushed visit produces. */
  closedWithNoWork: boolean
}

export function buildReport(db: Db, importId: string) {
  const imp = db.prepare('SELECT * FROM imports WHERE id = ?').get(importId) as
    | Record<string, unknown>
    | undefined
  if (!imp) return null

  const meta = db.prepare('SELECT * FROM session_meta WHERE import_id = ?').get(importId) as
    | Record<string, unknown>
    | undefined
  const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(imp.visit_id as string) as
    | Record<string, unknown>
    | undefined
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(imp.property_id as string) as
    | Record<string, unknown>
    | undefined

  const one = <T = Record<string, unknown>,>(sql: string, ...args: unknown[]): T =>
    db.prepare(sql).get(...args) as T
  const many = <T = Record<string, unknown>,>(sql: string, ...args: unknown[]): T[] =>
    db.prepare(sql).all(...args) as T[]

  // ------------------------------------------------------------------ pins
  //
  // These categories OVERLAP. In the reference export pin 10 is typeless AND
  // retired AND unanchored, and pin 2 is retired AND unanchored — so 2+2+4 is
  // five distinct pins, not eight. The report shows both numbers and never
  // presents the sum.
  const pinRows = many<{
    pin_id: string
    number: number
    zone_id: string | null
    type_kind: string | null
    component_type: string | null
    freeform_label: string | null
    flag: string | null
    retired_at: string | null
    anchor_count: number
  }>(
    `SELECT p.pin_id, p.number, p.zone_id, p.type_kind, p.component_type, p.freeform_label,
            p.flag, p.retired_at,
            (SELECT COUNT(*) FROM anchors a WHERE a.import_id = p.import_id AND a.pin_id = p.pin_id) AS anchor_count
     FROM pins p WHERE p.import_id = ? ORDER BY p.number`,
    importId,
  )

  const anomalousPins = pinRows
    .map((p) => {
      const flags: string[] = []
      if (!p.type_kind) flags.push('typeless')
      if (p.retired_at) flags.push('retired')
      if (p.anchor_count === 0) flags.push('unanchored')
      return { number: p.number, pinId: p.pin_id, flags }
    })
    .filter((p) => p.flags.length > 0)

  const pins = {
    total: pinRows.length,
    typeless: pinRows.filter((p) => !p.type_kind).length,
    retired: pinRows.filter((p) => p.retired_at).length,
    unanchored: pinRows.filter((p) => p.anchor_count === 0).length,
    flagged: many<{ flag: string | null; n: number }>(
      `SELECT flag, COUNT(*) AS n FROM pins WHERE import_id = ? AND flag IS NOT NULL GROUP BY flag`,
      importId,
    ),
    byTypeKind: many<{ type_kind: string | null; n: number }>(
      `SELECT type_kind, COUNT(*) AS n FROM pins WHERE import_id = ? GROUP BY type_kind`,
      importId,
    ),
    /** Distinct pins carrying at least one anomaly, with the overlap visible. */
    anomalousDistinct: anomalousPins.length,
    anomalous: anomalousPins,
  }

  // ----------------------------------------------------------------- media
  const byKind = many<MediaKindRow>(
    `SELECT kind, COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes
     FROM media WHERE import_id = ? GROUP BY kind ORDER BY bytes DESC`,
    importId,
  )
  const byOwner = many<{ owner_kind: string | null; count: number; bytes: number }>(
    `SELECT owner_kind, COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes
     FROM media WHERE import_id = ? GROUP BY owner_kind ORDER BY count DESC`,
    importId,
  )
  // All four states, always, including the zeroes. A verification summary that
  // silently omits "failed" reads as "nothing failed" whether or not the check
  // has run — which is exactly the reassurance this software must not give.
  const verification = one<{
    verified: number
    failed: number
    absent: number
    presentUnverified: number
  }>(
    `SELECT
       SUM(CASE WHEN file_status = 'present' AND sha_verified = 1 THEN 1 ELSE 0 END) AS verified,
       SUM(CASE WHEN file_status = 'failed_checksum'              THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN file_status = 'absent'                       THEN 1 ELSE 0 END) AS absent,
       SUM(CASE WHEN file_status = 'present' AND sha_verified = 0 THEN 1 ELSE 0 END) AS presentUnverified
     FROM media WHERE import_id = ?`,
    importId,
  )
  const mediaTotals = one<{ n: number; bytes: number; verified: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes,
            COALESCE(SUM(sha_verified), 0) AS verified
     FROM media WHERE import_id = ?`,
    importId,
  )

  // ----------------------------------------------------------- resolutions
  const resByKind = many<{ kind: string | null; n: number }>(
    `SELECT kind, COUNT(*) AS n FROM resolutions WHERE import_id = ? GROUP BY kind ORDER BY n DESC`,
    importId,
  )
  const resByScope = many<{ scope_kind: string | null; n: number }>(
    `SELECT scope_kind, COUNT(*) AS n FROM resolutions WHERE import_id = ? GROUP BY scope_kind ORDER BY n DESC`,
    importId,
  )
  const resByResult = many<{ result: string | null; n: number }>(
    `SELECT result, COUNT(*) AS n FROM resolutions WHERE import_id = ? AND result IS NOT NULL
     GROUP BY result ORDER BY n DESC`,
    importId,
  )
  const naByReason = many<{ reason_id: string | null; n: number }>(
    `SELECT reason_id, COUNT(*) AS n FROM resolutions WHERE import_id = ? AND kind = 'na'
     GROUP BY reason_id ORDER BY n DESC`,
    importId,
  )

  const gapRows = many<{ item_id: string; reason_id: string | null; scope_kind: string | null }>(
    `SELECT item_id, reason_id, scope_kind FROM resolutions
     WHERE import_id = ? AND feeds_gap_list = 1 ORDER BY item_id`,
    importId,
  )

  // "Finding" does not mean "problem". Failed checks are defects; confirmed
  // absences are substantive facts. Both belong in the binder, and the report
  // must never put them under a heading that implies trouble. (CLAUDE.md §5)
  const findingRows = many<{
    item_id: string
    kind: string | null
    result: string | null
    reason_id: string | null
    scope_kind: string | null
  }>(
    `SELECT item_id, kind, result, reason_id, scope_kind FROM resolutions
     WHERE import_id = ? AND records_finding = 1 ORDER BY item_id`,
    importId,
  )
  const failedChecks = findingRows.filter((r) => r.result === 'fail')
  const confirmedAbsences = findingRows.filter((r) => r.result !== 'fail')

  // ----------------------------------------------------------------- zones
  //
  // Zone close/reopen history lives ONLY in events[] — the zone record keeps
  // just the final closedAt. A heavily reworked zone would otherwise display as
  // pristine, which is exactly what the audit exists to surface.
  const zoneEvents = many<{ type: string; zoneId: string | null; note: string | null }>(
    `SELECT type,
            json_extract(payload, '$.zoneId') AS zoneId,
            json_extract(payload, '$.note')   AS note
     FROM events WHERE import_id = ? AND type IN ('ZoneClosed', 'ZoneReopened') ORDER BY seq`,
    importId,
  )

  const zones: ZoneRow[] = many<Record<string, unknown>>(
    `SELECT * FROM zones WHERE import_id = ? ORDER BY label`,
    importId,
  ).map((z) => {
    const zoneId = z.zone_id as string
    const audit = parse<{ coreUnresolved?: string[]; standardUnresolved?: number; naCount?: number }>(
      z.audit_summary,
      {},
    )
    const resolutionCount = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM resolutions WHERE import_id = ? AND scope_kind = 'zone' AND scope_zone_id = ?`,
      importId,
      zoneId,
    ).n
    const mine = zoneEvents.filter((e) => e.zoneId === zoneId)
    return {
      zoneId,
      type: (z.type as string) ?? null,
      label: (z.label as string) ?? null,
      level: (z.level as string) ?? null,
      closedAt: (z.closed_at as string) ?? null,
      pinCount: one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM pins WHERE import_id = ? AND zone_id = ?`,
        importId,
        zoneId,
      ).n,
      mediaCount: one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM media WHERE import_id = ? AND group_key = ?`,
        importId,
        zoneId,
      ).n,
      canvasCount: one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM canvases WHERE import_id = ? AND zone_id = ?`,
        importId,
        zoneId,
      ).n,
      resolutionCount,
      coreUnresolved: audit.coreUnresolved ?? [],
      standardUnresolved: audit.standardUnresolved ?? 0,
      naCount: audit.naCount ?? 0,
      closeCount: mine.filter((e) => e.type === 'ZoneClosed').length,
      reopenCount: mine.filter((e) => e.type === 'ZoneReopened').length,
      reopenReasons: mine.filter((e) => e.type === 'ZoneReopened' && e.note).map((e) => e.note as string),
      closedWithNoWork: Boolean(z.closed_at) && resolutionCount === 0,
    }
  })

  // ---------------------------------------------------------------- events
  const eventsByType = many<{ type: string | null; n: number }>(
    `SELECT type, COUNT(*) AS n FROM events WHERE import_id = ? GROUP BY type ORDER BY n DESC`,
    importId,
  )
  const eventCounts = one<{ n: number; resolved: number; reopened: number }>(
    `SELECT COUNT(*) AS n,
            SUM(CASE WHEN type = 'ItemResolved' THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN type = 'ItemReopened' THEN 1 ELSE 0 END) AS reopened
     FROM events WHERE import_id = ?`,
    importId,
  )

  const validation = parse<ValidationReport>(imp.validation_report, {
    status: 'ok',
    checks: [],
    checksRun: [],
    unrecognizedTerms: [],
    counts: { errors: 0, warnings: 0, infos: 0 },
  })

  // Counted from the rows themselves, not from the report, so the number always
  // reflects what is actually stored.
  const unrecognized = {
    resolutions: one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM resolutions WHERE import_id = ? AND is_recognized = 0`,
      importId,
    ).n,
    events: one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM events WHERE import_id = ? AND is_recognized = 0`,
      importId,
    ).n,
  }

  return {
    import: {
      id: importId,
      status: imp.status as string,
      importedAt: imp.imported_at as string,
      manifestSchemaVersion: imp.manifest_schema_version as number,
      appVersion: imp.app_version as string | null,
      mediaMode: imp.media_mode as string,
      config: {
        id: imp.config_id as string | null,
        version: imp.config_version as string | null,
        hash: imp.config_hash as string | null,
      },
    },
    property: {
      id: property?.id as string,
      label: property?.label as string,
      address: (property?.address as string | null) ?? null,
    },
    visit: {
      id: visit?.id as string,
      kind: visit?.kind as string,
      // Two dates, two names. What somebody typed when the visit was created,
      // and what this import's own manifest says about when the walk began.
      // The report is where a disagreement between them should be visible, so
      // both are carried and neither stands in for the other.
      plannedDate: (visit?.planned_date as string | null) ?? null,
      walkedDate: (meta?.started_at as string | null)?.slice(0, 10) ?? null,
    },
    session: {
      sessionId: (meta?.session_id as string | null) ?? null,
      // The label the FIELD APP recorded. Free text, varies between visits.
      // Shown so a misfiled import is obvious to a human; never used to match.
      propertyLabel: (meta?.property_label as string | null) ?? null,
      flags: parse<string[]>(meta?.flags, []),
      startedAt: (meta?.started_at as string | null) ?? null,
      completedAt: (meta?.completed_at as string | null) ?? null,
      exportedAt: (meta?.exported_at as string | null) ?? null,
      lifecycle: parse<{ type?: string; at?: string; reason?: string }[]>(meta?.lifecycle, []),
      declaredTotals: parse<Record<string, number>>(meta?.totals, {}),
      orphanEvents: parse<unknown[]>(meta?.orphan_events, []),
    },
    counts: {
      zones: zones.length,
      canvases: one<{ n: number }>(`SELECT COUNT(*) AS n FROM canvases WHERE import_id = ?`, importId).n,
      pins,
      media: {
        total: mediaTotals.n,
        bytes: mediaTotals.bytes,
        verified: mediaTotals.verified,
        byKind,
        byOwner,
        verification: {
          verified: verification.verified ?? 0,
          failed: verification.failed ?? 0,
          absent: verification.absent ?? 0,
          presentUnverified: verification.presentUnverified ?? 0,
        },
      },
      notes: one<{ n: number }>(`SELECT COUNT(*) AS n FROM notes WHERE import_id = ?`, importId).n,
      chatThreads: one<{ n: number }>(`SELECT COUNT(*) AS n FROM chat_threads WHERE import_id = ?`, importId).n,
      chatMessages: one<{ n: number }>(`SELECT COUNT(*) AS n FROM chat_messages WHERE import_id = ?`, importId).n,
      inboxRefs: many<{ ref_kind: string; n: number }>(
        `SELECT ref_kind, COUNT(*) AS n FROM inbox_refs WHERE import_id = ? GROUP BY ref_kind`,
        importId,
      ),
      inboxTotal: one<{ n: number }>(`SELECT COUNT(*) AS n FROM inbox_refs WHERE import_id = ?`, importId).n,
      events: eventCounts.n,
      eventsByType,
      orphanEvents: parse<unknown[]>(meta?.orphan_events, []).length,
    },
    checklist: {
      total: one<{ n: number }>(`SELECT COUNT(*) AS n FROM resolutions WHERE import_id = ?`, importId).n,
      byKind: resByKind,
      byScope: resByScope,
      byResult: resByResult,
      naByReason,
      gaps: { count: gapRows.length, rows: gapRows },
      findings: {
        total: findingRows.length,
        failedChecks: failedChecks.length,
        confirmedAbsences: confirmedAbsences.length,
        rows: findingRows,
      },
      // Expected reconciliation, not necessarily an error: resolves minus reopens.
      eventReconciliation: {
        itemResolved: eventCounts.resolved ?? 0,
        itemReopened: eventCounts.reopened ?? 0,
        net: (eventCounts.resolved ?? 0) - (eventCounts.reopened ?? 0),
        resolutionsLength: one<{ n: number }>(
          `SELECT COUNT(*) AS n FROM resolutions WHERE import_id = ?`,
          importId,
        ).n,
      },
    },
    zones,
    unrecognized,
    validation,
  }
}

export type ImportReport = NonNullable<ReturnType<typeof buildReport>>
