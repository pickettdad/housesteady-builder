import type { CanonicalImport } from './adapters/canonical.js'
import { makeReport, type Check } from './validate.js'

/**
 * Fail open on vocabulary.
 *
 * The field app is still adding words. config v1.3 brings a `choice` satisfy
 * type and a new resolution kind; `video` media is coming; `voice` may be
 * renamed `audio`; v4 brings concerns as a fifth media-owner kind. None of that
 * may fail an import.
 *
 * So: every vocabulary value is checked against what the import's OWN config
 * declares plus a small set the builder knows by name. Anything unfamiliar is
 * imported exactly as it arrived, flagged `is_recognized = 0`, counted, and
 * listed on the report. "Unrecognized" means "the builder has not met this
 * word", never "this is wrong".
 *
 * The test for fail-open is not that unknown words are tolerated — it is that
 * they are tolerated AND surfaced. A silently swallowed word is the same failure
 * as a crash, just slower.
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
  /**
   * ⚑ Which door the concierge chose — `capture_intent`. Field PR #86 shipped
   * `room-shot` and `run-trace`; `pan` was retired in favour of `traverse`, and
   * Field 6 adds `floorplan` and `mesh`.
   *
   * **This vocabulary was checked NOWHERE, which is exactly how `floorplan` and
   * `mesh` arrived silently.** Measured, not argued: an intent planted in a real
   * export appears in no part of the validation report.
   */
  mediaIntent: ['room-shot', 'run-trace', 'traverse', 'floorplan', 'mesh'],
  /** A canvas is a frame a zone is oriented by. Photo-only today. */
  canvasKind: ['photo'],
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

/**
 * ⚑ **What each media kind the builder knows claims its bytes are — and this
 * exists because the `media.kind` vocabulary check above cannot currently fire.**
 *
 * *Capture-Kind Contract Note v1.1 §2.* The field does not assign `kind`; it
 * derives it from mime, **and the derivation has no fallthrough**:
 *
 * > `mime.startsWith("image") ? "photo" : mime.startsWith("video") ? "video" : "voice"`
 * > *field repo, `src/engine/export/manifestV3.ts:69–70`*
 *
 * ⛑ **So everything unrecognised collapses to `voice`, which is a word this
 * builder knows.** A floorplan at `application/json` arrives filed as a voice
 * note, counted in `totals.voiceNotes`, and the vocabulary check above says
 * nothing — because there is no unfamiliar word to say. *The producer defeats
 * the consumer's guard.*
 *
 * **This is the guard that does not depend on the producer.** The field computes
 * kind from mime one way; this asks whether the answer is consistent. The two
 * sides can disagree, which is the whole property the vocabulary check lost.
 *
 * ⚑ **A claim, never a mapping.** Each kind names the mime family it asserts —
 * nothing here says what a `geometry` capture ought to be. **A kind this builder
 * has not met claims nothing and is checked against nothing**, which is doctrine
 * 7 and is also what stops this going stale the day the field adds a word. The
 * fix for that case is the vocabulary check, which by then will work.
 *
 * *Quiet on real data: all 163 captures in `fixtures/walk-2026-07-31/` agree —
 * 157 `photo`/`image/jpeg`, 4 `video`/`video/quicktime`, 2 `voice`/`audio/mp4`.*
 */
const MIME_FAMILY: Record<string, string> = {
  photo: 'image/',
  video: 'video/',
  voice: 'audio/',
}

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
    // ⛑ The escape, never the byte. Both build the same key — but a literal NUL
    // in the source makes git and GitHub classify this whole file as binary, and
    // every change to it renders as `Bin 13215 -> 16560 bytes` instead of a diff.
    // There was one here for five increments and no reviewer could see past it.
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

/** Every item definition the config declares, wherever it declares them. */
function configItemIds(snapshot: Record<string, unknown>): Set<string> {
  const ids = new Set<string>()
  const collect = (items: unknown) => {
    if (!Array.isArray(items)) return
    for (const item of items) {
      const id = (item as { id?: unknown })?.id
      if (typeof id === 'string') ids.add(id)
    }
  }
  for (const key of ['baseLists', 'zoneLists', 'componentLists'] as const) {
    const lists = snapshot[key]
    if (Array.isArray(lists)) for (const list of lists) collect((list as { items?: unknown })?.items)
  }
  collect(snapshot.sessionItems)
  return ids
}

function configComponentTypes(snapshot: Record<string, unknown>): Set<string> {
  const types = new Set<string>()
  const lists = snapshot.componentLists
  if (Array.isArray(lists)) {
    for (const list of lists) {
      const t = (list as { types?: unknown })?.types
      if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') types.add(x)
    }
  }
  return types
}

