import type { Db } from '../db/index.js'
import { j, newId, now } from '../db/index.js'
import type { CanonicalImport } from './adapters/canonical.js'
import type { PlacementMap } from './media.js'
import type { ValidationReport } from './validate.js'

export interface PersistInput {
  db: Db
  propertyId: string
  visitId: string | null
  /** The original bytes, stored verbatim. Never the canonical shape. */
  raw: string
  canonical: CanonicalImport
  report: ValidationReport
  mediaMode: 'manifest_only' | 'with_media'
  /** Which operator ran the import. Required — Increment 2c. */
  actorId: string
  /** Minted by the caller so media has a directory before the row exists — §1j. */
  importId: string
  /** Which app produced this manifest — §1j. Defaults to the field app. */
  producer?: string
  /** Array indexes the vocabulary pass found unfamiliar words in. */
  unrecognizedResolutions?: Set<number>
  unrecognizedEvents?: Set<number>
  /** What happened to each file on disk. Empty when no media was supplied. */
  placement?: PlacementMap
}

/**
 * Writes one import to the database, in a single transaction.
 *
 * Reads the CANONICAL shape only — this function has no idea which manifest
 * version produced its input, and adding v4 must not require touching it.
 *
 * `raw_manifest` still holds the original bytes: the canonical shape is a
 * convenience, the file is the evidence.
 *
 * A failed import leaves no partial state — better-sqlite3's transaction wrapper
 * rolls the whole thing back on throw.
 */
