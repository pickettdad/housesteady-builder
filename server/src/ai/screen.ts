/**
 * What the assists look like on the fresh pass.
 *
 * Spec §7: everything lands in the pass, no new screen. So this is a read model
 * the pass fetches alongside its own, and the split between the two is not
 * arbitrary — it is doctrine made structural:
 *
 *   **Accepted values are in the PASS model.** They are state. They arrive as
 *   `accept` and `assign` overlays like any other act, resolve through the same
 *   `resolveState`, and appear in the same `values` bag as a correction typed by
 *   hand. Nothing about rendering them is AI-specific.
 *
 *   **Pending proposals are in THIS model.** They are not state. A proposal is a
 *   thing a model said, sitting beside the record and not in it, and keeping it
 *   in a different payload is what makes "no path renders a generation as
 *   current state" hard to break by accident rather than merely forbidden.
 *
 * The one join between them is `provenance`: an accepted value carries its
 * generation id, and the screen looks up which model and prompt version produced
 * it — §7's "visible on inspection, not shouted, never hidden".
 */

import type { Db } from '../db/index.js'
import { generationProvenance, pendingProposals, type Provenance } from './accept.js'
import { queueProgress, visitSpend, type QueueProgress, type Spend } from './queue.js'
import { assistsBlocked, drainInFlight } from './worker.js'
import {
  CLASSIFY_TASK, EXTRACT_TASK, NAMEPLATE_FIELDS, pinForMedia,
  type Classification, type Extraction, type NameplateField, type Uncertainty,
} from './tasks/nameplate.js'
import { PIN_TYPE_TASK, type StoredTypeSuggestion } from './tasks/pinType.js'
import { routingBatch, ROUTING_TASK, type RoutingBatch } from './tasks/routing.js'

// ------------------------------------------------------------------- nameplate

export interface ProposedField {
  field: NameplateField
  /**
   * What the model read, or null where it declined.
   *
   * Null is a value in its own right here, not a missing one. §7 gives
   * abstention its own presentation and the screen needs to tell "the plate says
   * Rheem" apart from "the plate might say Rheem but I could not make it out",
   * and both apart from "there is no make on this plate at all".
   */
  value: string | null
  /**
   * What could be seen, where the value is null.
   *
   * CLAUDE.md §9: never summon a human to a blank space. The record abstains;
   * the prompt does not. This is the difference — the stored value stays
   * unknown and the person is told which characters are under glare.
   */
  uncertain?: Uncertainty
}

export interface NameplateProposal {
  generationId: string
  mediaId: string
  /** The pin the photograph is attached to. An acceptance lands here. */
  pinId: string | null
  fields: ProposedField[]
  /** True when the model saw a plate and got nothing off it. Never an error. */
  abstained: boolean
  legible: boolean
  notes: string
  /**
   * Why this photograph was read at all.
   *
   * A classification is NOT a proposal — nobody accepts one, and it never
   * becomes a value. It is the gate that decided whether extraction ran, and it
   * belongs beside the extraction as evidence. Rendering it as something to
   * accept would put a question in front of a person that has no answer.
   */
  classifiedAs: Classification | null
  provenance: Provenance | null
}

/**
 * A photograph that was looked at and deliberately not read.
 *
 * §11: the non-nameplate is "not extracted at all", and a row saying so is how
 * that becomes provable. An absent job and a job that decided not to run look
 * identical from the outside and only one of them is the feature working.
 */
export interface NotRead {
  mediaId: string
  pinId: string | null
  classifiedAs: Classification
}

// ------------------------------------------------------------------- pin type

export interface TypeProposal {
  generationId: string
  pinId: string
  candidates: StoredTypeSuggestion['candidates']
  shows: string
  unsure?: string
  /** Types the model named that this import's config does not declare. */
  offList?: string[]
  /**
   * The pin already has a type from somewhere else.
   *
   * Quiet, not hidden. A suggestion that arrives after the concierge typed the
   * pin by hand is not noise to be dropped — it is free evidence about whether
   * the model agrees — but it must not read as an open question either.
   */
  alreadyAnswered: boolean
  provenance: Provenance | null
}

// --------------------------------------------------------------- the whole lot

export interface AssistModel {
  /** Nameplate readings waiting on a human, newest last. */
  nameplates: NameplateProposal[]
  /** Photographs classified as not a plate, so nothing was read off them. */
  notRead: NotRead[]
  types: TypeProposal[]
  routing: RoutingBatch
  /** generationId → model and prompt version, for accepted values in the pass. */
  provenance: Record<string, Provenance>
  queue: QueueProgress
  spend: Spend
  /** True while a drain is running in this process, so the screen can say so. */
  running: boolean
  /**
   * Why nothing can run, in words, or null.
   *
   * §0.4 makes an absent key an ordinary state rather than an error, and an
   * ordinary state has to be sayable. A run button that does nothing and
   * explains nothing is the worst version of this.
   */
  blocked: string | null
}

