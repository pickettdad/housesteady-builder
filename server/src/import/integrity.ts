import type { Db } from '../db/index.js'
import type { CanonicalImport } from './adapters/canonical.js'
import { makeReport, type Check } from './validate.js'

/**
 * Cross-reference, bounds, sequence and timing checks.
 *
 * All of these read the CANONICAL shape, so they are written once and work for
 * every manifest version. Nothing here knows what a v3 export looks like.
 *
 * Every one is a WARNING, never a refusal. A dangling reference means the export
 * knows about something we cannot see — worth shouting about, and worth
 * importing anyway, because refusing loses the 99% that is fine along with the
 * 1% that is broken.
 *
 * Each message names BOTH ends. "3 dangling references" tells an operator
 * nothing they can act on; "pin 7 points at media 019f… which is not in media[]"
 * tells them exactly what to ask the field team.
 */

interface RefCheck {
  code: string
  dangling: string[]
}

const pinName = (p: { pinId: string | null; number: number | null }) =>
  p.number !== null ? `pin ${p.number}` : `pin ${p.pinId}`

export function checkReferentialIntegrity(c: CanonicalImport): Check[] {
  const { checks, add } = makeReport()

  const zoneIds = new Set(c.zones.map((z) => z.zoneId))
  const pinIds = new Set(c.pins.map((p) => p.pinId))
  const mediaIds = new Set(c.media.map((x) => x.mediaId))
  const noteIds = new Set(c.notes.map((n) => n.noteId))
  const threadIds = new Set(c.chatThreads.map((t) => t.threadId))
  const canvasIds = new Set(c.canvases.map((x) => x.canvasId))

  const results: RefCheck[] = []

  // -------------------------------------------------------------- from pins
  const pinToZone: string[] = []
  const pinToMedia: string[] = []
  const pinToNote: string[] = []
  const pinToChat: string[] = []
  for (const p of c.pins) {
    if (p.zoneId !== null && !zoneIds.has(p.zoneId)) {
      pinToZone.push(`${pinName(p)} sits in zone ${p.zoneId}, which is not in zones[]`)
    }
    for (const id of p.mediaIds) {
      if (!mediaIds.has(id)) pinToMedia.push(`${pinName(p)} points at media ${id}, which is not in media[]`)
    }
    for (const id of p.noteIds) {
      if (!noteIds.has(id)) pinToNote.push(`${pinName(p)} points at note ${id}, which is not in notes[]`)
    }
    for (const id of p.chatThreadIds) {
      if (!threadIds.has(id)) pinToChat.push(`${pinName(p)} points at chat thread ${id}, which is not in chats[]`)
    }
  }

  // ------------------------------------------------ anchors and canvases
  const pinByIdForAnchors = new Map(c.pins.map((p) => [p.pinId, p]))
  const anchorToCanvas: string[] = []
  const anchorToPin: string[] = []
  for (const a of c.anchors) {
    if (a.canvasId !== null && !canvasIds.has(a.canvasId)) {
      const p = pinByIdForAnchors.get(a.pinId)
      const who = p ? pinName(p) : `anchor ${a.anchorId}`
      anchorToCanvas.push(`${who} is anchored to canvas ${a.canvasId}, which no zone declares`)
    }
    if (a.pinId !== null && !pinIds.has(a.pinId)) {
      anchorToPin.push(`anchor ${a.anchorId} belongs to pin ${a.pinId}, which is not in pins[]`)
    }
  }

  const zoneById = new Map(c.zones.map((z) => [z.zoneId, z]))
  const canvasToMedia: string[] = []
  const canvasToZone: string[] = []
  for (const cv of c.canvases) {
    if (cv.mediaId !== null && !mediaIds.has(cv.mediaId)) {
      const z = zoneById.get(cv.zoneId)
      canvasToMedia.push(
        `canvas ${cv.canvasId} in "${z?.label ?? cv.zoneId}" uses media ${cv.mediaId}, which is not in media[]`,
      )
    }
    if (cv.zoneId !== null && !zoneIds.has(cv.zoneId)) {
      canvasToZone.push(`canvas ${cv.canvasId} belongs to zone ${cv.zoneId}, which is not in zones[]`)
    }
  }

  // ------------------------------------------------------------ from media
  const mediaOwner: string[] = []
  for (const x of c.media) {
    if (x.ownerKind === 'zone' && x.ownerZoneId !== null && !zoneIds.has(x.ownerZoneId)) {
      mediaOwner.push(`media ${x.mediaId} belongs to zone ${x.ownerZoneId}, which is not in zones[]`)
    }
    if (x.ownerKind === 'pin' && x.ownerPinId !== null && !pinIds.has(x.ownerPinId)) {
      mediaOwner.push(`media ${x.mediaId} belongs to pin ${x.ownerPinNumber ?? x.ownerPinId}, which is not in pins[]`)
    }
    if (x.ownerKind === 'canvas' && x.ownerCanvasId !== null && !canvasIds.has(x.ownerCanvasId)) {
      mediaOwner.push(`media ${x.mediaId} belongs to canvas ${x.ownerCanvasId}, which no zone declares`)
    }
  }

  // ------------------------------------- notes, chats, inbox, resolutions
  const targetExists = (kind: string | null, id: string | null): boolean => {
    if (id === null) return true
    if (kind === 'pin') return pinIds.has(id)
    if (kind === 'zone') return zoneIds.has(id)
    return true // session-scoped or a kind we do not know — not our call
  }

  const noteTarget: string[] = []
  for (const n of c.notes) {
    if (!targetExists(n.targetKind, n.targetId)) {
      noteTarget.push(`note ${n.noteId} is attached to ${n.targetKind} ${n.targetId}, which does not exist`)
    }
  }

  const chatTarget: string[] = []
  const chatMedia: string[] = []
  for (const t of c.chatThreads) {
    if (!targetExists(t.targetKind, t.targetId)) {
      chatTarget.push(`chat thread ${t.threadId} is attached to ${t.targetKind} ${t.targetId}, which does not exist`)
    }
    for (const msg of t.messages) {
      for (const id of msg.mediaIds) {
        if (!mediaIds.has(id)) {
          chatMedia.push(`a message in thread ${t.threadId} cites media ${id}, which is not in media[]`)
        }
      }
    }
  }

  const inboxRefs: string[] = []
  for (const ref of c.inboxRefs) {
    const known = ref.refKind === 'media' ? mediaIds.has(ref.refId) : noteIds.has(ref.refId)
    if (!known) inboxRefs.push(`the inbox holds ${ref.refKind} ${ref.refId}, which is not in the export`)
  }

  const resolutionRefs: string[] = []
  for (const r of c.resolutions) {
    if (r.scopeKind === 'zone' && r.scopeZoneId !== null && !zoneIds.has(r.scopeZoneId)) {
      resolutionRefs.push(`"${r.itemId}" is resolved against zone ${r.scopeZoneId}, which is not in zones[]`)
    }
    if (r.scopeKind === 'pin' && r.scopePinId !== null && !pinIds.has(r.scopePinId)) {
      resolutionRefs.push(`"${r.itemId}" is resolved against pin ${r.scopePinId}, which is not in pins[]`)
    }
    const evidencePin = r.evidence?.pinId
    if (typeof evidencePin === 'string' && !pinIds.has(evidencePin)) {
      resolutionRefs.push(`"${r.itemId}" cites pin ${evidencePin} as its evidence, which is not in pins[]`)
    }
  }

  results.push(
    { code: 'integrity.pin-zone', dangling: pinToZone },
    { code: 'integrity.pin-media', dangling: pinToMedia },
    { code: 'integrity.pin-note', dangling: pinToNote },
    { code: 'integrity.pin-chat', dangling: pinToChat },
    { code: 'integrity.anchor-canvas', dangling: anchorToCanvas },
    { code: 'integrity.anchor-pin', dangling: anchorToPin },
    { code: 'integrity.canvas-media', dangling: canvasToMedia },
    { code: 'integrity.canvas-zone', dangling: canvasToZone },
    { code: 'integrity.media-owner', dangling: mediaOwner },
    { code: 'integrity.note-target', dangling: noteTarget },
    { code: 'integrity.chat-target', dangling: chatTarget },
    { code: 'integrity.chat-media', dangling: chatMedia },
    { code: 'integrity.inbox-ref', dangling: inboxRefs },
    { code: 'integrity.resolution-scope', dangling: resolutionRefs },
  )

  for (const { code, dangling } of results) {
    for (const message of dangling) {
      add({ code, severity: 'warning', message: `Dangling reference — ${message}.`, detail: { code } })
    }
  }

  return checks
}

