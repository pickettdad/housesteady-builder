/**
 * Turning a proposal into a value, or declining to.
 *
 * Spec §2. Three outcomes, all recorded: accepted as-is, accepted after an
 * edit, discarded. The generation row tracks which, and the overlay — when
 * there is one — is what actually makes a value current.
 *
 * DISCARD IS RECORDED, NEVER DELETED. A model that keeps proposing the same
 * wrong thing is a prompt problem, and the discards are the evidence. Deleting
 * them would leave the prompt looking fine and the concierge quietly doing the
 * work by hand forever.
 *
 * The split between this file and `overlay/store.ts` is deliberate: the store
 * owns the only INSERT into `overlays` and the doctrine scan enforces that, so
 * this file asks it to write and then does the generation-side bookkeeping. It
 * never writes an overlay itself.
 */

import { now, type Db } from '../db/index.js'
import { readOne, writeOverlay, OverlayRefused } from '../overlay/store.js'
import type { Overlay } from '../overlay/model.js'

export type HumanDecision = 'pending' | 'accepted' | 'edited' | 'discarded'

export interface GenerationRow {
  id: string
  property_id: string | null
  visit_id: string | null
  task: string
  target_kind: string | null
  target_id: string | null
  model: string | null
  prompt_id: string | null
  prompt_version: string | null
  prompt_hash: string | null
  input_refs: string | null
  output: string | null
  abstained: number
  confidence: number | null
  human_decision: string
  human_note: string | null
  created_at: string
}

export const findGeneration = (db: Db, id: string): GenerationRow | undefined =>
  db.prepare('SELECT * FROM ai_generations WHERE id = ?').get(id) as GenerationRow | undefined

export interface AcceptArgs {
  db: Db
  propertyId: string
  visitId: string
  generationId: string
  /** Which value on the target this sets — model, serial, make, and so on. */
  field: string
  targetKind: string
  targetId: string
  /** What the human is accepting. Equal to the proposal means accepted as-is. */
  value: unknown
  actor?: string
}

export interface Acceptance {
  overlay: Overlay
  decision: 'accepted' | 'edited'
  proposed: unknown
  accepted: unknown
}

/**
 * Accept a proposal, possibly after editing it.
 *
 * There is no separate "edit" act. Editing is accepting a different value, and
 * modelling it as two things would mean the accuracy record depended on which
 * button somebody happened to press rather than on whether the value changed.
 * The diff decides, so it cannot be got wrong.
 */
export function acceptProposal(args: AcceptArgs): Acceptance {
  const { db, generationId } = args

  const overlay = writeOverlay({
    db,
    propertyId: args.propertyId,
    visitId: args.visitId,
    kind: 'accept',
    targetKind: args.targetKind,
    targetId: args.targetId,
    field: args.field,
    newValue: args.value,
    generationId,
    actor: args.actor ?? 'concierge',
    actorContext: 'desk',
    // Provenance in plain words, for the quiet line under an accepted value.
    reason: 'read from the photo, accepted at the desk',
  })

  // The store already resolved what was proposed, so compare against the row it
  // wrote rather than re-deriving it. Two derivations of the same fact is one
  // more place for them to disagree.
  const asIs = JSON.stringify(overlay.priorValue ?? null) === JSON.stringify(overlay.newValue ?? null)
  const decision: 'accepted' | 'edited' = asIs ? 'accepted' : 'edited'

  db.prepare('UPDATE ai_generations SET human_decision = ?, human_decided_at = ? WHERE id = ?')
    .run(decision, now(), generationId)

  return { overlay, decision, proposed: overlay.priorValue, accepted: overlay.newValue }
}

/**
 * Decline a proposal.
 *
 * No overlay: nothing about the house changed, and writing one would put an act
 * on the pin's trail that says nothing about the pin. The generation row carries
 * it, which is where the evidence about the prompt belongs.
 */
export function discardProposal(db: Db, generationId: string, note?: string): GenerationRow {
  const gen = findGeneration(db, generationId)
  if (!gen) throw new OverlayRefused('That proposal is not in the record.', 'overlay.accept-unknown-generation')
  if (gen.human_decision !== 'pending') {
    throw new OverlayRefused(`That proposal was already ${gen.human_decision}.`, 'overlay.accept-already-decided')
  }
  db.prepare('UPDATE ai_generations SET human_decision = ?, human_decided_at = ?, human_note = ? WHERE id = ?')
    .run('discarded', now(), note ?? null, generationId)
  return findGeneration(db, generationId)!
}

