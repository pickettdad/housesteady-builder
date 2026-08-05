# Schedule / engine overlap — parsed

**Date:** 2026-08-04
**Answers:** `Schedule-Engine-Overlap_Parse-Request` §4a–§4d.
**Source:** `schema/reference/maintenance-schedule-v1.json` **v1.4.1** (2026-07-27), read from the file. Component vocabulary from the walk's own config snapshot, **field config v1.11.0**.
**Method:** parsed. Where a count needed judgement I give a floor and a ceiling and say which is which.

---

## The short version

**4c and 4d together answer the request more decisively than 4a does, and they point away from your preferred reading.**

- **`appliesWhen` cannot address an individual object.** `house.water-heater` asks *does this house have one*, not *this one*. There is no grammar for the second.
- **No item can carry object identity.** Thirteen keys exist across all 190 items and none of them can hold an object reference — and the texts confirm the intent: *"Decks, steps, rails, and guards checked"*, *"Trees inspected"*, *"Leak sensors and smart alerts reviewed."* Plural, collective. **A house with three toilets gets one row.**
- **Reading C is contradicted by the file.** C says the schedule owns what *recurs*. **39 items key on a component existing *and* carry recurring cadences** — `sump-pump` alone has eight, across eight different cadences. The schedule unambiguously owns recurring object-dependent work.

**The line the numbers actually draw is granularity, not rhythm.** That is reading B, sharpened — and the reconciliation key already exists on both sides.

---

## 4c · What `appliesWhen` keys on — **property and house-level facts only**

37 distinct expressions across 190 items:

| namespace | items | what it asks |
|---|---:|---|
| `always` | **112** | nothing — fires on every house |
| `property.*` | 46 | a property flag — `well`, `septic`, `pool`, `flat_roof`, `pre_1990` |
| `house.*` | **39** | **does the house contain at least one of this component type** |
| `answer.*` | 3 | a recorded answer — `answer.radon.result = elevated` |
| `zone.*` | 2 | a zone attribute — `zone.finished` |

**Composition is `any(...)` only.** No `and`, no `not`, across all 190.

**So: `house.<component-type>` is an existence predicate over the whole house.** It is the finest grain the grammar has, and it is still a fact about the house rather than about a thing in it. **The schedule is structurally incapable of being object-specific**, exactly as you suspected — and that does settle a great deal.

---

## 4d · Per-object identity — **no, and not by omission**

Every key any of the 190 items carries:

```
id · text · cadence · audience · category · appliesWhen
caution · onFinding · namespaceQuestion · evaluatedBy · answerNote · band · source
```

**None can hold an object reference**, and there is no optional field waiting to be filled — this is not a slot nobody used.

**The item texts settle intent beyond the schema.** They are written collectively:

> *Decks, steps, rails, and guards checked* · *Trees inspected for winter damage* · *Leak sensors and smart alerts reviewed* · *Outbuildings quick pass* · *Treatment equipment — salt, filters, UV status, error codes*

**A house with two water heaters produces one schedule row and two engine rows.** That is a real difference in what the two systems can express, and you are right that it is the cleanest line between them.

---

## 4a · Object-based versus house-based — **a floor, a ceiling, and a wide middle**

Your definition needs a judgement I would be inventing, so here are two mechanical bounds instead.

| measure | count | what it is |
|---|---:|---|
| **Floor** — `appliesWhen` names a `house.<component-type>` | **39 / 190 (21%)** | the file's own declaration that this item depends on a component existing |
| **Ceiling** — item text mechanically names a component type or alias from config v1.11 | **90 / 190 (47%)** | a string match over 71 types and 56 aliases, not a reading |
| **Neither** — no component in the grammar *and* none in the text | **89 / 190 (47%)** | unambiguously house-based |

**So object-adjacent work is between 21% and 53%, and at least 47% is unambiguously not.**

The 89 in the *neither* bucket are what you would expect: *exterior drainage during heavy rain* · *fire extinguisher gauges in the green* · *look under every kitchen and bath cabinet* · *exits and mechanical rooms unobstructed* · *dry traps refilled* · *water-meter data reviewed for unexplained use*. **These have no object to be produced from and never will.**

**But the floor is the number that matters, and it is not small — it is 39 items across 15 component types, every one of them recurring.**

---

## 4b · Cannot be answered from here — `Class-List_v0-2` is not in the repo

The repo holds `Class-Frame_v1-1` and no class list. **So the mapping is yours** — but here is its input, which is the part that needed a parse.

**All 15 component types the schedule keys on are declared in config v1.11.0.** No orphans, no stale references.

| component type | items | cadences it spans |
|---|---:|---|
| `sump-pump` | **8** | weekly · monthly ×2 · quarterly · spring · fall · winter · annual |
| `irrigation-backflow` | 5 | quarterly · spring · summer · fall · annual |
| `tree` | 4 | monthly · spring · annual · multi-year |
| `water-treatment` | 3 | weekly · monthly · annual |
| `deck` | 3 | monthly · spring · multi-year |
| `heat-pump` | 3 | spring · summer · annual |
| `garage-door` | 2 | monthly · quarterly |
| `hrv-erv` | 2 | monthly · annual |
| `retaining-wall` | 2 | monthly · summer |
| `fireplace` | 2 | fall · annual |
| `dehumidifier` · `septic-alarm` · `leak-sensor` · `outbuilding` · `humidifier` | 1 each | weekly / monthly / fall |

**Notice what is absent.** No `water-heater`, no `furnace`, no `electrical-panel`, no appliance of any kind — **the exact objects the engine's care stream will produce most work for.** The schedule's object-dependent half covers the things a *property* has, and is nearly silent on the things a *room* has.

---

## Where the numbers point

**You asked me to test C rather than confirm it, and it does not survive.**

C says the schedule owns what recurs and the class list owns what is inspected once at the baseline. **The 39 items are all recurring and all component-dependent.** `sump-pump` has eight items spanning eight cadences. If C were the boundary, those items would not exist in this file — and they are 21% of it.

**Your flagged worry was right about itself.** C explains the missing rhythm field on the class list, and that is an inference from an absence. The file says otherwise.

**What the numbers do support is B, with a sharper boundary than *generic versus specific*: the line is granularity.**

| | asks | grain | a house with two softeners |
|---|---|---|---|
| **schedule** | does this *house* have water treatment? | **house** | **one** row: *salt level, weekly* |
| **engine** | what is *this object*? | **object** | **two** rows, each with its own model, cartridge and interval |

That is not two systems doing the same job. It is one system that fires **without identification** and one that cannot fire **without it** — which also explains the deployment order, since the schedule works on day one of a Discovery Visit and the engine needs the desk pass first.

**And the reconciliation you say does not exist has its key already declared on both sides.** The schedule keys on `house.<component-type>`. Frame §1 has every class declare *the component type it maps to, or an explicit none*. **So the join is component type, and neither side needs a new field to carry it.** What is missing is the rule for what happens when both fire — which is a design decision and yours, but it is a rule over an existing key rather than a mapping layer to be invented.

**One thing that makes that rule easier than it looks:** the two sets barely overlap in practice. The schedule's 15 component types are property-scale — sump, trees, irrigation, decks, retaining walls. **The engine's densest output will be water heater, furnace, panel, appliances — none of which the schedule keys on at all.** The collision you named in §1 is real but it is narrow, and it is enumerable today: it is at most those 15 types.

---

**Status:** parse complete. §4a, §4c, §4d answered from the file; §4b's input supplied and its mapping left with you.
