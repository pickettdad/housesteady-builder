# Increment 5 Build Spec — Amendment 11

**Identification is four acts in one call. Split them, and build the known inventory first.**

**Date:** 2026-08-10 · **Type:** amendment to the Increment 5 Build Spec (2026-08-02)
**Revision 1, 2026-08-10:** §C pass 1 gains *a nameplate is a table, not a paragraph*, and §C pass 3 gains the measured share of objects that never need to reach an appearance decision.
**Author:** design session · **Builds on:** the 2026-08-09 identification runs against the owner's mechanical room, and two independent structured reads of the same room.
**Supersedes in scope:** the standing ask for a "comparison pass" and for a `parent_id` relation. **Both are addressed here, and neither is the shape it was asked for.**

---

## A · Why

**One call currently performs four acts with four different reliabilities, and reports them at one confidence.**

Seeing what is there · reading text · deciding what a thing is · assigning a frame class. **A near-certain plate reading and an unreliable class guess come out of the same field wearing the same weight.**

**The measured consequence, from two runs on one room:**

| what happened | what it should have been |
|---|---|
| `reverse-osmosis` proposed from a sediment cartridge's part number | **PP20B-20 is a filter cartridge.** A consumable, not equipment |
| Manufacturer reported as **NextEnergy** twice | **The nameplate says CLIMATEMASTER.** NextEnergy is a homeowner warranty decal on the same cabinet |
| `well-pump-submersible` ← *"Well pump (Stenner 45MHP2)"* | **45MHP2 is a 3 GPD chemical metering pump** |
| `fuel-tank-propane` ← *"Propane tank (BURCAM 600545B)"* | **600545B is a captive-air pressure tank** — the only actual pressure tank in the room |
| `water-heater-gas` × 2, plus `-electric` and `-indirect` | **Two heaters, both electric.** The house has no gas water heater |
| `thermostat-smart` ← *"Water Depot Platinum controller"* | **A water-softener control head** |
| `water-treatment-other` ← a **TRU-SPEC TSMS-4/8** | **An HDTV signal splitter** |
| `well-pressure-tank` × 4 | **Two vessels, one of them a contact tank whose plate reads `Precharge: N/A`** |

**Seven of the eight are killed by resolving a model number against a source — a text-only lookup costing a fraction of a cent.** The eighth is killed by recording which surface a string was read from.

**And the class frame already assumed this stage exists.** It declares *categories* of care and states that AI supplies the model-specific detail. **The supply step was specified and never built.**

---

## B · The order, and why the inventory comes first

**Build the certain thing first and let it scaffold the uncertain thing.**

**The plated objects are the corners and edges of the puzzle.** They are also, not coincidentally, the large fixed appliances — **and the unplated remainder is mostly connective**: manifolds between pumps, piping between vessels, drains serving tanks. **A connective thing is defined by what it connects**, so it becomes describable only once the things it joins are named. **This is the only order in which the unnamed half is answerable at all.**

**And it converts the hardest question into the easiest kind.** Knowing from plates that the room holds **one Burcam 600545B and one WellMate UT-450**, four tank proposals stop being *how many tanks are there* and become *which of these two is in this photograph.* **Enumeration becomes matching, and matching has a bounded answer.**

⚑ **This is what dissolves the duplication problem.** Four proposals happened because three batches each saw a tank and none could see the others. **A shared known inventory is the mutual context that was missing** — not a post-hoc merge pass.

---

## C · The passes

### Pass 1 · Read — *what text is on these things, and on which surface*

**Input:** detail and nameplate photographs. **Not the canvas** — it carries no legible text and its tokens are wasted here.
**Output:** text strings, each with a **surface**: `nameplate` · `fascia-brand` · `adjacent-sticker` · `handwritten-tag` · `document`.
**Forbidden:** naming, classing, or inferring what a thing is.

**The surface field is the whole point and it is not optional.** *A brand on a fascia, a model on a plate* names two surfaces and offers one field — **that single sentence in the current prompt is the root cause of the NextEnergy error.** A manufacturer read off a data plate is `Observed` at the finest grain available. **A name on a decal beside it is `Observed` too — of the decal.** Collapsing them is doctrine 2's laundering, one level down.

