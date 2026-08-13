/**
 * Which pass wrote a row in `objects` — the lane, and the discipline around it.
 *
 * ---
 *
 * ## The failure this file exists to stop repeating
 *
 * **`objects` holds the output of more than one pass.** Amendment 11's pass 3
 * writes `derived_from` — `plate` or `appearance`. The retired identification
 * pass wrote nothing there, and it still runs on demand. So a read of `objects`
 * that says nothing about lanes returns *both passes' answers to the same
 * question*, and whatever the consumer does with them is a number naming
 * neither.
 *
 * That has now happened twice. The score was caught in August and fixed with
 * `splitByPass`; the roadmap then recorded the danger as closed — **and
 * `binder.ts` was still summing both passes into "components in the house",
 * a heading in a client-facing draft.** The design session's ruling on
 * 2026-08-13 made the sweep standing rather than a one-off: *any consumer of
 * `objects` that does not filter by lane carries the same defect.*
 *
 * ⚑ **A standing action nobody can forget is a mechanism, not a reminder.** So
 * the rule is enforced in two places, because the blend can happen at two
 * layers:
 *
 * | Layer | Mechanism | Enforced by |
 * |---|---|---|
 * | SQL — a query that reads rows | `scanForUnlanedReads` | a test over the source tree |
 * | memory — a consumer holding rows | `LaneScope` is a **required** argument to `proposalsForImport` | the typechecker |
 *
 * Neither alone is enough. A SQL scan cannot see `scripts/compare.ts` handing
 * two passes to one comparison in JavaScript; a required argument cannot see a
 * hand-written `COUNT(*)` in a script.
 *
 * ## The rule, stated once
 *
 * > **Every read of `objects` either scopes itself to one lane, or carries
 * > `derived_from` out so its caller can.**
 *
 * The second half matters as much as the first and is why this is not simply
 * "always filter". `score.ts` and `proposals.ts` read every pass on purpose —
 * and are correct, because they carry the lane and split on it downstream.
 * *Blending is the defect; reading widely is not.* A read that does neither is
 * the only shape that cannot be audited: rows whose pass nobody can tell apart.
 */

import type { PassName } from './score.js'

/**
 * How much of `objects` a reader wants, stated rather than defaulted.
 *
 * ⚑ **The two pass names are `score.ts`'s own** — imported, not restated. Four
 * separate rule-numbering schemes have already cost this project a withdrawn
 * correction; a second lane vocabulary would be the same mistake one layer down.
 *
 * `every-pass` is the honest escape hatch and it is deliberately wordy. It says
 * *I am taking both passes and I will separate them myself*, which is true of
 * the score and the fixture writer and is a promise the reader is making. A
 * consumer that means "all the objects" and writes this without splitting has
 * written the defect in a form somebody can find by grepping one word.
 */
export type LaneScope = PassName | 'every-pass'

/**
 * The SQL predicate for a scope. Always mentions the column, including for
 * `every-pass` — so the scan below reads the query and sees a deliberate choice
 * rather than an omission.
 */
export function laneClause(scope: LaneScope, table = ''): string {
  const col = `${table ? `${table}.` : ''}derived_from`
  switch (scope) {
    case 'match':
      return `${col} IS NOT NULL`
    case 'identify':
      return `${col} IS NULL`
    case 'every-pass':
      // Null-safe and always true in SQLite. The point is not the filtering —
      // it is that the query text names the column, so a reader of the SQL can
      // see that both passes were taken on purpose.
      return `${col} IS ${col}`
  }
}

/** Human words for a scope, for the line of a report that names its lane. */
export const laneLabel: Record<LaneScope, string> = {
  match: "Amendment 11 pass 3 — match and complete (`plate` and `appearance`)",
  identify: 'the retired identification pass (stage 4, no lane)',
  'every-pass': 'every pass that wrote objects, separated downstream',
}

// --------------------------------------------------------------- the scan

/** One source file, as text. The scan is pure so it can be tested on both answers. */
export interface SourceFile {
  path: string
  text: string
}

export interface UnlanedRead {
  path: string
  /** 1-indexed, so the finding is clickable. */
  line: number
  /** The query as far as the scan could read it — enough to recognise it. */
  query: string
}

