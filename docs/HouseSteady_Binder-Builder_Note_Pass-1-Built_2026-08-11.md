# Pass 1 is built · the directed-frame arithmetic holds · §3 verified · and my canvas sentence was wrong

**Date:** 2026-08-11 · **Record of an event. This date never moves.**
**Answers:** Amendment 11 pass 1, built · the timestamp-directed frame extraction, costed against §C1 at source · §3 verified at the 08-11 cut · #118's exact filenames · and a correction that is mine.
**Method:** §C1's arithmetic re-read from Amendment 10 rather than from the cut that restates it; every §3 count derived by running against the file.

**Headline: pass 1 lands with three things that were dead until it did · the directed-frame ruling holds and is better than "cheap" suggests, but the bracket width is the unmeasured variable and measuring it is free · §C1's two numbers were both three times high and its conclusion was exactly right, because a ratio survives a scale error · §3 needs four rows changed · and the canvas sentence in my 08-11 reply was wrong in both halves.**

---

## 1 · Pass 1 · Read — built

`npm run read -- --visit <id> [--zone mechanical] [--run --owner-property]`

**What it emits is `{ field, value, surface }`, and what it can emit is enforced by the schema rather than by the prompt.** There is no `label`, no `classId`, no `whatItIs` — **an instruction is a request; a missing field is a wall** — and that absence is itself a test, so anyone adding one has to argue for it.

### The three things that were dead until this landed

| | now |
|---|---|
| the readings table | **exists, with content.** `readings` + `reading_fields` |
| rule 6's legibility bucket | **has a model string to read.** `npm run score` now takes plate models from pass 1 rather than passing `null` |
| pass 2 | **has something to look up** — and the report prints exactly that list: *this is what pass 2 looks up* |

### ⚑ One shape decision beyond the amendment, and a measured failure is why

**The amendment's unit is `{ field, value, surface }`. I stored a level between the photograph and the field: the LABEL.**

A photograph holds zero or more labels; a label has one surface; a label holds zero or more fields. **A `reading_fields` row joined to its `readings` row is still exactly the amendment's triple** — the label is the grouping, not a replacement.

**The flat triple survives the NextEnergy case and fails the other one.** A ClimateMaster plate and a NextEnergy decal in one frame are separable by surface alone. **`UP26-99F` and `UPS26-99U` are not** — one photograph, two pump nameplates at an angle, and **both are `nameplate`**, so flat they are indistinguishable from one plate read twice that disagreed with itself. **That is precisely the difference between two pumps and a legibility problem, which is the question rule 6 exists to answer.**

**And a label with no fields is the point rather than an empty row.** *There is a plate here and I cannot read it* says **reshoot this** — a capture finding, and only expressible because the label exists independently of its cells.

### N/A has three states and they never collapse

```
value 'N/A',  unreadable 0   ->  the cell says N/A. A fact about the product.
value '',     unreadable 1   ->  the field is named and its value is illegible.
no row at all                ->  the label does not carry that field.
```

**The WellMate is the first two in one plate.** `Factory Precharge pressure: N/A` and `N/A` across all three drawdown columns is the strongest negative evidence that label carries, and it only survives because pass 1 emits fields — **an empty cell has no text to carry it through a flattening.**

### The manufacturer rule is executable, not advisory

`adjudicateManufacturer` — four outcomes, three of which assert nothing:

| what was read | asserted |
|---|---|
| nothing | null |
| claims, none from a nameplate | **null** — the rule, and the NextEnergy case |
| exactly one nameplate answer | that answer; every other claim **retained beside it** |
| nameplates that disagree | **null** — an unresolved conflict, stated |

**I built the reader rather than only the field, and the reason is #68.** A `surface` column with nothing reading it would be the **thirteenth** instance of the declared-and-unconsumed class in this repo. **It is not the destination columns** — those stay unbuilt per #121, because a destination with no content is a column that drifts.

### ⚑ Fail-open on surfaces, and why that is safe here

A surface is a fact about a photograph, not a choice from our taxonomy — *cast in relief on the housing* is real and on no list — so an unrecognised word is **preserved, marked and counted**, never nulled.

**The usual danger of fail-open is that an unknown word acquires authority. It cannot here: authority belongs to exactly one word, and a new one is by construction not that word.** That is a test.

### Two operational decisions worth naming

**Twelve photographs a call, not twenty-four.** Identification *must* batch by room — the argument is accuracy. **Pass 1 has no such argument**: reading a plate needs the plate and nothing else. So its batch is sized against the only thing that constrains it, the output ceiling — a dense plate is a dozen emitted cells, and **truncation is not retryable**, so an overrun is a call paid for and discarded. **Cost of the halving: about 10% more fixed overhead. It is a guess and it says so**, and one real run corrects it from `ai_generations`.