**Rule that becomes enforceable here: a label may not assert a manufacturer that only a non-nameplate surface supports.**

### ⚑ A nameplate is a table, not a paragraph — and an `N/A` in a named field is a fact

**Read a plate field by field.** `Model` · `Part Number` · `Factory Precharge pressure` · `Tank Volume`. **Flatten it into one string and every empty cell disappears**, because absence has no text to carry it.

**The WellMate UT-450 CE proves it, and it disproves itself twice in its own fields.** `Factory Precharge pressure: N/A`, and `N/A` across all three drawdown columns — 20–40, 30–50 and 40–60 psig. **Drawdown is the entire function of a pressure tank and the only figure anyone looks up on one. A vessel with no precharge and no drawdown at any range cannot be a pressure tank in any house** — before a lookup, before a household says anything.

**And the plate's prose points the other way, loudly.** *Hazardous Pressure · Risk of explosion · install a pressure relief valve between the pump and tank · Maximum Operating Pressure 75 psig.* **The word *pressure* appears roughly a dozen times. The two cells that settle it say `N/A` and nothing else.**

> **Read as prose, this label says *pressure tank* repeatedly. Read as a table, it says the opposite.**

**Identification proposed `well-pressure-tank` from it four times with the plate in frame** — which is the tell for what it was doing: **not reading a table, pattern-matching a grey cylinder with a label on it.**

**So pass 1 emits fields, not a string** — `{ field, value, surface }` — **and a field present with an `N/A` value is emitted, never dropped.** It is the strongest negative evidence a plate can carry.

⚑ **The join to the object is free and already in the manifest.** Capture convention is object, then plate, then plate. **Capture sequence proposes which plates belong to which object** — no tap, no detection. And **a plate arriving with no object photograph before it becomes a detectable orphan** rather than a silent one.

### Pass 2 · Resolve — *what product is that model number*

**Input:** pass 1's strings. **Text only. No images. May search.** Nearly free.
**Output:** for each model number — the product it identifies, its kind, and **where the answer came from.**

**Honesty is assigned here and it is per-source, not per-pass:**

| source | label |
|---|---|
| Manufacturer documentation or the manufacturer's own site | **`Documented`** |
| A retailer or aggregator listing | **`Inferred`** — and it says so |
| Nothing found | **unresolved. A valid and expected output** |

**A resolution that cannot state its source does not ship.** A model number resolved from a retail listing and rendered as `Documented` is the exact failure this project has spent a week naming.

**This pass also sorts equipment from supplies.** PP20B-20 resolves to a cartridge; **a cartridge is a consumable.** That is a whole error class removed before anything is classed.

**Output of passes 1–2 is the known inventory.** Twelve or so certain products, before a single guess has been made.

### Pass 3 · Match and complete — *find these, then tell me what else*

**Input:** all photographs **plus the known inventory.**
**The prompt is a checklist, not an open field:** *here are the products this room is known to contain. Find each one. Then tell me what else you see that is not on this list.*

**Output:** each known product located, with the photographs showing it · **each additional object proposed, flagged as appearance-derived** · and **an explicit could-not-locate list** for known products not found.

⚑ **The guessing half is smaller than it looks, and that is the point of the ordering.** **Recognition from appearance is the least reliable act in the pipeline and the most expensive.** Reading text is reliable; looking text up is reliable and nearly free; **deciding what a grey cylinder is by considering its shape is the guess — and every confident wrong class measured on that room came from it.** **Measured on the confirmed room record: 20 of 34 objects carry a nameplate. Fifty-nine per cent of that room should never reach an appearance decision at all.**

**Two lanes, and they must not merge.** A **plate-derived** object's class follows from its resolution and is close to deterministic. An **appearance-derived** object's class is a guess and carries that mark. *The same field reporting both at one confidence is what this amendment exists to end.*

⚑ **A known product not found is a finding, not a failure** — it usually means the object photograph is missing, which is exactly what the capture rules are for.

