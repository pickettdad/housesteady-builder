/**
 * Ratification — who approved which expected value, and when.
 *
 * This was inside `golden.ts` while nameplate reading was the only task with a
 * golden set. Routing has one now, and a second task importing the shared half
 * from a file named after the first is how a shared thing gets quietly forked.
 * So it moved, unchanged in behaviour: nothing here knows what a nameplate is,
 * what a pin is, or what is being compared.
 *
 * ONE COMPANY ARTIFACT, ONE REVIEW ROLE. Concierges will run these harnesses
 * against their own clients' equipment, so *proposing* an expected value is
 * distributed — every visit can contribute a candidate — but *ratifying* is
 * central. Whatever a new task's entries look like, their approvals go in this
 * log with the same `by`. A second ratification format would fragment accuracy
 * exactly as a second golden set would.
 *
 * THE FOUR RULES, all of which are task-agnostic and all of which are why this
 * file exists at all:
 *
 * 1. An act carries a COPY of the value approved, so editing the value lapses
 *    its ratification by itself. A flag would drift onto something nobody read.
 * 2. Withdrawal appends; it never deletes. Every run between a ratification and
 *    its withdrawal validated against that value, and binders may have shipped
 *    on that basis — erasing the approval erases the evidence that a window of
 *    false confidence existed.
 * 3. Only ratified values gate. An unratified difference is information.
 * 4. Two ratifications of one key to different answers is drift, and drift is a
 *    question for the review role rather than an error.
 */

/**
 * One act of ratifying or withdrawing one value.
 *
 * `by` is required everywhere. Not for blame — for tracing. If a wrong value
 * turns out to have been ratified, the question that matters next is which
 * review it came through, so the rest of that sitting can be re-checked. That is
 * not reconstructible afterwards, so it is recorded at the time.
 */
export interface RatificationAct {
  /** Which value on the entry this act is about. */
  key: string
  act: 'ratify' | 'revoke'
  /** Present on `ratify`. The exact value approved. */
  value?: string
  by: string
  at: string
  /** Why it was taken back. Worth having when the log is read years later. */
  reason?: string
}

/** Anything a golden set can hold: a named entry carrying its own log. */
export interface Ratifiable {
  /** How the entry is named in the report and in the approve command. */
  file: string
  ratifications?: RatificationAct[]
}

export interface Contest {
  file: string
  key: string
  /** Distinct values that have been ratified for this key, oldest first. */
  values: string[]
  /** Who ratified each. Two names here is the drift signal. */
  by: string[]
}

/** Every act touching one value, oldest first. */
export const historyFor = (entry: Ratifiable, key: string): RatificationAct[] =>
  (entry.ratifications ?? []).filter((r) => r.key === key)

/** The act in force for one value, if any. */
export const latestAct = (entry: Ratifiable, key: string): RatificationAct | undefined => {
  const acts = historyFor(entry, key)
  return acts[acts.length - 1]
}

/**
 * Was this value ever ratified, even if it is not now?
 *
 * The question a bad value raises: did anything validate against this while it
 * stood? A revoked ratification still had a window, and that window is what
 * needs chasing.
 */
export const wasEverRatified = (entry: Ratifiable, key: string): boolean =>
  historyFor(entry, key).some((r) => r.act === 'ratify')

/**
 * Values that have been ratified more than once, to different answers.
 *
 * This is the drift signal, and a list of who-has-ratified-how-many is not it.
 * Several reviewers agreeing is exactly what a company artifact looks like
 * working. The thing to catch is two reviewers who looked at the same evidence
 * and wrote down different values — because that is a set quietly forking, and
 * it fragments accuracy the way the binder voice would fragment without house
 * style. It surfaces as a question for the review role rather than an error: one
 * of them is wrong, or the case is genuinely ambiguous and the entry needs a
 * note saying so.
 */
export function contested(entries: Ratifiable[]): Contest[] {
  const out: Contest[] = []
  for (const entry of entries) {
    const keys = new Set((entry.ratifications ?? []).map((r) => r.key))
    for (const key of keys) {
      const ratifies = historyFor(entry, key).filter((r) => r.act === 'ratify')
      const values = [...new Set(ratifies.map((r) => r.value ?? ''))]
      if (values.length > 1) out.push({ file: entry.file, key, values, by: ratifies.map((r) => r.by) })
    }
  }
  return out
}

/**
 * Refuse an entry whose log cannot be trusted.
 *
 * Shape, not vocabulary — doctrine 7 says fail closed on shape, and both of
 * these are shape. The `approved` map is the earlier design, which kept only the
 * approval in force so a revocation erased the fact that anything had been
 * approved; it is refused rather than migrated, because a log reconstructed from
 * current state has no history in it, which is the whole thing the log is for.
 */
export function assertLogIsSound(entry: Ratifiable & { approved?: unknown }): void {
  if (entry.approved && Object.keys(entry.approved).length > 0) {
    throw new Error(
      `${entry.file}: carries an \`approved\` map. Ratification is an append-only log now — ` +
        're-ratify so the acts are recorded.',
    )
  }
  for (const act of entry.ratifications ?? []) {
    if (!act.by || act.by.trim() === '') {
      throw new Error(
        `${entry.file}: a ratification of "${act.key}" has no author. An approval whose author ` +
          'is unknown is exactly the approval you cannot trace when it turns out to be wrong.',
      )
    }
  }
}

/**
 * The ratification questions, bound to one task's idea of a current value.
 *
 * The log is task-agnostic; *what a key's current value is* is not — a nameplate
 * entry keeps its values in `fields` and its classification beside them, a
 * routing entry holds a pin id. So each task supplies that one function and gets
 * the rest unchanged. This is the seam that stayed general on purpose: the
 * comparison logic below it is nameplate-shaped or routing-shaped and should be,
 * but the record of who approved what must never be either.
 */
export function ratificationView<E extends Ratifiable>(currentValue: (entry: E, key: string) => string) {
  const isRatified = (entry: E, key: string): boolean => {
    const act = latestAct(entry, key)
    return act?.act === 'ratify' && act.value === currentValue(entry, key)
  }
  return {
    currentValue,
    isRatified,
    /** Who ratified this value, if it still stands. */
    ratifiedBy: (entry: E, key: string): RatificationAct | undefined =>
      isRatified(entry, key) ? latestAct(entry, key) : undefined,
    historyFor,
    latestAct,
    wasEverRatified,
    contested,
  }
}

/** Append an act. Never rewrites, never removes — see rule 2 above. */
export function appendAct(entry: Ratifiable, act: RatificationAct): void {
  entry.ratifications = [...(entry.ratifications ?? []), act]
}