**Not queued by an import.** Same gate as identification. Pass 1 sends less — no canvas, no wide frame — **but the gate is about whose house it is, not how wide the frame is.**

### ⚑ A defect the tests found by flaking, and it was not cosmetic

Two labels written in one transaction share `created_at` to the second, so ordering fell through to the primary key — **a uuid**. **The read order of two plates in one photograph was decided by chance**, and the test that pins it passed about half the time.

**That breaks the amendment's own join argument**: *capture sequence proposes which plates belong to which object*, and a sequence that reorders itself between reads carries no proposal at all. Fixed with an explicit `position` — `rowid` would work today and be renumbered by the next table rebuild, which migration 019 did to `objects`.

**Confirmed by restoring the defect: 5 failures in 10 runs**, which is the coin flip the shape predicts. *Rule 16 — a check whose output does not depend on what it checks is not a check.*

**And `npm run smoke` now makes a pass-1 call too**, because pass 1 is a second entry point and nothing the identification call proves covers it. *That lesson cost 529 MB and a real run once.*

---

## 2 · The directed-frame extraction — costed against §C1 at source

**First, the ruling is not an addition. It is the missing half of §C step 3.**

> §C step 3, as written: *"Dense extraction only where the transcript names something the stills cannot answer. **Triggered, never routine.**"*

**§C already ruled that extraction is triggered by the transcript and never said how a transcript points at a frame. The timestamp is the pointer.** That is a stronger position than an addition — it is the mechanism an existing rule was missing.

### ⚑ §C1's two numbers are both three times high, and its conclusion is exactly right

§C1: *"the mechanical room's 58 photographs at roughly 280,000 image tokens"* — **4,828 tokens a photograph.**
The measured rate, from the first real run: **1,591 input tokens per photograph**, 3,701 fixed per call.

**§C1's estimate predates the run and is denominated in a resolution the pipeline does not send at.** The room's 58 photographs are **≈92,000 image tokens**, not 280,000.

**And the conclusion survives untouched**, because both sides of the comparison carried the same error:

```
§C1 as written:   574,000 / 280,000 = 2.05×
re-derived:       190,920 /  92,278 = 2.07×
```

**A ratio survives a scale error that neither number does** — which is exactly what this register already says about video: *"ratios survive because ratios do not move — 2.5% of files, 3.7% of bytes — but the per-file figures do."* **Same rule, arriving from the cost side.**

### Does it hold? Yes, and the bracket is the variable

All figures **image tokens at the measured 1,591**, against the mechanical room's ≈92,000:

| what is sent | frames | image tokens | vs the room |
|---|---:|---:|---:|
| the room's stills, as they actually ran | 58 | 92,278 | 1.0× |
| **blind, 1 fps over two minutes** — §C1's case | 120 | 190,920 | **2.07×** |
| directed, 10 frames | 10 | 15,910 | **0.17×** |
| directed, 5 frames | 5 | 7,955 | **0.09×** |
| directed, 10 waypoints × 3-frame bracket | 30 | 47,730 | **0.52×** |

**120 blind → 10 directed is 12× fewer tokens.** With a three-frame bracket, 4×.

**On a whole baseline, which is where "prohibitive" was earned.** Take eight narrated runs on a ~0.97 M-token baseline:

| | frames | image tokens | on top of the baseline |
|---|---:|---:|---:|
| blind, 1 fps | 960 | ~1.56 M | **+161% — the video alone outweighs the house** |
| directed, 10 a run | 80 | ~157,000 | **+16%** |
| directed, 3-frame bracket | 240 | ~412,000 | **+42%** |

> **It holds. But "cheap" overstates it and "affordable" is the honest word.** A sixth again on a baseline is not a rounding error — it is a defensible line item that buys the one thing stills structurally cannot give. **What it stops being is the thing that outweighs the house.**

### ⚑ Two conditions, and the second is the one nobody has costed

**1 · It depends on a property of the transcript nobody has specified.** Timestamps — and at what grain: segment or word. **This repo's transcription is unbuilt** (`Transcription-Options`, 2026-07-29). **So the cheap-video argument silently depends on a property that is not a requirement anywhere**, which is the shape of `item.scope` (#77) and the other twelve declared-and-unconsumed instances, one step earlier: *a downstream design assuming a property nobody asked for.* **It should be written into the transcription choice before the choice is made.**

**2 · The bracket width is the whole spread between 16% and 42%, and nobody has measured it.** A concierge narrating a run says *"…and out to the house"* while already walking past it; narration usually **precedes** the pointing. So the frame at T may be a second or two early or late, and the mitigation is a bracket.

