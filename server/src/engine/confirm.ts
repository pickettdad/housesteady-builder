/**
 * The confirmation surface — Increment 5 §6, and Amendment 1 §B's two records.
 *
 * **Confirmation is per object, never per output.** One act on *this is an
 * American Standard gas water heater* and the streams follow from it. There is
 * deliberately no function here that confirms a care interval on its own:
 * confirming a class four times gets a weaker signature each time, which is the
 * same reasoning as one signature per nameplate.
 *
 * ## One click, two provenance records
 *
 * | What is signed | Checkable on screen | Act | Label |
 * |---|---|---|---|
 * | *American Standard gas water heater, serial 4471* | **yes** — the photo is there | `confirmed` | `Observed` |
 * | *Descale every 12 months, cartridge Y* | **no** — nothing in the room says so | `adopted` | `Inferred` |
 *
 * **The workflow is unchanged — one click per object, never twelve.** The cost is
 * a column value rather than a second surface, and what it buys is that when a
 * care interval turns out wrong, and over five years several will, **the record
 * already says nobody claimed to have verified it.**
 *
 * ## What is idle here, said plainly
 *
 * **The `adopted` path has no production caller yet**, because §4's research pass
 * is not built — nothing currently produces an interval or a part identity to
 * adopt. It is constructed in tests and nowhere else, and by rule 11 that means
 * this half is not yet proven by use.
 *
 * It is built now anyway, and the reason is the constraint rather than the code:
 * when research output does arrive, the shortest path is to let it ride the
 * existing confirmation, and that is precisely the laundering Amendment 1 §B
 * exists to stop. **The guard has to be in place before the temptation**, or the
 * first author to reach for it will find nothing in the way.
 */

import { randomUUID } from 'node:crypto'
import { now, type Db } from '../db/index.js'

/** 2b's vocabulary, extended rather than replaced. Amendment 1 §B's check. */
export type ProvenanceAct = 'confirmed' | 'adopted'

/** The two legal pairings, declared once so nothing writes them as literals. */
export const ACT_LABEL: Readonly<Record<ProvenanceAct, string>> = {
  confirmed: 'Observed',
  adopted: 'Inferred',
}

export type Decision = 'confirmed' | 'rejected'

export interface DerivedOutput {
  /** `care`, `opportunity`, `horizon`, `question` — open vocabulary. */
  stream: string
  /** The class-frame term or generation this record covers. */
  ref: string
  /**
   * Whether a person could check it against something on screen.
   *
   * **Required, with no default.** A default would decide the honesty label by
   * omission, which is the one thing this module exists to prevent — and an
   * author who has not thought about it is exactly who a default would serve.
   */
  checkableOnScreen: boolean
}

export class ConfirmationRefused extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'ConfirmationRefused'
  }
}

export interface ConfirmArgs {
  objectId: string
  operatorId: string
  decision: Decision
  /** Unanimity — one corrected character marks the whole reading edited. */
  edited?: boolean
  note?: string
  /** What rides this confirmation. Ignored on a rejection: nothing follows. */
  derived?: readonly DerivedOutput[]
}

export interface ConfirmResult {
  decisionId: string
  /** Every provenance row written, so a caller can report rather than re-query. */
  records: { stream: string; act: ProvenanceAct; honestyLabel: string; ref: string | null }[]
}

/**
 * Record one human decision about one object, and everything that follows.
 *
 * **A rejection writes no provenance at all** — nothing follows from an object
 * the concierge says is not there. It is recorded rather than deleted, for the
 * same reason a discard is: a model that keeps proposing the same wrong thing is
 * a prompt problem, and the rejections are the evidence.
 */
export function confirmObject(db: Db, args: ConfirmArgs): ConfirmResult {
  const object = db.prepare('SELECT id, class_id FROM objects WHERE id = ?').get(args.objectId) as
    | { id: string; class_id: string | null }
    | undefined
  if (!object) {
    throw new ConfirmationRefused(
      `No object \`${args.objectId}\`. A confirmation is a claim about a thing in a room, and this one names nothing.`,
      'confirm.object-absent',
    )
  }

  const prior = db
    .prepare('SELECT id FROM object_decisions WHERE object_id = ?')
    .get(args.objectId) as { id: string } | undefined
  if (prior) {
    throw new ConfirmationRefused(
      `Object \`${args.objectId}\` already carries decision \`${prior.id}\`. **Confirmation is per object and happens once** — a second signature over the same thing is weaker than the first, not stronger. A changed mind is a correction against the existing decision, which is a different act with its own record.`,
      'confirm.already-decided',
    )
  }

  const at = now()
  const decisionId = randomUUID()
  const records: ConfirmResult['records'] = []

  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO object_decisions (id, object_id, actor_id, decision, edited, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(decisionId, args.objectId, args.operatorId, args.decision, args.edited ? 1 : 0, args.note ?? null, at)

    if (args.decision === 'rejected') return

    const row = db.prepare(
      `INSERT INTO object_provenance (id, decision_id, object_id, stream, act, honesty_label, ref, actor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    // The identification itself. Always `confirmed`/`Observed`: it is the one
    // claim the photograph on screen can actually settle.
    row.run(randomUUID(), decisionId, args.objectId, 'identification', 'confirmed', ACT_LABEL.confirmed, object.class_id, args.operatorId, at)
    records.push({ stream: 'identification', act: 'confirmed', honestyLabel: ACT_LABEL.confirmed, ref: object.class_id })

    for (const d of args.derived ?? []) {
      const act: ProvenanceAct = d.checkableOnScreen ? 'confirmed' : 'adopted'
      row.run(randomUUID(), decisionId, args.objectId, d.stream, act, ACT_LABEL[act], d.ref, args.operatorId, at)
      records.push({ stream: d.stream, act, honestyLabel: ACT_LABEL[act], ref: d.ref })
    }

    // §2 keeps the answer on the object as well, so a reader asking *is this
    // confirmed* does not have to join. The decision table is the history.
    db.prepare('UPDATE objects SET confirmed_by = ?, confirmed_at = ? WHERE id = ?')
      .run(args.operatorId, at, args.objectId)
  })
  write()

  return { decisionId, records }
}