/** Anchors are normalized 0–1 against the canvas image. Out of range warns and stores anyway. */
export function checkAnchorBounds(c: CanonicalImport): Check[] {
  const { checks, add } = makeReport()
  const pinById = new Map(c.pins.map((p) => [p.pinId, p]))

  for (const a of c.anchors) {
    const bad: string[] = []
    if (a.x === null || a.x < 0 || a.x > 1) bad.push(`x = ${a.x}`)
    if (a.y === null || a.y < 0 || a.y > 1) bad.push(`y = ${a.y}`)
    if (bad.length > 0) {
      const p = pinById.get(a.pinId)
      add({
        code: 'anchor.out-of-bounds',
        severity: 'warning',
        message:
          `Pin ${p?.number ?? a.pinId} is anchored at ${bad.join(', ')}, outside the 0–1 range a canvas ` +
          `position must fall in. Stored as given — it will place off the edge of the image.`,
        detail: { pinNumber: p?.number ?? null, anchorId: a.anchorId, x: a.x, y: a.y },
      })
    }
  }
  return checks
}

/** The event log should run 1..n with nothing missing. A gap means events were lost. */
export function checkEventSequence(c: CanonicalImport): Check[] {
  const { checks, add } = makeReport()
  if (c.events.length === 0) return checks

  const seqs = c.events.map((e) => e.seq).filter((s): s is number => s !== null)
  if (seqs.length !== c.events.length) {
    add({
      code: 'events.missing-seq',
      severity: 'warning',
      message: `${c.events.length - seqs.length} of ${c.events.length} events carry no sequence number.`,
    })
  }
  if (seqs.length === 0) return checks

  const seen = new Set(seqs)
  const max = Math.max(...seqs)
  const min = Math.min(...seqs)

  if (min !== 1) {
    add({
      code: 'events.does-not-start-at-one',
      severity: 'warning',
      message: `The event log starts at sequence ${min}, not 1. Events from the start of the visit may be missing.`,
      detail: { min },
    })
  }

  const missing: number[] = []
  for (let i = 1; i <= max; i++) if (!seen.has(i)) missing.push(i)
  if (missing.length > 0) {
    const shown = missing.slice(0, 20)
    add({
      code: 'events.sequence-gap',
      severity: 'warning',
      message:
        `The event log is missing sequence number${missing.length === 1 ? '' : 's'} ` +
        `${shown.join(', ')}${missing.length > shown.length ? `, and ${missing.length - shown.length} more` : ''}. ` +
        `The audit trail for this visit is incomplete.`,
      detail: { missing },
    })
  }

  if (seen.size !== seqs.length) {
    const counts = new Map<number, number>()
    for (const s of seqs) counts.set(s, (counts.get(s) ?? 0) + 1)
    const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([s]) => s)
    add({
      code: 'events.duplicate-seq',
      severity: 'warning',
      message: `Sequence number${dupes.length === 1 ? '' : 's'} ${dupes.join(', ')} appear more than once in the event log.`,
      detail: { dupes },
    })
  }

  return checks
}