⚑ **And this pass is where the parent/component relation gets populated rather than hand-filled.** Systems render; parts surface when they have an age, a horizon, a part number or a service call. **A relation with no pass that compares proposals is a column nobody can fill** — this is that pass.

⚑ **Position data reduces this pass rather than replacing it.** F-26 lands 2026-08-11, after which every capture carries where it was taken from. **Two photographs from the same point on the same bearing are the same object; two taken four metres apart are not** — a far stronger identity signal than pixels, and nearly free. **Do not over-build spatial reasoning here; measure what position leaves unsolved first.**

### Pass 4 · Condition — *what is wrong, and attached to what*

**Separate call, separate act.** Mixing it with identification is how *"sediment in water tank"* was proposed as an **object** — a real finding wearing the wrong shape, because the object channel was the only one available.

**Input:** all photographs plus pass 3's placed objects.
**Output:** conditions, each attached to an object or to the room. **`Observed`. Describe, never diagnose** — *dark patches on the floor at the front-left corner*, not *probably a leak*.

⚑ **Two independent structured reads of one room agreed on roughly half its conditions**, each finding real ones the other missed. **Conditions are the least reliable category by a wide margin and should carry the lowest default confidence in the system.**

⚑ **A condition needs a resolution state that is not *fixed*.** The floor staining under the water heaters is old, dry, and explained — it is residue from the failure that caused the tank replacement. **Without an *explained* state it is raised as new on every visit forever.** The owner's ruling stands: it may re-flag, and one click closes it — **but the click must be remembered, so the third concierge does not re-ask what the first one settled.**

### The desk layer · Role and connection — *what is it for, here*

**Not an AI pass. This is the desk pass and the Home Profile, and it is where the household's answers land.**

**Three layers, and each buys something different.** **The plate says what it is not** — no precharge, no drawdown, 120 gallons, cold water only, 2011. **The lookup says what the product is** — a Pentair retention/contact vessel. **The household says what it is for here** — chlorine contact after the Stenner injects.

**The lookup is the largest automatic win because it is free and takes the product from wrong to right. It stops at the product.** A retention vessel could hold chlorinated water or something else entirely, **so the role remains the desk's and the household's.**

**A plate can never answer it.** The WellMate's nameplate says *pressure vessel* — correct product, wrong role. **In this house it is a chlorine contact tank, and only the household knew.** The Burcam's plate prints *for 20/40 PSI operation… for 30/50 PSI operation…* as **examples**; a single-pass model reads that as the setting in this house.

**Two facts from this room that no photograph and no plate could ever carry:**
**The first water heater's breaker is intentionally OFF** — it is a geothermal preheat store, not a fault. *An intentional state that reads as a defect, which a well-meaning technician would correct.* **The chlorination pump is wired to the well-pressure switch** by design, so it doses only while water moves.

**Labels here are `Inferred` or `Reported by homeowner`, never `Observed`.**

---

## D · Cost

**Measured baseline: 1,591 input tokens per photograph, 3,701 fixed per call.** The mechanical room ran at **$0.16** in one pass.

**Three image passes instead of one — and pass 1 skips the canvas, pass 2 is text-only.** Call it **under $0.50 a room, under $3 a baseline** at the cheap tier. **The pass split is not a cost decision.**

---

## E · What this changes in the existing asks

| ask | becomes |
|---|---|
| "Scope a comparison pass" | **Largely dissolved.** A known inventory makes it matching, and position data takes more of the remainder. **Measure before building** |
| "Add `parent_id`" | **Still needed — but pass 3 is what populates it.** The schema was never the blocker |
| "Add a source-of-text field" | **Pass 1's core output**, not a bolt-on to a single call |
| "Build §4 research" | **This is pass 2, and it is the keystone.** Seven of eight confident wrong classes die here |
| "Identification has only an object channel" | **Pass 4 is the missing channel** |
| "Abstention is not available" | **Every pass carries it, and `unresolved` is an expected pass-2 output** |

---

**Status:** amendment, for Builder Code to scope. **Nothing here is built.**
**The strongest evidence for it is that a room refused to fit the current design seven times in one call, and each refusal named its own fix.**
