/**
 * What an identification call would contain — worked out without making one.
 *
 * THE SPLIT THIS MODULE EXISTS TO ENFORCE (Amendment 1, Builder Claude's ruling).
 *
 * A zone's identification pass is two things wearing one name: deciding *what to
 * send* and *sending it*. Only the second needs a model, a key, or a network.
 * Built as one lump the whole pass is untestable until a real photograph reaches
 * a real API — and when the first run then looks wrong, nobody can say whether
 * it was the batching, the prompt, the parsing or the model.
 *
 * So assembly is a pure function of the media rows and the model's limits. It
 * runs in a container with no key, against placeholder images, and its output is
 * the thing a test can assert on. The call takes this as input and adds nothing
 * to the decision.
 *
 * DECLARE WHAT IS CONSUMED, NEVER WHAT IS SKIPPED.
 *
 * `CONSUMED_KINDS` names the kinds this pass reads. Everything else falls
 * through to the unconsumed report — including kinds nobody has met yet. The
 * inverse, a list of kinds to skip, goes stale the first time the field app ships
 * a new one and fails by silently feeding it to an image call. CLAUDE.md §5 and
 * Amendment §C both land here, and the direction of the list is the whole
 * content of the rule.
 *
 * On this walk that is not hypothetical: two of the busiest zones carry media
 * this pass cannot read. The mechanical room has a video among 58 photographs;
 * the kitchen a voice note among 38.
 *
 * THREE BUCKETS, BECAUSE THERE ARE THREE REASONS, AND THEY ARE NOT THE SAME FACT.
 *
 *   batched      a photograph, on disk, going to a call
 *   unconsumed   a kind this pass does not read — deliberate, not a problem
 *   unavailable  a photograph whose file is absent or failed its checksum
 *
 * Collapsing the last two would report a missing photograph as a design decision.
 * A video not being read is the pass working as specified; a photograph that
 * should be here and is not is a hole in the record. Same shape as gaps never
 * becoming findings.
 *
 * Every input row lands in exactly one bucket and the totals reconcile, which a
 * test asserts rather than trusts — doctrine 6 is only as good as the arithmetic
 * that proves nothing fell out.
 *
 * NO THRESHOLD IS CHOSEN HERE, AND THE ABSENCE IS DECLARED RATHER THAN INFERRED.
 *
 * Amendment §D leaves the batch threshold open: it wants real photographs and one
 * measured call. So the threshold is config. Unset, no split happens and the
 * record says *no threshold was in force* — which is a different fact from *the
 * threshold was not reached*, and the ninth time this repo has had to separate a
 * declared value from an absent one. A reader who cannot tell them apart cannot
 * tell a deliberate single call from an unconfigured one.
 *
 * A SPLIT IS RECORDED, NEVER SILENT (Amendment §D1).
 *
 * §3's accuracy claim is that the model sees a room rather than disconnected
 * frames. A zone split across calls no longer satisfies it, so the split travels
 * with the result: how many batches, and why. Same discipline as the active item
 * set reporting `{received, computed}` — a result produced under different
 * conditions must never be indistinguishable from one produced under the stated
 * ones.
 */

import type { ModelConfig } from '../ai/models.js'

/**
 * The kinds the identification pass reads.
 *
 * Photographs only, this increment. Amendment §C1 records voice notes as the
 * highest-value next addition and says why: a concierge saying "that's the
 * softener" is the concierge telling the desk what something is, which is better
 * identification evidence than any photograph. Adding it is a change to this
 * array plus the call shape — never a change to the direction of the test.
 */
export const CONSUMED_KINDS: readonly string[] = ['photo']

/**
 * What a photograph is doing in the call.
 *
 * Amendment 2 §A2. A canvas image is a wide shot of the room, and §3's whole
 * argument for batching by room is that the model sees a room rather than a
 * series of disconnected frames — the wide shot *is* that room, and it is the
 * single most useful frame for placing everything else. But it is not itself a
 * thing to identify: a floorplan sketch returning a proposed object called *a
 * drawing of a room* is the failure this distinction exists to avoid.
 */
export type MediaRole = 'subject' | 'context'

/** A media row as this module needs it. Deliberately narrow. */
export interface AssemblyMedia {
  mediaId: string
  /** Open vocabulary. Never switched on exhaustively. */
  kind: string | null
  mime: string | null
  bytes: number | null
  /** present | absent | failed_checksum — the import's own verdict. */
  fileStatus: string
  /** Relative path as exported. Null is itself a reason it cannot be sent. */
  file: string | null
  capturedAt: string | null
  role: MediaRole
  /**
   * How this photograph was captured — zone, pin, canvas, inbox, or a kind
   * nobody has met. **Evidence, never a filter** (Amendment 2 §A1): a concierge
   * who pinned something said *this specific thing matters*, which is a stronger
   * statement about a photograph than the absence of a pin. Filtering on it
   * would discard the best evidence in the set first.
   */
  ownerKind: string | null
  /** Set for pin-owned media, so the object it proposes can reference its pin. */
  ownerPinId: string | null
}