/**
 * resolutions[] is a projection of the log: resolves minus reopens.
 *
 * A difference is reported with BOTH numbers rather than judged. There are
 * legitimate reasons the two can drift, and the operator is better placed than
 * the builder to know which one applies.
 */
export function checkResolutionReconciliation(c: CanonicalImport): Check[] {
  const { checks, add } = makeReport()
  const resolved = c.events.filter((e) => e.type === 'ItemResolved').length
  const reopened = c.events.filter((e) => e.type === 'ItemReopened').length
  const net = resolved - reopened
  const actual = c.resolutions.length

  if (net !== actual) {
    add({
      code: 'resolutions.reconciliation',
      severity: 'warning',
      message:
        `The event log records ${resolved} items resolved and ${reopened} reopened, which should leave ${net} ` +
        `standing, but resolutions[] lists ${actual}. Both numbers are stored — this is a difference to ` +
        `understand, not necessarily an error.`,
      detail: { itemResolved: resolved, itemReopened: reopened, net, resolutionsLength: actual },
    })
  }
  return checks
}

/**
 * Pin numbers are a SESSION-SCOPED DISPLAY LABEL, not a join key.
 *
 * The counter lives on the session row and restarts at 1 every visit, so pin 1
 * next visit being a different pin is correct behaviour. There is deliberately
 * NO cross-visit number comparison here — an earlier version of this file had
 * one, and it reported normal behaviour as an anomaly. Cross-visit identity is
 * the uuid; see checkPinIdentityAcrossVisits.
 *
 * What remains is uniqueness within a single import, which is a real constraint:
 * two pins sharing a number in one visit makes the label ambiguous on the canvas.
 */
