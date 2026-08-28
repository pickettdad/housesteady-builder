# Binder audit — 2026-08-26

**Run `wf_4d6ed210-c17`.** 121 agents · 10 lenses · 12.9M subagent tokens · 3h35m.

Ten independent lenses swept the repo, then two adversarial refuters attacked every deduped
finding, each defaulting to *refuted* when uncertain.

## ⚑ The accounting, corrected

The workflow reported **20 refuted**. That number is wrong and the reason is the class the audit
was hunting:

> **A dead agent was indistinguishable from a refutation.**

25 agents died on a session limit. My harness computed `survives = refuters.length < votes.length`,
so a finding whose *both* skeptics died scored zero votes and fell into the refuted bucket. Rule 33,
self-inflicted, inside the harness built to hunt it.

| | |
|---|---:|
| raw findings | 64 |
| after dedup | 55 |
| **survived** two hostile skeptics | **35** |
| refuted, with a stated reason | 8 |
| ⚑ **UNVERIFIED** — both skeptics died | **12** |

Survivors by severity: **12 high** · **6 low** · **17 medium**

## The 12 unverified — ⚑ WORKED 2026-08-28, and none of them is unknown any more

**`twelve-verified.md` in this directory carries the verdicts.** Seven confirmed, three partly, one
fixed since by PR #123, one refuted. **Nothing came back unknown and nothing was overturned by the
hostile second reader.**

⚑ **One of twelve was false**, against 8 of 55 among the findings the harness *did* verify — so the
bucket it could not read was, if anything, slightly better than the population it came from.
**Treating a dead skeptic as a refutation would have discarded eleven true things**, which is the
argument for having worked them rather than the argument for having been careful.

The list as the audit left it, kept verbatim so the verdicts can be read against what was claimed:

- `server/src/report/binderDraft.ts` — 34 of the binder schema's 41 slots have no `title`, so the draft meant for an outside reviewer heads them with raw slot ids.
- `server/src/audit/itemSeries.ts` — `itemSeries` says its purpose is "the surface that lets somebody see the break", and the surface it got is a JSON endpoint no screen calls.
- `web/src/pass/Decisions.tsx` — `PhotoTileView` calls `useState` after two early returns, so a tile that changes file status between renders crashes the pass screen.
- `server/src/engine/identify.ts` — The identification planner decides "is this a still image" from `kind`, never from `mime`, so a Field 6 floorplan/mesh capture (kind `photo`, mime `application/json`) is planned into a vision call.
- `server/src/engine/assembly.ts` — The other call planner has the same `kind`-only gate, and hands the floorplan JSON to the model as `role: 'subject'` — a thing to identify — which is the exact failure the comment eight lines above it says the role distinction exists to prevent.
- `server/src/import/vocabulary.ts` — A `capture_intent` value the builder has never met is stored and never surfaced — so `floorplan` and `mesh`, the two words Field 6 adds, arrive completely silently, contradicting both the vocabulary pass's own stated test and migration 022's own comment.
- `server/src/import/validate.ts` — `checkTotals` reconciles only the ten keys it hardcodes, so a total the export declares under any other name is never compared — `totals.videos` is declared by the real walk export and has never been checked by anything.
- `server/src/import/adapters/v3.ts` — Field 6's own contract document and example call the media array `files[]`; this repo requires `media[]` as a structural section, so if the rename is real every Field 6 export refuses — and the refusal never mentions the word `files`.
- `server/test/doctrine.test.ts` — The doctrine scan that enforces allow-list-by-kind pins `CONSUMED_KINDS`, which gates nothing that runs, and cannot reach `IMAGE_KINDS` or the three SQL `kind = 'photo'` predicates that gate every real model call.
- `server/src/engine/identify.ts` — `planIdentificationCalls` reports intent-excluded photographs as "excluded by kind", and its zero-batch sentence asserts an absence that is false; the per-row `why` reaches no reader outside tests.
- `server/src/ai/tasks/readSurfaces.ts` — Pass 1 and pass 3 discard `excluded` and `unresolved` from the plan they build on, so neither has any path to report what it did not send.
- `server/src/plan/sessionPlan.ts` — `priorUnitPhoto` — the one field in the session plan whose purpose is re-photographing from the same position — returns the most recent photograph on the pin, which its own contract forbids; the test and the doctrine scan guarding it cannot currently fail.

## Files

- `verified-findings.json` — the final result: 35 survivors with evidence, refutations, coverage notes
- `raw-findings.json` — all 64 raw findings per lens, plus 73 refuter verdicts, harvested mid-run

⚑ **Nothing here is a work order.** Each finding names file:line; check it at source before acting.
