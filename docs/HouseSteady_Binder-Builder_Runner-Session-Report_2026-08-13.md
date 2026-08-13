# The runner session ran twice — what it found, and what it changes in §2

**Date:** 2026-08-13 · **Record of an event. This date never moves.**
**For:** the design session, which has had no update since the runner started.
**Written by:** Builder Code. **Every number below was reproduced here from the committed fixtures before being reported** — the runner's container produced the runs; this session confirmed the numbers independently, and neither needed the other's photographs.

⚑ **Register #147 is respected: the fixture does not travel with this.** Score, lane split and spend are here. The two plate strings that appear are already in the committed room record by the owner's ruling of 2026-08-11.

**Headline: #146 is answered — pass 3 has run against a real room twice and been scored. Stage 4 can be deleted. Six defects came out of it, four of them in the instrument rather than the pass, and the first conclusion the runner sent was wrong in a way that is the most useful finding of the two runs.**

---

## 1 · What it cost, and it is the first real cost data the project has

| | calls | input | output | cost |
|---|---:|---:|---:|---:|
| **run 1** — read 6 · resolve 2 · match 3 | 11 | 244,294 | 27,296 | **$0.3808** |
| **run 2** — read 9 · resolve 4 · match 6 *(cumulative)* | 19 | 439,545 | 48,138 | **$0.6802** |

**Pass 1 measured ~1,765 input tokens per photograph**, which corroborates §9's 1,591 on a second run rather than replacing it.

⚑ **And a figure §9 does not carry: pass 3 costs about as much again as pass 1**, because it re-sends the photographs carrying the class frame and the scaffold. **The one-pass arithmetic in Roadmap §6 doubles.**

⚠ **Do not project a baseline from this.** A mechanical room is the most plate-dense room in a house — this is an upper bound on rooms, not an average.

---

## 2 · ⚑ The finding that matters most: the score fell and the pass improved

**Run 2 was the complete-scaffold run. Scored under the code of the day it produced `1 correct` against run 1's `3`, and the runner reported a regression.** It was not one.

| | run 1 | run 2 | |
|---|---:|---:|---|
| proposals | 80 | **50** | |
| **correct** | 3 | **4** | rescored under identical current code |
| wrong | 29 | **28** | |
| false positives | 1 | **0** | |
| **duplicated labels** | **16** | **1** | ⚑ |
| missed | **2** | 4 | the honest cost |

**Under the harness as it stood, a run that was better on every axis scored worse.** ⚑ *The pass was doing better work the whole time and the measurement could not see it* — the same shape as a scoring command that printed nothing and exited 0, one level in.

**What genuinely improved:** duplication is essentially solved, **16 duplicated labels to 1**. The four-pressure-tanks question closes — they are gone. False positives to zero.

**What genuinely got worse, and it is real:** run 2 proposes 50 where run 1 proposed 80, cites fewer photographs, and **four key objects go uncited instead of two.** *Conservatism costs coverage.* The four are the ground-loop makeup gauge assembly, the chlorine injection point, a replacement filter cartridge, and legacy TV/satellite distribution.

---

## 3 · Six defects. Four were in the instrument.

| | what | where |
|---|---|---|
| **1** | ⚑ **`npm run score --visit` printed nothing and exited 0.** The runner ran the documented command against a real house and got a clean exit and an empty screen | mine, from a restructure — **every test called the engine directly and nothing ran the script** |
| **2** | **`npm run smoke` blamed pass 1 for smoke's own bug.** `claimNext` ordered by time and ignored task, so a second `drain(limit: 1)` claimed a leftover job from the previous phase | found and *proved* by the runner |
| **3** | **Stranded queries.** A retried pass-1 batch grew pass 2's plan 35 → 45; the extra ten landed in batches already `done`, and **pass 3's scaffold was built from 35 of 45 with nothing saying so** | found by the runner mid-run |
| **4** | ⚑ **`--again` re-ran three other tasks' jobs.** `identify`, `read_surfaces` and `match_known` all build their target id as `zone#index`, and the re-queue filtered on neither task nor pass. **~$0.10 re-paid, readings 54 → 89** | found by the runner, **static and bounded** |
| **5** | **A re-run appends and nothing separated the runs.** Import and lane are identical across runs; a fixture written blind would have mixed 160 proposals and scored a number naming neither | found by the runner **before it cost anything** |
| **6** | **An object written with no photograph behind it** — every cited frame belonged to another batch, so it became the run's only false positive | found here, in the fixture |

**All six are fixed and under test.** ⚑ *Four of them are the instrument rather than the pass, which is the reason the fixture ruling earned itself twice in three days.*

---

## 4 · Two rules the runs added to the scoring harness

