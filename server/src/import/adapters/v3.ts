import type { Manifest } from '../manifest.js'
import { makeReport, type Check } from '../validate.js'
import type {
  CanonicalAnchor,
  CanonicalCanvas,
  CanonicalImport,
  CanonicalInboxRef,
  CanonicalSource,
} from './canonical.js'

/**
 * The manifest v3 adapter.
 *
 * Everything this repo knows about the SHAPE of a v3 export lives here and
 * nowhere else. When v4 arrives it gets its own module beside this one; nothing
 * downstream changes.
 *
 * v3 is a proving exercise, not production — one real export exists and it is
 * archived. Its job was to make the contract executable and flush out
 * mismatches early, which it did. This module is where that knowledge is
 * quarantined so the production path (v4) does not inherit it.
 *
 * The v3-specific quirks handled here, all documented against the real export:
 *   - canvases arrive nested inside zones; anchors nested inside pins
 *   - chat messages carry no sequence number; order is array position
 *   - `pin.type` is ABSENT on typeless pins, not null
 *   - `pin.retired` is an object `{at}`, not a timestamp
 *   - `inbox` is an object of reference arrays, not a list of items
 *   - the resolution body is nested under `resolution`, with `evidence` inside it
 *   - media ownership is in `owner{}`; the file path is storage location only
 *   - there is no top-level `sessionAudit` — session items are resolutions with
 *     `scope.kind = "session"`
 */

export const MANIFEST_SCHEMA_VERSION = 3

/** Sections a v3 export must have for the file to be readable at all. */
const REQUIRED_SECTIONS = [
  'session',
  'config',
  'zones',
  'pins',
  'media',
  'resolutions',
  'totals',
  'events',
] as const

/** Present in every real v3 export, but not fatal if a future one omits them. */
const OPTIONAL_SECTIONS = ['notes', 'chats', 'inbox', 'orphanEvents'] as const

/**
 * Fail closed on structure — v3's own definition of "readable".
 *
 * Reports every problem at once rather than one per attempt, so an operator with
 * a bad file learns everything wrong with it in one go.
 */
export function validateStructure(parsed: unknown): Check[] {
  const { checks, add } = makeReport()
  const m = parsed as Record<string, unknown>

  for (const section of REQUIRED_SECTIONS) {
    if (m[section] === undefined || m[section] === null) {
      add({
        code: 'structure.missing-section',
        severity: 'error',
        message: `Required top-level section "${section}" is missing.`,
        detail: { section },
      })
    }
  }

  for (const section of OPTIONAL_SECTIONS) {
    if (m[section] === undefined || m[section] === null) {
      add({
        code: 'structure.missing-optional-section',
        severity: 'warning',
        message: `Optional top-level section "${section}" is absent. Importing without it.`,
        detail: { section },
      })
    }
  }

  for (const name of ['zones', 'pins', 'media', 'resolutions', 'events'] as const) {
    const value = m[name]
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      add({
        code: 'structure.wrong-shape',
        severity: 'error',
        message: `Top-level "${name}" must be an array, found ${typeof value}.`,
        detail: { section: name },
      })
    }
  }

  // In v3 the inbox is an object of reference arrays, not a list of items.
  const inbox = m.inbox
  if (inbox !== undefined && inbox !== null && (typeof inbox !== 'object' || Array.isArray(inbox))) {
    add({
      code: 'structure.wrong-shape',
      severity: 'error',
      message: 'Top-level "inbox" must be an object of reference arrays ({mediaIds, noteIds}).',
      detail: { section: 'inbox' },
    })
  }

  return checks
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const src = (v: unknown): CanonicalSource | null =>
  v && typeof v === 'object' ? (v as CanonicalSource) : null

/**
 * Normalizes a parsed v3 manifest into the canonical shape.
 *
 * Structural validation has already run and passed by the time this is called —
 * this function normalizes, it does not judge. Content problems (dangling
 * references, out-of-range anchors, unfamiliar words) are found downstream, on
 * the canonical shape, by checks that work for every manifest version.
 */
