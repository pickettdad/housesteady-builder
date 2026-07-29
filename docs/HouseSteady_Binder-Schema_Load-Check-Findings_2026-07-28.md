# Binder Schema — findings from running the declared load-check by hand

**Date:** 2026-07-28
**What this is:** the cross-check that `maintenance-schedule-v1.json` declares on itself, run against the two shipped schema files **before Increment 3 builds it.** Same exercise as the Dry-Run Findings and the v1.6.2 Reconciliation, and for the same reason: finding this now means editing a JSON file, finding it in Increment 3 means the evaluator is already wrong.

**Nothing has been changed.** Increment 3 is not started and these are content decisions for the schema session, not builder work.

**Method:** every `appliesWhen` / `expectationSource` / `condition` / `gate` string in both files, tokenised for `property.* · zone.* · pin.* · house.* · answer.*`, compared against the declared vocabulary. 190 conditions in the maintenance schedule, 24 in the binder schema.

---

## 1. The declared cross-check cannot pass as written

`maintenance-schedule-v1.json` carries:

> `flagVocabularyRule`: *"This list is the SHARED property-flag vocabulary for both this file and binder-schema-v1.json. They are evaluated by one evaluator, so a flag used in either must be declared here. A cross-check on load enforces it."*

`propertyTriggers` declares **17 flags, all of them `property.*`**. The two files between them use:

| Namespace | Distinct flags used | Declared anywhere in these files |
|---|---|---|
| `property.*` | 13 | yes — all 13 are in the list |
| `house.*` | 12 | **no** |
| `pin.*` | 6 | **no** |
| `zone.*` | 2 | **no** |

**A loader implementing the stated rule literally rejects 20 flags on load** — every non-`property.*` one, including every equipment condition in the maintenance schedule.

This is the defect class the Reconciliation §7 names, appearing in our own file: *"every structural fact has exactly one parsed home, and prose never substitutes for it."* The rule is a sentence asserting something the data does not carry. `triggerVocabularyRule` further down says the right thing in prose — four namespaces, every equipment condition is `house.*` — and no field an evaluator reads says it.

**Two ways out, and the choice is the schema session's:**

- **Narrow the rule to what the list is.** `propertyTriggers` governs `property.*` only; `house.*`, `pin.*` and `zone.*` are validated against the field master's Table A/B and component types, which is where they actually live. Honest, and it makes the cross-check a *shared* concern with the checklist config rather than a local one.
- **Declare all four namespaces here.** Keeps one file authoritative, at the cost of duplicating the field master's component list — which is the fork the *config decides, not the builder* rule exists to prevent.

The first looks right. Either way, the sentence and the data have to agree before anything evaluates them.

## 2. Four flags were added in v1.6 and nothing was re-conditioned to use them

Declared but never referenced by any condition in either file:

- `property.seasonal_vacancy`
- `property.secondary_suite`
- `property.flat_roof`
- `property.municipal_sewer`

The first three are precisely the flags the Reconciliation §2 says v1.6 added *as a direct result of that reconciliation* — because eight conditions had no flag to receive them. **The flags landed. The items did not get their conditions back.**

Eleven items still carry the note *"Condition removed 2026-07-27: no flag exists in Checklist Master v1.5.1 Table A. Applies universally until the field app declares one."* The field app has now declared three of them:

| Item | Should be gated on | Applies today |
|---|---|---|
| `tr.suite-alarms` — interconnected alarms across both units | `property.secondary_suite` | every house |
| `tr.suite-egress` — secondary-suite egress unobstructed | `property.secondary_suite` | every house |
| `tr.suite-code` — electrical and fire-separation items present | `property.secondary_suite` | every house |
| `tr.vacancy-procedures` — departure, absence and return procedures | `property.seasonal_vacancy` | every house |
| `tr.flat-drains` — roof drains and scuppers cleared | `property.flat_roof` | every house |
| `tr.flat-membrane` — membrane at seams and penetrations | `property.flat_roof` | every house |

**Every house currently gets a secondary-suite egress check and a flat-roof membrane check.** That is over-firing, and it is the mirror image of the zone-dependency defect the field session called the largest since G1 — that one silently under-fired a shutoff map, this one silently over-fires six items into every schedule. Both are a condition and its subject having drifted apart.

