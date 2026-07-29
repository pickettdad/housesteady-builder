/**
 * Operators — the named people whose acts are attributable.
 *
 * **Not a login.** Increment 2c §6 is explicit that this answers *who did this*
 * and never *who is allowed to*. There is no password here, no session token, no
 * permission check, and nothing in this module should ever grow one — access
 * control arrives with hosting and wants its own decision. Mixing the two now
 * would mean the first real authentication decision gets made by accident, in a
 * file whose job was bookkeeping.
 *
 * One client-facing surface: `display_name` is the *visited by* line a homeowner
 * reads on every report. That is why it is a display name rather than a
 * username.
 *
 * **Nobody is ever deleted.** An operator who leaves is deactivated and every
 * record keeps pointing at them. Same reasoning as retirement lineage — the
 * record of who did something outlives their employment, and a binder that has
 * lost the name of who walked the house has lost part of what it is for.
 */

import type { Db } from '../db/index.js'
import { newId, now } from '../db/index.js'

/**
 * The operator every pre-attribution row belongs to.
 *
 * A real row, deactivated, displaying as *pre-attribution*. **Not the owner** —
 * backfilling to him would assert something untrue about who did the work, and
 * assert it silently, on data nobody will re-examine. This says exactly what is
 * true and no more.
 */
export const LEGACY_OPERATOR_ID = 'op-legacy'

export interface Operator {
  id: string
  display_name: string
  short_code: string
  active: number
  created_at: string
  deactivated_at: string | null
}

export class OperatorRefused extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'OperatorRefused'
  }
}

const SHORT_CODE = /^[a-z0-9][a-z0-9-]{0,15}$/

export function createOperator(db: Db, input: { displayName: string; shortCode: string }): Operator {
  const displayName = input.displayName.trim()
  const shortCode = input.shortCode.trim().toLowerCase()

  if (!displayName) {
    throw new OperatorRefused('An operator needs a display name — a client reads it.', 'operator.no-name')
  }
  if (!SHORT_CODE.test(shortCode)) {
    throw new OperatorRefused(
      `"${shortCode}" is not usable as a short code. Lowercase letters, digits and hyphens, up to 16.`,
      'operator.bad-code',
    )
  }
  const clash = db.prepare('SELECT id, display_name FROM operators WHERE short_code = ?').get(shortCode) as
    | { id: string; display_name: string }
    | undefined
  if (clash) {
    // Named rather than "already exists": the person adding a second operator
    // needs to know it is not a stale row of their own.
    throw new OperatorRefused(
      `The short code "${shortCode}" already belongs to ${clash.display_name}.`,
      'operator.code-taken',
    )
  }

  const id = `op-${newId()}`
  db.prepare(
    `INSERT INTO operators (id, display_name, short_code, active, created_at, deactivated_at)
     VALUES (?, ?, ?, 1, ?, NULL)`,
  ).run(id, displayName, shortCode, now())
  return getOperator(db, id)!
}

export const getOperator = (db: Db, id: string): Operator | undefined =>
  db.prepare('SELECT * FROM operators WHERE id = ?').get(id) as Operator | undefined

export const listOperators = (db: Db, opts: { includeInactive?: boolean } = {}): Operator[] =>
  db
    .prepare(
      `SELECT * FROM operators ${opts.includeInactive ? '' : 'WHERE active = 1'} ORDER BY active DESC, display_name`,
    )
    .all() as Operator[]

/**
 * Retire an operator without erasing them.
 *
 * Deactivating is not deleting and this function cannot delete. Their records
 * still resolve to their name afterwards, which is the point — a report from
 * 2027 must still say who walked the house even if that person left in 2028.
 */
export function deactivateOperator(db: Db, id: string): Operator {
  const operator = getOperator(db, id)
  if (!operator) throw new OperatorRefused(`No operator ${id}.`, 'operator.not-found')
  if (operator.active === 0) return operator
  db.prepare('UPDATE operators SET active = 0, deactivated_at = ? WHERE id = ?').run(now(), id)
  return getOperator(db, id)!
}

