# The scoring harness, and two numbers in the room record that need a ruling

**Date:** 2026-08-11 · **Record of an event. This date never moves.**
**Revision 1, same day:** three corrections landed from the design session and each one reversed something below. **The superseded claims are struck rather than deleted** — §1 was wrong about whose house it is, §2's headline number measured the wrong thing, and §3's example rested on a false premise about a product. Each is marked where it stands.
**Answers:** #116's six rules, built · the thirteen unrowed documents, named exactly · and two counts in Amendment 11 rev 1 that I measure differently.
**Method:** every figure re-derived from `mechanical_room_scoring_extract_corrected.json` at source.

~~**Headline: the harness is built and gates nothing · the key is NOT in the repository and must not be · I count 22 plate-confirmed objects where the amendment says 20, and the number pass 3's claim actually rests on is 16 — 47%, not 59%.**~~

**Headline, revised: the harness is built and gates nothing · the key IS in the repository, by the owner's ruling, and is committed with this revision · 22 plate-confirmed stands and the amendment has taken it · and the 47% is withdrawn — it counted a field rather than the evidence, and the real shape is a gradient with no floor.**

---

## 1 · ~~Where the key lives, and this is a decision rather than an omission~~ → OVERTURNED. The key is committed

> ~~**The room record is not in this repository and I have not put it there.** It is one real house's complete equipment inventory: model numbers, eleven serial numbers, every photograph filename, and roles naming which breaker is deliberately off and why. CLAUDE.md §14 — this repo is public, and *test data from friends' houses gets the same treatment as client data.* **So the harness is code and is public; the house is not.**~~

**The owner ruled it in, and this revision commits it:** `fixtures/room-records/mechanical-room_2026-08-10.json`. `--key` now defaults to it.

**What the argument got wrong was whose house it is.** §14 was written about other people's homes — clients, and friends who lend a house for testing. **It never scoped the owner's own**, and I applied it to him as though it had. The reasoning was sound and the subject was wrong, which is a failure worth naming precisely: *a rule applied one step past the class it was written for reads exactly like caution.*

**And the positive reason is stronger than the absence of an objection.** Rule 5 says every disagreement must be resolvable in both directions and the correction recorded. **Git is the mechanism that records it.** A key sitting outside version control cannot show what it used to say — so the moment a scored disagreement resolves as *key-wrong*, an uncommitted key silently becomes a different key, and the run that disagreed with it is unreproducible. **The ground truth has to be under version control for rule 5 to mean anything.**

**Checked at source before committing** — six pattern classes over every field, zero hits:

| | |
|---|---:|
| street address (number + street word) | 0 |
| Canadian postal code | 0 |
| phone number | 0 |
| licence / registration word | 0 |
| email | 0 |
| Ontario place name | 0 |

**Every field the file has, counted rather than recalled** — objects carry `product · role · system · model · serial · photographs · confirmed_by` (and `proposal` on the nine unconfirmed); the single reading carries `attached_to · system · reading_type · read_from · product_reference · part_number · nominal_filtration · compatibility · photographs`. **No address field, no name field, no phone, no licence — none exists to hold one.** *(The pressure-test tag photograph carries a street address, a contractor, a phone number and two licence numbers. It is a photograph, it stays in `/data`, and none of its content reached the record.)*

⚠ **This ruling does not reach a client's room record.** Those stay in `/data`, which is gitignored and stays that way. `--key` still takes a path so the harness never assumes the committed one is the only one.