export function persistImport(input: PersistInput): string {
  const {
    db,
    propertyId,
    visitId,
    raw,
    canonical: c,
    report,
    mediaMode,
    actorId,
    importId,
    unrecognizedResolutions = new Set<number>(),
    unrecognizedEvents = new Set<number>(),
    placement,
  } = input
  const ts = now()

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO imports (id, visit_id, property_id, imported_at, manifest_schema_version,
        app_version, session_id, config_id, config_version, config_hash, media_mode,
        raw_manifest, validation_report, status, actor_id, producer, created_at)
       VALUES (@id, @visit_id, @property_id, @imported_at, @manifest_schema_version,
        @app_version, @session_id, @config_id, @config_version, @config_hash, @media_mode,
        @raw_manifest, @validation_report, @status, @actor_id, @producer, @created_at)`,
    ).run({
      id: importId,
      visit_id: visitId,
      property_id: propertyId,
      imported_at: ts,
      // Recorded for provenance. Nothing downstream branches on it.
      manifest_schema_version: c.sourceManifestVersion,
      app_version: c.session.appVersion,
      session_id: c.session.sessionId,
      config_id: c.config.id,
      config_version: c.config.version,
      config_hash: c.config.hash,
      media_mode: mediaMode,
      raw_manifest: raw, // verbatim, whole, byte-for-byte what arrived
      validation_report: JSON.stringify(report),
      status: report.status,
      // Who ran the import. The manifest says who was in the house; this says
      // who sat down and brought it in, and the two are routinely different.
      actor_id: actorId,
      // Named rather than defaulted silently: this repo's own field app is the
      // only producer today and will not be the only one, and a row that does
      // not say which app made it cannot be adapted later.
      producer: input.producer ?? 'housesteady-field',
      created_at: ts,
    })

    // ---------------------------------------------------------- session_meta
    db.prepare(
      `INSERT INTO session_meta (import_id, session_id, property_label, flags, started_at,
        completed_at, exported_at, lifecycle, totals, orphan_events, events_count, created_at)
       VALUES (@import_id, @session_id, @property_label, @flags, @started_at,
        @completed_at, @exported_at, @lifecycle, @totals, @orphan_events, @events_count, @created_at)`,
    ).run({
      import_id: importId,
      session_id: c.session.sessionId,
      property_label: c.session.propertyLabel,
      flags: j(c.session.flags),
      started_at: c.session.startedAt,
      completed_at: c.session.completedAt,
      exported_at: c.session.exportedAt,
      lifecycle: j(c.session.lifecycle),
      totals: j(c.declaredTotals),
      orphan_events: j(c.orphanEvents),
      events_count: c.events.length,
      created_at: ts,
    })

    // ------------------------------------------------------ config_snapshots
    db.prepare(
      `INSERT INTO config_snapshots (import_id, config_id, config_version, config_hash, snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(importId, c.config.id, c.config.version, c.config.hash, JSON.stringify(c.config.snapshot), ts)

    // ------------------------------------------------------- zones, canvases
    const insZone = db.prepare(
      `INSERT INTO zones (zone_id, import_id, property_id, visit_id, type, label, level,
        attributes, closed_at, close_note, audit_summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const z of c.zones) {
      insZone.run(
        z.zoneId,
        importId,
        propertyId,
        visitId,
        z.type,
        z.label,
        z.level,
        j(z.attributes),
        z.closedAt,
        z.closeNote,
        // Stored as the field app sent it. Recomputing is Increment 3's job.
        z.auditSummary
          ? JSON.stringify({
              coreUnresolved: z.auditSummary.coreUnresolved,
              standardUnresolved: z.auditSummary.standardUnresolved,
              naCount: z.auditSummary.naCount,
            })
          : null,
        ts,
      )
    }

    const insCanvas = db.prepare(
      `INSERT INTO canvases (canvas_id, zone_id, import_id, kind, retired, media_id, file, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const cv of c.canvases) {
      insCanvas.run(cv.canvasId, cv.zoneId, importId, cv.kind, cv.retired ? 1 : 0, cv.mediaId, cv.file, ts)
    }

    // --------------------------------------------------------- pins, anchors
    const insPin = db.prepare(
      `INSERT INTO pins (pin_id, import_id, property_id, visit_id, number, zone_id, type_kind,
        component_type, freeform_label, nickname, flag, retired_at, media_ids, note_ids,
        chat_thread_ids, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const p of c.pins) {
      // A pin with no type at all is valid — created and never typed. All three
      // type columns stay null; nothing is invented to fill them.
      insPin.run(
        p.pinId,
        importId,
        propertyId,
        visitId,
        p.number,
        p.zoneId,
        p.typeKind,
        p.componentType,
        p.freeformLabel,
        p.nickname,
        p.flag,
        p.retiredAt,
        j(p.mediaIds),
        j(p.noteIds),
        j(p.chatThreadIds),
        ts,
      )
    }

    const insAnchor = db.prepare(
      `INSERT INTO anchors (anchor_id, pin_id, canvas_id, x, y, import_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const a of c.anchors) {
      insAnchor.run(a.anchorId, a.pinId, a.canvasId, a.x, a.y, importId, ts)
    }

    // ---------------------------------------------------------------- media
    const insMedia = db.prepare(
      `INSERT INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind,
        owner_zone_id, owner_pin_id, owner_pin_number, owner_canvas_id, group_key, file,
        mime, bytes, sha256, sha_verified, file_status, bytes_on_disk, captured_at,
        duration_ms, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const x of c.media) {
      // With no media supplied the honest values are "not verified" and "not
      // here" — never a hopeful default. When files did arrive, the media pass
      // has already said what happened to each one.
      const placed = (x.mediaId !== null ? placement?.get(x.mediaId) : undefined) ?? {
        status: 'absent' as const,
        shaVerified: false,
        bytesOnDisk: null,
      }
      insMedia.run(
        x.mediaId,
        importId,
        propertyId,
        visitId,
        x.kind,
        x.ownerKind,
        x.ownerZoneId,
        x.ownerPinId,
        x.ownerPinNumber,
        x.ownerCanvasId,
        x.groupKey,
        x.file,
        x.mime,
        x.bytes,
        x.sha256,
        placed.shaVerified ? 1 : 0,
        placed.status,
        placed.bytesOnDisk,
        x.capturedAt,
        x.durationMs,
        j(x.source),
        ts,
      )
    }

    // ---------------------------------------------------------------- notes
    const insNote = db.prepare(
      `INSERT INTO notes (note_id, import_id, target_kind, target_id, text, at, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const n of c.notes) {
      insNote.run(n.noteId, importId, n.targetKind, n.targetId, n.text, n.at, j(n.source), ts)
    }

    // ---------------------------------------------------- chats and messages
    const insThread = db.prepare(
      `INSERT INTO chat_threads (thread_id, import_id, target_kind, target_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    const insMessage = db.prepare(
      `INSERT INTO chat_messages (thread_id, import_id, seq, role, text, media_ids, model, at, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const t of c.chatThreads) {
      insThread.run(t.threadId, importId, t.targetKind, t.targetId, ts)
      for (const msg of t.messages) {
        insMessage.run(
          t.threadId,
          importId,
          msg.seq, // assigned by the adapter from position
          msg.role,
          msg.text,
          j(msg.mediaIds),
          msg.model,
          msg.at,
          j(msg.source),
          ts,
        )
      }
    }

    // ----------------------------------------------------------- inbox refs
    const insInbox = db.prepare(
      `INSERT INTO inbox_refs (import_id, ref_kind, ref_id, created_at) VALUES (?, ?, ?, ?)`,
    )
    for (const ref of c.inboxRefs) insInbox.run(importId, ref.refKind, ref.refId, ts)

    // ----------------------------------------------------------- resolutions
    // The derived columns are computed here, from THIS import's own config
    // snapshot. Never from a list baked into the builder.
    const reasons = new Map<string, { feedsGapList?: boolean; recordsFinding?: boolean }>()
    const declared = c.config.snapshot.naReasons
    if (Array.isArray(declared)) {
      for (const r of declared) {
        const reason = r as { id?: unknown; feedsGapList?: boolean; recordsFinding?: boolean }
        if (typeof reason.id === 'string') reasons.set(reason.id, reason)
      }
    }

    const insRes = db.prepare(
      `INSERT INTO resolutions (import_id, property_id, visit_id, scope_kind, scope_zone_id,
        scope_pin_id, item_id, kind, via, result, note, reason_id, evidence, at, source,
        is_recognized, feeds_gap_list, records_finding, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    c.resolutions.forEach((r, index) => {
      const reason = r.reasonId ? reasons.get(r.reasonId) : undefined

      // An na reason the config does not declare has no flags, so it lands in
      // neither stream. That is the honest outcome — it is flagged unrecognized
      // and listed on the report rather than guessed into one column or the other.
      const feedsGapList = r.kind === 'na' && reason?.feedsGapList === true
      const recordsFinding = (r.kind === 'na' && reason?.recordsFinding === true) || r.result === 'fail'

      insRes.run(
        importId,
        propertyId,
        visitId,
        r.scopeKind,
        r.scopeZoneId,
        r.scopePinId,
        r.itemId,
        r.kind,
        r.via,
        r.result,
        r.note,
        r.reasonId,
        j(r.evidence),
        r.at,
        j(r.source),
        unrecognizedResolutions.has(index) ? 0 : 1,
        feedsGapList ? 1 : 0,
        recordsFinding ? 1 : 0,
        ts,
      )
    })

    // ---------------------------------------------------------------- events
    const insEvent = db.prepare(
      `INSERT INTO events (import_id, event_id, seq, type, at, event_schema_version, source,
        payload, is_recognized, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    c.events.forEach((e, index) => {
      insEvent.run(
        importId,
        e.eventId,
        e.seq,
        e.type,
        e.at,
        // Per-event schemaVersion is independent of the manifest's own version.
        e.schemaVersion,
        j(e.source),
        JSON.stringify(e.payload), // the whole event, verbatim
        unrecognizedEvents.has(index) ? 0 : 1,
        ts,
      )
    })
  })

  run()
  return importId
}