export function toCanonical(m: Manifest): { canonical: CanonicalImport; checks: Check[] } {
  const { checks } = makeReport()

  // Canvases arrive nested inside their zone. Flatten, carrying the zone down.
  const canvases: CanonicalCanvas[] = (m.zones ?? []).flatMap((z) =>
    (z.canvases ?? []).map((c) => ({
      canvasId: str(c.canvasId),
      zoneId: str(z.zoneId),
      kind: str(c.kind),
      retired: c.retired === true,
      mediaId: str(c.mediaId),
      file: str(c.file),
    })),
  )

  // Anchors arrive nested inside their pin. Same treatment.
  const anchors: CanonicalAnchor[] = (m.pins ?? []).flatMap((p) =>
    (p.anchors ?? []).map((a) => ({
      anchorId: str(a.anchorId),
      pinId: str(p.pinId),
      canvasId: str(a.canvasId),
      x: num(a.x),
      y: num(a.y),
    })),
  )

  // The inbox is an object of reference arrays, not a list of items.
  const inboxRefs: CanonicalInboxRef[] = [
    ...arr<string>(m.inbox?.mediaIds).map((id) => ({ refKind: 'media' as const, refId: id })),
    ...arr<string>(m.inbox?.noteIds).map((id) => ({ refKind: 'note' as const, refId: id })),
  ]

  const canonical: CanonicalImport = {
    sourceManifestVersion: MANIFEST_SCHEMA_VERSION,

    session: {
      sessionId: str(m.session?.sessionId),
      propertyLabel: str(m.session?.propertyLabel),
      flags: arr<string>(m.session?.flags),
      startedAt: str(m.session?.startedAt),
      completedAt: str(m.session?.completedAt),
      exportedAt: str(m.session?.exportedAt),
      appVersion: str(m.session?.appVersion),
      lifecycle: arr(m.session?.lifecycle),
    },

    // Passed through whole. The config decides, not the builder — so the builder
    // does not get to reshape it and drop a key it has not met.
    config: {
      id: str(m.config?.configId),
      version: str(m.config?.version),
      hash: str(m.config?.hash),
      snapshot: (m.config?.snapshot ?? {}) as Record<string, unknown>,
    },

    zones: (m.zones ?? []).map((z) => ({
      zoneId: str(z.zoneId),
      type: str(z.type),
      label: str(z.label),
      level: str(z.level),
      attributes: (z.attributes ?? {}) as Record<string, unknown>,
      closedAt: str(z.closedAt),
      closeNote: str(z.closeNote),
      auditSummary: z.audit
        ? {
            coreUnresolved: arr<string>(z.audit.coreUnresolved),
            standardUnresolved: num(z.audit.standardUnresolved),
            naCount: num(z.audit.naCount),
          }
        : null,
    })),

    canvases,

    pins: (m.pins ?? []).map((p) => ({
      pinId: str(p.pinId),
      number: num(p.number),
      zoneId: str(p.zoneId),
      // `type` is ABSENT on a typeless pin, not null. Optional chaining handles
      // both, and all three columns stay null rather than being invented.
      typeKind: str(p.type?.kind),
      componentType: str(p.type?.componentType),
      freeformLabel: str(p.type?.label),
      nickname: str(p.label),
      flag: str(p.flag),
      // `retired` is an object on the wire; the canonical shape wants the moment.
      retiredAt: str(p.retired?.at),
      mediaIds: arr<string>(p.mediaIds),
      noteIds: arr<string>(p.noteIds),
      chatThreadIds: arr<string>(p.chatThreadIds),
    })),

    anchors,

    media: (m.media ?? []).map((x) => ({
      mediaId: str(x.mediaId),
      kind: str(x.kind),
      // Ownership from owner{}, never parsed out of the path.
      ownerKind: str(x.owner?.kind),
      ownerZoneId: str(x.owner?.zoneId),
      ownerPinId: str(x.owner?.pinId),
      ownerPinNumber: num(x.owner?.pinNumber),
      ownerCanvasId: str(x.owner?.canvasId),
      groupKey: str(x.group),
      file: str(x.file),
      mime: str(x.mime),
      bytes: num(x.bytes),
      sha256: str(x.sha256),
      capturedAt: str(x.capturedAt),
      durationMs: num(x.durationMs),
      source: src(x.source),
    })),

    notes: (m.notes ?? []).map((n) => ({
      noteId: str(n.noteId),
      targetKind: str(n.target?.kind),
      targetId: str(n.target?.id),
      text: str(n.text),
      at: str(n.at),
      source: src(n.source),
    })),

    chatThreads: (m.chats ?? []).map((t) => ({
      threadId: str(t.threadId),
      targetKind: str(t.target?.kind),
      targetId: str(t.target?.id),
      // Messages carry no seq of their own. Position in the array IS the order,
      // and the adapter makes that explicit so nothing downstream has to guess.
      messages: (t.messages ?? []).map((msg, i) => ({
        seq: i + 1,
        role: str(msg.role),
        text: str(msg.text),
        mediaIds: arr<string>(msg.mediaIds),
        model: str(msg.model),
        at: str(msg.at),
        source: src(msg.source),
      })),
    })),

    inboxRefs,

    resolutions: (m.resolutions ?? []).map((r) => {
      const body = r.resolution ?? {}
      return {
        scopeKind: str(r.scope?.kind),
        scopeZoneId: str(r.scope?.zoneId),
        scopePinId: str(r.scope?.pinId),
        itemId: str(r.itemId),
        kind: str(body.kind),
        via: str(body.via),
        result: str(body.result),
        note: str(body.note),
        reasonId: str(body.reasonId),
        evidence: body.evidence ?? null,
        at: str(r.at),
        source: src(r.source),
      }
    }),

    /**
     * v3 ships no active item set — Increment 4 §3c.
     *
     * Empty rather than absent, so nothing downstream has to ask whether the
     * key exists before reading it. The builder computes the set for a v3
     * import and marks it `computed`; that difference is the whole of what a
     * version adapter is for.
     */
    activeItems: [],

    events: (m.events ?? []).map((e) => ({
      eventId: str(e.eventId),
      seq: num(e.seq),
      type: str(e.type),
      at: str(e.at),
      schemaVersion: num(e.schemaVersion),
      source: src(e.source),
      payload: e as Record<string, unknown>,
    })),

    declaredTotals: (m.totals ?? {}) as Record<string, number | undefined>,
    orphanEvents: arr(m.orphanEvents),
  }

  return { canonical, checks }
}