/**
 * Reads of `objects` that neither scope by lane nor carry it out.
 *
 * **Deliberately crude.** It finds `FROM objects`, walks to the end of the
 * enclosing string literal, and asks whether `derived_from` appears anywhere in
 * that query. It is not a SQL parser and must never become one: a check nobody
 * can read in ten seconds is a check people route around.
 *
 * Two consequences of the crudeness, both stated rather than hidden:
 *
 * - **It will not see a lane predicate built somewhere else and interpolated in**
 *   under a name that does not contain `derived_from`. `laneClause` always names
 *   the column for exactly this reason.
 * - **It cannot see the memory-layer blend at all.** That is `LaneScope`'s job.
 */
export function scanForUnlanedReads(
  files: readonly SourceFile[],
  exempt: ReadonlyMap<string, string> = LANE_EXEMPT,
): UnlanedRead[] {
  const out: UnlanedRead[] = []
  for (const file of files) {
    if (exempt.has(file.path)) continue
    // ⚑ **Comments out first — prose in a header is not an implementation.**
    // The scan's own doc comment above contains the words it searches for, and
    // the first run of this check flagged `lanes.ts` itself. *Exempting the
    // rule's own home would have been the wrong fix*: this repo's §15 was
    // derived by stripping comments for exactly this reason, and every file
    // that argues about the defect would otherwise have to be parked.
    const code = stripComments(file.text)
    const re = /\bFROM\s+objects\b/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(code)) !== null) {
      const query = queryAround(code, m.index)
      if (/derived_from/i.test(query)) continue
      out.push({
        path: file.path,
        line: code.slice(0, m.index).split('\n').length,
        query: query.replace(/\s+/g, ' ').trim().slice(0, 160),
      })
    }
  }
  return out
}

/**
 * Comments blanked, everything else left exactly where it was.
 *
 * **Blanked rather than removed**, so byte offsets and line numbers survive and
 * a finding still points at the line a person can open.
 *
 * A state machine rather than two regexes, because the shortcut fails in the
 * direction that matters: `'https://…'` inside a string would end the line at
 * `//`, and any SQL after it would go **unscanned and unreported.** *A scanner
 * with false negatives is worse than none — it is the clean sweep that was not
 * one.*
 */
export function stripComments(text: string): string {
  const out: string[] = []
  let i = 0
  let quote = ''
  while (i < text.length) {
    const c = text[i]!
    const next = text[i + 1]
    if (quote) {
      if (c === '\\') {
        out.push(c, next ?? '')
        i += 2
        continue
      }
      if (c === quote) quote = ''
      out.push(c)
      i++
      continue
    }
    if (c === '`' || c === "'" || c === '"') {
      quote = c
      out.push(c)
      i++
      continue
    }
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') {
        out.push(' ')
        i++
      }
      continue
    }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      for (; i < stop; i++) out.push(text[i] === '\n' ? '\n' : ' ')
      continue
    }
    out.push(c)
    i++
  }
  return out.join('')
}

/**
 * The enclosing string literal, as best as can be told without parsing.
 *
 * Backwards to the nearest quote character, forwards to the next one of the same
 * kind. Every SQL string in this repo is a single backtick or single-quoted
 * literal, and a query that is neither will simply be read to the end of the
 * fallback window rather than misreported.
 */
function queryAround(text: string, at: number): string {
  const OPENERS = ['`', "'", '"']
  let start = -1
  let quote = ''
  for (let i = at; i >= 0 && at - i < 400; i--) {
    if (OPENERS.includes(text[i]!)) {
      start = i
      quote = text[i]!
      break
    }
  }
  if (start === -1) return text.slice(at, at + 400)
  const end = text.indexOf(quote, at)
  return text.slice(start + 1, end === -1 ? Math.min(text.length, at + 400) : end)
}

/**
 * Reads that cannot blend two passes, with the reason each is safe.
 *
 * ⚑ **A path goes in here with a sentence, never on its own.** An allow-list of
 * bare filenames is how a real defect gets parked: the next reader cannot tell
 * an argued exemption from one somebody added to make the suite green.
 */
export const LANE_EXEMPT: ReadonlyMap<string, string> = new Map([
  [
    'server/src/engine/confirm.ts',
    'Keyed on a single `objects.id` a human picked. One row, one lane, and the ' +
      'human is looking at the object they chose — there is nothing to blend.',
  ],
])