/** One call's worth of photographs. */
export interface Batch {
  /** 1-based, for display. Batch 1 of 1 is still batch 1. */
  index: number
  /** Photographs the pass is asked to identify things in. */
  subjects: AssemblyMedia[]
  /**
   * Wide shots of the room, sent for orientation and **repeated in every batch**.
   * A split batch needs the room shot most — without it, batch 2 of 3 loses
   * exactly the thing that makes batching by room better than batching by
   * photograph. The repetition is real cost and is counted, not hidden.
   */
  context: AssemblyMedia[]
  /** Declared bytes for everything in this batch, subjects and context alike. */
  declaredBytes: number
}

/** A media row this pass does not read, and the kind that decided it. */
export interface Unconsumed {
  mediaId: string
  kind: string | null
  mime: string | null
  bytes: number | null
}

/** A photograph that cannot be sent because its file is not usable. */
export interface Unavailable {
  mediaId: string
  /** The import's file_status, or `no-path` when the row carries no file at all. */
  reason: string
}

export interface SplitRecord {
  batchCount: number
  /** The configured maximum that forced it. */
  maxPerBatch: number
  /**
   * Plain words, carried to the run record and shown to a person. §3's claim is
   * about a whole room; this is the sentence that withdraws it.
   */
  note: string
}

export interface ZoneAssembly {
  zoneId: string
  zoneLabel: string | null
  /** Calls to make. Empty is a valid outcome and not an error. */
  batches: Batch[]
  /**
   * Distinct photographs to identify, counted once however many batches they
   * were spread across. `batches` cannot be summed for this — context repeats.
   */
  subjectCount: number
  /**
   * The room's wide shots, once. Present even when there is nothing to identify
   * and therefore no call, so a room photographed only from the doorway does not
   * lose its one frame between the media table and the record.
   */
  context: AssemblyMedia[]
  unconsumed: Unconsumed[]
  unavailable: Unavailable[]
  /**
   * Null when the zone went in one call. Non-null records that §3's
   * whole-room claim does not hold for this zone's result.
   */
  split: SplitRecord | null
  /**
   * False when no threshold is configured — distinct from a threshold that was
   * configured and not reached. Without this the record cannot tell a deliberate
   * single call from an unconfigured one.
   */
  thresholdInForce: boolean
  /** Every input row, for the reconciliation a test asserts on. */
  receivedCount: number
}

/** The zone's own identity, kept separate from its media. */
export interface AssemblyZone {
  zoneId: string
  label: string | null
}

export interface AssemblyOptions {
  /**
   * Maximum photographs in one call. Undefined means no threshold is configured
   * and no split happens — recorded as `thresholdInForce: false`, never as a
   * threshold of infinity.
   *
   * Amendment §D deliberately leaves the number open; this is the seam it lands
   * in when it is measured.
   */
  maxPhotosPerBatch?: number
}

const isConsumed = (kind: string | null): boolean =>
  kind !== null && CONSUMED_KINDS.includes(kind)

/**
 * Work out the calls for one zone.
 *
 * Pure. No database, no filesystem, no network — which is what makes the send
 * side testable everywhere the photographs are not.
 */
export function assembleZone(
  zone: AssemblyZone,
  media: AssemblyMedia[],
  options: AssemblyOptions = {},
): ZoneAssembly {
  const subjects: AssemblyMedia[] = []
  const context: AssemblyMedia[] = []
  const unconsumed: Unconsumed[] = []
  const unavailable: Unavailable[] = []

  for (const m of media) {
    if (!isConsumed(m.kind)) {
      // Includes kinds this build has never met. Preserved, displayed, counted.
      unconsumed.push({ mediaId: m.mediaId, kind: m.kind, mime: m.mime, bytes: m.bytes })
      continue
    }
    if (m.file === null) {
      unavailable.push({ mediaId: m.mediaId, reason: 'no-path' })
      continue
    }
    if (m.fileStatus !== 'present') {
      unavailable.push({ mediaId: m.mediaId, reason: m.fileStatus })
      continue
    }
    ;(m.role === 'context' ? context : subjects).push(m)
  }

  // Capture order. The concierge walked the room in an order and consecutive
  // frames are usually the same thing from two angles — shuffling that throws
  // away context the model would otherwise get for free. Rows without a
  // timestamp keep their incoming position rather than sorting to one end.
  const ordered = stableByCapturedAt(subjects)
  const orderedContext = stableByCapturedAt(context)

  const max = options.maxPhotosPerBatch
  const thresholdInForce = max !== undefined && max > 0

  // The threshold counts subjects. Context is overhead carried into every batch,
  // so counting it would let a room with two wide shots split earlier than an
  // identical room with one — a storage decision changing what the model sees.
  const batches: Batch[] = []
  if (ordered.length > 0) {
    const size = thresholdInForce ? max : ordered.length
    for (let i = 0; i < ordered.length; i += size) {
      const slice = ordered.slice(i, i + size)
      batches.push({
        index: batches.length + 1,
        subjects: slice,
        context: orderedContext,
        declaredBytes: [...slice, ...orderedContext].reduce((t, m) => t + (m.bytes ?? 0), 0),
      })
    }
  } else if (orderedContext.length > 0) {
    // A room with only a wide shot and nothing else. There is nothing to
    // identify, so there is no call — but the context is not lost, it is simply
    // not a subject. Recorded rather than silently discarded.
    batches.length = 0
  }

  const split: SplitRecord | null =
    batches.length > 1 && thresholdInForce
      ? {
          batchCount: batches.length,
          maxPerBatch: max,
          note:
            `${ordered.length} photographs exceeded the configured maximum of ${max}, ` +
            `so this zone was read in ${batches.length} calls rather than one. ` +
            `No single call saw the whole room.` +
            (orderedContext.length > 0
              ? ` The ${orderedContext.length} room shot${orderedContext.length === 1 ? '' : 's'} ` +
                `went into each call, so ${orderedContext.length * batches.length} context sends ` +
                `were made for ${orderedContext.length} file${orderedContext.length === 1 ? '' : 's'}.`
              : ''),
        }
      : null

  return {
    zoneId: zone.zoneId,
    zoneLabel: zone.label,
    batches,
    subjectCount: ordered.length,
    context: orderedContext,
    unconsumed,
    unavailable,
    split,
    thresholdInForce,
    receivedCount: media.length,
  }
}

