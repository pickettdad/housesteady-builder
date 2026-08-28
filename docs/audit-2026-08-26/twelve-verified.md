# The twelve unverified — worked, 2026-08-28

**Run `wf_19d632f0-a44`.** 20 agents · one reader and one hostile second reader per finding · 1.79M
subagent tokens · 37m. Two of the twelve had already been checked at source this week; the other ten
were read here.

Each reader was told that `UNKNOWN` and `FIXED_SINCE` are respectable answers and that a silent
verification is not a verification — which is the whole reason these twelve existed. Each second
reader was told to check that every cited line actually says what the first reader claims, on the
grounds that a fabricated or misread citation is the likeliest failure in this shape of work.

## ⚑ The result

**Nothing was overturned. Nothing came back UNKNOWN.**

| | |
|---|---:|
| **CONFIRMED** — the defect is real today | **7** |
| **PARTLY** — the defect is real, some claim around it is not | **3** |
| **FIXED_SINCE** — real, and a merged PR closed it | **1** |
| **REFUTED** — the claim is false | **1** |
| UNKNOWN | 0 |

⚑ **One of twelve was false.** Against the 8 of 55 refuted among the findings that *were* verified,
the bucket the harness could not read was, if anything, slightly better than the population it came
from. **Treating a dead skeptic as a refutation would have discarded eleven true things.**

## The twelve

| # | finding | verdict |
|---|---|---|
| 1 | `report/binderDraft.ts` — 34 of 41 slots have no `title`; the draft heads them with raw ids | **CONFIRMED** |
| 2 | `audit/itemSeries.ts` — the surface it got is a JSON endpoint no screen calls | **CONFIRMED** |
| 3 | `web/src/pass/Decisions.tsx` — `useState` after two early returns | **CONFIRMED** |
| 4 | `engine/identify.ts` — the planner gates on `kind`, never on `mime` | **PARTLY** |
| 5 | `engine/assembly.ts` — same gate, hands the row on as `role: 'subject'` | **PARTLY** |
| 6 | `import/vocabulary.ts` — an unmet `capture_intent` is stored and never surfaced | **FIXED_SINCE** — PR #123 |
| 7 | `import/validate.ts` — `checkTotals` compares only its ten hardcoded keys | **CONFIRMED** |
| 8 | `engine/identify.ts` — intent-exclusions reported as "excluded by kind"; the zero-batch sentence asserts a false absence; the per-row `why` reaches no reader | **CONFIRMED**, all three |
| 9 | `ai/tasks/readSurfaces.ts` — passes 1 and 3 drop `excluded` and `unresolved` | **CONFIRMED**, both passes |
| 10 | `plan/sessionPlan.ts` — `priorUnitPhoto` returns the newest capture on the pin | **PARTLY** |
| 11 | `import/adapters/v3.ts` — Field 6 renamed `media[]` to `files[]`, so every export refuses | **REFUTED** — the emitter has always written `media[]`; only its own doc and a hand-written fixture said otherwise |
| 12 | `test/doctrine.test.ts` — the kind scan pins `CONSUMED_KINDS` and reaches neither `IMAGE_KINDS` nor the three SQL predicates | **CONFIRMED**, and closed by PR #124 |

## Where the three PARTLY verdicts split

**4 · `identify.ts` kind-only gate.** The *mechanism* is confirmed and unchanged by #123 and #124:
the planner gates on `kind` alone, `MediaRow` carries no `mime` field at all, and the kind/mime
warning #124 added is import-time and read by nothing at plan time. ⛑ **The trigger and the
consequence are both wrong.** A Field floorplan at `application/json` does not arrive as
`kind: photo` — it arrives as `kind: voice`, because the field derives kind from mime with no
fallthrough, which is the Capture-Kind Contract Note's own finding. So the row the audit describes
cannot currently exist.

**5 · `assembly.ts` `role: 'subject'`.** The mechanical half is real and was reproduced by running
it: a planted `kind: photo` / `mime: application/json` row lands in `batches[].subjects`. **The
rhetorical half is wrong on three counts**, the first of which matters most: *nothing hands these
batches to a model.* The assembly → plan → completeness → run-record path has no model call in it.

**10 · `priorUnitPhoto`.** (a) and (b) are confirmed: the query is `ORDER BY captured_at DESC LIMIT 1`
over every capture the pin owns — no item join, no `kind` filter, no prior-visit filter — and the
contract at §6 forbids exactly that. (c) splits: **the doctrine scan measures an identifier rather
than a behaviour** — four mutants were run, and deleting the `.unit` gate entirely passes while
renaming a local variable fails — but the test, read literally, does fire on one of the wrong forms.
The conservative reading was taken.

## ⚑ Two findings the verification produced that the audit did not

Both are the same rule from the verification note: *a check whose output does not depend on what it
checks is not a check.*

- **`test/binder-draft.test.ts:121-127`** asserts `md.includes(\`**${s.title ?? s.id}**\`)` — it
  restates the implementation's own fallback. It passes identically whether a title exists or not,
  and would stay green if all 41 titles were deleted. A green check sitting on top of finding 1.
- **The doctrine scan guarding `priorUnitPhoto`** was measured against four mutants in a scratchpad:
  live passes, the `.unit` gate deleted passes, an unconditional newest-capture emit passes,
  renaming `candidates` to `cands` fails.

## What is not decided here

⛑ **Nothing in this file is a work order**, and two of the verdicts turn on decisions that are not a
code session's:

- **Finding 1's fix is a Master Spec edit.** `binderDraft.ts` states outright that it invents no
  headings and takes every one from the schema. Adding 34 titles is the owner's call. The
  tautological test is independently fixable now.
- **Finding 10's fix needs a manifest answer.** The media table carries no item link, so the
  contracted value is underivable today. The choice is between emitting `null` plus a warning, or
  routing a manifest change to the Field team — the owner's call under CLAUDE.md §2.