/**
 * Everything the pass needs to render the assists for one visit.
 *
 * Reads proposals through `accept.ts` rather than the table, which is the
 * doctrine scan's whole point: a read path that joined `ai_generations` for
 * convenience is how an unsigned value reaches a screen.
 */
export function buildAssists(db: Db, visitId: string): AssistModel {
  const proposals = pendingProposals(db, visitId)
  const provenance = generationProvenance(db, visitId)

  const typedPins = new Set(livePinTypeTargets(db, visitId))

  const nameplates: NameplateProposal[] = []
  const notRead: NotRead[] = []
  const types: TypeProposal[] = []

  // Classifications are indexed rather than listed: they are evidence for an
  // extraction, not proposals of their own.
  const classifications = new Map<string, Classification>()
  for (const p of proposals) {
    if (p.task === CLASSIFY_TASK && p.targetId) {
      classifications.set(p.targetId, p.output as Classification)
    }
  }

  for (const p of proposals) {
    if (p.task === EXTRACT_TASK && p.targetId) {
      const e = (p.output ?? {}) as Extraction
      nameplates.push({
        generationId: p.generationId,
        mediaId: p.targetId,
        pinId: pinForMedia(db, visitId, p.targetId) ?? null,
        fields: NAMEPLATE_FIELDS.map((f) => proposedField(f, e)),
        abstained: p.abstained,
        legible: e.legible !== false,
        notes: e.notes ?? '',
        classifiedAs: classifications.get(p.targetId) ?? null,
        provenance: provenance[p.generationId] ?? null,
      })
      continue
    }

    if (p.task === PIN_TYPE_TASK && p.targetId) {
      const s = (p.output ?? {}) as StoredTypeSuggestion
      types.push({
        generationId: p.generationId,
        pinId: p.targetId,
        candidates: s.candidates ?? [],
        shows: s.shows ?? '',
        unsure: s.unsure,
        offList: s.offList,
        alreadyAnswered: typedPins.has(p.targetId),
        provenance: provenance[p.generationId] ?? null,
      })
    }
  }

  // A photograph classified `no` has no extraction proposal — the classifier
  // skipped the job. Listing it here is what stops "not extracted" from looking
  // like "never got round to it".
  const extracted = new Set(nameplates.map((n) => n.mediaId))
  for (const [mediaId, c] of classifications) {
    if (extracted.has(mediaId) || c.isNameplate === 'yes') continue
    notRead.push({ mediaId, pinId: pinForMedia(db, visitId, mediaId) ?? null, classifiedAs: c })
  }

  return {
    nameplates,
    notRead,
    types,
    routing: routingBatch(proposals),
    provenance,
    queue: queueProgress(db, visitId),
    spend: visitSpend(db, visitId),
    running: drainInFlight(visitId),
    blocked: assistsBlocked(),
  }
}

const isUnknown = (v: string | undefined): boolean =>
  v === undefined || v.trim() === '' || v.trim().toLowerCase() === 'unknown'

const proposedField = (field: NameplateField, e: Extraction): ProposedField => {
  const raw = e.fields?.[field]
  const value = isUnknown(raw) ? null : raw!.trim()
  const uncertain = value === null ? e.uncertain?.[field] : undefined
  return uncertain ? { field, value, uncertain } : { field, value }
}

/**
 * Pins whose type has already been settled at the desk.
 *
 * Only `correct` and `accept` count — those are the two kinds that set a field's
 * value (`VALUE_KINDS`), and a confirm on a typeless pin confirms that it has no
 * type, which is not an answer to what it is.
 */
function livePinTypeTargets(db: Db, visitId: string): string[] {
  return (
    db
      .prepare(
        `SELECT target_id FROM overlays
          WHERE visit_id = ? AND target_kind = 'pin' AND field = 'type'
            AND kind IN ('correct', 'accept')
            AND NOT EXISTS (SELECT 1 FROM overlays s WHERE s.supersedes_id = overlays.id)`,
      )
      .all(visitId) as { target_id: string }[]
  ).map((r) => r.target_id)
}

/** Which task a proposal belongs to, so a route can dispatch without guessing. */
export const ASSIST_TASKS = [CLASSIFY_TASK, EXTRACT_TASK, PIN_TYPE_TASK, ROUTING_TASK] as const
