# The scoring harness, and two numbers in the room record that need a ruling

**Date:** 2026-08-11 · **Record of an event. This date never moves.**
**Answers:** #116's six rules, built · the thirteen unrowed documents, named exactly · and two counts in Amendment 11 rev 1 that I measure differently.
**Method:** every figure re-derived from `mechanical_room_scoring_extract_corrected.json` at source.

**Headline: the harness is built and gates nothing · the key is NOT in the repository and must not be · I count 22 plate-confirmed objects where the amendment says 20, and the number pass 3's claim actually rests on is 16 — 47%, not 59%.**

---

## 1 · Where the key lives, and this is a decision rather than an omission

**The room record is not in this repository and I have not put it there.**

It is one real house's complete equipment inventory: **model numbers, eleven serial numbers, every photograph filename, and roles naming which breaker is deliberately off and why.** CLAUDE.md §14 — this repo is public, and *test data from friends' houses gets the same treatment as client data.*

**So the harness is code and is public; the house is not.** `npm run score -- --key <path>` takes the key's location as an argument, and it belongs in `/data` or outside the repo entirely. **Register #106 already reserves its home as the project folder**, which agrees.

*(`fixtures/nameplates` is committed and is the counter-example worth naming: seventeen photographs of equipment plates with no inventory, no roles and no house around them. A plate is not a house.)*

---

## 2 · Two counts I measure differently — and the second changes an argument

**Re-read from the file, not from the report of it.**

| | |
|---|---:|
| confirmed objects | **34** ✓ |
| unconfirmed | **9** ✓ |
| readings | **1** ✓ |
| distinct photographs referenced | 59 |
| **`confirmed_by.product === "plate"`** | **22 — 65%** |
| **objects carrying a `model` string** | **16 — 47%** |

**Amendment 11 §C pass 3 says *20 of 34, fifty-nine per cent*. I get neither 20 nor 59%.**

**The likeliest reconstruction, offered as a hypothesis rather than a correction:** 22 minus the two pure consumables — the softener salt and the resin cleaner — is 20. Both are `plate`-confirmed because they have a printed label, and neither is equipment. **If that is the intended set the number is right and the definition needs stating**, because *"carries a nameplate"* and *"is equipment with a nameplate"* are two counts.

### ⚑ And the number the argument actually needs is the third one

**Pass 3's claim is that plated objects *never reach an appearance decision*. That requires a lookup to be possible, and a lookup needs a model number.**

**Six of the 22 have a plate and no model string** — `QD Control Box`, `Boshart 0–100 psi pressure gauge`, `Siemens EQ Loadcentre Type 1`, the Franklin cartridge, the Riepert salt, the ResCare cleaner. **A plate reading *Siemens EQ Loadcentre, Type 1* names the maker and not the product**; pass 2 has nothing to resolve.

**So the share that can bypass appearance entirely is 16 of 34 — 47%.** Still the largest single lever in the pipeline, and still the right ordering argument. **But it is a minority of the room, not a majority**, and pass 3 should be sized against a bit under half rather than a bit under two-thirds.

*Not a correction to the amendment — three defensible numbers answer three different questions, which is rule 13's own shape. Reported so the cut can pick one and say which.*

---

## 3 · The harness — six rules, and each one is a test

**`npm run score -- --visit <id> --key <path> [--zone mechanical]`**

| rule | how it is enforced |
|---|---|
| **1 · It gates nothing** | Returns a report on total failure rather than throwing. Exit 0 unless the harness could not run at all |
| **2 · Photograph overlap, never names** | Matching is set intersection on media ids. **Tested in both directions** — a proposal whose words are nothing like the key's matches; a proposal with an identical label and no shared photograph does not |
| **3 · Three outcomes, `role: null` → key-uncertain** | Automatic, before any comparison. **The key does not know what those two vessels are for, so the engine cannot be wrong about it** |
| **4 · `confirmed_by` as the weight** | Carried onto every judgement rather than folded into a score |
| **5 · Resolvable in both directions** | `resolvableAs: ['engine-wrong', 'key-wrong']` on every disagreement **and every miss**, by construction |
| **6 · A character off is legibility** | One edit, on strings of four or more. **Tested that it does NOT swallow `UP26-99F` against `UPS26-99U`** — two edits, two real pumps, and a tolerant matcher would hide a real duplicate |

### The test that matters most

**Scoring uses `role`, and the WellMate proves why.**

The UT-450 **genuinely is** a Pentair pressure vessel. **A key recording only the product would score `well-pressure-tank` as CORRECT — validating the exact bug it was built to catch.** Its role here is a chlorine contact tank, and only the household knew.

That case is a test, and it asserts both halves: **wrong on role**, and — as the counter-check — that the same proposal *would* have passed against the product. **A harness that scored the product would be measuring whether the model can read.**

### One thing the matcher does deliberately badly

**The wording rule lives in the script, not in the engine.** Whether *"domestic hot-water tank"* answers *"first/left geothermal-connected hot-water tank"* is a judgement about English, **and a judgement buried inside a similarity function is one nobody audits.** It is a crude word-containment test, in a place a person will read it, and anything cleverer should be argued for before it is written.

### ⚠ Rule 6 has nothing to read yet

`objects` stores no model string — **that is Amendment 11 pass 1's output and pass 1 is unbuilt.** The script passes `model: null`, so the legibility bucket is always empty on a real run today. **The rule is built and tested; it activates when pass 1 does.** Said here rather than discovered as a zero.

---

## 4 · The thirteen unrowed documents — I count sixteen

**Derived from `git log --diff-filter=A` against `origin/main` since the 08-08 cut, minus every file §3 already rows.**

```
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
HouseSteady_Binder-Builder_Property-Flags-and-Session-Plan_Code-Reply_2026-08-07.md
HouseSteady_Binder-Builder_Register-06b_Code-Reply_2026-08-08.md
HouseSteady_Binder-Builder_Register-08-08g_Code-Reply_2026-08-08.md
HouseSteady_Binder-Builder_Register-2026-08-09c_S3-Verification.md
HouseSteady_Binder-Builder_Rulings-08-08c_Code-Reply_2026-08-08.md
HouseSteady_Binder-Builder_Runner-Session-Brief_2026-08-08.md
```

**Plus this note, which makes seventeen.** *(`Harvest-Verification` and `State-of-Understanding` were in the same date range and already have rows; the Brand Guide is rowed twice.)*

⚑ **Two of them are not records of an event and are the ones worth rowing first.** The **Runner-Session-Brief** is a live operating document that a runner executes and that has been corrected five times — it goes stale the way a governing document does. And **`Register-2026-08-09c_S3-Verification`** breaks rule 2: **its filename carries no date of its own**, only the cut it verifies. That is mine, and I would rename it `…_S3-Verification_2026-08-09.md`.

---

## 5 · Amendment 11 revision 1 is landed

`docs/…_Amendment-11_2026-08-10.md`, replacing the 08-09 file. **#108's row records the date as 2026-08-09 and the file is now 2026-08-10.**

**And §C pass 1's addition is the sharpest thing in the amendment.** *Read as prose, the WellMate's label says pressure tank repeatedly. Read as a table, it says the opposite.* **A field present with an `N/A` value is emitted, never dropped** — an empty cell has no text to carry it, so flattening is what destroys the evidence.

**That is the same failure this repo keeps meeting from other directions:** a count without its unit, a check whose two sides cannot disagree, an absence indistinguishable from a completion. **`N/A` in a named field is the strongest negative evidence a plate can carry, and only a shape that has fields can hold it.**

---

**1019 tests green, typecheck green.** Nothing from Amendment 11 §C is built.