export function checkPinNumbers(c: CanonicalImport): Check[] {
  const { checks, add } = makeReport()

  const byNumber = new Map<number, string[]>()
  for (const p of c.pins) {
    if (p.number === null) {
      add({
        code: 'pins.no-number',
        severity: 'warning',
        message:
          `Pin ${p.pinId} carries no number. The number is how a person refers to it on the canvas and in ` +
          `notes, so this pin has no human-facing label for this visit.`,
        detail: { pinId: p.pinId },
      })
      continue
    }
    byNumber.set(p.number, [...(byNumber.get(p.number) ?? []), p.pinId ?? '(no id)'])
  }

  for (const [number, ids] of byNumber) {
    if (ids.length > 1) {
      add({
        code: 'pins.duplicate-number',
        severity: 'warning',
        message:
          `Pin number ${number} is used by ${ids.length} different pins in this export (${ids.join(', ')}). ` +
          `Numbers must be unique within a visit or the label is ambiguous.`,
        detail: { number, pinIds: ids },
      })
    }
  }

  return checks
}

/**
 * The uuid is the identity that carries across visits — so the same uuid
 * describing a materially different thing on a later visit is one identity
 * covering two objects, and the year-over-year record for it is now wrong.
 *
 * This is the check the deleted pin-number comparison was reaching for, aimed at
 * the thing that actually is stable.
 *
 * A retyped pin is not automatically an error — a typeless pin later given a
 * type is ordinary progress, so gaining a value where there was none is ignored.
 * What is flagged is a value CHANGING to a different value.
 */
