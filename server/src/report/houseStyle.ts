/**
 * The House Style lint — Increment 4 §6, gate two.
 *
 * **In the render path. Not in a test, not at author time.**
 *
 * That placement is the whole requirement and it is not a preference. A lint in
 * a test checks the sentences a test happens to build; a lint at author time
 * checks what a developer typed. **Neither sees the sentence a concierge types
 * into the editor at four o'clock on a Friday**, and that is the sentence that
 * reaches a client. So this runs on the composed document, immediately before it
 * becomes an edition, and a violation refuses the render.
 *
 * House Style §11 names exactly what is checkable, and the boundary matters as
 * much as the list: *"banned words · severity adjectives inside a finding body ·
 * the monitor rule · outcome-promise verbs · claims exceeding their label. **It
 * cannot check tone.** That stays a human read, and it's why nothing renders
 * unsigned."*
 *
 * So this is not a quality gate. It is a floor. Passing it means the document
 * contains no word we have written down as forbidden — it does not mean the
 * document is good, and the signature is what claims that.
 *
 * ---
 *
 * **Every rule here quotes the document that declares it.** A lint whose rules
 * are folk memory drifts from the standard it enforces, and then the standard
 * and the check are two authorities. Where House Style gives the reason, the
 * reason is here verbatim, because a person reading a refusal needs to know why
 * rather than which regex.
 */

export interface Violation {
  /** The rule, named for a person. */
  rule: string
  /** The word or phrase found. */
  found: string
  /** Where — the group frame, an item name, a reworded row. */
  where: string
  /** Why it is forbidden, in House Style's own words. */
  because: string
}

interface Rule {
  name: string
  pattern: RegExp
  because: string
  /** Some rules only bite in a particular position. See the monitor rule. */
  when?: (match: RegExpMatchArray, text: string) => boolean
}

/**
 * The monitor rule, which is the one that needs more than a word list.
 *
 * House Style §7: *"Monitor may take a **component, a measurement, or a
 * reading** as its object. It may never take a home, a household, a person, or
 * the service. 'Monitor the crack' is fine. 'Monitoring service', 'we monitor
 * your home', 'monitored household' are not. **We check houses, not people** —
 * and the word choice is where that either holds or quietly stops holding."*
 *
 * So the check is on the OBJECT, not on the word. A pattern that banned
 * `monitor` outright would fail the sentence the house style holds up as
 * correct.
 */
const FORBIDDEN_MONITOR_OBJECTS = /\bmonitor(?:ed|ing|s)?\b[^.!?]{0,40}?\b(home|homes|house|houses|household|households|client|clients|family|families|person|people|you|your home|service)\b/i

const RULES: Rule[] = [
  {
    name: 'the word "issue"',
    pattern: /\bissues?\b/i,
    because:
      'House Style §7 — "issue" asserts a defect. "Concern" says this was noticed and is being ' +
      'tracked: true, and claims nothing more. The concierge does not assess.',
  },
  {
    name: 'a severity adjective',
    pattern: /\b(serious|significant|major|minor|critical|urgent|severe|dangerous|hazardous)\b/i,
    because:
      'House Style §3 — every one of these is the writer\'s judgement leaking into a factual ' +
      'record. Severity is the status category, assigned once and shown in one place.',
  },
  {
    name: 'a diminisher',
    pattern: /\b(just|only|merely|nothing to worry about|no big deal|wouldn't lose sleep)\b/i,
    because:
      'House Style §8 — minimizing is the same failure as alarming, from the other side: the ' +
      'writer adding their feelings about the fact to the fact.',
  },
  {
    name: 'claiming work we did not do',
    pattern: /\bwe (fixed|repaired|replaced|installed|corrected|serviced)\b/i,
    because:
      'House Style §7 — the trade fixed it. "Coordinated", "arranged", "verified" are true; ' +
      '"we fixed it" is not, and §3 of CLAUDE.md calls overclaiming the cardinal sin.',
  },
  {
    name: 'an outcome promise',
    pattern: /\b(ensures?|guarantees?|prevents?|eliminates?|will stop|protects? against)\b/i,
    because:
      'House Style §7 — we do not promise outcomes we cannot control. "Reduces the chance of" ' +
      'and "is intended to" are what we can stand behind.',
  },
  {
    name: 'an assessment we are not licensed to make',
    pattern: /\b(code violation|non-compliant|noncompliant|unsafe|up to code|not to code)\b/i,
    because:
      'House Style §7 and CLAUDE.md §6 — compliance is an inspector\'s determination. The ' +
      'correct output is a referral, never a softened opinion.',
  },
  {
    name: 'a condition grade',
    pattern: /\bcondition\s*[::]\s*(poor|fair|good|excellent)\b/i,
    because:
      'House Style §7 and the Object/Concern Model §7 — a grade is a judgement a concierge ' +
      'cannot defend and a homeowner may act on. Checklist answers across visits tell a ' +
      'comparable story a grade cannot.',
  },
  {
    name: 'labelling a person rather than describing the situation',
    pattern: /\b(seniors?|elderly|aging in place|ageing in place)\b/i,
    because:
      'House Style §7 — describe the situation, do not label the person. "We check houses, ' +
      'not people."',
  },
  {
    name: 'the monitor rule',
    pattern: FORBIDDEN_MONITOR_OBJECTS,
    because:
      'House Style §7 — "monitor" may take a component, a measurement or a reading as its ' +
      'object. It may never take a home, a household, a person, or the service. "Monitor the ' +
      'crack" is fine; "we monitor your home" is not.',
  },
  {
    name: 'a hedge that outruns its label',
    pattern: /\b(probably|appears to be|seems to be|likely to be|might be)\b/i,
    because:
      'House Style §6 — these are usually a sign that an Inferred value is trying to pass as ' +
      'Observed. Either the evidence supports the claim or the label changes.',
  },
  {
    name: 'internal vocabulary',
    pattern: /\b(unknown-provenance|none-present|no-access|not-applicable|feedsGapList|not-reached)\b/,
    because:
      'Increment 4 §2b — a homeowner learns nothing from an enum except that we discuss their ' +
      'house in a language they do not speak.',
  },
  {
    name: 'an item id',
    pattern: /\b[a-z]{2,4}\.[a-z][a-z-]{2,}\b/,
    because:
      'Increment 4 §2b — the same rule. An id is our filing system, not a name for anything in ' +
      'their house.',
  },
]

/**
 * Lint one piece of client-facing text.
 *
 * `where` names the place for a person: *"the ensuite group's frame"*, *"a
 * reworded row"*. A refusal that says only *"the word issue appears"* sends
 * somebody scrolling.
 */
export function lint(text: string, where: string): Violation[] {
  const out: Violation[] = []
  for (const rule of RULES) {
    const match = text.match(rule.pattern)
    if (!match) continue
    if (rule.when && !rule.when(match, text)) continue
    out.push({ rule: rule.name, found: match[0], where, because: rule.because })
  }
  return out
}

/** Every rule, for anything that wants to show a person what is enforced. */
export const rules = (): { name: string; because: string }[] =>
  RULES.map((r) => ({ name: r.name, because: r.because }))

export class HouseStyleRefused extends Error {
  constructor(readonly violations: Violation[]) {
    super(
      `This cannot go to a client yet — ${violations.length} House Style violation(s): ` +
        violations.map((v) => `${v.rule} ("${v.found}") in ${v.where}`).join('; '),
    )
    this.name = 'HouseStyleRefused'
  }
}
