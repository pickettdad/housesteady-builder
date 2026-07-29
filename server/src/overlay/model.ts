/**
 * The overlay model — what the desk says about what the field captured.
 *
 * Everything in this file is PURE. It takes overlay rows and returns state; it
 * never touches the database and never writes. That is deliberate: "current
 * state is computed on read" (spec §4) is only a safe design if the computation
 * is cheap, total, and testable on its own, and the fastest way to guarantee it
 * stays that way is to give it no way to persist anything.
 *
 * The one idea worth holding on to: an overlay is LIVE if nothing supersedes it.
 * Undo does not delete, it supersedes. A re-decision does not overwrite, it
 * supersedes. So the whole history is always present and the current state is a
 * filter over it, never a separate record that could drift.
 */

/**
 * Today's kinds. This is a type alias for editor help, NOT a closed set —
 * `Overlay.kind` is a plain string and unrecognized kinds are preserved,
 * displayed and counted like every other open vocabulary in this codebase.
 */
export type KnownOverlayKind = 'confirm' | 'correct' | 'assign' | 'flag' | 'memory' | 'accept' | 'undo'

/** Likewise open. v4 adds `concern`; 2b adds nothing but uses these. */
export type KnownTargetKind = 'pin' | 'media' | 'zone' | 'resolution' | 'note' | 'inbox_ref'

/** The four acts of the pass. `memory` records recall; `undo` retracts. */
export const DECISION_KINDS = ['confirm', 'correct', 'assign', 'flag', 'accept'] as const

/**
 * Kinds that set the value of a named field.
 *
 * `correct` and `accept` compete for the same slot on purpose: both answer
 * "what does this field say now", and a pin cannot have a corrected model and
 * an accepted model at once without something having to choose between them at
 * render time. Making them share the slot means the choice is made once, when
 * the act is recorded, and the trail still says which kind of act it was.
 */
export const VALUE_KINDS = ['correct', 'accept'] as const

export interface OverlayRow {
  id: string
  property_id: string
  visit_id: string
  seq: number
  kind: string
  target_kind: string
  target_id: string
  field: string | null
  prior_value: string | null
  new_value: string | null
  reason: string | null
  supersedes_id: string | null
  actor: string
  actor_context: string
  actor_id: string | null
  generation_id: string | null
  created_at: string
}

export interface Overlay {
  id: string
  propertyId: string
  visitId: string
  /** Decision order within the visit. This, not the timestamp, is "latest". */
  seq: number
  kind: string
  targetKind: string
  targetId: string
  field: string | null
  priorValue: unknown
  newValue: unknown
  reason: string | null
  supersedesId: string | null
  /** The ROLE this act was performed in. Only ever 'concierge' so far. */
  actor: string
  actorContext: string
  /**
   * WHICH OPERATOR did it — Increment 2c.
   *
   * Surfaced here as well as stored, because an attribution nothing can read is
   * only half of one: "who discarded this proposal" has to be answerable from
   * the record, not just present in it.
   */
  actorId: string | null
  /** Set on `accept` only: the proposal this act answered. */
  generationId: string | null
  createdAt: string
}

const parseJson = (s: string | null): unknown => {
  if (s === null) return null
  try {
    return JSON.parse(s) as unknown
  } catch {
    // Never throw reading our own storage back. A value we cannot parse is
    // shown as the raw string rather than vanishing — same instinct as the
    // import path, for the same reason.
    return s
  }
}

export const toOverlay = (r: OverlayRow): Overlay => ({
  id: r.id,
  propertyId: r.property_id,
  visitId: r.visit_id,
  seq: r.seq,
  kind: r.kind,
  targetKind: r.target_kind,
  targetId: r.target_id,
  field: r.field,
  priorValue: parseJson(r.prior_value),
  newValue: parseJson(r.new_value),
  reason: r.reason,
  supersedesId: r.supersedes_id,
  actor: r.actor,
  actorContext: r.actor_context,
  actorId: r.actor_id ?? null,
  generationId: r.generation_id ?? null,
  createdAt: r.created_at,
})

/** Stable key for an entity. The uuid is the identity; nothing else is. */
export const entityKey = (targetKind: string, targetId: string): string => `${targetKind}:${targetId}`

// ------------------------------------------------------------------- the trail

/**
 * How an overlay reads in the audit trail.
 *
 * Spec §3: "The trail should honestly read *assigned, unassigned, reassigned*."
 * That sentence is the whole reason undo is a superseding row — a deletion
 * would leave the trail reading "assigned" with no trace of the mind changed in
 * between, which is a quieter kind of lie than a wrong value.
 */
const PAST: Record<string, string> = {
  confirm: 'confirmed',
  correct: 'corrected',
  assign: 'assigned',
  flag: 'flagged',
  memory: 'recorded',
  accept: 'accepted',
}

const UNDONE: Record<string, string> = {
  confirm: 'unconfirmed',
  correct: 'correction withdrawn',
  assign: 'unassigned',
  flag: 'unflagged',
  memory: 'recollection withdrawn',
  accept: 'acceptance withdrawn',
}

const REDONE: Record<string, string> = {
  confirm: 'reconfirmed',
  correct: 'corrected again',
  assign: 'reassigned',
  flag: 'reflagged',
  memory: 'recorded again',
  accept: 'accepted again',
}