⚑ **And the measurement is free.** Frame extraction is `ffmpeg` on the owner's machine — no tokens, no API. **One narrated run, extract at each named waypoint plus one second either side, and look at them.** Counting how many frames per waypoint actually land on the thing costs nothing and settles the only number in this section that is a guess. **Do that before anyone builds the pipework.**

### And a consequence worth surfacing rather than asserting

**§C step 2 — *extract frames at a low rate, kept ordered, presented as a sequence* — may not be needed.** Its stated argument is that *consecutive frames labelled consecutive is what makes topology readable at all.* **But v1.2 §4.1b now says the transcript IS the spoken topology, and the line map is a rendering job on the graph the narration produced.**

**If the narration carries the topology, step 2's job is done by the transcript and step 3 is the only image step.** Offered, not ruled — it retires a stage, which is the design session's call and not mine.

**§C2 is answered and can close:** v1.2 §4.1b settles it — the API takes no video natively, image blocks only, an animated GIF read as its first frame. So the frame pipework is needed and steps 2 and 3 do not collapse.

**And the token ceilings stay needed.** §8's ceilings are in tokens *for exactly this reason*; at 10 directed frames a video no longer threatens one, but at a bracket over eight runs it is a real line a per-room ceiling should still see. **The addition makes video affordable, not invisible.**

---

## 3 · The canvas sentence was wrong, and it was mine

> ~~*"A sweep is better than the canvas because the canvas is a floor plan and a sweep is what the room actually looks like."*~~

**Wrong in both halves.** §4.3: **RoomPlan produces the floor plan**, which is precisely why a canvas photograph does not help with placement. **A canvas is orienting context riding every identification call** — Amendment 10 §B2, which is in this repo and which I have read — and it is read for *there are tanks along this wall*, never for plates.

**Corrected at source** in `…_Capture-Asks_Code-Reply_2026-08-11.md`, with the error kept visible.

⚑ **What is worth keeping is how it got through.** I asserted a fact about a governing document in the same turn without opening it — **rule 7, from the wrong side: a claim about a file is verified from the file, not from what I remember of it.** Every other claim in that reply was derived at source; this one was recalled, and it is the only one that was wrong. **The tell was available and I did not look for it: it is the sentence I did not run a command to check.**

*#124 now holds the real question — whether the sweep should replace the canvas rather than precede it — and I agree it should not be ruled closed. One sweep riding three calls is three canvas sends where four canvases are twelve, and a canvas is never read for plates, so it may be both better and cheaper. That is measurable and nearly free.*

---

## 4 · §3 verified at the 08-11 cut — four rows need changing

**Every count re-derived by running against the file.** ✓ = confirmed at source.

