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
