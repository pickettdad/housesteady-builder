# §3 verified at the 2026-08-09c cut — and Amendment 11 resizes stage 3 to almost nothing

**Date:** 2026-08-09 · **Record of an event. This date never moves.**
**Answers:** the explicit ask — verify §3, my section, at this cut — plus Amendment 11 §B run against my own eight, and the `/prompts` defect filed.
**Method:** every figure below re-derived from the file it describes. **Nine rows are wrong or stale; the other counts are right.**

**Headline: fourteen §3 counts re-read and eleven are correct · `424 KB` is KiB labelled KB in the file that states rule 13 · Amendment 11 §B is right and it leaves stage 3 with three objects, two of which are already-named gaps rather than identity problems.**

---

## 1 · §3 — what is wrong

| row | says | is |
|---|---|---|
| **`/prompts`** | 8 files, **5 tasks** | 8 version files across **6 tasks** — `house-style` · `identify_objects` · `nameplate_classify` · `nameplate_extract` · `photo_routing` · `pin_type`, plus a README. **`identify_objects` is the sixth**, added for §3's model call |
| **Increment 5 Build Spec** | Amendments 1–6, 8, 9, 10 | **Amendment 11 was not in the repo at all.** #108 records its home as *binder `/docs`* and it was nowhere on disk. **Landed this turn** as `…_Amendment-11_2026-08-09.md` |
| **Walk fixture** | **424 KB** | **434,244 bytes = 434 KB decimal, 424 KiB.** ⚑ **Rule 13's exact class, in the file that states rule 13** — and the same shape as the 123/117 error it was written for |
| **`/docs/reference/`** | *"Two files stayed and neither is a copy of a project-folder document"* | **Three files stayed**, and **one of them is a copy of a project-folder document** — the Brand Guide, restored on the 08-08c ruling. The row still describes the pre-restoration state |
| **`Note_Verification-Discipline`** | 16 rules | **Correct** — but rule 16 was headed `### Rule 16 ·` where 1–15 use `### N.`, so a grep for the pattern found one of sixteen. **Fixed this turn**; the count was always right |

**And thirteen documents created since the 08-08 cut have no row** — the runner brief, six notes from the identification runs, and the Code replies. *(Rule 3: this register changes when a document is created. Not mine to add; named so the count is available.)*

---

## 2 · §3 — what is right

**Re-derived, not carried forward:**

| | |
|---|---|
| `class-frame-v1.json` | **176 classes** ✓ · care 73 ✓ · inspection 166 ✓ · opportunity 55 ✓ · owner questions 37 ✓ |
| `binder-schema-v1.json` | **41 slots, 18 labelled** ✓ |
| `maintenance-schedule-v1.json` | **v1.4.1 · 190 items · 78 carry a condition · 36 distinct expressions** ✓ |
| `reference/lifespans-v1` | **still absent** ✓ — the △ is correct |
| `provenance.ts` | **still idle** ✓ — zero non-test importers |
| Brand assets | **18 files** ✓ |
| `CLAUDE.md` §11 | **reference 123 MB · walk 529 MB, decimal, unit stated** ✓ |

**Eleven of fourteen correct** — worth recording as plainly as the misses, since two cuts ago the ratio ran the other way.

---

## 3 · Amendment 11 §B, run against my own eight

**The reasoning is right and I would not have got there.** A known inventory turns *how many tanks are there* into *which of these two is in this photograph*, and **enumeration becoming matching is the whole move.** My scoping had stage 2 asking a model to compare two proposals; §B makes most of those comparisons unnecessary rather than cheaper.

**And it is stronger than "free" — it is *derived*.** Two objects binding to one resolved product are the same object by construction, no call. **The other direction is equally free and I want it named too: two objects binding to *different* products are `different` by construction.** Burcam and WellMate settle two of the four tanks without anyone looking at a photograph — which is exactly the case that a merge pass would have got *wrong*, because they look alike.

### The eight, sorted by whether binding dissolves them