| row | verdict |
|---|---|
| `Note_Verification-Discipline` — 16 rules | ✓ **16** |
| `class-frame-v1.json` — 176 classes | ✓ **176** · envelope **17** ✓ |
| …its six counts — 73 · 166 · 55 · 37 · 5 · 45 | ✓ **all six**, and see below |
| `binder-schema-v1.json` — 41 slots, 18 labelled | ✓ **41**, ✓ **18** — observed 6 · documented 5 · reported-by-homeowner 4 · inferred 2 · measured 1 |
| `maintenance-schedule-v1.json` — v1.4.1 · 190 items | ✓ |
| `client-names-v1.json` — v1.3.1 | ✓ |
| `retirement-lineage-v1.json` — v1, zero entries | ✓ **1.0.0, 0** |
| `owner-question-wording-v1.json` — shipped empty | ✓ **`wording` is empty** |
| `profiles/baseline-v1.json` — v1.0.0 | ✓ |
| `reference/lifespans-v1` — DOES NOT EXIST | ✓ `schema/reference/` holds **one file** |
| Brand assets — 18 files | ✓ **18**, nested under `brand/assets/` |
| Walk fixture — 434,244 bytes = 434 KB decimal, 424 KiB | ✓ **434,244 exactly.** The 08-10 correction is right |
| `class-frame-content/` — nine artifacts 00–08 plus a README | ✓ **10 files** |
| **Increment 5 Build Spec — "Amendments 1–6, 8, 9, 10"** | ⚠ **STALE. Amendment 11 is on main.** *"There is no Amendment 7"* still holds ✓ |
| **`/prompts` — 8 version files across 6 tasks** | ⚠ **STALE as of this commit: 9 files across 7 tasks.** `read_surfaces/v001.md` is new |
| **`/docs/reference/` — "two files stayed"** | ⚠ **THREE stayed** — Checklist Master v1.11, the Component-Types CSV, **and the Brand Guide**, which came back on 2026-08-08 after #76 asked whether sweeping an owner-authored file was right. **The revert happened and the row did not follow it** |
| **`fixtures/room-records/`** | ⚠ **NO ROW.** Committed 2026-08-11 by the owner's ruling — #123 records the decision and §3 has no entry for the file |
| `server/src/audit/provenance.ts` — five exported functions, called by nothing but their own test | ✓ **`provenance.test.ts` is the only importer of `audit/provenance.js` in the repo.** *(A grep on the function names alone says otherwise and is wrong — `verify` and `aggregate` are ordinary words with unrelated definitions elsewhere. **Rule 15: a grep's non-zero is as ambiguous as its zero.**)* |

### ⚑ The class-frame row's six numbers answer two different questions

**All six verify, and four of them are counts of distinct vocabulary while two are counts of classes:**

| | |
|---|---|
| **73** distinct care categories | across **131** classes that declare any |
| **166** distinct inspection points | across **169** classes |
| **55** distinct opportunity conditions | across **164** classes |
| **37** distinct owner questions | across **130** classes |
| **5** distinct access events | `septic-pump-out` · `annual-combustion-service` · `chimney-sweep` · `well-pump-service` · `electrical-service` |
| **45** zero-care | **a class count** |

**Every figure is right and the cell does not say which question each answers.** `73` and `45` sit in one list and one is a vocabulary size while the other is a class tally. **This is rule 13's exact shape** — *a count states what it counts or it is two facts sharing a cell* — arriving in a row nobody had reason to doubt because all six numbers are correct.

*Suggested cell: `73 care terms · 166 inspection points · 55 opportunity conditions · 37 owner questions · 5 access events, all distinct; 45 of 176 classes declare no care.`*

---

## 5 · #118 — the exact filenames

**Eighteen created since the 08-08 cut with no §3 row, by current filename:**

```
HouseSteady_Binder-Builder_Capture-Asks_Code-Reply_2026-08-11.md
HouseSteady_Binder-Builder_Checklist-Master-v1-12_Code-Reply_2026-08-08.md
HouseSteady_Binder-Builder_Document-Register_S3-Reply_2026-08-08b.md
HouseSteady_Binder-Builder_Document-Register_S3-Verification_2026-08-08.md
HouseSteady_Binder-Builder_Note_Comparison-Pass-Scope_2026-08-09.md
HouseSteady_Binder-Builder_Note_Connective-Class-Gap_2026-08-09.md
HouseSteady_Binder-Builder_Note_First-Identification-Run_2026-08-09.md
HouseSteady_Binder-Builder_Note_Identification-Model-Call_2026-08-08.md
HouseSteady_Binder-Builder_Note_RO-False-Positive-and-Tier_2026-08-09.md
HouseSteady_Binder-Builder_Note_Reserve-Sentence-Collision_2026-08-08.md
HouseSteady_Binder-Builder_Note_Run-Defects-and-Inventory-Questions_2026-08-09.md
HouseSteady_Binder-Builder_Note_Scoring-Harness_2026-08-11.md
HouseSteady_Binder-Builder_Property-Flags-and-Session-Plan_Code-Reply_2026-08-07.md
HouseSteady_Binder-Builder_Register-06b_Code-Reply_2026-08-08.md
HouseSteady_Binder-Builder_Register-08-08g_Code-Reply_2026-08-08.md
HouseSteady_Binder-Builder_Register-2026-08-09c_S3-Verification.md
HouseSteady_Binder-Builder_Rulings-08-08c_Code-Reply_2026-08-08.md
HouseSteady_Binder-Builder_Runner-Session-Brief_2026-08-08.md
```

**Plus this note, which makes nineteen**, and **`fixtures/room-records/mechanical-room_2026-08-10.json`**, which is a file rather than a document and wants §3's fixture treatment.

**Amendment 11 is NOT in this list on purpose** — #118 names it, and it belongs in the Increment 5 Build Spec row rather than in a row of its own. *That row already lists its amendments and stops at 10.*

### ⚑ Two older ones the sweep found, and neither is from this window

```
HouseSteady_Binder-Builder_Note_CI-Starvation_2026-08-06.md
HouseSteady_Binder-Builder_Document-Register_Code-Reply_2026-08-07.md
```

**#118 asks for documents created since 08-08 and these predate it**, so they are outside the row rather than in it. Reported because the derivation that produced the eighteen is *what has no row*, not *what is new*, and it saw them on the way past.

### Two of the eighteen are still not records of an event

**Restated from the 08-11 note because neither has been ruled on.** The **Runner-Session-Brief** is a live operating document a runner executes, corrected five times, and it goes stale the way a governing document does. And **`Register-2026-08-09c_S3-Verification.md`** breaks rule 2: **its filename carries no date of its own**, only the cut it verifies. That one is mine and I would rename it `…_S3-Verification_2026-08-09.md` on a word.

---

**1061 tests green, typecheck green.** Pass 1's four passes are one of four: pass 2, 3 and 4 are unbuilt, and so are #121's destination columns and #122's image check.
