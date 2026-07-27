export interface Property {
  id: string
  label: string
  address: string | null
  created_at: string
  visit_count?: number
  import_count?: number
}

export interface Visit {
  id: string
  property_id: string
  kind: string
  visit_date: string | null
  notes: string | null
  created_at: string
  import_count?: number
  latest_import_id?: string | null
  latest_status?: string | null
}

export interface Check {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  detail?: unknown
}

export interface ImportReport {
  import: {
    id: string
    status: 'ok' | 'ok_with_warnings' | 'failed'
    importedAt: string
    manifestSchemaVersion: number
    appVersion: string | null
    mediaMode: string
    config: { id: string | null; version: string | null; hash: string | null }
  }
  property: { id: string; label: string; address: string | null }
  visit: { id: string; kind: string; visitDate: string | null }
  session: {
    sessionId: string | null
    propertyLabel: string | null
    flags: string[]
    startedAt: string | null
    completedAt: string | null
    exportedAt: string | null
    lifecycle: { type?: string; at?: string; reason?: string }[]
    declaredTotals: Record<string, number>
    orphanEvents: unknown[]
  }
  counts: {
    zones: number
    canvases: number
    pins: {
      total: number
      typeless: number
      retired: number
      unanchored: number
      flagged: { flag: string | null; n: number }[]
      byTypeKind: { type_kind: string | null; n: number }[]
      anomalousDistinct: number
      anomalous: { number: number; pinId: string; flags: string[] }[]
    }
    media: {
      total: number
      bytes: number
      verified: number
      byKind: { kind: string | null; count: number; bytes: number }[]
      byOwner: { owner_kind: string | null; count: number; bytes: number }[]
      verification: { verified: number; failed: number; absent: number; presentUnverified: number }
    }
    notes: number
    chatThreads: number
    chatMessages: number
    inboxRefs: { ref_kind: string; n: number }[]
    inboxTotal: number
    events: number
    eventsByType: { type: string | null; n: number }[]
    orphanEvents: number
  }
  checklist: {
    total: number
    byKind: { kind: string | null; n: number }[]
    byScope: { scope_kind: string | null; n: number }[]
    byResult: { result: string | null; n: number }[]
    naByReason: { reason_id: string | null; n: number }[]
    gaps: { count: number; rows: { item_id: string; reason_id: string | null; scope_kind: string | null }[] }
    findings: {
      total: number
      failedChecks: number
      confirmedAbsences: number
      rows: {
        item_id: string
        kind: string | null
        result: string | null
        reason_id: string | null
        scope_kind: string | null
      }[]
    }
    eventReconciliation: {
      itemResolved: number
      itemReopened: number
      net: number
      resolutionsLength: number
    }
  }
  zones: {
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
    closeCount: number
    reopenCount: number
    reopenReasons: string[]
    closedWithNoWork: boolean
  }[]
  unrecognized: { resolutions: number; events: number }
  validation: {
    status: string
    checks: Check[]
    checksRun: string[]
    unrecognizedTerms: { field: string; value: string; count: number; examples: string[] }[]
    counts: { errors: number; warnings: number; infos: number }
  }
}

// ------------------------------------------------------------------ the pass

export interface Overlay {
  id: string
  visitId: string
  seq: number
  kind: string
  targetKind: string
  targetId: string
  field: string | null
  priorValue: unknown
  newValue: unknown
  reason: string | null
  supersedesId: string | null
  actor: string
  actorContext: string
  createdAt: string
}

export interface TrailEntry {
  overlay: Overlay
  verb: string
  live: boolean
}

export interface EntityState {
  targetKind: string
  targetId: string
  decision: Overlay | null
  corrections: Record<string, Overlay>
  confirm: Overlay | null
  assign: Overlay | null
  flag: Overlay | null
  memory: Overlay | null
  unrecognized: Overlay[]
  trail: TrailEntry[]
}

