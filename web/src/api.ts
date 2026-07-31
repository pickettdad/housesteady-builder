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
  /** What somebody typed when the visit was created. Not evidence — see `walkedAt`. */
  planned_date: string | null
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
  visit: { id: string; kind: string; plannedDate: string | null; walkedDate: string | null }
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
  generationId: string | null
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
  values: Record<string, Overlay>
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
  /** The desk's acts on this pin, including values accepted off a photograph. */
  state: EntityState | null
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
  visit: { id: string; kind: string; plannedDate: string | null; walkedDate: string | null; propertyId: string }
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

// ---------------------------------------------------------------- the assists
//
// Increment 2b §7. Deliberately a SEPARATE payload from the pass model, and the
// split is doctrine rather than tidiness: accepted values are state and live in
// `PassModel` with every other act, while a proposal is a thing a model said
// that nobody has signed. Keeping them in different objects is what makes "no
// path renders a generation as current state" hard to break by accident.

export interface Provenance {
  task: string
  model: string | null
  promptId: string | null
  promptVersion: string | null
  decision: string
  abstained: boolean
  createdAt: string
}

/** What could be seen, where the model declined to read. Never a value. */
export interface Uncertainty {
  partial: string
  obscured: string
  lookElsewhere: string
  alternatives: string[]
}

export type NameplateField = 'make' | 'model' | 'serial' | 'capacity' | 'installDate'

export interface ProposedField {
  field: NameplateField
  value: string | null
  uncertain?: Uncertainty
}

export interface Classification {
  isNameplate: 'yes' | 'no' | 'unsure'
  orientation: 'upright' | 'rotated' | 'unknown'
  reason: string
}

export interface NameplateProposal {
  generationId: string
  mediaId: string
  pinId: string | null
  fields: ProposedField[]
  abstained: boolean
  legible: boolean
  notes: string
  classifiedAs: Classification | null
  provenance: Provenance | null
}

export interface NotRead {
  mediaId: string
  pinId: string | null
  classifiedAs: Classification
}

export type Confidence = 'certain' | 'likely' | 'possible'

export interface TypeProposal {
  generationId: string
  pinId: string
  candidates: { type: string; confidence: Confidence; why: string }[]
  shows: string
  unsure?: string
  offList?: string[]
  alreadyAnswered: boolean
  provenance: Provenance | null
}

export type Dismissal = 'none-of-these' | 'belongs-elsewhere'

export interface RoutingSuggestion {
  generationId: string
  mediaId: string
  candidates: { pinId: string; number: number | null; label: string; confidence: Confidence; why: string }[]
  shows: string
  unsure?: string
  origin: 'room' | 'inbox'
  dismissals: Dismissal[]
}

export interface RoutingBatch {
  bar: Confidence
  suggestions: RoutingSuggestion[]
  belowBar: number
  silent: number
}