/**
 * Take an acceptance back.
 *
 * The undo is an overlay like any other, so the pin's trail reads
 * accepted → acceptance withdrawn. But the generation must return to `pending`
 * too: leaving it `accepted` while the value it set has been withdrawn would
 * make the row claim a value is current that is not. Same discipline as a
 * completed pass reopening when a decision lands after it — the stored fact has
 * to stay true to what is actually the case.
 *
 * The trail keeps the history. Only the current-state field moves.
 */
export function withdrawAcceptance(db: Db, overlayId: string, reason?: string): Overlay {
  const target = readOne(db, overlayId)
  if (!target) throw new OverlayRefused('That acceptance is not in the record.', 'overlay.undo-unknown')
  if (target.kind !== 'accept') {
    throw new OverlayRefused('That is not an acceptance.', 'overlay.undo-not-accept')
  }

  const undo = writeOverlay({
    db,
    propertyId: target.propertyId,
    visitId: target.visitId,
    kind: 'undo',
    targetKind: target.targetKind,
    targetId: target.targetId,
    supersedesId: overlayId,
    reason: reason ?? 'acceptance taken back at the desk',
  })

  if (target.generationId) {
    db.prepare(
      `UPDATE ai_generations SET human_decision = 'pending', human_decided_at = NULL WHERE id = ?`,
    ).run(target.generationId)
  }
  return undo
}

export interface Proposal {
  generationId: string
  task: string
  targetKind: string | null
  targetId: string | null
  /** The parsed output. Shape is the task's business, not this module's. */
  output: unknown
  /** True when the model declined to read. A success, and its own presentation. */
  abstained: boolean
  confidence: number | null
  model: string | null
  promptId: string | null
  promptVersion: string | null
  createdAt: string
}

const parse = (s: string | null): unknown => {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

const toProposal = (g: GenerationRow): Proposal => ({
  generationId: g.id,
  task: g.task,
  targetKind: g.target_kind,
  targetId: g.target_id,
  output: parse(g.output),
  abstained: g.abstained === 1,
  confidence: g.confidence,
  model: g.model,
  promptId: g.prompt_id,
  promptVersion: g.prompt_version,
  createdAt: g.created_at,
})

/**
 * Proposals still waiting on a human, for a visit.
 *
 * Abstentions are included on purpose. §7: an abstention is never an error
 * state, it has its own presentation, and the offer it carries — type it
 * yourself, or carry it to the next visit — is a decision the concierge still
 * has to make. Filtering them out would hide the feature working.
 */
export function pendingProposals(db: Db, visitId: string): Proposal[] {
  return (
    db
      .prepare(`SELECT * FROM ai_generations WHERE visit_id = ? AND human_decision = 'pending' ORDER BY created_at, id`)
      .all(visitId) as GenerationRow[]
  ).map(toProposal)
}

export interface Accuracy {
  proposed: number
  acceptedAsIs: number
  edited: number
  discarded: number
  abstained: number
  pending: number
}

/**
 * How often the model is right, for a visit.
 *
 * Falls straight out of the storage because §2 chose to keep both values on the
 * acceptance rather than only the accepted one. Nothing here is maintained; it
 * is a count of rows that had to exist anyway.
 */
export function accuracy(db: Db, visitId: string, task?: string): Accuracy {
  const where = task ? 'AND task = ?' : ''
  const params = task ? [visitId, task] : [visitId]
  const rows = db
    .prepare(`SELECT human_decision, abstained FROM ai_generations WHERE visit_id = ? ${where}`)
    .all(...params) as { human_decision: string; abstained: number }[]

  return {
    proposed: rows.length,
    acceptedAsIs: rows.filter((r) => r.human_decision === 'accepted').length,
    edited: rows.filter((r) => r.human_decision === 'edited').length,
    discarded: rows.filter((r) => r.human_decision === 'discarded').length,
    abstained: rows.filter((r) => r.abstained === 1).length,
    pending: rows.filter((r) => r.human_decision === 'pending').length,
  }
}