export interface PassPin {
  pinId: string
  number: number | null
  typeKind: string | null
  componentType: string | null
  freeformLabel: string | null
  flag: string | null
  retiredAt: string | null
  anchors: { anchorId: string; canvasId: string | null; x: number | null; y: number | null }[]
  mediaIds: string[]
  notes: { noteId: string; text: string | null; at: string | null }[]
  deskPlacement: {
    overlayId: string
    canvasId: string
    x: number
    y: number
    evidence: { kind: string; id: string } | null
    priorPosition: { canvasId?: string; x?: number; y?: number } | null
    at: string
  } | null
}

export interface PhotoTile {
  mediaId: string
  kind: string | null
  mime: string | null
  bytes: number | null
  capturedAt: string | null
  durationMs: number | null
  fileStatus: string
  state: EntityState | null
}

export type DecisionReason = 'typeless-pin' | 'pin-flagged-issue' | 'failed-check' | 'na' | 'inbox-unassigned'

export interface DecisionItem {
  key: string
  targetKind: string
  targetId: string
  reasons: DecisionReason[]
  headline: string
  pin?: PassPin
  photo?: PhotoTile
  resolution?: {
    itemId: string
    itemText: string | null
    kind: string | null
    via: string | null
    result: string | null
    note: string | null
    reasonId: string | null
    reasonLabel: string | null
    evidence: Record<string, unknown> | null
    scopeKind: string | null
    scopePinNumber: number | null
  }
  decided: boolean
  state: EntityState | null
}

export interface PassZone {
  zoneId: string
  type: string | null
  label: string | null
  level: string | null
  closedAt: string | null
  order: number
  canvases: { canvasId: string; kind: string | null; mediaId: string | null; imageAvailable: boolean }[]
  pins: PassPin[]
  unplacedPins: PassPin[]
  retiredPinCount: number
  decisions: DecisionItem[]
  roomPhotos: PhotoTile[]
  memory: EntityState | null
  memoryAudio: {
    id: string
    durationMs: number | null
    bytes: number | null
    peakLevel: number | null
    silent: boolean
    acknowledgedAt: string | null
    createdAt: string
  }[]
  opened: boolean
  openedAt: string | null
  openCount: number
  decisionsRemaining: number
}

export interface NaReason {
  id: string
  label?: string
  feedsGapList?: boolean
  recordsFinding?: boolean
}

export interface PassModel {
  visit: { id: string; kind: string; visitDate: string | null; propertyId: string }
  property: { id: string; label: string }
  import: { id: string; mediaMode: string; importedAt: string } | null
  pass: {
    id: string
    mode: string
    startedAt: string
    completedAt: string | null
    completedWithOutstanding?: string[] | null
    history?: { type: string; at: string; outstanding: string[] | null; reason: string | null }[]
  } | null
  zones: PassZone[]
  sessionItems: DecisionItem[]
  vocabulary: { componentTypes: string[]; naReasons: NaReason[] }
  progress: {
    zonesTotal: number
    zonesWalked: number
    decisionsTotal: number
    decisionsMade: number
    decisionsRemaining: number
    actsRecorded: number
    complete: boolean
    outstanding: string[]
  }
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
    Object.assign(err, body)
    throw err
  }
  return body as T
}