The remaining five (`pro.leak-sensors`, `fa.humidifier-pad`, `tr.radon-mitigation`, `tr.radon-post-mitigation`, `my.04`) are a different question: leak sensors, humidifier and radon mitigation are equipment, so they want `house.*` conditions rather than Table A flags, and `my.04` is now governed by `answer.*` per Increment 3 §1f. Worth confirming rather than assuming.

**`property.municipal_sewer` is the odd one out** — declared, never used, and no item obviously wants it. Possibly the complement of `property.septic` kept for symmetry, which is reasonable; worth a note saying so, or removing.

## 3. Three conditions carry a repeated operand

- `any(house.heat-pump, house.heat-pump)` — `sp.ac-service` and `su.cooling`
- `any(property.solar, property.solar)` — `tr.solar-inverter`

Harmless to evaluate and obviously remapping scars: two distinct original flags each resolving to the same target, per the Reconciliation's `property.central_ac → pin.heat-pump` line. Worth collapsing to a bare flag, because the next person to read `any(x, x)` will look for the difference between the operands and not find one.

## 4. What passed, and is worth recording

- **No `property.*` flag is used that is not declared.** All 13 in use are in Table A.
- **`house.*` is used consistently for equipment**, exactly as `triggerVocabularyRule` asserts. No maintenance-schedule condition uses the zone-scoped `pin.*` form, so the under-firing trap Increment 3 §1e.2 warns about is not present today.
- **Both `answer.*` cases named in §1f are absent from these files**, which is correct — they are the builder's and arrive through the session plan.

---

## Method note, carried from the Reconciliation

This check compares the *data* against the *declared vocabulary*, and finding 1 is what it caught. It would **not** have caught the defect the field session found — three attribute ids corrupted identically in the ids and in every reference — because a uniform transformation leaves everything agreeing with everything. That still requires validating against the field master itself, which is why finding 1's first option is the better one: it puts the check where the authority is.

**Status:** four findings, none of them builder work. Routed to the schema session. Increment 3 remains not started.

---

## Addendum — re-run against the corrected files (2026-07-28, later)

Both findings landed. **Nothing used is undeclared** across either file: 17 `property.*`, 14 `house.*`, 2 `zone.*`, 2 `answer.*` in the schedule, 9 `pin.*` in the binder schema. **All eleven items are re-conditioned** — the v1.5.1 "no flag exists" note is gone from the file entirely. `vocabularyCrossCheckRule` now states a rule that can actually be executed.

Three small things survive, none worth blocking on.

**1 · B5 is three items, not two.** `house.leak-sensor` and `house.humidifier` were routed to the field session; `house.dehumidifier` is the same case and was not. It is used by `wk.dehumidifier` and — unlike the other two — carries **no `undeclaredType` note**, so nothing in the file records that it fires nowhere.

| Item | Condition | Carries the note? |
|---|---|---|
| `pro.leak-sensors` | `house.leak-sensor` | yes |
| `fa.humidifier-pad` | `house.humidifier` | yes |
| **`wk.dehumidifier`** | **`house.dehumidifier`** | **no** |

All three are owner-visible equipment a concierge could plausibly pin. Worth going to the field session together.

**2 · Two conditions still carry a repeated operand.** `any(house.heat-pump, house.heat-pump)` on `sp.ac-service` and `su.cooling`, and `any(property.solar, property.solar)` on `tr.solar-inverter`. Remapping scars — two original flags each resolving to one target. Harmless to evaluate; worth collapsing so the next reader does not hunt for a difference between the operands.

**3 · `property.municipal_sewer` is declared and never used.** Plausibly the deliberate complement of `property.septic`, kept for symmetry. Worth a note saying so, or removing.

### How finding 1 was reached, and why it is a hint rather than a check

`house.*` and `pin.*` names were compared against the component types declared in the **reference export's own config snapshot** — the only real config in this repo, and **two versions stale at 48 types**. That produces false positives, and it produced two: `house.septic-alarm` and `pin.septic-alarm` are absent from the stale list because `septic-alarm` was *added in v1.5* closing G5, which the binder schema's own note records. Both are correct today.

