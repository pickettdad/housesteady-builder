/**
 * Step zero — can this machine make a model call at all?
 *
 * **Costs nothing, sends nothing, takes a second.** It exists because the
 * expensive way to discover a missing key is to move 178 MB of photographs
 * first and find out afterwards.
 *
 * ---
 *
 * ## Why this is not obvious, and why guessing was the wrong move
 *
 * A Claude Code cloud environment authenticates **its own session** through the
 * user's Anthropic account, and its settings screen warns that setting
 * `ANTHROPIC_API_KEY` will not change that. **The warning is true and it is
 * about the session, not about this program** — `identify.ts` is an ordinary
 * Node process using the SDK, and the SDK reads whatever is in its environment.
 *
 * **But "the host ignores this variable" and "the host removes this variable"
 * are different claims, and the warning does not distinguish them.** Reasoning
 * from the wording to a conclusion is exactly the shape of guess this project
 * keeps catching. So: don't reason about it, print it.
 *
 * This repo now prefers `HOUSESTEADY_ANTHROPIC_API_KEY` for that reason — a
 * name nothing else claims cannot be shadowed or stripped, and nobody setting
 * it is shown a warning that is true of something else.
 *
 *   npx tsx server/scripts/preflight.ts
 */

import { apiKey, apiKeySource, modelFor } from '../src/ai/models.js'
import { spendCapDollars } from '../src/ai/queue.js'

const tick = (ok: boolean): string => (ok ? '  ok  ' : ' MISS ')

const key = apiKey()
const source = apiKeySource()
const fast = modelFor('fast')

console.log('\nPreflight — nothing is sent and nothing is spent.\n')

// The key itself is never printed. A preflight that leaks the credential it is
// checking has traded one problem for a worse one.
console.log(
  `[${tick(Boolean(key))}] API key` +
    (key ? `        present, ${key.length} chars, from ${source}` : '        NOT SET'),
)
console.log(
  `[${tick(Boolean(fast))}] fast model` +
    (fast ? `     ${fast.id}` : `     NOT SET — set HOUSESTEADY_MODEL_FAST`),
)

if (fast) {
  const rated = fast.inputPerMTok > 0 || fast.outputPerMTok > 0
  console.log(
    `[${rated ? '  ok  ' : ' warn '}] rates` +
      (rated
        ? `          $${fast.inputPerMTok}/Mtok in, $${fast.outputPerMTok}/Mtok out — the spend cap can bite`
        : `          unset, so the $${spendCapDollars()} cap CANNOT FIRE — it is checked in dollars and every ` +
          `call costs $0.00 without rates. Use --zone and --limit as the bound.`),
  )
  console.log(`[  ok  ] image edge      ${fast.maxImageEdge} px (capped to 2000 over 20 images per call)`)
}

console.log(
  `[  ok  ] operator       ${process.env.HOUSESTEADY_OPERATOR ?? '(unset — pass --operator instead)'}`,
)

if (!key || !fast) {
  console.error(
    `\nNot ready. Both the key and the fast model are required and neither has a default.\n` +
      `Set them in the environment's own variables, then run this again BEFORE moving any photographs.\n` +
      `\n  HOUSESTEADY_ANTHROPIC_API_KEY=...   (preferred — a name nothing else claims)\n` +
      `  HOUSESTEADY_MODEL_FAST=...\n`,
  )
  process.exit(1)
}

console.log(
  `\nReady. This proves the variables reached this process — it does not prove the key is valid,\n` +
    `which the first real call is what tells you. Next: bring one small zone and import it.\n`,
)