export const api = {
  listProperties: () => req<Property[]>('/api/properties'),

  createProperty: (label: string, address: string) =>
    req<Property>('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, address }),
    }),

  getProperty: (id: string) => req<{ property: Property; visits: Visit[] }>(`/api/properties/${id}`),

  createVisit: (propertyId: string, kind: string, visitDate: string) =>
    req<Visit>(`/api/properties/${propertyId}/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, visitDate: visitDate || null }),
    }),

  /**
   * Send whatever the operator picked. The server sorts the manifest from the
   * media archives by what the files are, so the order they were selected in
   * does not matter.
   */
  importFiles: (visitId: string, files: FileList | File[]) => {
    const fd = new FormData()
    for (const file of Array.from(files)) fd.append('files', file)
    return req<{ importId: string; status: string }>(`/api/visits/${visitId}/import`, {
      method: 'POST',
      body: fd,
    })
  },

  importReferenceFixture: (visitId: string) =>
    req<{ importId: string; status: string }>(`/api/visits/${visitId}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useReferenceFixture: true }),
    }),

  getReport: (importId: string) => req<ImportReport>(`/api/imports/${importId}/report`),

  // ------------------------------------------------------------------ pass
  getPass: (visitId: string) => req<PassModel>(`/api/visits/${visitId}/pass`),

  startPass: (visitId: string) =>
    req<unknown>(`/api/visits/${visitId}/pass/start`, { method: 'POST' }),

  openZone: (visitId: string, zoneId: string) =>
    req<unknown>(`/api/visits/${visitId}/pass/zones/${zoneId}/open`, { method: 'POST' }),

  /** force = the concierge was shown what is outstanding and said yes anyway. */
  completePass: (visitId: string, force = false) =>
    req<{ model: PassModel }>(`/api/visits/${visitId}/pass/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    }),

  /**
   * One act. The four kinds are separate calls to the same endpoint rather than
   * one "decide" call with a flag, because they are separate acts and the
   * record keeps them separate.
   */
  writeOverlay: (
    visitId: string,
    body: {
      kind: string
      targetKind: string
      targetId: string
      field?: string | null
      newValue?: unknown
      reason?: string | null
    },
  ) =>
    req<Overlay>(`/api/visits/${visitId}/overlays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** Late thoughts about a house are normal and must not need a hack. */
  reopenPass: (visitId: string) =>
    req<unknown>(`/api/visits/${visitId}/pass/reopen`, { method: 'POST' }),

  /**
   * Placing or moving a pin on a canvas at the desk.
   *
   * Always carries the evidence it was read from — spec §2: the line is
   * evidence versus recall, and the server refuses a placement without one.
   */
  place: (
    visitId: string,
    pinId: string,
    value: { canvasId: string; x: number; y: number; evidence: { kind: string; id: string } },
  ) =>
    req<Overlay>(`/api/visits/${visitId}/overlays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'place', targetKind: 'pin', targetId: pinId, newValue: value }),
    }),

  /** With no argument this takes back the most recent act — the `u` keystroke. */
  undo: (visitId: string, overlayId?: string) =>
    req<Overlay>(`/api/visits/${visitId}/overlays/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overlayId ? { overlayId } : {}),
    }),
}

/** Full-size original. Used for the lightbox, never for a grid. */
export const mediaUrl = (visitId: string, mediaId: string): string =>
  `/api/visits/${visitId}/media/${mediaId}`

/**
 * A thumbnail. Made on demand and cached — see server/src/pass/thumbs.ts for
 * why. 400 for grid tiles, 1200 for the canvas.
 */
export const thumbUrl = (visitId: string, mediaId: string, w: 400 | 1200 = 400): string =>
  `/api/visits/${visitId}/media/${mediaId}/thumb?w=${w}`

/**
 * Decimal MB, not binary MiB, deliberately.
 *
 * The manifest declares bytes. Anyone cross-checking a figure here against the
 * export's own number must land on the same value — 122,680,159 bytes is
 * 122.7 MB here and 117.0 MiB under the other convention, and a 5 MB
 * discrepancy in a report about honesty is the wrong place to be clever.
 */
export const fmtBytes = (n: number): string => {
  if (n < 1000) return `${n} B`
  if (n < 1000 ** 2) return `${(n / 1000).toFixed(1)} KB`
  if (n < 1000 ** 3) return `${(n / 1000 ** 2).toFixed(1)} MB`
  return `${(n / 1000 ** 3).toFixed(2)} GB`
}

export const fmtTime = (s: string | null | undefined): string =>
  s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