So this cannot be a gate, and Increment 3's loader must not implement it as one against the material now in the repo. **The check the `vocabularyCrossCheckRule` describes — `house.*` and `pin.*` must name a declared component type — needs the v1.6.2 component list, and nothing in this repo carries it.** That is the same gap B3 names: a fresh export carrying the current config. Until it arrives, this check informs a conversation and cannot fail a build.

**Status:** three follow-ups, all content. Still no builder work. Increment 3 remains not started.

---

## Second addendum — the check run against the master itself (2026-07-28, later still)

The Checklist Master v1.6.2 is now in `/docs/reference/`, so **the half of `vocabularyCrossCheckRule` that was never executable can now be executed**: `property.*` matched against Table A, `zone.*` against Table B, `house.*`/`pin.*` against the component library. This is the authoritative form of the check rather than the hint the first addendum ran.

### What passes, verified against the master rather than inferred

| Check | Result |
|---|---|
| `property.*` matches Table A exactly | **17 = 17, both files, no difference in either direction** |
| Component types | **58 declared in the master**, matching `componentVocabularyRule` |
| Inheritance graph | **11 relations, identical** to `componentInheritance` in the binder schema, key for key |
| `house.*`/`pin.*` naming a declared type | 20 of 23 — the three exceptions are B5, below |
| Every trigger used is declared | yes, across 234 conditions |

The direction clause landed: `property.municipal_sewer` mirrors Table A and is correctly unused, so it is no longer reported.

### One new finding — `zone.outbuilding` is not a zone attribute

`pro.outbuildings` carries `appliesWhen: zone.outbuilding`. Table B declares six attributes — `finished`, `sleeping`, `has_stairs`, `has_mechanicals`, `has_plumbing`, `exterior_wall` — and `outbuilding` is not among them. It is a **zone type**, one of the thirteen in §4's taxonomy.

The master's own §3 defines the namespace as *"`zone.*` (Table B) — an attribute of this zone."* So this condition asks "is this zone of type outbuilding" through the namespace that means "does this zone have attribute X". The other two `zone.*` conditions are correct: `zone.finished` is a real Table B attribute and `tr.fin-leak-sensors` / `tr.fin-moisture` use it properly.

It is the same defect class as B5 — a condition naming something its namespace does not contain — and it fires nowhere for the same reason. Three ways out, and the choice is the field session's: add the attribute to Table B, add a namespace for zone type, or re-express the condition. **Not the builder's to pick.**

*A secondary question, raised rather than asserted:* all three `zone.*` conditions sit in a **house-scoped** file, whose own `triggerVocabularyRule` says every equipment condition here is `house.*` because "a maintenance schedule asks whether the HOUSE has a sump, never whether this room does." `zone.finished` is defensible — moisture readings are taken behind *a particular* finished wall. `zone.outbuilding` reads more like a house question. Worth a look when the namespace is settled.

### `property.flat_roof` is now used, and still cannot fire

The first addendum flagged it as declared-but-unused; `tr.flat-drains` and `tr.flat-membrane` now use it. But **Table A marks it "⚠ not yet asked at intake"** and the master's §9 item 6 records it as an open item: *"a flag no input can set is worse than an absent one."*

So those two items moved from *firing on every house* to *firing on no house*. That is the better failure — an item that never appears is visible as absent, where one that always appears looks correct — but neither is the intent, and it stays dead until the intake form asks the question.

### One repeated operand survives, in the other file

`any(property.solar, property.solar)` at `s1.solar-battery-disconnect` in **`binder-schema-v1.json`**. The three in the maintenance schedule were collapsed; this one is in the binder schema and was missed.

### A note on method, because this is twice now

Two parses of the master gave confident wrong answers before this one: a regex for `` `property.x` `` found zero flags because Table A writes ids bare, and a line-range window spanning both tables reported `finished`, `has_stairs` and `sleeping` as missing property flags. Neither was reported as a finding — both were caught by the results being implausible and checked before saying anything.

That is the same caution the first addendum recorded about the stale config, and it generalises: **a check against a document you have just started parsing is a hint until its parse is verified against something you can read yourself.** Here that meant opening the tables. The lesson for Increment 3's loader is narrower and firmer — it must parse `triggerVocabulary`, which is structured data with one declaration site, and it must not parse this markdown at all.

