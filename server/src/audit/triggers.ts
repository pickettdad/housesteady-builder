/**
 * The shared trigger evaluator.
 *
 * Spec §1: *"This is the piece with the longest reach in the whole product."* It
 * answers one question — **does X apply to this house** — for two consumers that
 * do not know about each other: binder slots (`appliesWhen`, `expectationSource`)
 * and the maintenance schedule's eighteen property triggers.
 *
 * **It knows nothing about binders or schedules, and a doctrine scan keeps it
 * that way.** The spec is explicit that the alternative is it gets built twice
 * and the two drift — and two evaluators that disagree about whether a house has
 * a well is not a bug anyone finds quickly. It would show up as a shutoff nobody
 * was asked about.
 *
 * Nothing in this file touches the database either. It takes facts and a
 * condition and returns a verdict, which is what makes it exhaustively testable
 * without an import.
 */

// ------------------------------------------------------------------ the facts

/**
 * What is true of this house, this zone, and this visit.
 *
 * **The vocabularies are separate from the values, and that separation is the
 * whole of fail-open.** `property.solar` where `solar` is a declared flag that
 * simply is not set is a confident NO. `property.geothermal`, where nothing
 * declares such a flag at all, is *the builder has not met this word* — and
 * doctrine 7 says preserve, display, count, mark unrecognised. Collapsing the
 * two would turn every vocabulary the builder has not caught up with into a
 * silent "does not apply", which is how a house stops being asked about its
 * shutoff.
 *
 * §1e.2 · **four namespaces, and `pin` is not a weaker `house`.** A pin
 * condition asks about this zone; a house condition asks about the whole visit.
 * The zone form silently under-fires a house question and the house form
 * over-fires a zone one, so they are separate sets here rather than one set with
 * a scope flag somebody has to remember to pass.
 */
export interface FactSet {
  /** `property.*` — flags true for this house. Values, not vocabulary. */
  property: ReadonlySet<string>
  /** Every `property.*` id this import's config declares. Values may be absent. */
  propertyVocabulary: ReadonlySet<string>

  /** `zone.*` — attributes true of the zone in scope. Null when visit-wide. */
  zone: ReadonlySet<string> | null
  /** Every `zone.*` id this import's config declares. */
  zoneVocabulary: ReadonlySet<string>

  /** `pin.*` — component types pinned IN THIS ZONE. Null when visit-wide. */
  pinsHere: ReadonlySet<string> | null
  /** `house.*` — component types pinned ANYWHERE in this visit. */
  pinsAnywhere: ReadonlySet<string>
  /** Every component type this import's config declares, at any of the three states. */
  componentVocabulary: ReadonlySet<string>

  /**
   * `answer.*` — recorded values, keyed by item id.
   *
   * §1f: the builder owns this class permanently, because the field app can
   * never evaluate half the inputs — a radon result arrives three months later.
   * Present in the shape so the evaluator is complete; §1f's operators land with
   * the session plan.
   */
  answers: ReadonlyMap<string, unknown>
}

/** An empty fact set. Every field explicit, so a missing one is a type error. */
export const noFacts = (): FactSet => ({
  property: new Set(),
  propertyVocabulary: new Set(),
  zone: null,
  zoneVocabulary: new Set(),
  pinsHere: null,
  pinsAnywhere: new Set(),
  componentVocabulary: new Set(),
  answers: new Map(),
})

// ------------------------------------------------------------------- the tree

export type Node =
  | { kind: 'always' }
  | { kind: 'ref'; ref: string }
  | { kind: 'any'; of: Node[] }
  | { kind: 'all'; of: Node[] }
  | { kind: 'not'; of: Node }

const NODE_KINDS = new Set(['always', 'ref', 'any', 'all', 'not'])

/**
 * Is this already a parsed tree?
 *
 * Narrow on purpose. `{kind: 'any'}` with no `of` is not a node — it is a config
 * shape that happens to share a word, and treating it as one would evaluate an
 * empty disjunction to `false` and silently drop every item behind it.
 */
const isNode = (o: Record<string, unknown>): boolean => {
  if (typeof o.kind !== 'string' || !NODE_KINDS.has(o.kind)) return false
  if (o.kind === 'always') return true
  if (o.kind === 'ref') return typeof o.ref === 'string'
  if (o.kind === 'not') return o.of !== undefined && !Array.isArray(o.of)
  return Array.isArray(o.of)
}

export class ConditionRefused extends Error {
  constructor(message: string, readonly input: string) {
    super(message)
    this.name = 'ConditionRefused'
  }
}

