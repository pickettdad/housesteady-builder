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
  /** Which operator is accepting. Required — Increment 2c. */
  actorId: string
  actor?: string
}

export interface Acceptance {
  /** Every act written — one per field accepted. */
  overlays: Overlay[]
  /** The first act. Callers accepting one field read this. */
  overlay: Overlay
  /** `accepted` only when EVERY field went in exactly as proposed. */
  decision: 'accepted' | 'edited'
  /** What the model proposed for `overlay`'s field, and what went in. */
  proposed: unknown
  accepted: unknown
}

export interface ReadingArgs {
  db: Db
  propertyId: string
  visitId: string
  generationId: string
  targetKind: string
  targetId: string
  /** field → value. Only the fields being accepted; the rest stay unwritten. */
  values: Record<string, unknown>
  /** Which operator is accepting. Required — Increment 2c. */
  actorId: string
  actor?: string
}

/**
 * Accept a whole reading — every field off one plate, in one act.
 *
 * ONE PHOTOGRAPH, ONE SIGNATURE. A nameplate generation proposes up to five
 * fields, and the claim a concierge is making is not five separate ones: it is
 * CLAUDE.md §6's sentence — *I looked at this plate and this description matches
 * what I saw*. Splitting it into five buttons would ask for that signature five
 * times and get a weaker one each time.
 *
 * It is also what the storage requires. A generation's `human_decision` is one
 * value, so the first single-field acceptance would settle the row and the
 * second would be refused as already decided. Writing every field while the
 * proposal is still open and settling once at the end is the only shape that
 * is both honest and possible.
 *
 * A field the concierge left alone is simply not in `values` — no overlay, no
 * claim. Doctrine 4: an explicit unknown is information.
 */
export function acceptReading(args: ReadingArgs): Acceptance {
  const fields = Object.keys(args.values)
  if (fields.length === 0) {
    throw new OverlayRefused('There is nothing here to accept.', 'overlay.accept-no-fields')
  }

  const overlays = fields.map((field) =>
    writeOverlay({
      db: args.db,
      propertyId: args.propertyId,
      visitId: args.visitId,
      kind: 'accept',
      targetKind: args.targetKind,
      targetId: args.targetId,
      field,
      newValue: args.values[field],
      generationId: args.generationId,
      actor: args.actor ?? 'concierge',
      actorContext: 'desk',
      actorId: args.actorId,
      // Provenance in plain words, for the quiet line under an accepted value.
      reason: 'read from the photo, accepted at the desk',
    }),
  )

  return settle(args.db, args.generationId, overlays)
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
  return acceptReading({
    db: args.db,
    propertyId: args.propertyId,
    visitId: args.visitId,
    generationId: args.generationId,
    targetKind: args.targetKind,
    targetId: args.targetId,
    values: { [args.field]: args.value },
    actor: args.actor,
    actorId: args.actorId,
  })
}

export interface RouteAcceptArgs {
  db: Db
  propertyId: string
  visitId: string
  generationId: string
  /** The loose photograph. */
  mediaId: string
  /** The pin the concierge chose — not necessarily the one that was offered. */
  pinId: string
  /** Which operator is accepting. Required — Increment 2c. */
  actorId: string
  actor?: string
}

/**
 * Attach a loose photograph to a pin, in answer to a routing suggestion.
 *
 * An ORDINARY ASSIGNMENT, not a new kind. A photograph on pin 4 is one fact
 * whether somebody dragged it there or agreed with a suggestion, and it has to
 * read as one state in the workbench, one pip in the table of contents and one
 * row in the report. What the generation adds is provenance: which proposal was
 * answered, and — through the overlay's two value columns — whether the pin
 * chosen is the pin offered.
 *
 * Choosing a candidate further down the list lands here as `edited`, which is
 * right: the model was not wrong, but it was not leading with the answer either,
 * and the golden set's verdicts tell those two apart.
 */
export function acceptRoute(args: RouteAcceptArgs): Acceptance {
  const overlay = writeOverlay({
    db: args.db,
    propertyId: args.propertyId,
    visitId: args.visitId,
    kind: 'assign',
    targetKind: 'media',
    targetId: args.mediaId,
    newValue: { toKind: 'pin', toId: args.pinId },
    generationId: args.generationId,
    actor: args.actor ?? 'concierge',
    actorContext: 'desk',
    actorId: args.actorId,
    reason: 'suggested from the photo, attached at the desk',
  })

  return settle(args.db, args.generationId, [overlay])
}

/**
 * Record what the human did with a proposal.
 *
 * There is no separate "edit" act. Editing is accepting a different value, and
 * modelling it as two things would mean the accuracy record depended on which
 * button somebody happened to press rather than on whether the value changed.
 * The diff decides, so it cannot be got wrong — and it is read off the rows the
 * store wrote rather than re-derived here, because two derivations of one fact
 * is one more place for them to disagree.
 *
 * Across several fields the rule is unanimity: `accepted` means every field went
 * in exactly as proposed. One corrected character in a serial makes the whole
 * reading an edit, which is the answer that keeps the accuracy record useful —
 * "the model got this plate right" has to mean the plate, not four fifths of it.
 */