**Status:** one new finding (`zone.outbuilding`), one carried (`property.flat_roof` cannot fire), one leftover operand. All content, all the field or schema session's. Increment 3 remains not started.

---

## Third addendum — against Checklist Master v1.11 (2026-07-28)

Re-run with the escaped-pipe rule applied per Increment 3 §1g: `\|` neutralised before any cell split, and every table slice bounded at the next `##` heading rather than running to end of file.

### What reconciles exactly

| Check | Master v1.11 | Schema files | |
|---|---|---|---|
| Live checklist items | **417 id rows − 8 Table F rows = 409** | states 409 | ✓ |
| Table A property flags | 17 | 17 declared, both files | ✓ |
| Table B zone attributes | 6 | — | — |
| Inheritance relations | 11 | identical to `componentInheritance`, key for key | ✓ |
| **§1g.2 — stale bindings** | 8 retired ids in Table F | **schema binds to 42 field item ids; none retired, none undeclared** | ✓ |

**§1g.2 passes against v1.11.** `liv.egress` and `wm.curbstop` are both in Table F, and neither appears in any binding — `wm.curbstop` was already replaced by `sit.curbstop` in the `curb-stop` entry, which records the lineage in its note without following it.

### One count I cannot reconcile — 61 against 62

`reconciledAgainst` states **62 component types**. Section 7 bounded at the next `##`, deduplicated, gives **61 typed `### \`name\`` headings**, plus a **Stubs** line naming 9 more that have no headings — so 61 with items, or 70 names in total. No duplicates.

The full 61, so it can be eyeballed in one pass rather than re-parsed:

> water-heater · furnace · boiler · heat-pump · hrv-erv · electrical-panel · water-main · sump-pump · well-pressure-tank · water-treatment · water-softener · sediment-filter · uv-sterilizer · reverse-osmosis · toilet · sink · shower · bathtub · laundry-tub · smoke-alarm · gas-shutoff · fuel-tank · fireplace · dryer-duct · garage-door · generator · foundation-crack · comparison-position · wellhead · septic-lid · downspout · hose-bib · receptacle-gfci · window · door · deck · chimney · tree · floor-drain · cleanout · backwater-valve · vent-termination · register · appliance · appliance-refrigerator · appliance-dishwasher · appliance-range · appliance-range-hood · appliance-washer · appliance-dryer · appliance-microwave · dock · leak-sensor · humidifier · dehumidifier · retaining-wall · curb-stop · septic-alarm · solar-inverter · pool-equipment · irrigation-backflow

**One of us is off by one, and on this round's record it is likelier to be me.** Stated as a question rather than a finding. Nothing depends on it: the runtime check reads each import's own snapshot, and the count appears only in prose.

### Two carried, unchanged

**`zone.outbuilding` is still not a Table B attribute.** Table B declares six and `outbuilding` is not among them — it is a zone *type* in §4's taxonomy, and separately a reserved stub component type. `pro.outbuildings` still asks a type question through the attribute namespace.

**`any(property.solar, property.solar)`** survives at `s1.solar-battery-disconnect` in the binder schema.

### B5 closed, confirmed against the master

`leak-sensor`, `humidifier` and `dehumidifier` all appear as typed headings in v1.11. All three `house.*` conditions resolve, and the `undeclaredType` notes are gone from the schedule.

### The method note, earning its keep

Four parses of this master have now produced confident wrong answers before the right one: a regex that found zero Table A flags because ids are written bare; a line-window spanning Tables A and B; a Table F slice running to end of file that reported **16** retired ids instead of 8; and, from that same slice, **`pnl.service` reported as a broken binding when it is not retired at all**.

None reached a report. Each was caught by the number being implausible against something already known — 17 flags, 8 lineage rows, 409 items — and then checked by opening the document.

**The generalisable form: an unbounded slice of a structured document is the single most productive source of false findings here.** Every one of the four came from a boundary that was assumed rather than located. For Increment 3's loader the conclusion is unchanged and now better evidenced — parse `triggerVocabulary`, which is structured with one declaration site, and never parse this markdown at runtime.

**Status:** one open question (61 vs 62), two carried findings, §1g.2 passing. Increment 3 remains not started.
