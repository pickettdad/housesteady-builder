/**
 * Which model runs which tier, and what it costs.
 *
 * Spec §5: pinned model IDs in environment variables, one per tier, and no
 * auto-latest alias. An alias that silently upgrades is a behaviour change
 * nobody authorised — the golden set would start failing and the cause would
 * be invisible, because nothing in the repo changed. So the ID is config, an
 * upgrade is an edit to that config, and the golden set runs against it first.
 *
 * The doctrine scan enforces the other half: no model ID appears in source.
 *
 * TIERING IS THE WHOLE OPERATING COST. §9 of CLAUDE.md: extraction,
 * classification and transcription go to the cheap fast model, batched; only
 * client-facing prose earns the strong one. At 400–600 photos per baseline that
 * difference is not an optimisation, it is the difference between a rounding
 * error and a real bill. Increment 2b is entirely the fast tier — the strong
 * tier is declared here so the shape exists, and nothing in this increment
 * calls it.
 *
 * Rates are config for the same reason the IDs are: a hardcoded price silently
 * becomes a lie, and the per-visit figure the concierge sees is only worth
 * showing if it is true.
 */

export type Tier = 'fast' | 'strong'

export interface ModelConfig {
  tier: Tier
  /** The pinned model ID. Never a moving alias. */
  id: string
  /** USD per million input tokens. */
  inputPerMTok: number
  /** USD per million output tokens. */
  outputPerMTok: number
  /**
   * Longest image edge this model accepts, in pixels.
   *
   * Bigger images are not an error — they are silently downscaled server-side,
   * which is worse than an error, because a nameplate's small text quietly
   * stops being legible and the model abstains for a reason that has nothing to
   * do with the plate. So the builder does the downscale itself, knowingly, and
   * records what it sent.
   */
  maxImageEdge: number
  /** Output ceiling for this tier. See `modelFor` for why it is not one number. */
  maxOutputTokens: number
}

export class ModelNotConfigured extends Error {
  constructor(readonly tier: Tier, readonly variable: string) {
    super(
      `No model configured for the ${tier} tier. Set ${variable}. ` +
        `Until then AI assists stay queued and the pass works exactly as it does without them.`,
    )
    this.name = 'ModelNotConfigured'
  }
}

const num = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${name} must be a non-negative number, got ${JSON.stringify(raw)}.`)
  }
  return n
}

const VARIABLE: Record<Tier, string> = {
  fast: 'HOUSESTEADY_MODEL_FAST',
  strong: 'HOUSESTEADY_MODEL_STRONG',
}

/**
 * The model for a tier, or undefined if none is configured.
 *
 * Undefined is a normal state, not a broken one. §0.4: the pass is fully usable
 * with no API key, no network, or a failed job. Callers that need a model check
 * for it; callers that only need to know whether to queue work do not.
 */
export function modelFor(tier: Tier): ModelConfig | undefined {
  const id = process.env[VARIABLE[tier]]
  if (!id) return undefined
  const prefix = tier === 'fast' ? 'HOUSESTEADY_FAST' : 'HOUSESTEADY_STRONG'
  return {
    tier,
    id,
    inputPerMTok: num(`${prefix}_INPUT_PER_MTOK`, 0),
    outputPerMTok: num(`${prefix}_OUTPUT_PER_MTOK`, 0),
    maxImageEdge: num(`${prefix}_MAX_IMAGE_EDGE`, 1568),
    /**
     * How much room an answer gets, **per tier**, because verbosity is a
     * property of the model rather than of the question.
     *
     * **4096 was sized against the cheap tier and it is not enough for a strong
     * one.** Measured on the mechanical room 2026-08-09: Haiku answered three
     * batches in 2,185 / 2,877 / 1,507 output tokens; Sonnet overran 4,096 on
     * **all three — including the six-photograph batch Haiku finished in
     * 1,507.** Every attempt truncated, and truncation is not retryable, so the
     * strong tier could not complete a dense room at all.
     *
     * The default is therefore tier-shaped: the same 4096 on the fast tier,
     * four times that on the strong one. **A ceiling is not free** — it is the
     * cap on a runaway answer — so this is raised deliberately rather than
     * removed, and it is an environment variable because the next model's
     * verbosity is not knowable from here.
     */
    maxOutputTokens: num(`${prefix}_MAX_OUTPUT_TOKENS`, tier === 'strong' ? 16_384 : 4_096),
  }
}

export function requireModel(tier: Tier): ModelConfig {
  const m = modelFor(tier)
  if (!m) throw new ModelNotConfigured(tier, VARIABLE[tier])
  return m
}

/**
 * The API key, from our own variable first and the SDK's conventional one after.
 *
 * **`ANTHROPIC_API_KEY` is not ours.** It is the Anthropic SDK's convention and
 * it is also a name the surrounding tooling has opinions about: a Claude Code
 * cloud environment authenticates its own session through the user's account,
 * and warns — correctly — that setting this variable will not change that. The
 * warning is about the session, not about this program, but **a reader cannot
 * tell those apart from the warning alone**, and the honest fix is not to argue
 * with it.
 *
 * So this repo reads `HOUSESTEADY_ANTHROPIC_API_KEY` first. A name nothing else
 * claims cannot be shadowed, stripped or confused with the host's own auth, and
 * a person setting it is told nothing alarming and untrue.
 *
 * **`ANTHROPIC_API_KEY` still works**, because it is what every local shell and
 * every SDK example already uses, and breaking that to make a point would cost
 * more than it buys.
 */
export const apiKey = (): string | undefined =>
  process.env.HOUSESTEADY_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || undefined

/** Which variable supplied the key, for a diagnostic that has to be specific. */
export const apiKeySource = (): 'HOUSESTEADY_ANTHROPIC_API_KEY' | 'ANTHROPIC_API_KEY' | null =>
  process.env.HOUSESTEADY_ANTHROPIC_API_KEY
    ? 'HOUSESTEADY_ANTHROPIC_API_KEY'
    : process.env.ANTHROPIC_API_KEY
      ? 'ANTHROPIC_API_KEY'
      : null

/** Whether any AI work can run at all right now. */
export const aiAvailable = (): boolean => Boolean(apiKey() && modelFor('fast'))

/**
 * What a call cost, in dollars.
 *
 * Returns 0 rather than null when rates are unset, and the UI says "rates not
 * configured" rather than printing a confident $0.00. A cost of zero and an
 * unknown cost are different facts and the screen must not merge them.
 */
export const estimateCost = (m: ModelConfig, inputTokens: number, outputTokens: number): number =>
  (inputTokens / 1e6) * m.inputPerMTok + (outputTokens / 1e6) * m.outputPerMTok

export const ratesKnown = (m: ModelConfig): boolean => m.inputPerMTok > 0 || m.outputPerMTok > 0
