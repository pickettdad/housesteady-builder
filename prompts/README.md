# /prompts — versioned prompt config

**No prompts yet.** Increment 1 contains no AI logic. This directory and the empty
`ai_generations` table exist so the shape is settled before Increment 2 writes to it.

## The rules, which are not negotiable

**A prompt is a config file, not a string in the code.** Every prompt lives here as a
file with an `id`, a `version`, and a content hash. **No model call may ever use an
inline prompt string.** If you find yourself typing prompt text into a `.ts` file, stop —
that is the failure this directory exists to prevent.

**Every artifact records which prompt version produced it.** The `ai_generations` table
carries `prompt_id`, `prompt_version`, and `prompt_hash` on every row. This is what makes
"why does this binder read differently from that one" an answerable question rather than a
shrug.

**Changing a prompt means changing its version.** Prompts are append-only in the same
sense the manifest is: you cut a new version, you do not silently edit the old one.
Artifacts produced by v1 must remain traceable to v1's exact text.

**A golden set gates prompt changes.** Before a prompt change ships, it runs against a
fixed collection of real inputs with approved outputs, and the differences are reviewed.
Without this, a prompt edit silently changes the voice of every binder produced afterwards
and nobody notices for months. This lands with Increment 4, before the first client-facing
AI-drafted words.

**Abstention is a success, not an error.** Every extraction prompt must ask, in plain
words, for `unknown` rather than a plausible guess. `abstained = 1` is a valid outcome. A
wrong serial number is worse than a blank one — the blank gets chased, the wrong one gets
believed.

## Why this discipline

The field app renders its inspection process as versioned, content-hashed config. This is
the same discipline one level up. At one concierge the binder's voice is whatever the
concierge's voice is that day; at five, without this, clients receive documents that read
like different companies. The house style lives in these files, not in anyone's head.

See `/docs/HouseSteady_Binder-Builder_AI-Assist-Plan_v1_2026-07-25.md` for the full plan
and `CLAUDE.md` §7 for the governing doctrine.