/** Bring somebody back. Rehiring happens; a new row would split their history. */
export function reactivateOperator(db: Db, id: string): Operator {
  const operator = getOperator(db, id)
  if (!operator) throw new OperatorRefused(`No operator ${id}.`, 'operator.not-found')
  if (operator.id === LEGACY_OPERATOR_ID) {
    throw new OperatorRefused(
      'The legacy operator stands for records that predate attribution. It can never be selected for new work.',
      'operator.legacy',
    )
  }
  db.prepare('UPDATE operators SET active = 1, deactivated_at = NULL WHERE id = ?').run(id)
  return getOperator(db, id)!
}

/**
 * Find an operator by id, short code, or display name.
 *
 * For the command line and configuration, where a person types a word rather
 * than a uuid. Ambiguity is refused rather than resolved — two operators whose
 * display names both match means the caller has to be specific, because picking
 * one silently would attribute somebody's work to their colleague.
 */
export function resolveOperator(db: Db, needle: string): Operator {
  const value = needle.trim()
  if (!value) throw new OperatorRefused('Name an operator.', 'operator.empty')

  const byId = getOperator(db, value)
  if (byId) return byId

  const byCode = db.prepare('SELECT * FROM operators WHERE short_code = ?').get(value.toLowerCase()) as
    | Operator
    | undefined
  if (byCode) return byCode

  const byName = db
    .prepare('SELECT * FROM operators WHERE lower(display_name) = lower(?)')
    .all(value) as Operator[]
  if (byName.length === 1) return byName[0]!
  if (byName.length > 1) {
    throw new OperatorRefused(
      `More than one operator is called "${value}". Use a short code: ${byName.map((o) => o.short_code).join(', ')}.`,
      'operator.ambiguous',
    )
  }

  const known = listOperators(db).map((o) => o.short_code)
  throw new OperatorRefused(
    `No operator "${value}".` + (known.length ? ` Known: ${known.join(', ')}.` : ' None are registered yet.'),
    'operator.not-found',
  )
}

/**
 * Who is acting in this process.
 *
 * §2: *"Current operator is set per session, from config for now."* Configuration
 * is `HOUSESTEADY_OPERATOR`, holding a short code.
 *
 * Where it is unset and exactly one active operator exists, that is the answer —
 * unambiguous, and it keeps a single-operator install working without ceremony.
 * Where it is unset and there are none or several, **this refuses rather than
 * picking.** Choosing for somebody is how one concierge's work quietly ends up
 * filed under another's name, and the whole increment is about that not
 * happening.
 *
 * It never creates an operator. Inventing a person to satisfy a constraint is
 * the same class of act as inventing an install date.
 */
export function currentOperator(db: Db, override?: string): Operator {
  const configured = override ?? process.env.HOUSESTEADY_OPERATOR
  if (configured && configured.trim()) {
    const operator = resolveOperator(db, configured)
    if (operator.id === LEGACY_OPERATOR_ID) {
      throw new OperatorRefused(
        'The legacy operator stands for records that predate attribution and cannot perform new work.',
        'operator.legacy',
      )
    }
    if (operator.active === 0) {
      throw new OperatorRefused(
        `${operator.display_name} is deactivated. Their existing records keep their name; new work needs an active operator.`,
        'operator.inactive',
      )
    }
    return operator
  }

  const active = listOperators(db)
  if (active.length === 1) return active[0]!

  if (active.length === 0) {
    throw new OperatorRefused(
      'No operators are registered. Add one:  npm run operator -- add "Full Name" <short-code>',
      'operator.none',
    )
  }
  throw new OperatorRefused(
    `${active.length} operators are registered, so who is working has to be said rather than guessed. ` +
      `Set HOUSESTEADY_OPERATOR to one of: ${active.map((o) => o.short_code).join(', ')}.`,
    'operator.ambiguous',
  )
}

/**
 * The name a client sees.
 *
 * Resolves through deactivation, which is the case that matters: a report
 * rendered in 2028 for a visit walked in 2026 still names the person who walked
 * it. An id with no operator behind it says so plainly rather than rendering a
 * uuid into a client document.
 */
export function displayNameFor(db: Db, id: string | null | undefined): string {
  if (!id) return 'not recorded'
  const operator = getOperator(db, id)
  return operator?.display_name ?? `unknown operator (${id})`
}
