/**
 * Uncertainty is reported only where uncertainty exists.
 *
 * CLAUDE.md §9 says never summon a human to a blank space: where a model
 * declines to answer, it must still hand over what it could see. That rule has a
 * twin that is easy to miss and does real damage on its own — an uncertainty
 * note attached to a value that WAS read is noise, and worse than noise, because
 * it invites the reader to weigh the hedge against the reading and quietly
 * erodes trust in the confident values beside it.
 *
 * So the note travels only where the value is actually uncertain. That is one
 * rule, applied by every task that produces one, and it lives here rather than
 * being re-remembered in each of them.
 *
 * It also never becomes a value. Nothing this file returns is stored as a
 * reading; it is evidence shown beside the photograph so the person deciding
 * starts from what is known rather than from nothing.
 */

/**
 * Keep an uncertainty note, or drop it.
 *
 * @param note       what the model said it could see
 * @param uncertain  whether the value this note is about is actually unresolved
 * @param hasContent whether the note says anything — an empty one is not a note
 */
export function onlyIfUncertain<T>(
  note: T | undefined | null,
  uncertain: boolean,
  hasContent: (n: T) => boolean,
): T | undefined {
  if (note === undefined || note === null || !uncertain) return undefined
  return hasContent(note) ? note : undefined
}

/** The commonest case: the note is a sentence, and a blank one is not a note. */
export const saidSomething = (s: string): boolean => s.trim().length > 0