/**
 * Two surface forms, one tree.
 *
 * The field config writes `{ anyOf: ["property.gas", "property.propane"] }`. The
 * binder schema writes `any(property.gas, property.propane)`. **Neither notation
 * is ours to change** — one comes from the field app and the other from a
 * document the owner ratifies — so both are parsed here and reduced to the same
 * tree. One evaluator, two readers; the alternative is two evaluators, which is
 * what §1 exists to prevent.
 *
 * A malformed condition is refused loudly. Doctrine 7 is fail-open on
 * *vocabulary* and fail-closed on *structure*, and a condition nobody can parse
 * is structure.
 */
export function parseCondition(input: unknown): Node {
  if (input === null || input === undefined) return { kind: 'always' }
  if (typeof input === 'string') return parseText(input)

  if (typeof input === 'object') {
    const o = input as Record<string, unknown>
    // Already a tree. Parsing is idempotent so a caller that composed a
    // condition (see composeGate) can hand the result straight to evaluate
    // without the two having to agree on which stage they are at.
    if (isNode(o)) return o as unknown as Node

    // The config's shape. `anyOf` is the only one v1.2 uses; the rest are
    // accepted because the grammar declares them and a newer config may.
    if (Array.isArray(o.anyOf)) return { kind: 'any', of: o.anyOf.map(parseCondition) }
    if (Array.isArray(o.allOf)) return { kind: 'all', of: o.allOf.map(parseCondition) }
    if (o.not !== undefined) return { kind: 'not', of: parseCondition(o.not) }
  }

  throw new ConditionRefused(
    `A condition must be a flag id, "always", or one of any/all/not — got ${JSON.stringify(input)}.`,
    JSON.stringify(input),
  )
}

/**
 * `any(a, b)` · `all(a, not(b))` · `property.gas` · `always`.
 *
 * A real tokenizer rather than a regex, deliberately. A regex over
 * `any(a, all(b, c))` splits on the wrong comma, and the failure is silent —
 * it produces a condition that evaluates and is wrong. Locate every boundary;
 * never assume one.
 */
function parseText(raw: string): Node {
  const text = raw.trim()
  if (text === '') throw new ConditionRefused('An empty condition is not "always" — say which you mean.', raw)

  let at = 0
  const skip = () => { while (at < text.length && /\s/.test(text[at]!)) at++ }

  const parseNode = (): Node => {
    skip()
    const start = at
    while (at < text.length && !'(),'.includes(text[at]!)) at++
    const word = text.slice(start, at).trim()

    skip()
    if (text[at] === '(') {
      at++ // the paren
      const args: Node[] = []
      skip()
      // `any()` with nothing in it is a condition that cannot be evaluated
      // either way, which is a structural error rather than a vacuous truth.
      if (text[at] === ')') throw new ConditionRefused(`"${word}()" has no operands.`, raw)
      for (;;) {
        args.push(parseNode())
        skip()
        if (text[at] === ',') { at++; continue }
        if (text[at] === ')') { at++; break }
        throw new ConditionRefused(`Expected "," or ")" at position ${at} of ${JSON.stringify(raw)}.`, raw)
      }
      if (word === 'any') return { kind: 'any', of: args }
      if (word === 'all') return { kind: 'all', of: args }
      if (word === 'not') {
        if (args.length !== 1) throw new ConditionRefused('not(...) takes exactly one operand.', raw)
        return { kind: 'not', of: args[0]! }
      }
      throw new ConditionRefused(`"${word}" is not an operator. The grammar is any, all, not.`, raw)
    }

    if (word === '' ) throw new ConditionRefused(`Missing operand in ${JSON.stringify(raw)}.`, raw)
    if (word === 'always') return { kind: 'always' }
    return { kind: 'ref', ref: word }
  }

  const node = parseNode()
  skip()
  if (at !== text.length) {
    throw new ConditionRefused(`Trailing input after the condition: ${JSON.stringify(text.slice(at))}.`, raw)
  }
  return node
}

// -------------------------------------------------------------- the evaluation

/**
 * Three-valued, because two values cannot express "I have not met this word".
 *
 * The alternative — resolve every unrecognised leaf to `true` on the spot — gets
 * `not(...)` exactly backwards: `not(property.geothermal)` would become
 * *definitely does not apply* and quietly EXCLUDE an item, which is the failure
 * fail-open exists to prevent. So unknown propagates as unknown and is resolved
 * once, at the top, in the direction the spec names: *wrongly excluding a
 * shutoff is worse than wrongly asking about one.*
 */