export function checkPinIdentityAcrossVisits(db: Db, propertyId: string, c: CanonicalImport): Check[] {
  const { checks, add } = makeReport()

  const prior = db
    .prepare(
      `SELECT p.pin_id, p.number, p.type_kind, p.component_type, p.freeform_label, p.nickname,
              p.zone_id, z.label AS zone_label, v.kind AS visit_kind, sm.started_at
       FROM pins p
       JOIN visits v ON v.id = p.visit_id
       LEFT JOIN zones z ON z.zone_id = p.zone_id AND z.import_id = p.import_id
       -- The WALK, not the planned date. This sentence names a day to somebody
       -- who will go and check it, and visits.planned_date is hand-typed and
       -- unchecked — it can name a day nobody was in the house. Joined on the
       -- pin's own import rather than on the visit, because the import IS the
       -- walk on which this pin was last recorded.
       LEFT JOIN session_meta sm ON sm.import_id = p.import_id
       WHERE p.property_id = ?
       ORDER BY p.created_at DESC`,
    )
    .all(propertyId) as {
    pin_id: string
    number: number | null
    type_kind: string | null
    component_type: string | null
    freeform_label: string | null
    nickname: string | null
    zone_id: string | null
    zone_label: string | null
    visit_kind: string
    started_at: string | null
  }[]

  if (prior.length === 0) return checks

  // Most recent record wins as the comparison point.
  const priorById = new Map<string, (typeof prior)[number]>()
  for (const p of prior) if (!priorById.has(p.pin_id)) priorById.set(p.pin_id, p)

  const zoneLabelById = new Map(c.zones.map((z) => [z.zoneId, z.label]))

  for (const p of c.pins) {
    if (p.pinId === null) continue
    const was = priorById.get(p.pinId)
    if (!was) continue

    const changes: string[] = []

    // Gaining a type where there was none is progress, not a contradiction.
    const changed = (before: string | null, after: string | null) =>
      before !== null && after !== null && before !== after

    if (changed(was.component_type, p.componentType)) {
      changes.push(`its component type was "${was.component_type}" and is now "${p.componentType}"`)
    }
    if (changed(was.freeform_label, p.freeformLabel)) {
      changes.push(`its label was "${was.freeform_label}" and is now "${p.freeformLabel}"`)
    }
    if (changed(was.nickname, p.nickname)) {
      changes.push(`its nickname was "${was.nickname}" and is now "${p.nickname}"`)
    }
    if (changed(was.type_kind, p.typeKind)) {
      changes.push(`it was a ${was.type_kind} pin and is now a ${p.typeKind} pin`)
    }

    const nowZoneLabel = zoneLabelById.get(p.zoneId) ?? null
    if (changed(was.zone_id, p.zoneId)) {
      const from = was.zone_label ?? was.zone_id
      const to = nowZoneLabel ?? p.zoneId
      changes.push(`it was in "${from}" and is now in "${to}"`)
    }

    if (changes.length > 0) {
      add({
        code: 'pins.identity-changed',
        severity: 'warning',
        message:
          `The same pin (${p.pinId}, shown as ${p.number ?? 'no number'} this visit) describes something ` +
          `different than it did on this property's ${was.visit_kind} visit` +
          // No date rather than the planned one, where the manifest carries no
          // session start. An unnamed visit sends somebody looking; a wrong date
          // sends them to the wrong day and looks authoritative doing it.
          `${was.started_at ? ` of ${was.started_at.slice(0, 10)}` : ''}: ${changes.join('; ')}. ` +
          `The uuid is what ties a thing to itself across years, so if these are genuinely two different ` +
          `things, the history recorded under this id now covers both.`,
        detail: { pinId: p.pinId, changes },
      })
    }
  }

  return checks
}

/**
 * Captures should have happened during the visit.
 *
 * A photo timestamped before the session started was taken somewhere else and
 * brought in — from a camera roll, a previous visit, or a device with a wrong
 * clock. None of those is forbidden, but all of them change what the photo is
 * evidence OF, and a binder that presents last year's photo as this visit's
 * observation is exactly the overclaim this software exists to prevent.
 *
 * A small tolerance absorbs clock rounding without hiding anything real, and the
 * message says how far outside the window each one falls so the operator can
 * judge triviality themselves.
 */
const CLOCK_TOLERANCE_MS = 60_000

