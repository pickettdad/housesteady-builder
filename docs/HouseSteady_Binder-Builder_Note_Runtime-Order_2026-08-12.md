# Where the room-level enumeration runs — and the answer is neither of the two on offer

**Date:** 2026-08-12 · **Record of an event. This date never moves.**
**Answers:** the owner's question about runtime order, at source.
**Method:** four checks against the code, each stated with what it looked at.

**Headline: the enumeration does not lead and it does not follow. It runs blind, in whatever order a person ran three separate scripts — and it could not consume the known inventory if pass 2 ran first, because it has no input channel for one. Amendment 11 §B's scaffold is not mis-ordered; it is unwired. So the ruling applies, and it applies harder than the question assumed.**

---

## 1 · The four checks

**Every one derived by looking, and each says what it looked at.**

| # | Question | At source |
|---|---|---|
| 1 | **What order does the worker run jobs in?** | `claimNext` in `ai/queue.ts`: `ORDER BY created_at, id`. **Queue insertion order and nothing else** |
| 2 | **Does identification read pass 1 or pass 2?** | `tasks/identify.ts` imports ten modules. **None of them is `readSurfaces` or `resolveProduct`** |
| 3 | **Does any identification code touch a reading or a resolution?** | Searched `identify.ts`, `engine/identify.ts` and `engine/projection.ts` for `readings`, `product_resolutions`, `claimsForImport`, `knownInventory`. **Zero hits** |
| 4 | **Does anything sequence the three passes?** | Searched `identify.ts` and `worker.ts` for `READ_TASK` and `RESOLVE_TASK`. **Zero hits** |

**What identification actually receives**, from `runIdentify`: the zone's photographs, the class projection, the zone's label and type, the property flags, and any capture notes. **That is the complete list.**

---

## 2 · So the answer is a third thing

**Not *the enumeration leads*. Not *it already runs after resolve*.**

> **Three scripts exist — `npm run identify`, `npm run read`, `npm run resolve` — and each queues its own jobs onto one table that drains in insertion order. Whichever a person types first, runs first.**

⚑ **And the ordering would not matter if it were fixed, because the channel is missing.** Run pass 2 to completion, then run identification, and **identification asks the same question it asks today**: *what things are in this room*, against 176 class ids and nothing else. **The known inventory is in `product_resolutions` and nothing reads it into a call.**

**That is the finding, and it is bigger than the ambiguity the question was about.** Amendment 11 §B's argument — *knowing the room holds one Burcam 600545B and one WellMate UT-450 turns four tank proposals into which of these two is in this photograph* — **is entirely unimplemented.** Not ordered wrongly. **Not wired at all.**

*It is also the honest reading of the Roadmap's table: the numbers were build order, because a runtime order was never expressed anywhere for them to describe.*

---

## 3 · What that means for the ruling

**The ruling applies, and the reason it applies is stronger than the conditional it was written under.**

> *"If the enumeration still leads, my ruling is that it moves inside pass 3 — which is what match and complete means — and stage 4 as a standalone first step is superseded."*

**⚑ The owner's argument is right and the cost framing understates it.** A vision pass asked *what is in this room* has to enumerate, and enumeration is the act every measured failure came out of. A pass asked *here are twenty-two known objects, what else is here* **cannot produce a duplicate of a known object**, because the known object is in the question rather than in the answer.

**Four pressure tanks stops being a thing the model gets wrong and becomes a thing it is no longer asked.** That is structural, and it does not depend on the model improving.

**And the anchoring point is the sharper half.** A pass that has already said *reverse osmosis system* has committed. **Nothing downstream un-commits it** — pass 3 finding a sediment cartridge does not retract a proposal that already exists as a row with a class and a maintenance rhythm attached. **The order is what prevents the claim, not what corrects it.**

### What this costs in code, stated so the ruling is priced

| | |
|---|---|
| **Stage 4 keeps running unchanged today** | It is `Done` and it works. **Nothing is deleted** — the ruling supersedes it as a *first step*, not as code |
| **Pass 3 gains the input channel stage 4 never had** | `knownInventory(db, importId)` already exists and returns exactly what the prompt needs. **Written in stage 6a for this** |
| **The prompt is the real work** | *Here are the products this room is known to contain. Find each one. Then tell me what else you see.* Plus the could-not-locate list, which is a finding rather than a failure |
| **Two lanes must not merge** | Plate-derived and appearance-derived, kept apart — Amendment 11 §C's own requirement, and the thing a single-channel stage 4 cannot express |

