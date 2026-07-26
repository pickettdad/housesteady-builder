import type { Db } from '../db/index.js'
import type { Manifest } from './manifest.js'
import { makeReport, type Check } from './validate.js'

/**
 * Cross-reference, bounds, and sequence checks.
 *
 * Every one of these is a WARNING, never a refusal. A dangling reference means
 * the export knows about something we cannot see — that is worth shouting about
 * and worth importing anyway, because refusing loses the 99% that is fine along
 * with the 1% that is broken.
 *
 * Each message names BOTH ends of the problem. "3 dangling references" tells an
 * operator nothing they can act on; "pin 7 points at media 019f… which is not in
 * media[]" tells them exactly what to ask the field team.
 */

/** Describes one reference class so the check reads the same way for all of them. */
interface RefCheck {
  code: string
  /** Each dangling reference, already described in words. */
  dangling: string[]
}

export function checkReferentialIntegrity(m: Manifest): Check[] {
  const { checks, add } = makeReport()

  const zoneIds = new Set((m.zones ?? []).map((z) => z.zoneId))
  const pinIds = new Set((m.pins ?? []).map((p) => p.pinId))
  const mediaIds = new Set((m.media ?? []).map((x) => x.mediaId))
  const noteIds = new Set((m.notes ?? []).map((n) => n.noteId))
  const threadIds = new Set((m.chats ?? []).map((t) => t.threadId))
  const canvasIds = new Set((m.zones ?? []).flatMap((z) => (z.canvases ?? []).map((c) => c.canvasId)))

  const pinName = (p: { pinId?: string; number?: number }) =>
    p.number !== undefined ? `pin ${p.number}` : `pin ${p.pinId}`

  const results: RefCheck[] = []

  // -------------------------------------------------------------- from pins
  const pinToZone: string[] = []
  const pinToMedia: string[] = []
  const pinToNote: string[] = []
  const pinToChat: string[] = []
  const anchorToCanvas: string[] = []
  for (const p of m.pins ?? []) {
    if (p.zoneId !== undefined && p.zoneId !== null && !zoneIds.has(p.zoneId)) {
      pinToZone.push(`${pinName(p)} sits in zone ${p.zoneId}, which is not in zones[]`)
    }
    for (const id of p.mediaIds ?? []) {
      if (!mediaIds.has(id)) pinToMedia.push(`${pinName(p)} points at media ${id}, which is not in media[]`)
    }
    for (const id of p.noteIds ?? []) {
      if (!noteIds.has(id)) pinToNote.push(`${pinName(p)} points at note ${id}, which is not in notes[]`)
    }
    for (const id of p.chatThreadIds ?? []) {
      if (!threadIds.has(id)) pinToChat.push(`${pinName(p)} points at chat thread ${id}, which is not in chats[]`)
    }
    for (const a of p.anchors ?? []) {
      if (a.canvasId !== undefined && !canvasIds.has(a.canvasId)) {
        anchorToCanvas.push(`${pinName(p)} is anchored to canvas ${a.canvasId}, which no zone declares`)
      }
    }
  }
  results.push(
    { code: 'integrity.pin-zone', dangling: pinToZone },
    { code: 'integrity.pin-media', dangling: pinToMedia },
    { code: 'integrity.pin-note', dangling: pinToNote },
    { code: 'integrity.pin-chat', dangling: pinToChat },
    { code: 'integrity.anchor-canvas', dangling: anchorToCanvas },
  )

  // ------------------------------------------------------------ from zones
  const canvasToMedia: string[] = []
  for (const z of m.zones ?? []) {
    for (const c of z.canvases ?? []) {
      if (c.mediaId !== undefined && !mediaIds.has(c.mediaId)) {
        canvasToMedia.push(`canvas ${c.canvasId} in "${z.label ?? z.zoneId}" uses media ${c.mediaId}, which is not in media[]`)
      }
    }
  }
  results.push({ code: 'integrity.canvas-media', dangling: canvasToMedia })

  // ------------------------------------------------------------ from media
  const mediaOwner: string[] = []
  for (const x of m.media ?? []) {
    const o = x.owner
    if (!o) continue
    if (o.kind === 'zone' && o.zoneId !== undefined && !zoneIds.has(o.zoneId)) {
      mediaOwner.push(`media ${x.mediaId} belongs to zone ${o.zoneId}, which is not in zones[]`)
    }
    if (o.kind === 'pin' && o.pinId !== undefined && !pinIds.has(o.pinId)) {
      mediaOwner.push(`media ${x.mediaId} belongs to pin ${o.pinNumber ?? o.pinId}, which is not in pins[]`)
    }
    if (o.kind === 'canvas' && o.canvasId !== undefined && !canvasIds.has(o.canvasId)) {
      mediaOwner.push(`media ${x.mediaId} belongs to canvas ${o.canvasId}, which no zone declares`)
    }
  }
  results.push({ code: 'integrity.media-owner', dangling: mediaOwner })

  // ------------------------------------------- from notes, chats, inbox, resolutions
  const noteTarget: string[] = []
  for (const n of m.notes ?? []) {
    const t = n.target
    if (!t?.id) continue
    const known = t.kind === 'pin' ? pinIds.has(t.id) : t.kind === 'zone' ? zoneIds.has(t.id) : true
    if (!known) noteTarget.push(`note ${n.noteId} is attached to ${t.kind} ${t.id}, which does not exist`)
  }
  const chatTarget: string[] = []
  for (const t of m.chats ?? []) {
    const tg = t.target
    if (!tg?.id) continue
    const known = tg.kind === 'pin' ? pinIds.has(tg.id) : tg.kind === 'zone' ? zoneIds.has(tg.id) : true
    if (!known) chatTarget.push(`chat thread ${t.threadId} is attached to ${tg.kind} ${tg.id}, which does not exist`)
  }
  const chatMedia: string[] = []
  for (const t of m.chats ?? []) {
    for (const msg of t.messages ?? []) {
      for (const id of msg.mediaIds ?? []) {
        if (!mediaIds.has(id)) chatMedia.push(`a message in thread ${t.threadId} cites media ${id}, which is not in media[]`)
      }
    }
  }
  const inboxRefs: string[] = []
  for (const id of m.inbox?.mediaIds ?? []) {
    if (!mediaIds.has(id)) inboxRefs.push(`the inbox holds media ${id}, which is not in media[]`)
  }
  for (const id of m.inbox?.noteIds ?? []) {
    if (!noteIds.has(id)) inboxRefs.push(`the inbox holds note ${id}, which is not in notes[]`)
  }
  const resolutionRefs: string[] = []
  for (const r of m.resolutions ?? []) {
    if (r.scope?.kind === 'zone' && r.scope.zoneId && !zoneIds.has(r.scope.zoneId)) {
      resolutionRefs.push(`"${r.itemId}" is resolved against zone ${r.scope.zoneId}, which is not in zones[]`)
    }
    if (r.scope?.kind === 'pin' && r.scope.pinId && !pinIds.has(r.scope.pinId)) {
      resolutionRefs.push(`"${r.itemId}" is resolved against pin ${r.scope.pinId}, which is not in pins[]`)
    }
    const evidencePin = r.resolution?.evidence?.pinId
    if (typeof evidencePin === 'string' && !pinIds.has(evidencePin)) {
      resolutionRefs.push(`"${r.itemId}" cites pin ${evidencePin} as its evidence, which is not in pins[]`)
    }
  }
  results.push(
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
export function checkAnchorBounds(m: Manifest): Check[] {
  const { checks, add } = makeReport()
  for (const p of m.pins ?? []) {
    for (const a of p.anchors ?? []) {
      const bad: string[] = []
      if (typeof a.x !== 'number' || a.x < 0 || a.x > 1) bad.push(`x = ${a.x}`)
      if (typeof a.y !== 'number' || a.y < 0 || a.y > 1) bad.push(`y = ${a.y}`)
      if (bad.length > 0) {
        add({
          code: 'anchor.out-of-bounds',
          severity: 'warning',
          message:
            `Pin ${p.number ?? p.pinId} is anchored at ${bad.join(', ')}, outside the 0–1 range a canvas ` +
            `position must fall in. Stored as given — it will place off the edge of the image.`,
          detail: { pinNumber: p.number, anchorId: a.anchorId, x: a.x, y: a.y },
        })
      }
    }
  }
  return checks
}

/** The event log should run 1..n with nothing missing. A gap means events were lost. */
export function checkEventSequence(m: Manifest): Check[] {
  const { checks, add } = makeReport()
  const events = m.events ?? []
  if (events.length === 0) return checks

  const seqs = events.map((e) => e.seq).filter((s): s is number => typeof s === 'number')
  if (seqs.length !== events.length) {
    add({
      code: 'events.missing-seq',
      severity: 'warning',
      message: `${events.length - seqs.length} of ${events.length} events carry no sequence number.`,
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
export function checkResolutionReconciliation(m: Manifest): Check[] {
  const { checks, add } = makeReport()
  const events = m.events ?? []
  const resolved = events.filter((e) => e.type === 'ItemResolved').length
  const reopened = events.filter((e) => e.type === 'ItemReopened').length
  const net = resolved - reopened
  const actual = (m.resolutions ?? []).length

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
 * Pin numbers are the cross-visit join key. They must be unique inside an import,
 * and a number must mean the same physical thing every visit — otherwise the
 * longitudinal record silently describes two different objects as one.
 */
export function checkPinNumbers(db: Db, propertyId: string, m: Manifest): Check[] {
  const { checks, add } = makeReport()
  const pins = m.pins ?? []

  const byNumber = new Map<number, string[]>()
  for (const p of pins) {
    if (typeof p.number !== 'number') {
      add({
        code: 'pins.no-number',
        severity: 'warning',
        message: `Pin ${p.pinId} carries no number. Pin number is the key that ties a thing to itself across visits, so this pin cannot be followed year to year.`,
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
          `Pin numbers must be unique within a visit — the cross-visit join for this number is now ambiguous.`,
        detail: { number, pinIds: ids },
      })
    }
  }

  // Against prior visits on this property.
  const priorPins = db
    .prepare(
      `SELECT p.number, p.pin_id, v.id AS visit_id, v.kind, v.visit_date
       FROM pins p JOIN visits v ON v.id = p.visit_id
       WHERE p.property_id = ?`,
    )
    .all(propertyId) as { number: number; pin_id: string; visit_id: string; kind: string; visit_date: string | null }[]

  const priorByNumber = new Map<number, { pin_id: string; kind: string; visit_date: string | null }>()
  for (const p of priorPins) if (!priorByNumber.has(p.number)) priorByNumber.set(p.number, p)

  for (const p of pins) {
    if (typeof p.number !== 'number' || !p.pinId) continue
    const prior = priorByNumber.get(p.number)
    if (prior && prior.pin_id !== p.pinId) {
      add({
        code: 'pins.cross-visit-collision',
        severity: 'warning',
        message:
          `Pin ${p.number} in this export (${p.pinId}) is a different pin from the one that carried number ` +
          `${p.number} on this property's ${prior.kind} visit${prior.visit_date ? ` of ${prior.visit_date}` : ''} ` +
          `(${prior.pin_id}). Pin number is what identifies the same thing across years — if these are genuinely ` +
          `two different objects, the history for number ${p.number} is now describing both.`,
        detail: { number: p.number, thisPinId: p.pinId, priorPinId: prior.pin_id },
      })
    }
  }

  return checks
}

/** A config change between visits is worth knowing about. It is never an error. */
export function checkConfigHash(db: Db, propertyId: string, m: Manifest): Check[] {
  const { checks, add } = makeReport()
  const hash = m.config?.hash
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
        `This visit used checklist ${m.config?.configId} v${m.config?.version}; an earlier visit to this ` +
        `property used ${p.config_id} v${p.config_version}. The checklist has changed between visits, so ` +
        `item-by-item comparison across them needs care.`,
      detail: { thisHash: hash, priorHashes: prior.map((x) => x.config_hash) },
    })
  }

  return checks
}