const idsOf = (snapshot: Record<string, unknown>, key: string): Set<string> => {
  const out = new Set<string>()
  const list = snapshot[key]
  if (Array.isArray(list)) {
    for (const entry of list) {
      const id = (entry as { id?: unknown })?.id
      if (typeof id === 'string') out.add(id)
    }
  }
  return out
}

export function checkVocabulary(c: CanonicalImport): VocabularyResult {
  const { checks, add } = makeReport()
  const collector = new Collector()
  const snapshot = c.config.snapshot

  // What THIS import's config declares. Read per import — never a baked-in list.
  const reasonIds = idsOf(snapshot, 'naReasons')
  const itemIds = configItemIds(snapshot)
  const componentTypes = configComponentTypes(snapshot)
  const zoneTypes = idsOf(snapshot, 'zoneTypes')
  // ⚑ Declared by the config, so read from it. A flag gates an item or a whole
  // list, and one this build has never met changes a visit's scope silently.
  const propertyFlags = idsOf(snapshot, 'propertyFlags')
  // Pin flags are declared implicitly, by the layers that select on them.
  const flags = new Set(
    (Array.isArray(snapshot.layers) ? snapshot.layers : []).flatMap((l) => {
      const pred = (l as { predicate?: { flags?: string[] } })?.predicate
      return pred?.flags ?? []
    }),
  )

  const unrecognizedResolutions = new Set<number>()
  const unrecognizedEvents = new Set<number>()

  // ------------------------------------------------------------- resolutions
  c.resolutions.forEach((r, i) => {
    const where = `${r.itemId ?? '(no item id)'} (${r.scopeKind ?? 'no scope'})`
    let unfamiliar = false

    const flag = (field: string, value: unknown) => {
      collector.note(field, value, where)
      unfamiliar = true
    }

    if (!known(KNOWN.resolutionKind, r.kind)) flag('resolution.kind', r.kind)
    if (!known(KNOWN.resolutionVia, r.via)) flag('resolution.via', r.via)
    if (!known(KNOWN.resolutionResult, r.result)) flag('resolution.result', r.result)
    if (!known(KNOWN.scopeKind, r.scopeKind)) flag('resolution.scope.kind', r.scopeKind)

    if (r.reasonId !== null && !reasonIds.has(r.reasonId)) {
      // This one matters more than the rest: an na reason the config does not
      // declare has no feedsGapList / recordsFinding flags, so the item lands in
      // neither the gap list nor the findings. It would otherwise vanish.
      flag('resolution.reasonId', r.reasonId)
      add({
        code: 'vocabulary.undeclared-na-reason',
        severity: 'warning',
        message:
          `"${r.itemId}" is marked not-applicable for reason "${r.reasonId}", which this export's own config ` +
          `does not declare. Without the reason's flags the builder cannot tell whether it belongs in the gap ` +
          `list or the findings, so it is counted in neither. It is stored and listed here so it is not lost.`,
        detail: { itemId: r.itemId, reasonId: r.reasonId },
      })
    }

    if (r.itemId !== null && !itemIds.has(r.itemId)) flag('resolution.itemId', r.itemId)

    if (unfamiliar) unrecognizedResolutions.add(i)
  })

  // ------------------------------- item ids the zone audits refer to
  //
  // The zone summary lists outstanding items by id. Those come from the same
  // vocabulary as resolutions and are just as capable of drifting ahead of what
  // the config declares — an outstanding item the builder cannot name is one the
  // audit engine will not be able to explain later.
  const undeclaredAuditItems = new Map<string, string[]>()
  for (const z of c.zones) {
    for (const itemId of z.auditSummary?.coreUnresolved ?? []) {
      if (!itemIds.has(itemId)) {
        undeclaredAuditItems.set(itemId, [...(undeclaredAuditItems.get(itemId) ?? []), z.label ?? z.zoneId ?? '?'])
      }
    }
  }
  for (const [itemId, zones] of undeclaredAuditItems) {
    collector.note('zone.audit.coreUnresolved', itemId, zones.join(', '))
  }
  if (undeclaredAuditItems.size > 0) {
    add({
      code: 'vocabulary.undeclared-audit-item',
      severity: 'warning',
      message:
        `${undeclaredAuditItems.size} item${undeclaredAuditItems.size === 1 ? '' : 's'} listed as outstanding in a ` +
        `zone's audit summary ${undeclaredAuditItems.size === 1 ? 'is' : 'are'} not defined in this export's config ` +
        `snapshot (${[...undeclaredAuditItems.keys()].slice(0, 5).join(', ')}). The count is stored as given, but ` +
        `the builder cannot say what those items ask for.`,
      detail: { itemIds: [...undeclaredAuditItems.keys()] },
    })
  }

  // -------------------------------------------------------------------- pins
  for (const p of c.pins) {
    const where = `pin ${p.number ?? p.pinId}`
    if (!known(KNOWN.pinTypeKind, p.typeKind)) collector.note('pin.type.kind', p.typeKind, where)
    if (p.componentType !== null && !componentTypes.has(p.componentType)) {
      collector.note('pin.type.componentType', p.componentType, where)
    }
    // Freeform labels are open by design — that is the telemetry, not a problem.
    if (p.flag !== null && !flags.has(p.flag)) collector.note('pin.flag', p.flag, where)
  }

  // ------------------------------------------------------------------ zones
  for (const z of c.zones) {
    if (z.type !== null && !zoneTypes.has(z.type)) {
      collector.note('zone.type', z.type, `"${z.label ?? z.zoneId}"`)
    }
  }
  for (const v of c.canvases) {
    if (v.kind !== null && !known(KNOWN.canvasKind, v.kind)) {
      collector.note('canvas.kind', v.kind, String(v.canvasId))
    }
  }

  /**
   * ⚑ **Property flags, and this is the one nobody had named.**
   *
   * A flag gates an item or a whole list — `base:mechanical-base` is gated on
   * `has_mechanicals` — so **a flag this build has never met changes the scope of
   * a visit's checklist and said nothing.** Table A declares twenty at v1.12 and
   * the app asks nineteen; the twenty-first arrives silently.
   *
   * Checked against the import's OWN config, never a hardcoded list — the config
   * is where flags are declared, and a list here would go stale at every cut.
   */
  for (const f of c.session.flags) {
    if (!propertyFlags.has(f)) collector.note('session.propertyFlag', f, 'session')
  }

  // ------------------------------------------------------------------ media
  const kindMimeDisagreements: { mediaId: string; kind: string; mime: string; expected: string }[] = []
  for (const x of c.media) {
    if (!known(KNOWN.mediaKind, x.kind)) collector.note('media.kind', x.kind, String(x.mediaId))
    // ⚑ **The `media.kind` check above cannot fire on anything the field sends,
    // and this is the check that can.** See MIME_FAMILY.
    const family = x.kind === null ? undefined : MIME_FAMILY[x.kind]
    if (family !== undefined && typeof x.mime === 'string' && x.mime !== ''
        && !x.mime.toLowerCase().startsWith(family)) {
      kindMimeDisagreements.push({ mediaId: String(x.mediaId), kind: x.kind!, mime: x.mime, expected: family })
    }
    if (!known(KNOWN.mediaOwnerKind, x.ownerKind)) {
      collector.note('media.owner.kind', x.ownerKind, String(x.mediaId))
    }
    // ⚑ The gap that let `floorplan` and `mesh` in without a word being said.
    if (x.captureIntent !== null && x.captureIntent !== undefined
        && !known(KNOWN.mediaIntent, x.captureIntent)) {
      collector.note('media.intent', x.captureIntent, String(x.mediaId))
    }
  }

  if (kindMimeDisagreements.length > 0) {
    const n = kindMimeDisagreements.length
    const shown = kindMimeDisagreements.slice(0, 5)
      .map((d) => `${d.mediaId} is filed \`${d.kind}\` and carries \`${d.mime}\``)
    add({
      code: 'media.kind-mime-disagreement',
      severity: 'warning',
      message:
        `${n} capture${n === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} filed under a kind that does not match ` +
        `${n === 1 ? 'its' : 'their'} own declared mime type (${shown.join('; ')}` +
        `${n > 5 ? `, and ${n - 5} more` : ''}). Nothing is dropped and the kind is stored exactly as it ` +
        `arrived — but a capture that is not what it says it is has been filed by every count and every ` +
        `filter in this build as though it were. The likeliest cause is a capture the field app has no ` +
        `kind for yet: it derives kind from mime, and anything that is neither an image nor a video ` +
        `becomes a voice note.`,
      detail: { disagreements: kindMimeDisagreements },
    })
  }

  // ------------------------------------------------------- notes and chats
  for (const n of c.notes) {
    if (!known(KNOWN.targetKind, n.targetKind)) collector.note('note.target.kind', n.targetKind, String(n.noteId))
  }
  for (const t of c.chatThreads) {
    if (!known(KNOWN.targetKind, t.targetKind)) collector.note('chat.target.kind', t.targetKind, String(t.threadId))
    for (const msg of t.messages) {
      if (!known(KNOWN.chatRole, msg.role)) collector.note('chat.message.role', msg.role, String(t.threadId))
    }
  }

  // ----------------------------------------------------------------- events
  c.events.forEach((e, i) => {
    if (!known(KNOWN.eventType, e.type)) {
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
