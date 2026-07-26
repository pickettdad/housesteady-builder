import { allComponentTypes, allItemDefs, type ConfigSnapshot, type Manifest } from './manifest.js'
import { makeReport, type Check } from './validate.js'

/**
 * Fail open on vocabulary.
 *
 * The field app is still adding words. config v1.3 brings a `choice` satisfy
 * type and a new resolution kind; `video` media is coming; `voice` may be
 * renamed `audio`. None of that may fail an import.
 *
 * So: every vocabulary value is checked against what the import's OWN config
 * declares plus a small set the builder knows by name. Anything unfamiliar is
 * imported exactly as it arrived, flagged `is_recognized = 0`, counted, and
 * listed on the report. "Unrecognized" means "the builder has not met this
 * word", never "this is wrong".
 */

/**
 * Words the builder knows without being told. Deliberately short — anything the
 * config can declare is read from the config instead, so this list does not go
 * stale every time the checklist grows.
 */
const KNOWN = {
  resolutionKind: ['satisfied', 'na'],
  resolutionVia: ['check', 'pin', 'photo', 'note', 'measure'],
  resolutionResult: ['pass', 'fail'],
  scopeKind: ['zone', 'pin', 'session'],
  pinTypeKind: ['component', 'freeform'],
  mediaKind: ['photo', 'voice', 'video'],
  mediaOwnerKind: ['zone', 'pin', 'canvas', 'inbox'],
  targetKind: ['zone', 'pin', 'session'],
  chatRole: ['user', 'assistant'],
  eventType: [
    'SessionInitialized', 'SessionCompleted', 'SessionReopened',
    'ZoneCreated', 'ZoneClosed', 'ZoneReopened',
    'CanvasAdded', 'CanvasRetired',
    'PinCreated', 'PinTyped', 'PinFlagged', 'PinRetired',
    'AnchorPlaced', 'AnchorRemoved',
    'PhotoAdded', 'MediaReassigned', 'MediaDiscarded',
    'NoteAdded', 'ChatMessageSent', 'ChatReplyRecorded',
    'ItemResolved', 'ItemReopened',
  ],
} as const

export interface UnrecognizedTerm {
  field: string
  value: string
  count: number
  /** Enough to go and look at it — pin numbers, item ids, media ids. */
  examples: string[]
}

export interface VocabularyResult {
  checks: Check[]
  terms: UnrecognizedTerm[]
  /** Indexes into resolutions[] carrying at least one unfamiliar word. */
  unrecognizedResolutions: Set<number>
  /** Indexes into events[] whose type is unfamiliar. */
  unrecognizedEvents: Set<number>
}

class Collector {
  private map = new Map<string, UnrecognizedTerm>()

  note(field: string, value: unknown, example: string): void {
    if (value === undefined || value === null || value === '') return
    const v = String(value)
    const key = `${field}\u0000${v}`
    const existing = this.map.get(key)
    if (existing) {
      existing.count++
      if (existing.examples.length < 5) existing.examples.push(example)
    } else {
      this.map.set(key, { field, value: v, count: 1, examples: [example] })
    }
  }

  terms(): UnrecognizedTerm[] {
    return [...this.map.values()].sort((a, b) => b.count - a.count || a.field.localeCompare(b.field))
  }
}

const known = (set: readonly string[], value: unknown): boolean =>
  value === undefined || value === null || set.includes(String(value))

