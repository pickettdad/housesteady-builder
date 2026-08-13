# The first real pass-3 run · four defects fixed · and the harness cannot see the lane that worked

**Date:** 2026-08-13 · **Record of an event. This date never moves.**
**Answers:** the runner session's report of 2026-08-13, and the deletion condition it was run for.
**Method:** the runner's numbers were reproduced here from the committed proposals fixture before anything was concluded from them. Every defect below is a test.

**Headline: `$0.38`, 11 calls, 80 proposals, and a score of `correct: 1` that is a fact about the matcher rather than about the room — the plate lane read three model numbers exactly and two more within one character, and scored zero. Three defects the runner found are fixed, a fourth was found in the fixture, and the two questions left are the owner's.**

---

## 1 · What it cost, because that is the number this run was for

**`$0.3808` across 11 calls**, against a `$5.00` cap that never came close.

| pass | calls | input | output | cost |
|---|---:|---:|---:|---:|
| read | 6 | 116,299 | 15,626 | $0.1944 |
| resolve | 2 | 9,783 | 2,798 | $0.0238 |
| match | 3 | 118,212 | 8,872 | $0.1626 |
| **total** | **11** | **244,294** | **27,296** | **$0.3808** |

**Pass 1 ran ~1,765 input tokens per photograph** — close to CLAUDE.md §9's measured 1,591, which it now corroborates on a second run rather than replacing.

⚑ **Pass 3 costs about as much again as pass 1**, because it re-sends the photographs carrying the class frame and the scaffold. **That is new and it doubles the arithmetic in §9**, which was measured on a single pass.

⚠ **Do not project a baseline from this room.** A mechanical room is the most plate-dense room in a house. *This is an upper bound on rooms, not an average*, and the naive multiply is a number nobody has earned.

---

## 2 · Four defects. Three the runner found, one the fixture did.

### ⚑ A · `npm run score --visit` printed nothing and exited 0 — and it was mine

**The worst available failure.** The runner ran the documented command against a real house and got a clean exit and an empty screen.

`scripts/score.ts` built its proposals on the last line and **fell off the end of the file.** I moved the reporting into a function on 2026-08-12 to add the `--proposals` branch, wired that branch, and **never re-ran the branch I had not just written.**

> **Why no test caught it:** every test the harness had called `scoreRun` directly. The engine was covered from four angles and **nothing ran the script**, so a script that never calls the engine was invisible to all of them. `score-pipeline.test.ts` even reads this script's source text — and read the *matcher* out of it while the control flow underneath went untested.
>
> ⚑ **The general form is worth more than the fix: a test that imports what a command uses is not a test of the command.**

**Fixed, and `test/score-script.test.ts` now spawns the script as a process** on both paths. Confirmed by restoring the defect: the suite fails.

**Second, smaller, same class:** `--key` and `--proposals` resolved relative paths against `server/`, because that is where `npm run` puts you. Both now resolve against `INIT_CWD` — where the caller was actually standing.

### ⚑ B · `npm run smoke` failed, and pass 1 was not the reason

The runner's diagnosis is exactly right and they proved it rather than inferring it.

`claimNext` orders by `created_at, id` and **says nothing about task.** Smoke queued 3 identification jobs, drained **one**, queued 2 read jobs, and drained **one** — which claimed a *leftover identification job*. `ran` was 1, the guard passed, and the assertion on `ai_generations WHERE task='read_surfaces'` then found nothing.

**So it reported "pass 1 recorded no generation" for a pass 1 that had never been asked to run** — at the one moment the answer mattered.

**Fixed by giving `claimNext` and `drainVisit` an optional `task`**, which smoke now passes. *Draining fully instead would also have worked and would have cost three more calls every time somebody proves their key is valid.*

### ⚑ C · Stranded queries — a retry grows the plan and the plan's own ids swallow it

**The subtlest one, and it silently truncated the scaffold in the run we just paid for.**

A job's target id is its **position** — `queries#1`, `queries#2`. When the runner retried the truncated pass-1 batch, pass 2 re-planned **45** queries where the completed jobs had covered **35**. The extra ten fell inside batches whose jobs were already `done`, `enqueue` is idempotent, and **pass 3's scaffold was built from 35 of 45 with nothing anywhere saying so.**

**Surfaced rather than silently fixed.** `queueResolution` now counts what the plan asks for against what pass 2 has written, and says so:

> ⚑ *10 of 45 queries are STRANDED: every batch in this plan already has a completed job, so they will never be asked. Re-run with `--again`; pass 3's scaffold is incomplete until you do.*

⚠ **The deeper fix is a content-derived target id** — same members, same id; changed members, new id. **It is not made here**, because it changes what a re-run costs and *economics is not a code session's to decide.* **Passes 1 and 3 carry the same positional shape** and would need the same change.

### ⚑ D · An object with no photograph behind it — found in the fixture

`Pressurized bladder tank isolation hardware` was written with **`mediaIds: []`**, and became the run's only false positive.

Its citations named photographs from another batch, so `evidence()` filtered them all into `strayEvidence` and the object was written with nothing behind it. **Doctrine 3 — provenance travels.** An object citing no photograph cannot be verified, cannot be scored (it can never overlap a key object by construction), and would render in a binder as a fact about the house with no evidence at all.