export interface AssistModel {
  nameplates: NameplateProposal[]
  notRead: NotRead[]
  types: TypeProposal[]
  routing: RoutingBatch
  provenance: Record<string, Provenance>
  queue: {
    queued: number
    running: number
    done: number
    failed: number
    skipped: number
    failures: { task: string; targetKind: string; targetId: string; error: string | null }[]
    /** Why work was correctly not done, grouped and counted. Never silent. */
    skips: { task: string; reason: string; n: number }[]
  }
  spend: {
    inputTokens: number
    outputTokens: number
    dollars: number
    generations: number
    cap: number
    capReached: boolean
    /** False when no rates are configured — the screen must then say unknown. */
    ratesKnown: boolean
  }
  running: boolean
  blocked: string | null
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

/** What one slot's audit says. Mirrors `audit_slots` — §3. */
export interface AuditSlot {
  slotId: string
  kind: string
  applicable: boolean
  required: boolean
  state: 'complete' | 'partial' | 'empty' | 'not-applicable' | 'n-a-narrative'
  /**
   * What specifically is short, in two parts — §3.
   *
   * Structured rather than a sentence because the screen groups by the shared
   * reason, and a label containing a dash ("Water heater shutoff — water and
   * fuel/power") splits in half if the client tries to take the sentence apart.
   */
  missing: { what: string; why?: string }[]
  detail: Record<string, unknown>
}

export interface AuditSection {
  sectionId: string
  number: number
  title: string
  rollup: { state: string; complete: number; partial: number; empty: number; notApplicable: number }
}

export interface AuditRun {
  runId: string
  provenance: {
    schemaVersion: string
    schemaHash: string
    profileId: string
    profileVersion: string
    profileHash: string
    versionMismatch?: string
  }
  slots: AuditSlot[]
  sections: AuditSection[]
  gaps: AuditSlot[]
  warnings: string[]
  triggerFacts: {
    property: string[]
    propertyVocabulary: string[]
    pinsAnywhere: string[]
    visitKind: string
    zoneTypesWalked: string[]
    importsRead: { id: string; visitId: string | null; at: string; producer: string | null; configVersion: string | null }[]
  }
  binding: {
    context: {
      configVersion: string
      schemaReconciledAgainst: string
      zoneTypes: string[]
      zoneCount: number
      importsRead: number
      producers: string[]
    }
    bound: { slotId: string; itemId: string; label: string }[]
    noCandidate: { slotId: string; itemId: string; label: string }[]
    candidateShort: { slotId: string; itemId: string; label: string; unresolvedItems: string[]; matched: { number: number }[] }[]
    brokenBindings: { slotId: string; itemId: string; label: string; brokenRefs: string[] }[]
    unmatchedEvidence: { pinId: string; number: number; zoneId: string | null; describedAs: string; reason: string }[]
    rate: {
      itemsConsidered: number
      itemsApplicable: number
      itemsBound: number
      evidenceConsidered: number
      evidenceBound: number
      evidenceUnmatched: number
      unmatchedPercent: number
    }
  }
  contributions: Record<string, { visitId: string | null; importId: string; at: string }>
  /**
   * §1b — the field-checklist gap stream. **A separate output from `gaps`.**
   *
   * `gaps` is binder-slot completeness; this is which checklist item, in which
   * room, was never answered. On the reference export `gaps` carries none of
   * these twenty. The two are never added together and never rendered under one
   * heading.
   */
  carried: {
    items: CarriedItem[]
    /** The derivation, named. "19 of 19 applicable items in ensuite have no answer." */
    evidence: string[]
    byScope: { zone: number; pin: number; session: number; other: number }
    warnings: string[]
  }
  statusDisagreements: { itemId: string; scopeKey: string; declared: string; derived: string }[]
  /**
   * Amendment 1 §C — how much of the stream can actually be written for a client.
   *
   * **Withholding is the safe branch**, so a report withholding all of itself
   * looks identical to one working perfectly. These are the numbers that tell
   * them apart. Today `namesDeclared` is 0 and `renderable` is 0: naming the
   * checklist items in HouseSteady's voice is a content pass that has not run.
   */
  clientCoverage: {
    total: number
    renderable: number
    withheld: number
    reasons: { itemId: string; because: string }[]
    namesDeclared: number
  }
}

/** One carried item. Mirrors `audit_carried_items` — §1b. */
export interface CarriedItem {
  scope: { kind: string; zoneId: string | null; pinId: string | null }
  itemId: string
  tier: string
  /** `not-reached`, or the config's own na reason id, verbatim. Open vocabulary. */
  reason: string
  naReasonId: string | null
  column: 'missing-from-you' | 'missing-from-us' | 'triggered-flags'
  /** Structured, never a composed sentence — §2a. Two composers read these. */
  parts: { what: string; why?: string }
  /** §1c — `proposed` means evidence is on the pin awaiting one confirming tap. */
  status: string | null
  origin: 'received' | 'computed'
  dueSince: { importId: string; visitId: string | null; at: string }
  where: string
  certain: boolean
  unrecognised: string[]
}

export const api = {
  listProperties: () => req<Property[]>('/api/properties'),

  /** The gap report draft. A projection of the audit plus the edit log, never a stored document. */
  gapReport: (propertyId: string) => req<Draft>(`/api/properties/${propertyId}/report`),

  /** One editorial decision. Append-only — the server never updates a row. */
  editReportRow: (propertyId: string, rowKey: string, kind: string, payload?: Record<string, unknown>) =>
    req<{ id: string }>(`/api/properties/${propertyId}/report/rows/${encodeURIComponent(rowKey)}/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    }),

  /** §1d — a row the concierge types. Provenance `human-entered`, always. */
  addReportRow: (propertyId: string, text: string, column: string) =>
    req<{ rowKey: string }>(`/api/properties/${propertyId}/report/rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, column }),
    }),

  /**
   * Sign the report — the only way client-facing HTML comes to exist.
   *
   * There is deliberately no `render` call beside this. A render that can happen
   * without a signer is a render that will.
   */
  signReport: (propertyId: string) =>
    req<Edition>(`/api/properties/${propertyId}/report/sign`, { method: 'POST' }),

  editions: (propertyId: string) => req<Edition[]>(`/api/properties/${propertyId}/report/editions`),

  editionUrl: (id: string) => `/api/report/editions/${id}.html`,

  reportRowTrail: (propertyId: string, rowKey: string) =>
    req<{ kind: string; actorId: string; at: string }[]>(
      `/api/properties/${propertyId}/report/rows/${encodeURIComponent(rowKey)}/trail`,
    ),

  /**
   * A client-facing name, written inline.
   *
   * Company-wide the moment it is written, and unratified until the design
   * session confirms it — the server's insert hardcodes NULL, so this call
   * cannot ratify anything.
   */
  writeClientName: (itemId: string, name: string, propertyId?: string) =>
    req<{ id: string; ratified: boolean }>('/api/client-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, name, propertyId }),
    }),

  /** §1i — the audit is PROPERTY-scoped. A re-run is a new run, never an update. */
  runAudit: (propertyId: string, visitId?: string | null) =>
    req<AuditRun>(`/api/properties/${propertyId}/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitId: visitId ?? null }),
    }),

  createProperty: (label: string, address: string) =>
    req<Property>('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, address }),
    }),

  getProperty: (id: string) => req<{ property: Property; visits: Visit[] }>(`/api/properties/${id}`),

  createVisit: (propertyId: string, kind: string, plannedDate: string) =>
    req<Visit>(`/api/properties/${propertyId}/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, plannedDate: plannedDate || null }),
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

  // --------------------------------------------------------------- assists
  getAssists: (visitId: string) => req<AssistModel>(`/api/visits/${visitId}/assists`),

  /** Queues whatever is owed and starts a drain. Returns without waiting. */
  runAssists: (visitId: string, retryFailed = false) =>
    req<{ queued: { total: number }; requeued: number }>(`/api/visits/${visitId}/assists/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retryFailed }),
    }),

  /**
   * Accept a whole plate in one act.
   *
   * Every field at once because that is the claim being made — I looked at this
   * plate and this description matches what I saw. A field the concierge left
   * alone is simply absent from `values`, and nothing is written for it.
   */
  acceptReading: (visitId: string, generationId: string, values: Record<string, string>) =>
    req<{ decision: string }>(`/api/visits/${visitId}/assists/${generationId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    }),

  acceptType: (visitId: string, generationId: string, value: unknown) =>
    req<{ decision: string }>(`/api/visits/${visitId}/assists/${generationId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }),

  /** Answering a routing suggestion. The act is an ordinary attachment. */
  acceptRoute: (visitId: string, generationId: string, pinId: string) =>
    req<{ decision: string }>(`/api/visits/${visitId}/assists/${generationId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinId }),
    }),

  /** Recorded, never deleted — the discards are the evidence about a prompt. */
  discardProposal: (visitId: string, generationId: string, note?: string) =>
    req<unknown>(`/api/visits/${visitId}/assists/${generationId}/discard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
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

// ------------------------------------------------- the gap report editor (§5)

/** What a row's presence rests on. §1d — visible in the record, not only in the render. */
export type RowProvenance = 'evidence-bound' | 'human-entered'

export interface DraftRow {
  rowKey: string
  column: string
  /**
   * Why it landed in that column, in a sentence rather than a rule id.
   *
   * §5: a misclassified row should be visible AS misclassified. A concierge can
   * disagree with "this is ours because a checklist item in the ensuite has no
   * answer"; nobody can disagree with `rule-3`.
   */
  columnBecause: string
  provenance: RowProvenance
  text: string
  reworded: boolean
  /** What the composer wrote, kept beside a rewording so the change is visible. */
  composed: string | null
  included: boolean
  source?: {
    itemId: string
    scopeKind: string
    zoneId: string | null
    pinId: string | null
    where: string
    /** Client-safe, or null — the location the render composes from. */
    whereLabel: string | null
    reason: string
    /** Untouched by any rewording — §2's boundary holds through the editor. */
    parts: { what: string; why?: string }
    /**
     * What the checklist asked, in the config's own words. **Desk-facing.**
     *
     * Shown beside the naming box so the person writing has something to
     * translate rather than something to invent. It is emphatically NOT a
     * client-facing name — reading it as one is Amendment 1 §C's failure.
     */
    itemText: string | null
  }
  /** False when the item's client-facing name has not been through the design session. */
  nameRatified: boolean
  /**
   * What the pin or room this row points at is holding.
   *
   * **A row affordance, never a filter.** Presence of media says nothing about
   * whether THIS item was captured, and gating rows on it would silence the row
   * that most needed saying.
   */
  media: {
    /** A pin's media or a room's. Worded differently, because they claim different things. */
    ofWhat: 'pin' | 'room'
    ofKind: { kind: string; count: number; bytes: number }[]
    total: number
    recent: { mediaId: string; kind: string; capturedAt: string | null }[]
  } | null
  withheldBecause?: string
  actor?: string
  at?: string
}

export interface Draft {
  propertyId: string
  auditRunId: string | null
  rows: DraftRow[]
  columns: { id: string; title: string; rows: DraftRow[] }[]
  /** Rows the client render cannot carry, with the reason. Never silently dropped. */
  withheld: DraftRow[]
  /** Written inline, still awaiting the design session. Empties when the file carries the item. */
  unratifiedNames: { id: string; itemId: string; name: string; actorId: string; at: string }[]
  /**
   * Proposals the ratified file has since settled, with both wordings.
   *
   * Read for a different reason than the queue: not work to do, but how the
   * wording moved. **If these routinely differ a lot the fault is in the naming
   * guidance, not in the concierge** — the same reading the house style takes of
   * a high rewrite rate.
   */
  supersededNames: { itemId: string; proposed: string; ratified: string; actorId: string; at: string }[]
}

/** A House Style violation, with the rule's own reason. §6, gate two. */
export interface Violation {
  rule: string
  found: string
  where: string
  because: string
}

/**
 * A signed edition — Design v1 §6.
 *
 * **The bytes are the deliverable.** A second edition does not replace the
 * first; a client asking in September what their July report said gets the July
 * bytes rather than a re-render against today's names and today's audit.
 */
export interface Edition {
  id: string
  number: number
  propertyId: string
  auditRunId: string
  signedBy: string
  signedAt: string
  contentHash: string
  columns: {
    id: string
    title: string
    groups: {
      reason: string
      where: string | null
      frame: string
      label: string
      items: { itemId: string; name: string; nameRatified: boolean }[]
      next?: string
    }[]
    typed: string[]
    media: { where: string; summary: string }[]
  }[]
  /** Rows held out, with the reason. Never dropped silently — doctrine 6. */
  withheld: { itemId: string; because: string }[]
}