export function checkVocabulary(m: Manifest): VocabularyResult {
  const { checks, add } = makeReport()
  const collector = new Collector()
  const snapshot: ConfigSnapshot | undefined = m.config?.snapshot

  // What THIS import's config declares. Read per import — never a baked-in list.
  const configReasonIds = new Set((snapshot?.naReasons ?? []).map((r) => r.id))
  const configItemIds = new Set(allItemDefs(snapshot).map((i) => i.id))
  const configComponentTypes = new Set(allComponentTypes(snapshot))
  const configZoneTypes = new Set((snapshot?.zoneTypes ?? []).map((z) => z.id))
  // Pin flags are declared implicitly, by the layers that select on them.
  const configFlags = new Set(
    (snapshot?.layers ?? []).flatMap((l) => {
      const pred = (l as { predicate?: { flags?: string[] } }).predicate
      return pred?.flags ?? []
    }),
  )

  const unrecognizedResolutions = new Set<number>()
  const unrecognizedEvents = new Set<number>()

  // ------------------------------------------------------------- resolutions
  ;(m.resolutions ?? []).forEach((r, i) => {
    const body = r.resolution ?? {}
    const where = `${r.itemId ?? '(no item id)'} (${r.scope?.kind ?? 'no scope'})`
    let unfamiliar = false

    if (!known(KNOWN.resolutionKind, body.kind)) {
      collector.note('resolution.kind', body.kind, where)
      unfamiliar = true
    }
    if (!known(KNOWN.resolutionVia, body.via)) {
      collector.note('resolution.via', body.via, where)
      unfamiliar = true
    }
    if (!known(KNOWN.resolutionResult, body.result)) {
      collector.note('resolution.result', body.result, where)
      unfamiliar = true
    }
    if (!known(KNOWN.scopeKind, r.scope?.kind)) {
      collector.note('resolution.scope.kind', r.scope?.kind, where)
      unfamiliar = true
    }
    if (body.reasonId !== undefined && body.reasonId !== null && !configReasonIds.has(body.reasonId)) {
      // This one matters more than the rest: an na reason the config does not
      // declare has no feedsGapList / recordsFinding flags, so the item lands in
      // neither the gap list nor the findings. It would otherwise vanish.
      collector.note('resolution.reasonId', body.reasonId, where)
      unfamiliar = true
      add({
        code: 'vocabulary.undeclared-na-reason',
        severity: 'warning',
        message:
          `"${r.itemId}" is marked not-applicable for reason "${body.reasonId}", which this export's own config ` +
          `does not declare. Without the reason's flags the builder cannot tell whether it belongs in the gap ` +
          `list or the findings, so it is counted in neither. It is stored and listed here so it is not lost.`,
        detail: { itemId: r.itemId, reasonId: body.reasonId },
      })
    }
    if (r.itemId !== undefined && !configItemIds.has(r.itemId)) {
      collector.note('resolution.itemId', r.itemId, where)
      unfamiliar = true
    }

    if (unfamiliar) unrecognizedResolutions.add(i)
  })

  // -------------------------------------------------------------------- pins
  for (const p of m.pins ?? []) {
    const where = `pin ${p.number ?? p.pinId}`
    if (!known(KNOWN.pinTypeKind, p.type?.kind)) collector.note('pin.type.kind', p.type?.kind, where)
    if (p.type?.componentType && !configComponentTypes.has(p.type.componentType)) {
      collector.note('pin.type.componentType', p.type.componentType, where)
    }
    // Freeform labels are open by design — that is the telemetry, not a problem.
    if (p.flag !== undefined && p.flag !== null && !configFlags.has(p.flag)) {
      collector.note('pin.flag', p.flag, where)
    }
  }

  // ------------------------------------------------------------------ zones
  for (const z of m.zones ?? []) {
    if (z.type && !configZoneTypes.has(z.type)) {
      collector.note('zone.type', z.type, `"${z.label ?? z.zoneId}"`)
    }
  }

  // ------------------------------------------------------------------ media
  for (const x of m.media ?? []) {
    if (!known(KNOWN.mediaKind, x.kind)) collector.note('media.kind', x.kind, String(x.mediaId))
    if (!known(KNOWN.mediaOwnerKind, x.owner?.kind)) {
      collector.note('media.owner.kind', x.owner?.kind, String(x.mediaId))
    }
  }

  // ------------------------------------------------------- notes and chats
  for (const n of m.notes ?? []) {
    if (!known(KNOWN.targetKind, n.target?.kind)) collector.note('note.target.kind', n.target?.kind, String(n.noteId))
  }
  for (const t of m.chats ?? []) {
    if (!known(KNOWN.targetKind, t.target?.kind)) collector.note('chat.target.kind', t.target?.kind, String(t.threadId))
    for (const msg of t.messages ?? []) {
      if (!known(KNOWN.chatRole, msg.role)) collector.note('chat.message.role', msg.role, String(t.threadId))
    }
  }

  // ----------------------------------------------------------------- events
  ;(m.events ?? []).forEach((e, i) => {
    if (!known(KNOWN.eventType, e.type as string)) {
      collector.note('event.type', e.type, `seq ${e.seq ?? '?'}`)
      unrecognizedEvents.add(i)
    }
  })

  const terms = collector.terms()
  if (terms.length > 0) {
    const total = terms.reduce((n, t) => n + t.count, 0)
    add({
      code: 'vocabulary.unrecognized',
      severity: 'info',
      message:
        `${terms.length} word${terms.length === 1 ? '' : 's'} appeared that the builder has not met before, ` +
        `across ${total} record${total === 1 ? '' : 's'}. Everything is imported and stored exactly as it ` +
        `arrived — this is the field app moving ahead of the builder, which is expected.`,
      detail: { terms },
    })
  }

  return { checks, terms, unrecognizedResolutions, unrecognizedEvents }
}