⚑ **One thing to keep from stage 4 rather than fold in.** A zone with **no plated objects at all** — a bedroom, a hallway — has an empty known inventory, and *here are zero known objects, what else is here* is the enumeration question wearing different words. **The scaffold argument only holds where there is a scaffold**, and the honest shape is that pass 3 asks a different question depending on whether the inventory is empty. **Said now so it is designed rather than discovered.**

---

## 4 · The two ruled stages, and what each actually needs

### Stage 12 — the Home Binder, first draft from the owner's own house

**The spine exists and is complete.** `schema/binder-schema-v1.json` v1.0.0 declares **23 sections and 41 slots**, and every section carries a title:

```
s1  Emergency sheet & shutoff map        s13 Testing & environmental program
s2  Home dashboard                       s14 Insurance & risk file
s3  This-year calendar                   s15 Maintenance system & checklist library
s4  Property profile & site plan         s16 Seasonal & absence procedures
s5  Documents index & vault list         s17 Vendor & service directory
s6  Household & occupancy profile        s18 Repair & project register
s7  Systems inventory                    s19 Ten-year capital plan & reserve
s8  How this house runs                  s20 Utility & performance history
s9  Finishes, spares & consumables       s21 Programs, rebates & grants register
s10 Baseline condition assessment        s22 Livability & long-term suitability
s11 Warranty & lifespan register         s23 Property-transfer / continuity package
s12 Life-safety record & escape plan
```

**So *every heading present and the empty ones showing as empty* is derivable from the schema rather than authored** — which is what makes the draft honest, and it is the same move `report/render.ts` already makes for the gap report.

⚑ **The gaps being the point changes what the render must do, and it is not a styling choice.** A section with no content must render its heading **and say what would fill it and why it is empty** — *nothing here yet because no lab result has returned* is a different fact from *nothing here yet because nobody has built the producer*, and an outside reviewer can only critique the second if the document distinguishes them.

**⚑ And the profile already declares three kinds of empty, which is better than I expected to find.** `schema/profiles/baseline-v1.json` partitions the 41 slots — **28 `required`, 7 `presentWhenPopulated`, 6 `outOfScope`** — disjoint, and their union is exactly the schema's slot set. *Checked, because my first check said zero and the claim was right and the check was wrong: the profile lists slot ids as plain strings and I had scanned for object keys.*

**So an empty section can already say which kind of empty it is without anything being authored:**

| | |
|---|---|
| `required` × 28 | **empty is a gap.** This is owed and is not here |
| `presentWhenPopulated` × 7 | *`s3.calendar` · `s8.quirks` · `s9.finishes` · `s9.consumables` · `s14.requirements` · `s16.procedures` · `s22.review`* — **empty is correct** when the house has none |
| `outOfScope` × 6 | *`s4.site-plan` · `s4.regulatory-overlay` · `s18.projects` · `s20.readings` · `s21.programs` · `s23.package`* — **empty is by design** and rendering it as a gap would manufacture six |

**That distinction is the whole reason the draft is critiquable.** *A binder that shows thirteen legitimately-empty sections as thirteen holes gets reviewed on the wrong thirteen things.*

*Roadmap row 11 already records the equivalent point for the Home Profile — not blocked on the desk screen for a first render, because it can run against the confirmed room fixture. **The same is true here**, and the fixture is committed.*

### Stage 13 — the outcome log

**Named, and I am not specifying it.** v1.4 §4.1g's ruling is explicit — *secure the capture first; work out the consumers afterwards* — and a shape argued now, before a single coordinated job has happened, would be a schema drawn from imagination.

**What I can say from inside the code, and it is one thing:** §4.1g's structure — *object · symptom · diagnosis · what fixed it · what it cost · which trade · when* — **is an event, not a record.** Dated, repeatable, append-only. **Same shape as `object_states`, and the same argument: a column holds the latest and discards the transition, and the transition is what a replacement curve is made of.** *Twenty water-heater failures with install dates is twenty events, not twenty fields.*

⚑ **And the unit rate correcting itself is a join that needs both ends dated.** *Quote at time T, real time recorded at T+n, rate adjusts.* **A log gives that for free; a field gives none of it.** Recorded so the shape is not re-argued when the specification is written.

---

**1100 tests green, typecheck green.** Nothing was built for this note — it is four checks and their consequence.
