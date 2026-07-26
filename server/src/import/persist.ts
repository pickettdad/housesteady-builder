import type { Db } from '../db/index.js'
import { j, newId, now } from '../db/index.js'
import type { Manifest, NaReason } from './manifest.js'
import type { ValidationReport } from './validate.js'

export interface PersistInput {
  db: Db
  propertyId: string
  visitId: string
  raw: string
  manifest: Manifest
  report: ValidationReport
  mediaMode: 'manifest_only' | 'with_media'
  /** Array indexes the vocabulary pass found unfamiliar words in. */
  unrecognizedResolutions?: Set<number>
  unrecognizedEvents?: Set<number>
}

/**
 * Writes one import to the database, in a single transaction.
 *
 * A failed import leaves no partial state — better-sqlite3's transaction
 * wrapper rolls the whole thing back on throw.
 */
export function persistImport(input: PersistInput): string {
  const {
    db,
    propertyId,
    visitId,
    raw,
    manifest: m,
    report,
    mediaMode,
    unrecognizedResolutions = new Set<number>(),
    unrecognizedEvents = new Set<number>(),
  } = input
  const importId = newId()
  const ts = now()

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO imports (id, visit_id, property_id, imported_at, manifest_schema_version,
        app_version, session_id, config_id, config_version, config_hash, media_mode,
        raw_manifest, validation_report, status, created_at)
       VALUES (@id, @visit_id, @property_id, @imported_at, @manifest_schema_version,
        @app_version, @session_id, @config_id, @config_version, @config_hash, @media_mode,
        @raw_manifest, @validation_report, @status, @created_at)`,
    ).run({
      id: importId,
      visit_id: visitId,
      property_id: propertyId,
      imported_at: ts,
      manifest_schema_version: m.manifestSchemaVersion ?? null,
      app_version: m.session?.appVersion ?? null,
      session_id: m.session?.sessionId ?? null,
      config_id: m.config?.configId ?? null,
      config_version: m.config?.version ?? null,
      config_hash: m.config?.hash ?? null,
      media_mode: mediaMode,
      raw_manifest: raw, // verbatim, whole, byte-for-byte what arrived
      validation_report: JSON.stringify(report),
      status: report.status,
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
      session_id: m.session?.sessionId ?? null,
      property_label: m.session?.propertyLabel ?? null,
      flags: j(m.session?.flags ?? []),
      started_at: m.session?.startedAt ?? null,
      completed_at: m.session?.completedAt ?? null,
      exported_at: m.session?.exportedAt ?? null,
      lifecycle: j(m.session?.lifecycle ?? []),
      totals: j(m.totals ?? {}),
      orphan_events: j(m.orphanEvents ?? []),
      events_count: (m.events ?? []).length,
      created_at: ts,
    })

    // ------------------------------------------------------ config_snapshots
    db.prepare(
      `INSERT INTO config_snapshots (import_id, config_id, config_version, config_hash, snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      importId,
      m.config?.configId ?? null,
      m.config?.version ?? null,
      m.config?.hash ?? null,
      JSON.stringify(m.config?.snapshot ?? {}),
      ts,
    )

    // ------------------------------------------------------- zones, canvases
    const insZone = db.prepare(
      `INSERT INTO zones (zone_id, import_id, property_id, visit_id, type, label, level,
        attributes, closed_at, close_note, audit_summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insCanvas = db.prepare(
      `INSERT INTO canvases (canvas_id, zone_id, import_id, kind, retired, media_id, file, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const z of m.zones ?? []) {
      insZone.run(
        z.zoneId ?? null,
        importId,
        propertyId,
        visitId,
        z.type ?? null,
        z.label ?? null,
        z.level ?? null,
        j(z.attributes ?? {}),
        z.closedAt ?? null,
        z.closeNote ?? null,
        j(z.audit ?? null),
        ts,
      )
      for (const c of z.canvases ?? []) {
        insCanvas.run(
          c.canvasId ?? null,
          z.zoneId ?? null,
          importId,
          c.kind ?? null,
          c.retired ? 1 : 0,
          c.mediaId ?? null,
          c.file ?? null,
          ts,
        )
      }
    }

    // --------------------------------------------------------- pins, anchors
    const insPin = db.prepare(
      `INSERT INTO pins (pin_id, import_id, property_id, visit_id, number, zone_id, type_kind,
        component_type, freeform_label, nickname, flag, retired_at, media_ids, note_ids,
        chat_thread_ids, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insAnchor = db.prepare(
      `INSERT INTO anchors (anchor_id, pin_id, canvas_id, x, y, import_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const p of m.pins ?? []) {
      // A pin with no `type` key at all is valid — created and never typed.
      // All three type columns stay null; nothing is invented to fill them.
      insPin.run(
        p.pinId ?? null,
        importId,
        propertyId,
        visitId,
        p.number ?? null,
        p.zoneId ?? null,
        p.type?.kind ?? null,
        p.type?.componentType ?? null,
        p.type?.label ?? null,
        p.label ?? null, // nickname — reserved, absent in the observed export
        p.flag ?? null,
        p.retired?.at ?? null,
        j(p.mediaIds ?? []),
        j(p.noteIds ?? []),
        j(p.chatThreadIds ?? []),
        ts,
      )
      for (const a of p.anchors ?? []) {
        insAnchor.run(
          a.anchorId ?? null,
          p.pinId ?? null,
          a.canvasId ?? null,
          a.x ?? null,
          a.y ?? null,
          importId,
          ts,
        )
      }
    }

    // ---------------------------------------------------------------- media
    const insMedia = db.prepare(
      `INSERT INTO media (media_id, import_id, property_id, visit_id, kind, owner_kind,
        owner_zone_id, owner_pin_id, owner_pin_number, owner_canvas_id, group_key, file,
        mime, bytes, sha256, sha_verified, file_status, bytes_on_disk, captured_at,
        duration_ms, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const x of m.media ?? []) {
      // Ownership comes from owner{}, never from parsing the path. The path is
      // where the bytes live; owner is what the bytes are of.
      insMedia.run(
        x.mediaId ?? null,
        importId,
        propertyId,
        visitId,
        x.kind ?? null,
        x.owner?.kind ?? null,
        x.owner?.zoneId ?? null,
        x.owner?.pinId ?? null,
        x.owner?.pinNumber ?? null,
        x.owner?.canvasId ?? null,
        x.group ?? null,
        x.file ?? null,
        x.mime ?? null,
        x.bytes ?? null,
        x.sha256 ?? null,
        // Nothing has been verified because nothing has been copied yet. The
        // checksum pass sets both of these; until then the honest values are
        // "not verified" and "not here" — never a hopeful default.
        0, // sha_verified
        'absent', // file_status
        null, // bytes_on_disk
        x.capturedAt ?? null,
        x.durationMs ?? null,
        j(x.source ?? null),
        ts,
      )
    }

    // ---------------------------------------------------------------- notes
    const insNote = db.prepare(
      `INSERT INTO notes (note_id, import_id, target_kind, target_id, text, at, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const n of m.notes ?? []) {
      insNote.run(
        n.noteId ?? null,
        importId,
        n.target?.kind ?? null,
        n.target?.id ?? null,
        n.text ?? null,
        n.at ?? null,
        j(n.source ?? null),
        ts,
      )
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
    for (const t of m.chats ?? []) {
      insThread.run(t.threadId ?? null, importId, t.target?.kind ?? null, t.target?.id ?? null, ts)
      // Messages carry no seq of their own; position in the array is the order.
      ;(t.messages ?? []).forEach((msg, i) => {
        insMessage.run(
          t.threadId ?? null,
          importId,
          i + 1,
          msg.role ?? null,
          msg.text ?? null,
          j(msg.mediaIds ?? null),
          msg.model ?? null,
          msg.at ?? null,
          j(msg.source ?? null),
          ts,
        )
      })
    }

    // ----------------------------------------------------------- inbox refs
    const insInbox = db.prepare(
      `INSERT INTO inbox_refs (import_id, ref_kind, ref_id, created_at) VALUES (?, ?, ?, ?)`,
    )
    for (const id of m.inbox?.mediaIds ?? []) insInbox.run(importId, 'media', id, ts)
    for (const id of m.inbox?.noteIds ?? []) insInbox.run(importId, 'note', id, ts)

    // ----------------------------------------------------------- resolutions
    // The derived columns are computed here, from THIS import's own config
    // snapshot. Never from a list baked into the builder.
    const reasons = new Map<string, NaReason>()
    for (const r of m.config?.snapshot?.naReasons ?? []) reasons.set(r.id, r)

    const insRes = db.prepare(
      `INSERT INTO resolutions (import_id, property_id, visit_id, scope_kind, scope_zone_id,
        scope_pin_id, item_id, kind, via, result, note, reason_id, evidence, at, source,
        is_recognized, feeds_gap_list, records_finding, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    ;(m.resolutions ?? []).forEach((r, index) => {
      const body = r.resolution ?? {}
      const reason = body.reasonId ? reasons.get(body.reasonId) : undefined

      // An na reason the config does not declare has no flags, so it lands in
      // neither stream. That is the honest outcome — it is flagged unrecognized
      // and listed on the report rather than guessed into one column or the other.
      const feedsGapList = body.kind === 'na' && reason?.feedsGapList === true
      const recordsFinding =
        (body.kind === 'na' && reason?.recordsFinding === true) || body.result === 'fail'

      insRes.run(
        importId,
        propertyId,
        visitId,
        r.scope?.kind ?? null,
        r.scope?.zoneId ?? null,
        r.scope?.pinId ?? null,
        r.itemId ?? null,
        body.kind ?? null,
        body.via ?? null,
        body.result ?? null,
        body.note ?? null,
        body.reasonId ?? null,
        j(body.evidence ?? null), // nested inside resolution{} — easy to drop, must not be
        r.at ?? null,
        j(r.source ?? null),
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
    ;(m.events ?? []).forEach((e, index) => {
      insEvent.run(
        importId,
        (e.eventId as string) ?? null,
        (e.seq as number) ?? null,
        (e.type as string) ?? null,
        (e.at as string) ?? null,
        // Per-event schemaVersion is independent of manifestSchemaVersion.
        (e.schemaVersion as number) ?? null,
        j(e.source ?? null),
        JSON.stringify(e), // the whole event, verbatim
        unrecognizedEvents.has(index) ? 0 : 1,
        ts,
      )
    })
  })

  run()
  return importId
}