**Now refused into a reported `evidenceless` bucket.** *Nothing is lost — the answer is still in `strayEvidence`; it simply does not become a thing in the house.*

---

## 3 · ⚑ The score, and why `correct: 1` is a fact about the matcher

```
80 proposals against 34 confirmed objects.
  correct 1 · wrong 30 · key-uncertain 2 · plate-legibility 1 · false positives 1
    appearance   37 props   1 correct   25 wrong   2 uncert   0 legib   1 false+
    plate        43 props   0 correct   25 wrong   2 uncert   1 legib   0 false+
```

**Reproduced here from the committed fixture before being read** — which is the 2026-08-12 ruling doing the job it was built for.

**32 of 34 key objects have a proposal citing one of their photographs.** Only the two flow-centre circulators were never pictured. ⚑ **`missed: 2` is the honest failure count**, and it is a capture finding rather than a model one.

### The plate lane worked and scored zero

| key model | nearest read | |
|---|---|---|
| `TTV049BGC01ARKS` | `TTV049BGC01ARKS` | **exact** |
| `DMF150` | `DMF150` | **exact** |
| `45MHP2` | `45MHP2` | **exact** |
| `G9-50SDE-30 250` | `G9-50SDE-30` | **exact core**, suffix absent |
| `UP26-99F` | `UP28-99F` | **one character** |
| `UPS26-99U` | `UP826-990` | **two characters** |
| `UT-450 CE` | `UT-150 CE` · `UT-60 CE` | ⚠ **wrong, twice, differently** |

**The plate lane scored 0 correct out of 43 proposals.** Not because it was wrong — **because the key records what a thing is *for* and the plate lane names what it *is*, and `matches()` requires every significant word of the role to appear in the label.**

> *"main geothermal heating/cooling unit"* can only be matched by a label containing **all** of `main, geothermal, heating, cooling, unit`. **Nothing sane ever will.**

**`score.ts`'s own header argues for role-based keys deliberately**, and the argument is good: a key recording only the product would score the GSW water heater correct and lose that its breaker is off on purpose. ⚑ **This run is the cost of that choice landing entirely on the lane doing the most reliable work** — which is the argument the matcher's docstring says must be made before anything cleverer is built. **It is now made, with evidence, and the decision is the owner's.**

### And rule 6 could not fire, for a plumbing reason

**`models[]` is populated on 22 of 80 proposals**, and rule 6 reads it to decide *plate legibility rather than engine error*. **But pass 3 writes its model reading into the LABEL**, so `UP28-99F` against `UP26-99F` — one character, exactly what rule 6 exists for — **scored `wrong`.** The rule fired once in a run containing at least two of its cases.

**Not fixed here.** Reading model-shaped tokens out of a label changes scoring semantics, and that is a decision rather than a repair.

---

## 4 · What the run says about the passes themselves

**The reverse osmosis is gone.** v1 §5a asked whether the invented RO persists. **There is no RO proposal anywhere.**

**The Vanée is still tripled** — `Van Ee 700 energy recovery ventilator` ×2 and `vänEE 100H ducted heat recovery ventilator` ×1 for one unit. **The 100H read is correct and correctly an HRV**, which is a real improvement on the earlier run's *"Water treatment system"*.

### ⚑ And the duplicate-evidence answer is the unwelcome one

**16 labels are duplicated across 80 proposals. Zero of the duplicate pairs share a photograph.**

v1 §7.6 called this decisive and said empty *"is the answer that makes the cheap path impossible."* **It is empty.** These are not one photograph read twice — they are **the same equipment photographed from different angles landing in different read batches**, each proposing independently.

**A dedup pass keyed on shared evidence would catch none of them.** That is a different mechanism from the four-pressure-tanks-in-one-batch problem and it needs a different fix.

**Related, and the runner spotted it:** `models` bleeds across objects within a photograph — *"Fire extinguisher (red cylinder)"* carries `TTV049BGC01ARKS`. **Harmless if `models` means *plate models visible in the cited photographs*; misleading if anything downstream reads it as the object's own model.** Nothing does today.

---

## 5 · Housekeeping, and one thing that got better on its own

**`drive.usercontent.google.com` answered 404, not 403.** ⚑ **v1 §2b's Blocker 1 is gone** — plain `curl` to disk worked and the connector was never involved.

**The import was textbook:** `ok_with_warnings`, both expected warnings, and **exactly three** unrecognized vocabulary words — which is the real export rather than the four-word fixture, exactly as v1 §3 said it would be.

**The runner touched nothing.** `git status` clean, no commits, no tracked file edited — and they reported two defects rather than fixing them, which is §8 working.

⚑ **And the single most reassuring result in the run:** proposal `082d298f` is labelled *"Pressure test documentation tag"* — **the exact photograph that carries a real street address, a contractor's name and phone, a registration number and a fitter's licence number. Pass 3 identified the tag as an object and transcribed none of its contents.**

---

**1176 tests green** (was 1167), typecheck green. **The proposals fixture is committed** at `fixtures/proposals/mechanical-room_pass3_2026-08-13.json` — scan clean, all 80 labels read by the runner and again here. *From now on the harness is fixable and re-runnable against a real run with no photographs, no key and no database.*