function settle(db: Db, generationId: string, overlays: Overlay[]): Acceptance {
  const asIs = overlays.every(
    (o) => JSON.stringify(o.priorValue ?? null) === JSON.stringify(o.newValue ?? null),
  )
  const decision: 'accepted' | 'edited' = asIs ? 'accepted' : 'edited'

  db.prepare('UPDATE ai_generations SET human_decision = ?, human_decided_at = ? WHERE id = ?')
    .run(decision, now(), generationId)

  const first = overlays[0]!
  return { overlays, overlay: first, decision, proposed: first.priorValue, accepted: first.newValue }
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
 *
 * The gate is "does this act answer a proposal", not "is this act an accept" —
 * a routing suggestion is answered by an assignment, and withdrawing one has to
 * put its generation back in front of a person exactly as withdrawing an
 * acceptance does. An assignment made by hand carries no generation and is
 * undone through the ordinary undo route.
 */
export function withdrawAcceptance(
  db: Db,
  overlayId: string,
  // An object rather than two more positionals: taking something back is itself
  // an attributable act, and `withdrawAcceptance(db, id, someString)` would
  // read as a reason at every call site whichever order the two ended up in.
  args: { actorId: string; reason?: string },
): Overlay {
  const target = readOne(db, overlayId)
  if (!target) throw new OverlayRefused('That acceptance is not in the record.', 'overlay.undo-unknown')
  if (!target.generationId) {
    throw new OverlayRefused('That act did not answer a proposal.', 'overlay.undo-not-accept')
  }

  const undo = writeOverlay({
    db,
    propertyId: target.propertyId,
    visitId: target.visitId,
    kind: 'undo',
    targetKind: target.targetKind,
    targetId: target.targetId,
    supersedesId: overlayId,
    actorId: args.actorId,
    reason: args.reason ?? 'acceptance taken back at the desk',
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

/**
 * Which model and which prompt produced a generation.
 *
 * Provenance ONLY. There is no output field here on purpose: this is what the
 * screen joins onto an *accepted* value to answer "where did this come from",
 * and giving it the model's text as well would make it a second route by which
 * an unsigned reading could reach a render — the exact thing the doctrine scan
 * on this table exists to prevent.
 */
export interface Provenance {
  task: string
  model: string | null
  promptId: string | null
  promptVersion: string | null
  decision: string
  abstained: boolean
  createdAt: string
}

/**
 * Provenance for every generation in a visit, keyed by id.
 *
 * §7: "model and prompt version are visible on inspection — not shouted, but
 * never hidden." One query for the visit rather than one per accepted value; a
 * baseline carries a few hundred and the pass screen redraws on every act.
 */
export function generationProvenance(db: Db, visitId: string): Record<string, Provenance> {
  const rows = db
    .prepare(
      `SELECT id, task, model, prompt_id, prompt_version, human_decision, abstained, created_at
         FROM ai_generations WHERE visit_id = ?`,
    )
    .all(visitId) as {
    id: string; task: string; model: string | null; prompt_id: string | null
    prompt_version: string | null; human_decision: string; abstained: number; created_at: string
  }[]

  const out: Record<string, Provenance> = {}
  for (const r of rows) {
    out[r.id] = {
      task: r.task,
      model: r.model,
      promptId: r.prompt_id,
      promptVersion: r.prompt_version,
      decision: r.human_decision,
      abstained: r.abstained === 1,
      createdAt: r.created_at,
    }
  }
  return out
}

export interface GoldenCandidate {
  generationId: string
  task: string
  /** The photograph the model was reading. This is what joins the golden set. */
  mediaId: string | null
  field: string | null
  proposed: unknown
  accepted: unknown
  /** `edited` — the model was wrong. `discarded` — the whole reading was wrong. */
  decision: string
  note: string | null
  promptId: string | null
  promptVersion: string | null
  model: string | null
  at: string
}

/**
 * Plates the model got wrong in production — the golden set's next entries.
 *
 * Fifteen images is a start, not the set. The set grows by absorbing the real
 * failures, and this is the query that finds them: every acceptance a human had
 * to edit is a photograph where the model read something the plate did not say,
 * and every discard is one where the whole reading was wrong.
 *
 * Nothing here promotes anything automatically, and it must not. A candidate is
 * a photograph worth a human looking at again; the approved reading that would
 * make it a golden-set entry has to come from that person, not from the value
 * they happened to type while doing something else. Auto-promotion would let a
 * hurried correction become permanent ground truth, which is the failure the
 * per-value approval design exists to prevent.
 *
 * The data costs nothing extra: it is already in `ai_generations` because §2
 * chose to keep the proposal beside the acceptance.
 */
export function goldenCandidates(db: Db, visitId?: string): GoldenCandidate[] {
  const where = visitId ? 'AND g.visit_id = ?' : ''
  const params = visitId ? [visitId] : []
  return (
    db
      .prepare(
        `SELECT g.id, g.task, g.input_refs, g.output, g.human_decision, g.human_note,
                g.prompt_id, g.prompt_version, g.model, g.human_decided_at, g.created_at,
                o.field AS field, o.prior_value AS proposed, o.new_value AS accepted
           FROM ai_generations g
           LEFT JOIN overlays o ON o.generation_id = g.id
                               AND NOT EXISTS (SELECT 1 FROM overlays s WHERE s.supersedes_id = o.id)
          WHERE g.human_decision IN ('edited', 'discarded') ${where}
          ORDER BY COALESCE(g.human_decided_at, g.created_at) DESC`,
      )
      .all(...params) as {
      id: string; task: string; input_refs: string | null; output: string | null
      human_decision: string; human_note: string | null; prompt_id: string | null
      prompt_version: string | null; model: string | null
      human_decided_at: string | null; created_at: string
      field: string | null; proposed: string | null; accepted: string | null
    }[]
  ).map((r) => ({
    generationId: r.id,
    task: r.task,
    mediaId: ((parse(r.input_refs) as { mediaId?: string } | null)?.mediaId) ?? null,
    field: r.field,
    proposed: parse(r.proposed),
    accepted: parse(r.accepted),
    decision: r.human_decision,
    note: r.human_note,
    promptId: r.prompt_id,
    promptVersion: r.prompt_version,
    model: r.model,
    at: r.human_decided_at ?? r.created_at,
  }))
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
