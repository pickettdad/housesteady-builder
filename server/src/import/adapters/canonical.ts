/**
 * The canonical import — this repo's own shape, not any manifest version's.
 *
 * ONE RULE, and everything about this file follows from it:
 *
 *   Nothing downstream of an adapter may know which manifest version produced
 *   the data it is reading.
 *
 * `sourceManifestVersion` is recorded so provenance is answerable. It is NEVER
 * branched on. If you find yourself writing `if (c.sourceManifestVersion === 3)`
 * outside an adapter, the version-specific knowledge belongs in the adapter
 * instead.
 *
 * v4 — when concerns become entities — is a NEW ADAPTER MODULE producing this
 * shape (extended), not a rewrite of the code that consumes it. That is the
 * whole point: validation, persistence and reporting are written once against
 * this shape and keep working.
 *
 * The shape is deliberately FLAT and EXPLICIT where the wire format is nested
 * and implicit. Every quirk of the v3 export — canvases nested inside zones,
 * anchors nested inside pins, chat messages with no sequence number, `type`
 * absent rather than null, `retired` as an object, `inbox` as an object of
 * reference arrays — is resolved by the adapter and never seen again. That list
 * of quirks is precisely what a version adapter is for.
 */

/** Who or what produced a record. Passed through verbatim from the field. */
export interface CanonicalSource {
  actor?: string
  actorId?: string
  device?: string
  appVersion?: string
  [k: string]: unknown
}

export interface CanonicalLifecycleEntry {
  type?: string
  at?: string
  reason?: string
}

export interface CanonicalSession {
  sessionId: string | null
  /** Free text typed in the field. Never a property identifier. */
  propertyLabel: string | null
  flags: string[]
  startedAt: string | null
  completedAt: string | null
  exportedAt: string | null
  appVersion: string | null
  lifecycle: CanonicalLifecycleEntry[]
}

/**
 * The field app's checklist config, passed through WHOLE and verbatim.
 *
 * This is not manifest structure — it is the field app's own configuration,
 * carried inside the export. Adapters do not reshape it, because the rule that
 * "the config decides, not the builder" means the builder reads whatever the
 * config says, including keys it has never met.
 */
export interface CanonicalConfig {
  id: string | null
  version: string | null
  hash: string | null
  snapshot: Record<string, unknown>
}

export interface CanonicalZone {
  zoneId: string | null
  type: string | null
  label: string | null
  level: string | null
  attributes: Record<string, unknown>
  closedAt: string | null
  closeNote: string | null
  /** Stored as the field app sent it. Recomputing is the audit engine's job. */
  auditSummary: {
    coreUnresolved: string[]
    standardUnresolved: number | null
    naCount: number | null
  } | null
}

/** Flattened out of zones — downstream does not need to know they arrived nested. */
export interface CanonicalCanvas {
  canvasId: string | null
  zoneId: string | null
  kind: string | null
  retired: boolean
  mediaId: string | null
  file: string | null
}

/**
 * A marker on a canvas. Per the Object/Concern Model, "pin" means the marker,
 * not the entity — from v4 the entities are Zone, Object, Concern and Capture,
 * and this shape gains them alongside.
 */
export interface CanonicalPin {
  /** Field-minted uuid. THIS is the identity that carries across visits. */
  pinId: string | null
  /**
   * Session-scoped display label. The counter restarts at 1 every visit, so this
   * is NEVER a join key and never compared across visits.
   */
  number: number | null
  zoneId: string | null
  typeKind: string | null
  componentType: string | null
  freeformLabel: string | null
  /** Reserved. Not present in any observed v3 export. */
  nickname: string | null
  flag: string | null
  retiredAt: string | null
  mediaIds: string[]
  noteIds: string[]
  chatThreadIds: string[]
}

/** Flattened out of pins. x and y are normalized 0-1 against the canvas image. */
export interface CanonicalAnchor {
  anchorId: string | null
  pinId: string | null
  canvasId: string | null
  x: number | null
  y: number | null
}

export interface CanonicalMedia {
  mediaId: string | null
  /** Open vocabulary. photo, voice, video, audio, whatever comes next. */
  kind: string | null
  /** Ownership is explicit. The file path is storage location only. */
  ownerKind: string | null
  ownerZoneId: string | null
  ownerPinId: string | null
  ownerPinNumber: number | null
  ownerCanvasId: string | null
  groupKey: string | null
  file: string | null
  mime: string | null
  bytes: number | null
  sha256: string | null
  capturedAt: string | null
  durationMs: number | null
  source: CanonicalSource | null
}

export interface CanonicalNote {
  noteId: string | null
  targetKind: string | null
  targetId: string | null
  text: string | null
  at: string | null
  source: CanonicalSource | null
}

export interface CanonicalChatMessage {
  /** Assigned by the adapter from array position — the wire format carries none. */
  seq: number
  role: string | null
  text: string | null
  mediaIds: string[]
  model: string | null
  at: string | null
  source: CanonicalSource | null
}

export interface CanonicalChatThread {
  threadId: string | null
  targetKind: string | null
  targetId: string | null
  messages: CanonicalChatMessage[]
}

/** Flattened out of the inbox object. */
export interface CanonicalInboxRef {
  refKind: 'media' | 'note'
  refId: string
}

/** Current checklist state. A projection of the event log, stored alongside it. */
export interface CanonicalResolution {
  scopeKind: string | null
  scopeZoneId: string | null
  scopePinId: string | null
  itemId: string | null
  kind: string | null
  via: string | null
  result: string | null
  note: string | null
  reasonId: string | null
  /** Nested inside the resolution body on the wire. Easy to drop; must not be. */
  evidence: Record<string, unknown> | null
  at: string | null
  source: CanonicalSource | null
}

export interface CanonicalEvent {
  eventId: string | null
  seq: number | null
  type: string | null
  at: string | null
  /** Per-event, independent of the manifest's own version number. */
  schemaVersion: number | null
  source: CanonicalSource | null
  /** The whole event verbatim, so nothing is lost to normalization. */
  payload: Record<string, unknown>
}

export interface CanonicalTotals {
  [key: string]: number | undefined
}

export interface CanonicalImport {
  /**
   * Recorded for provenance. Never branched on outside an adapter.
   */
  sourceManifestVersion: number
  session: CanonicalSession
  config: CanonicalConfig
  zones: CanonicalZone[]
  canvases: CanonicalCanvas[]
  pins: CanonicalPin[]
  anchors: CanonicalAnchor[]
  media: CanonicalMedia[]
  notes: CanonicalNote[]
  chatThreads: CanonicalChatThread[]
  inboxRefs: CanonicalInboxRef[]
  resolutions: CanonicalResolution[]
  events: CanonicalEvent[]
  /** What the export claimed. Reconciled against the arrays by validation. */
  declaredTotals: CanonicalTotals
  orphanEvents: unknown[]
}