*(Register #106 reserved the record's home as the project folder. **Superseded by the owner on 2026-08-11** — #106 needs the correction, and this is where it comes from.)*

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
| objects carrying a populated `model` field | 16 |

**Amendment 11 §C pass 3 said *20 of 34, fifty-nine per cent*. ⚑ The design session has taken 22, and 22 is the number.** *(My reconstruction of 20 as "22 minus the softener salt and the resin cleaner" is therefore withdrawn as well — the two consumables count, because a consumable with a printed label is exactly as resolvable as a pump with a plate, and pass 2 sorting equipment from supplies is one of the things the lookup is for.)*

### ⚑ WITHDRAWN — the 47% counted a field, not the evidence

> ~~**Pass 3's claim is that plated objects never reach an appearance decision. That requires a lookup to be possible, and a lookup needs a model number. Six of the 22 have a plate and no model string, so the share that can bypass appearance entirely is 16 of 34 — 47%. A minority of the room, not a majority.**~~

**The design session's correction, and it is right: pass 2's input is any text that identifies a product, not a model number.** I measured how many objects populate a `model` field in one JSON record. That is a fact about the record's shape, not about what a lookup can resolve.

**The record itself disproves the claim in one row.** Of my six "plate but no model" objects, one is:

> `Franklin Water Treatment FWPS20B20 polypropylene cartridge`

**`FWPS20B20` is a part-number-shaped string sitting in the `product` field because that is where the extract happened to put it.** It is exactly the input pass 2 wants, and my count scored it as *nothing to resolve*. **A measurement that changes when someone moves a substring between two fields was never measuring the pipeline.**

**And it is a gradient, never a gate.** Pass 2 does not decline to run for want of a model number; it reports **how specific the answer was**:

| what the read carries | objects | what a lookup can return |
|---|---:|---|
| model **and** serial | **11** | the **unit** — often with its date of manufacture |
| model, no serial | **5** | the **product line** |
| brand and product name, no model field | **6** | the **family** |
| **plate-confirmed total** | **22** | **all 22 have something to resolve** |

*Siemens EQ Loadcentre, Type 1* resolves to a family of load centres rather than to a catalogue number — **and a family is a real answer.** It is enough to know the object is an electrical distribution panel and not a water treatment vessel, which is the error class pass 2 exists to kill. **Specificity degrades; the pass does not fail.**

**So 22 of 34 — 65% — is what pass 3 should be sized against**, and the residual question is not *how many can be looked up* but *how precisely*. **Nothing about the ordering argument weakens: the lookup is still the largest automatic win in the pipeline, and it is now a larger one than I reported.**

⚑ **The general lesson, and it belongs with rules 13, 15 and 16.** *A count of a field is not a count of the thing the field was meant to hold.* Rule 15 says a grep's zero is ambiguous; this is its sibling — **a populated-field count silently asserts that the extract's schema and the pipeline's input are the same set, and they are not.** **Count the evidence, not the column.**

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

### The test that matters most — and its example moved, because the premise was false

> ~~**Scoring uses `role`, and the WellMate proves why.** The UT-450 **genuinely is** a Pentair pressure vessel, so a key recording only the product would score `well-pressure-tank` as CORRECT — validating the exact bug it was built to catch.~~

**It is not a pressure vessel.** It is a **universal retention tank** — a contact tank by default, a pressure tank only when adapted. **So the key's own product string was wrong**, corrected at source to `Pentair WellMate UT-450 universal retention tank`, and with a correct product string the proposal `well-pressure-tank` is wrong against the product *as well as* the role. **The case never discriminated the two fields.** The split stands; the example had to move.

**The GSW water heater is the case that does discriminate**, and it is stronger because nothing about it is wrong:

| | |
|---|---|
| **product** | *automatic storage water heater* — exactly what the plate says and exactly what a lookup on `G9-50SDE-30 250` returns |
| **a proposal saying "electric water heater"** | **right about the product.** A product-only key marks it CORRECT and stops |
| **role** | *geothermal preheat store; breaker intentionally off* |

**That is the fact worth having and the one a product-only key throws away** — an intentional state that reads as a defect, which a well-meaning technician would "fix". Only the household knew it. **A harness that scored the product would be measuring whether the model can read.**

⚑ **And the WellMate now proves something better, which is why it stays in the file as its own test.** The plate's `Precharge: N/A` and `N/A` drawdown at all three ranges say what it is **not**; the lookup says what the product **is**; the household says what it is **for**. **Three independent sources and no disagreement** — that is what a working lookup looks like, and it is the case to point at when asking whether pass 2 is worth building.

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