export function checkCaptureWindow(c: CanonicalImport): Check[] {
  const { checks, add } = makeReport()

  const started = c.session.startedAt ? Date.parse(c.session.startedAt) : NaN
  const ended = c.session.exportedAt
    ? Date.parse(c.session.exportedAt)
    : c.session.completedAt
      ? Date.parse(c.session.completedAt)
      : NaN

  if (Number.isNaN(started) && Number.isNaN(ended)) {
    add({
      code: 'capture.no-session-window',
      severity: 'warning',
      message:
        'The export declares neither a start nor an end time, so capture timestamps cannot be checked against ' +
        'the visit. Nothing is wrong with the files — this simply could not be verified.',
    })
    return checks
  }

  const describe = (ms: number): string => {
    const mins = Math.round(ms / 60_000)
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`
    const hours = Math.round(mins / 60)
    if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`
    return `${Math.round(hours / 24)} days`
  }

  const before: { mediaId: string | null; at: string; by: number }[] = []
  const after: { mediaId: string | null; at: string; by: number }[] = []
  let unparseable = 0

  for (const x of c.media) {
    if (x.capturedAt === null) continue
    const at = Date.parse(x.capturedAt)
    if (Number.isNaN(at)) {
      unparseable++
      continue
    }
    if (!Number.isNaN(started) && at < started - CLOCK_TOLERANCE_MS) {
      before.push({ mediaId: x.mediaId, at: x.capturedAt, by: started - at })
    } else if (!Number.isNaN(ended) && at > ended + CLOCK_TOLERANCE_MS) {
      after.push({ mediaId: x.mediaId, at: x.capturedAt, by: at - ended })
    }
  }

  if (before.length > 0) {
    const worst = before.reduce((a, b) => (b.by > a.by ? b : a))
    add({
      code: 'capture.before-session',
      severity: 'warning',
      message:
        `${before.length} file${before.length === 1 ? ' was' : 's were'} captured before this visit started — ` +
        `the earliest by ${describe(worst.by)} (${worst.at}, media ${worst.mediaId}). A file from outside the ` +
        `visit is evidence of something else, so it should not be presented as this visit's observation.`,
      detail: { count: before.length, sessionStartedAt: c.session.startedAt, examples: before.slice(0, 5) },
    })
  }

  if (after.length > 0) {
    const worst = after.reduce((a, b) => (b.by > a.by ? b : a))
    add({
      code: 'capture.after-session',
      severity: 'warning',
      message:
        `${after.length} file${after.length === 1 ? ' was' : 's were'} captured after this visit ended — ` +
        `the latest by ${describe(worst.by)} (${worst.at}, media ${worst.mediaId}). That should not be ` +
        `possible, so either the export window or the device clock is wrong.`,
      detail: { count: after.length, sessionEndedAt: c.session.exportedAt ?? c.session.completedAt, examples: after.slice(0, 5) },
    })
  }

  if (unparseable > 0) {
    add({
      code: 'capture.unparseable-timestamp',
      severity: 'warning',
      message: `${unparseable} file${unparseable === 1 ? ' carries' : 's carry'} a capture timestamp that cannot be read as a date.`,
      detail: { count: unparseable },
    })
  }

  return checks
}

/** A config change between visits is worth knowing about. It is never an error. */
export function checkConfigHash(db: Db, propertyId: string, c: CanonicalImport): Check[] {
  const { checks, add } = makeReport()
  const hash = c.config.hash
  if (!hash) {
    add({
      code: 'config.no-hash',
      severity: 'warning',
      message: 'The export declares no config hash, so this visit cannot be tied to a known checklist version.',
    })
    return checks
  }

  const prior = db
    .prepare(
      `SELECT DISTINCT config_hash, config_id, config_version FROM imports
       WHERE property_id = ? AND config_hash IS NOT NULL AND config_hash != ?`,
    )
    .all(propertyId, hash) as { config_hash: string; config_id: string; config_version: string }[]

  if (prior.length > 0) {
    const p = prior[0]!
    add({
      code: 'config.changed-since-last-visit',
      severity: 'info',
      message:
        `This visit used checklist ${c.config.id} v${c.config.version}; an earlier visit to this ` +
        `property used ${p.config_id} v${p.config_version}. The checklist has changed between visits, so ` +
        `item-by-item comparison across them needs care.`,
      detail: { thisHash: hash, priorHashes: prior.map((x) => x.config_hash) },
    })
  }

  return checks
}