/**
 * Sort by capture time, keeping the incoming order for anything undated and for
 * ties. `Array.prototype.sort` is stable in every engine this runs on, so the
 * only care needed is that a null timestamp never compares as earlier or later
 * than a real one — it must simply not move.
 */
function stableByCapturedAt(media: AssemblyMedia[]): AssemblyMedia[] {
  const dated = media.filter((m) => m.capturedAt !== null)
  if (dated.length === 0) return [...media]

  // Positions of the dated rows, so undated rows keep the slots they arrived in.
  const slots: number[] = []
  media.forEach((m, i) => {
    if (m.capturedAt !== null) slots.push(i)
  })
  const sorted = [...dated].sort((a, b) => (a.capturedAt! < b.capturedAt! ? -1 : a.capturedAt! > b.capturedAt! ? 1 : 0))

  const out = [...media]
  slots.forEach((slot, i) => {
    const m = sorted[i]
    if (m !== undefined) out[slot] = m
  })
  return out
}

/**
 * Every input row is in exactly one bucket.
 *
 * Exported so it is callable from a test and from the run record rather than
 * being a comment somebody has to trust. Doctrine 6 is arithmetic here, not
 * intent.
 */
export function reconciles(a: ZoneAssembly): boolean {
  // Counted from the distinct sets rather than from batch membership, because
  // context appears in every batch — summing batches would over-count a room's
  // wide shot once per split and quietly turn a correct assembly into a failure.
  const placed = a.subjectCount + a.context.length + a.unconsumed.length + a.unavailable.length
  return placed === a.receivedCount
}

/**
 * A plain-words summary of what this pass will not read in this zone.
 *
 * Grouped by kind and counted. This is the sentence Amendment §C1 expects to
 * make the case for transcription with real numbers rather than an argument, so
 * it names kinds explicitly instead of saying "4 other files".
 */
export function unconsumedNote(a: ZoneAssembly): string | null {
  if (a.unconsumed.length === 0) return null
  const byKind = new Map<string, number>()
  for (const u of a.unconsumed) {
    const k = u.kind ?? 'untyped'
    byKind.set(k, (byKind.get(k) ?? 0) + 1)
  }
  const parts = [...byKind.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
  const list = parts.map(([k, n]) => `${n} ${k}`).join(', ')
  return `${a.unconsumed.length} file${a.unconsumed.length === 1 ? '' : 's'} not sent to identification: ${list}.`
}

/**
 * The model's image limit, applied to a known source size.
 *
 * The pixels sent decide what a vision call costs, and this is the only place
 * that arithmetic lives. It takes the model's own `maxImageEdge` rather than a
 * constant, because that is config for exactly the reason a hardcoded price is a
 * lie waiting to happen.
 *
 * NOT A TOKEN COUNT, DELIBERATELY. Tokens per image are the model's to state, and
 * this build has no way to verify a formula it wrote down. The run record takes
 * its token number from the API response's own `usage`, never from arithmetic
 * here — measured, not inferred, which is the same rule the honesty labels obey.
 */
export function sentDimensions(
  source: { width: number; height: number },
  model: Pick<ModelConfig, 'maxImageEdge'>,
): { width: number; height: number; downscaled: boolean } {
  const longest = Math.max(source.width, source.height)
  if (longest <= model.maxImageEdge) {
    return { width: source.width, height: source.height, downscaled: false }
  }
  const scale = model.maxImageEdge / longest
  return {
    width: Math.round(source.width * scale),
    height: Math.round(source.height * scale),
    downscaled: true,
  }
}
