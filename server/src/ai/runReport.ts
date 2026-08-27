/**
 * What a run actually did, so a report can tell its own rows from what was there.
 *
 * ---
 *
 * ## The failure this exists to remove
 *
 * ⚑ **`npm run read` and `npm run match` printed `Ran 0, failed 16` and then a
 * confident table.** The table was read back from the tables, so on a run where
 * every call failed it showed **whatever a previous run had left behind**, with
 * nothing saying so.
 *
 * *A verdict formed with nothing present that could refute it* — in the two
 * passes that cost money and send photographs of the inside of a house.
 *
 * ⛑ **And the empty branch was wrong in the same direction.** *"No labels are
 * stored for this import yet. Pass 1 has not run against it."* — after a run in
 * which pass 1 ran sixteen times and failed sixteen times. **A blank reported as
 * a fact about the house rather than a fact about the run.**
 *
 * ## What the fix is, and what it is NOT
 *
 * **It is not that the table becomes empty.** Prior rows are real and a person
 * looking at a failed run still wants to see them. **It is that a reader can tell
 * *this run found these* from *this run did nothing, and here is what was already
 * there*.**
 *
 * *Same distinction as a blank versus a refusal in the field app: an absence and
 * a declined attempt look identical in the output and are completely different
 * facts.*
 *
 * ⚑ **So rows are partitioned by when they were written**, against an instant
 * captured before the drain. A report says how many of the rows it is showing
 * this run actually produced — which is a number that cannot be faked by rows
 * that were already there.
 *
 * ## Why this is shared rather than written twice
 *
 * Two scripts print the same distinction. **A duplicated rule in this repo has
 * drifted four times**, and the two passes it governs are the two that cost
 * money — so the sentence a person reads after paying for a run is derived in
 * one place.
 */

/** An instant, or the marker that no call was made. */
export interface RunOutcome {
  /**
   * ISO instant captured **immediately before the drain**, so a row written
   * during the run sorts at or after it.
   *
   * **`null` means no drain happened at all** — a plan-only invocation. That is a
   * third state, not a run with zero calls, and it reads differently.
   */
  since: string | null
  ran: number
  failed: number
}

/** A run that never called anything, because it was only asked to plan. */
export const PLAN_ONLY: RunOutcome = { since: null, ran: 0, failed: 0 }

export interface RunPartition<T> {
  /** Written at or after `since` — this run's own output. */
  fresh: T[]
  /** Already in the tables when the run began. */
  prior: T[]
}

/**
 * Split rows into what this run wrote and what preceded it.
 *
 * On a plan-only run everything is `prior` by definition: nothing was called, so
 * nothing below can be attributed to it.
 */
export function partitionByRun<T>(rows: readonly T[], outcome: RunOutcome, createdAt: (row: T) => string): RunPartition<T> {
  if (outcome.since === null) return { fresh: [], prior: [...rows] }
  const fresh: T[] = []
  const prior: T[] = []
  for (const r of rows) (createdAt(r) >= outcome.since ? fresh : prior).push(r)
  return { fresh, prior }
}

/**
 * The sentence above a report's table. **Never silent about which state it is in.**
 *
 * `noun` names what is being counted — *labels*, *objects* — so the caller's
 * vocabulary reaches the reader rather than this module's.
 */
export function describeRun(outcome: RunOutcome, part: RunPartition<unknown>, noun: string): string {
  const { fresh, prior } = part
  const total = fresh.length + prior.length

  // 1 · No call was made. Everything shown predates this invocation.
  if (outcome.since === null) {
    return total === 0
      ? `\nNothing was called, and no ${noun} are stored for this import. ` +
        `That is the state of the tables, not a result — nothing ran.\n`
      : `\n⚑ Nothing was called. All ${total} ${noun} below were already stored ` +
        `before this invocation; none is a result of it.\n`
  }

  // 2 · Calls were made and every one failed. The loudest case, and the one that
  //     printed a confident table.
  if (fresh.length === 0 && outcome.failed > 0) {
    return `\n⚑ THIS RUN PRODUCED NOTHING. ${outcome.failed} call(s) failed and ${outcome.ran} completed.\n` +
      (total === 0
        ? `  No ${noun} are stored for this import at all.\n`
        : `  The ${total} ${noun} below were already there before this run started. ` +
          `Nothing below is evidence that this run worked.\n`)
  }

  // 3 · Calls were made and produced nothing, without failing. Rare and real —
  //     a pass can legitimately find nothing.
  if (fresh.length === 0) {
    return `\n${outcome.ran} call(s) completed and produced no new ${noun}. ` +
      `${total === 0 ? `None are stored for this import.` : `The ${total} below predate this run.`}\n` +
      `  A pass that ran and found nothing is not a pass that did not run.\n`
  }

  // 4 · This run wrote something.
  return `\n${fresh.length} of the ${total} ${noun} below were written by this run` +
    `${outcome.failed > 0 ? `, and ${outcome.failed} call(s) failed` : ''}.` +
    `${prior.length > 0 ? ` The other ${prior.length} were already stored.` : ''}\n`
}