type Tri = true | false | 'unknown'

export interface Verdict {
  /** Fail open: an unresolvable condition applies. */
  applies: boolean
  /** False when something in the condition was not recognised. */
  certain: boolean
  /** Every id the vocabulary did not declare. Named, never just counted. */
  unrecognised: string[]
  /** Every id that was recognised and consulted, for the explicability record. */
  consulted: string[]
}

export function evaluate(condition: unknown, facts: FactSet): Verdict {
  const node = parseCondition(condition)
  const unrecognised: string[] = []
  const consulted: string[] = []

  const walk = (n: Node): Tri => {
    switch (n.kind) {
      case 'always':
        return true
      case 'ref':
        return lookup(n.ref, facts, unrecognised, consulted)
      case 'not': {
        const v = walk(n.of)
        return v === 'unknown' ? 'unknown' : !v
      }
      case 'any': {
        const vs = n.of.map(walk)
        if (vs.includes(true)) return true
        return vs.includes('unknown') ? 'unknown' : false
      }
      case 'all': {
        const vs = n.of.map(walk)
        if (vs.includes(false)) return false
        return vs.includes('unknown') ? 'unknown' : true
      }
    }
  }

  const value = walk(node)
  return {
    applies: value !== false,
    certain: value !== 'unknown',
    unrecognised: [...new Set(unrecognised)].sort(),
    consulted: [...new Set(consulted)].sort(),
  }
}

/**
 * One reference, in one namespace.
 *
 * Everything interesting is the difference between *declared and false* and
 * *never declared*. A bare id with no namespace is not guessed at — a config
 * that writes `gas` where it means `property.gas` is a config to fix, and
 * quietly picking a namespace for it is how the zone form of a house question
 * gets accepted without anyone noticing.
 */
function lookup(ref: string, facts: FactSet, unrecognised: string[], consulted: string[]): Tri {
  const dot = ref.indexOf('.')
  if (dot < 0) {
    unrecognised.push(ref)
    return 'unknown'
  }
  const namespace = ref.slice(0, dot)
  const name = ref.slice(dot + 1)

  const answer = (declared: boolean, held: boolean): Tri => {
    if (!declared) { unrecognised.push(ref); return 'unknown' }
    consulted.push(ref)
    return held
  }

  switch (namespace) {
    case 'property':
      return answer(facts.propertyVocabulary.has(name), facts.property.has(name))

    case 'zone':
      // A zone condition evaluated with no zone in scope is not false — there is
      // simply no zone to ask. Answering `false` would silently drop every
      // zone-conditioned item from a visit-wide evaluation.
      if (facts.zone === null) { unrecognised.push(ref); return 'unknown' }
      return answer(facts.zoneVocabulary.has(name), facts.zone.has(name))

    case 'pin':
      // Strictly zone-scoped — §1e.2. The field validator rejects it at session
      // scope, and so does this.
      if (facts.pinsHere === null) { unrecognised.push(ref); return 'unknown' }
      return answer(facts.componentVocabulary.has(name), facts.pinsHere.has(name))

    case 'house':
      return answer(facts.componentVocabulary.has(name), facts.pinsAnywhere.has(name))

    case 'answer':
      // §1f. The comparison operators land with the session plan; a bare
      // reference with no value recorded yet is honestly unknown, not false.
      if (!facts.answers.has(name)) { unrecognised.push(ref); return 'unknown' }
      consulted.push(ref)
      return Boolean(facts.answers.get(name))

    default:
      unrecognised.push(ref)
      return 'unknown'
  }
}

/**
 * `allOf(list gate, item trigger)` — §1e.1.
 *
 * A list heading may carry `— gated on <ref>`, conditioning every item in it,
 * and an item may carry its own trigger as well. **Evaluating the gate alone
 * fires every Fuel item in every zone of every house**; evaluating the item
 * alone ignores the heading. The composition is `all`, and it is here rather
 * than at each call site so there is one place for it to be right.
 */
export const composeGate = (gate: unknown, itemTrigger: unknown): Node => {
  const parts: Node[] = []
  if (gate !== null && gate !== undefined) parts.push(parseCondition(gate))
  if (itemTrigger !== null && itemTrigger !== undefined) parts.push(parseCondition(itemTrigger))
  if (parts.length === 0) return { kind: 'always' }
  if (parts.length === 1) return parts[0]!
  return { kind: 'all', of: parts }
}