**Rule 7 · a score names the lane that earned it.** Pass 3's whole claim is that `plate` and `appearance` are different acts; one blended number cannot test it.

**Rule 8 · the key has three fields and all three are read.** The record has carried `product` and `model` beside `role` since the first day and **only `role` was ever compared**, so the plate lane scored **0 of 43** on a run where it read three model numbers exactly. Role, then product, then model — **exact only**, so a one-character miss stays rule 6's plate legibility. **Nothing was loosened; a field already in the record started being read.**

⚑ **The matched field is itself the diagnostic.** A `plate` proposal matching on **model** is right; an `appearance` proposal matching on **role** is right. Run 2's three gains are all plate-lane, all on model, and **two of the three are stranded-query products** — so the chain holds end to end: *complete scaffold → plate lane → model reading → the harness can see it.* **Each link was necessary and none scored on its own.**

---

## 5 · ⚑ Rule 2 was validated on real data, by nearly being fooled

**The strongest single result in either run, and it arrived as a correction to the runner's own report.**

A proposal carried a model reading **exactly matching** the key's chlorine contact tank. The runner flagged it as *the one known-good match the harness declines* and diagnosed a lane restriction. **There is no lane restriction.**

**The real reason is rule 2 — matching is on photograph overlap, never on names.** That proposal cites the photograph of a *different* tank and read the other one's plate out of the frame. **Nothing that actually looks at the contact tank read that model at all.**

⚑ **So it is not a known-good match. It is the third cross-object plate bleed in one run** — and **without the photograph gate, the new model rule would have credited an exactly-right number to a proposal looking at the wrong object.** *That is precisely the failure rule 2 was written to prevent, arriving through a field that did not exist when rule 2 was written, and caught anyway.*

**This is also the measurement behind §4.1a-ii.** The container fixes the duplicates and the count; **it does not fix this**, because the foreign plate is in the frame either way. What it does is make the bleed *detectable* — a grouped object can be told a plate in its frame is not its own.

---

## 6 · The duplicates finding, carried forward as ruled

**16 duplicated labels across 80 proposals in run 1, and zero of the duplicate pairs share a photograph.** Same equipment, different angles, different read batches, each proposing independently. **Evidence-based de-duplication catches none of them.**

**v002's prompt change alone took it 16 → 1**, which is a larger effect than expected from a prompt.

⚑ **No dedup mechanism has been built, by owner ruling**, on the grounds that the field app's capture-order and position data may change what is available to key on. **§4.1a-ii is the same conclusion from the capture end.**

---

## 7 · State for Roadmap §2, quoted as that section requires

**Binder** `[code, 2026-08-13]` — **1192 tests green, typecheck green. PRs #96–#111 merged.**

| # | stage | state as of today |
|---|---|---|
| 5 | pass 1 | **Done** — and has now run against real photographs twice |
| 6a | pass 2 | **Done** — and the stranded-query defect it hid is fixed |
| 6b | search + source URL | **Not started.** `Documented` still unreachable |
| **7** | **pass 3** | ⚑ **Done and scored, not "Not started".** Two real runs. *Product-image comparison, which §2 places here, is not built* |
| 8 | pass 4 — conditions | **Not started** |
| 9 | what each thing needs | **Not started** |
| 10 | the desk screen | **Not started** |
| 11 | the Home Profile | **Not started** |
| **12** | **the Home Binder** | ⚑ **Built as a draft, not "Not started".** 23 sections, 41 slots, every heading present, empties partitioned 28 gaps / 7 correctly empty / 6 out of scope — *which is exactly what §2's own Delivers column asks for* |
| 13 | the outcome log | **Not started** |
| 14 | the monthly service | **Not started** |

⚑ **And #146 closes.** Stage 4's deletion condition was *pass 3 runs against a real room and is scored.* **It has, twice.** The file comes out on the next touch, or the reason it stayed gets written down.

---

## 8 · Four things in the documents, offered as corrections

1. **Baseline Service Design v1.5's footer reads `Status: v1.4`** while its header reads v1.5.
2. **Build Roadmap's header claims two different predecessors** — *replaces the 08-11b cut* in the What-changed line, *replaces the 2026-08-10 cut, wholesale* twelve lines later.
3. **Roadmap §2's quoted binder state is three days and fifteen PRs old** — 1100 tests, #96–#99. §7 above is the replacement.
4. ⚑ **Roadmap §4 item 2 still reads *Next: the harness that scores a run against it*.** It is built, has been used four times, and has been wrong in three distinct ways since — all fixed. **That row is the one most likely to be read as current.**

---

**Not built and correctly so:** the hypothesis channel, product-image comparison, pass 4, stage 9, and any de-duplication mechanism.