| class | dissolves at binding? | why |
|---|---|---|
| `well-pressure-tank` ×4 | **yes** | Burcam 600545B and WellMate UT-450 — **two plates, so two objects and two duplicates, both derived** |
| `water-softener` ×3 | **yes** | Water Depot Platinum, plated |
| `water-heater-gas` ×2 | **yes** | and resolution kills the class too — **the house has no gas water heater** |
| `fuel-tank-propane` ×2 | **yes** | 600545B resolves to a pressure tank, not a propane tank |
| `electrical-panel` ×3 | **yes** | plated |
| **`sediment-filter` ×2** | **no** | PP20B-20 resolves to a **cartridge — a consumable.** Pass 2 removes it from the object stream entirely |
| **`appliance-water-connector` ×2** | **no** | **a connective.** No plate, and defined by what it joins |
| **`security-panel` ×2** | **no** | misclassified, and whatever it is was not read from a plate |

**Five of eight dissolve. The design session's residue is exactly right.**

### ⚑ And the residue has a shape, which is the finding

**None of the three is an identity problem.**

- **`sediment-filter` is #95** — the object channel receiving something that is not an object. Pass 2 sorts it out **before** anything needs comparing.
- **`appliance-water-connector` is #93** — the connective gap, measured at 26 classes carrying 4.3 content items against 6.9. **A connective is defined by what it connects, so it is not identifiable until its neighbours are named** — which is §B's own argument for ordering, arriving from the other end.
- **`security-panel` is a class error**, which pass 3's two-lane split addresses by marking it appearance-derived rather than by comparing it to anything.

**So stage 2 is not for duplicates. It is for unplated objects, and the unplated objects are mostly connectives** — a category the frame already under-serves and cannot currently name. **Stage 3 may not need building at all**, and I would not build it before the measurement.

### What I would still build, and it is small

**Stage 1, as ruled, and it changes shape slightly.** Its output is no longer *candidates for a comparison pass* — it is **two lists after binding**: derived-same, derived-different, and a residue. **The residue is the measurement**, and it is the number that decides whether stage 2 exists.

**The evidence-union rule applies to the derived merges too, and it is not optional there either.** A same-as derived from two objects binding to one product still unions the photographs — **if anything more strictly, because nobody looked and so nobody can notice the loss.**

---

## 4 · The `/prompts` defect — filed, and half of it turned out to already exist

**Filed as ruled: a directory where adding a file changes production behaviour is a defect**, and it is a sharp one in a system where a prompt is versioned and content-hashed everywhere else. `currentPrompt` returns the last version; a `v002.md` dropped beside `v001.md` is live on the next call with no review, no ruling and no signal. **The v002 draft was kept out by remembering, which is not a mechanism.**

**The safe place already existed and nothing said so.** `loadPrompts` reads `*.md` **only at the task-directory level and does not recurse** — so `prompts/<task>/drafts/v002.md` is invisible to it. Documented in `prompts/README.md`, **with the trap beside it: a top-level `prompts/drafts/` is not safe**, because every directory at that level is read as a task and would refuse on the first file not named `vNNN.md`.

**And the other half is now a pin.** `doctrine.test.ts` records the live version of all six tasks. **Moving a draft up fails that test until the pin is updated in the same commit** — turning *shipped by being written* into *shipped by being acknowledged*.

> **What it cannot do, stated rather than left to be found:** it cannot check that a version was *ruled on*. Nothing can. It makes going live something a person did rather than something that happened, and that is the whole claim.

**Plus a second test proving the drafts directory is actually invisible** — rule 11b, because the entire convention rests on `loadPrompts` not recursing, and that is a property of code rather than of intent.

---

## 5 · The evidence-union addition — taken, and it belongs in the schema not the prose

**Agreed without reservation, and the reason given is better than mine:** *a merge is already the invisible half of the failure.* A duplicate is visible in a list; a merge that quietly drops two photographs is visible nowhere.

**So it is not a rule the merge code remembers — it is what `object_relations` stores.** A confirmed `same-as` writes the union into the survivor's `object_media` in the same transaction that retires the loser, or the transaction does not commit. **A rule that lives in prose beside the code is the shape that produced the four no-op fixtures.**

---

**997 tests green, typecheck green.** Amendment 11 is in `/docs`. Nothing from §3 of it is built.