export interface TrailEntry {
  overlay: Overlay
  /** The verb a human reads: assigned / unassigned / reassigned / … */
  verb: string
  /** True while nothing supersedes this row. */
  live: boolean
}

/**
 * The full history for a set of overlays, oldest first, each labelled with what
 * it actually did in context. An overlay that supersedes an undo is a *re*-doing
 * and says so; an undo names the act it retracted.
 */
export function buildTrail(overlays: Overlay[]): TrailEntry[] {
  const byId = new Map(overlays.map((o) => [o.id, o]))
  const superseded = new Set(overlays.map((o) => o.supersedesId).filter((v): v is string => v !== null))

  // By seq, never by timestamp. Two acts a second apart and two acts in the
  // same millisecond both need a defined order, and only seq gives one.
  return [...overlays]
    .sort((a, b) => a.seq - b.seq)
    .map((o) => {
      const prior = o.supersedesId ? byId.get(o.supersedesId) : undefined
      let verb: string
      if (o.kind === 'undo') {
        // An undo with no visible antecedent still reads honestly rather than
        // guessing at what it retracted.
        verb = prior ? (UNDONE[prior.kind] ?? `${prior.kind} withdrawn`) : 'withdrawn'
      } else if (prior?.kind === 'undo') {
        verb = REDONE[o.kind] ?? `${o.kind} again`
      } else {
        verb = PAST[o.kind] ?? o.kind
      }
      return { overlay: o, verb, live: !superseded.has(o.id) }
    })
}

// ------------------------------------------------------------- current state

export interface EntityState {
  targetKind: string
  targetId: string
  /**
   * The latest live act of any decision kind. This is what makes an item count
   * as "decided" in the pass — see spec §6.
   */
  decision: Overlay | null
  /**
   * The live value of each named field, keyed by field.
   *
   * Holds `correct` and `accept` alike — read `.kind` to tell a value the
   * concierge typed from one they accepted off a photograph. Calling this
   * `corrections` would have been a small lie the moment acceptance existed.
   */
  values: Record<string, Overlay>
  /** Live overlays of each kind, if any. A confirm and a flag can coexist. */
  confirm: Overlay | null
  assign: Overlay | null
  flag: Overlay | null
  memory: Overlay | null
  /** Live overlays whose kind this builder does not recognize. Never dropped. */
  unrecognized: Overlay[]
  /** Every overlay for this entity, oldest first, with its verb. */
  trail: TrailEntry[]
}

const emptyState = (targetKind: string, targetId: string): EntityState => ({
  targetKind,
  targetId,
  decision: null,
  values: {},
  confirm: null,
  assign: null,
  flag: null,
  memory: null,
  unrecognized: [],
  trail: [],
})

/**
 * Resolve overlays into current state, one entry per entity touched.
 *
 * "Latest wins across all overlay kinds for an entity" (spec §4) is implemented
 * as: among LIVE overlays, the most recent decision-kind row is the entity's
 * standing decision, and each kind's own latest live row is available beside it.
 *
 * Two kinds do NOT clear each other. A pin can be confirmed and flagged at once,
 * because "the label reads what the field says it reads" and "somebody should
 * look at this again" are both true statements about the same pin, and dropping
 * either to satisfy a tidier model would lose information the pass exists to
 * collect. Superseding is how a decision is replaced, and it only ever happens
 * within one kind and field.
 */
export function resolveState(overlays: Overlay[]): Map<string, EntityState> {
  const superseded = new Set(overlays.map((o) => o.supersedesId).filter((v): v is string => v !== null))
  const byEntity = new Map<string, Overlay[]>()
  for (const o of overlays) {
    const key = entityKey(o.targetKind, o.targetId)
    const list = byEntity.get(key)
    if (list) list.push(o)
    else byEntity.set(key, [o])
  }

  const out = new Map<string, EntityState>()
  for (const [key, list] of byEntity) {
    const first = list[0]!
    const state = emptyState(first.targetKind, first.targetId)
    state.trail = buildTrail(list)

    // Oldest first, so a later assignment simply overwrites an earlier one here.
    const live = state.trail.filter((t) => t.live).map((t) => t.overlay)

    for (const o of live) {
      // An undo that is itself live means the act it retracted is gone and
      // nothing replaced it. It contributes no state — that is the point.
      if (o.kind === 'undo') continue
      switch (o.kind) {
        case 'confirm':
          state.confirm = o
          break
        case 'correct':
        case 'accept':
          if (o.field !== null) state.values[o.field] = o
          break
        case 'assign':
          state.assign = o
          break
        case 'flag':
          state.flag = o
          break
        case 'memory':
          state.memory = o
          break
        default:
          // Fail open. A kind from a newer builder is kept and surfaced rather
          // than silently ignored, exactly like an unknown resolution kind.
          state.unrecognized.push(o)
      }
      if ((DECISION_KINDS as readonly string[]).includes(o.kind)) state.decision = o
    }

    out.set(key, state)
  }
  return out
}

/**
 * Has the desk decided anything about this entity?
 *
 * Deliberately narrow: `memory` is not a decision (it is recall, and §6 says it
 * is prompted but never required) and a live `undo` leaves an entity undecided
 * again, which is the honest answer after someone takes a decision back.
 */
export const isDecided = (state: EntityState | undefined): boolean => Boolean(state?.decision)
