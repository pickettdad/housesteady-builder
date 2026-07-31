# Session Plan v0 — the contract

**Date:** 2026-07-31 · revised same day with the design session's four answers
**Emitted by:** the binder builder, at `GET /api/properties/:id/session-plan`
**Consumed by:** nothing yet. `PLAN-STAGE-1` §7a and §7a-ii scope the field-side import in detail but it is not built.
**Status:** **specified and emitting.** Increment 4 §3 says to emit as though no receiver exists, and that is the correct sequencing — the import cannot be built until something emits an artifact to build against. **This document is the thing to review before the receiver is written**, and the field session should disagree with it here rather than after both halves exist.

---

## 1. What it is, and what it is not

**It is the return leg.** The manifest is the field's export; this is what goes back. §1 of the Object/Concern Model makes it structural rather than a convenience:

> Without it a five-year-old leak is minted fresh every visit and nothing lines up.

**It is session data, never config.** It never touches the generated config or its hash. A plan that modified the config would make the config a function of what the builder thinks, and that is backwards: the config is the field's declaration of *what a visit asks*, and the plan is *one visit's starting state*. A doctrine scan gives the emitter no write path into a config snapshot, and a test asserts no config key appears anywhere in the payload.

**Naming trap.** `src/engine/plan.ts` in the field repo exports `SessionPlan` and `compilePlan`. **That is the v1 slot-model plan compiler and is unrelated to this.** Nothing here binds to it or mirrors its shape, and a scan keeps the word `compilePlan` out of this module — two things with one name is how somebody eventually binds to the wrong one.

**It is a to-do list, not a diff.** There is deliberately no changelog between two plans. *Recorded, not specced:* if one is ever wanted, Design v1 §6's edition mechanism already does this for the binder and the pattern copies.

## 2. The failure it exists to prevent

From Increment 4 §3a:

> A concierge ticks `has_mechanicals` on the basement during the baseline. Visit two replays the zone as identity only. The attribute arrives absent, falls through to a default — and twelve of thirteen zone types have no default. The mechanical checklist is empty on visit two, and an empty checklist reads as already handled.

**The number is a range across versions, and citing one figure reads as a contradiction to whoever finds it next.**

| Read from | Zone types with no default |
|---|---|
| Master v1.11 *(Field Code)* | **12 of 13** |
| Field config v1.2.1 *(measured here)* | **13 of 13** — `defaultsTrueFor` appears nowhere at all |

Both are true of the version they were read from. The honest statement is *between twelve and thirteen of thirteen, and **none at all** on the config this repo can currently read* — which makes carrying the decisions the only mechanism available, not merely the better one.

Three items in field config v1.2.1 are gated on a zone attribute, so the failure is demonstrable rather than hypothetical:

| Item | Gate |
|---|---|
| `liv.egress` | `zone.sleeping` |
| `bsm.finished-behind` | `zone.finished` |
| `cir.stairs-rails` | `zone.has_stairs` |

The reference export's ensuite carries `finished: true`. Lose that on replay and anything gated on it stops being due, in a room where it applies, with nothing to say so.

**The test for what belongs in the plan:** *could the app work this out again by looking at the house?* If no, carry it explicitly.

## 3. The trap inside "carry the attributes"

**A recorded `false` is a decision. An absent attribute is not.**

The bedroom carries `sleeping: false` — somebody was asked at zone creation and said no. `has_plumbing` is absent from both zones, because this config sets `askAtCreation: false` on it and nobody has ever been asked.

An emitter that carries truthy keys only makes those two identical on the receiving end. Visit two then cannot tell *"we established there is no plumbing here"* from *"nobody has considered it."*

So the plan carries **the recorded map verbatim, falses included**, and names the rest in `unanswered`. A doctrine scan forbids filtering the map to its true values, and asserts the positive form — the test is `typeof value === 'boolean'`, not whether the value is true, which is the part that survives somebody optimising the payload later.

*(Third time this distinction has decided a design here, after declared-and-false in the trigger evaluator and typed/stub/undeclared for component types.)*

## 4. The payload

```jsonc
{
  "planSchemaVersion": 1,
  "kind": "session-plan",

  // Provenance-tagged `system`, per §3.
  "source": {
    "actor": "system",
    "binderId": "…",        // the property id — see §5
    "propertyId": "…",
    "auditRunId": "…",      // which audit run the carried gaps came from
    "generatedAt": "…",
    "generatedBy": "…"      // the operator who generated it
  },

  "property": { "id": "…", "label": "…" },

  // §3a. One entry per zone uuid across every visit — the field-minted uuid is
  // the cross-visit identity, so the same ensuite seen twice is one ensuite.
  "zones": [{
    "zoneId": "…",
    "label": "ensuite",
    "type": "bathroom",
    "attributes": { "finished": true, "sleeping": false, "has_stairs": false },
    "unanswered": ["exterior_wall", "has_plumbing"]
  }],

  // Live typed pins, by uuid. Retired pins are not carried — a removed water
  // heater is house history, not an outstanding question.
  "objects": [{
    "pinId": "…",
    "componentType": "smoke-alarm",
    "label": null,
    "priorUnitPhoto": null      // §B3 — see §6 below
  }],

  // The §1b stream, with the config's own reason verbatim.
  "carriedGaps": [{
    "scopeKind": "zone",
    "zoneId": "…",
    "pinId": null,
    "itemId": "int.canvas",
    "reason": "not-reached",     // or the na reason id, e.g. `deferred`
    "since": "2026-07-24",       // the VISIT DATE — see §7. Null if unrecorded.
    "sinceImportedAt": "…"       // a different fact, named separately
  }],

  "monitorsDue": [{ "pinId": "…", "componentType": "…", "label": null }],
  "comparisonPositionsDue": [{ "pinId": "…", "itemId": "wh.unit" }],

  // Recorded, not specced. Increment 5, gated on manifest v4.
  "openConcerns": [],

  "sections": { /* see §8 */ },
  "warnings": []
}
```

## 5. `binderId` is the property id, and that is named rather than assumed

A binder is a property's record and no separate binder entity exists in this build. **If a binder ever becomes its own row, `binderId` is the field that changes** — so it is a distinct key rather than a second name for `propertyId`, and a receiver must not infer the equivalence.

## 6. §B3 — prior unit photographs, built and unexercised

`.unit` items are the object-level comparison position: *"here is your water heater, and here is what it looked like last year."* The prior photograph must ride back into the visit and display beside the capture prompt, because nothing in the field app can enforce consistent framing unaided and at hour three the concierge will not recall the angle.

**The mechanism is built. It has never run.** The master declares 23 `.unit` items; **field config v1.2.1 declares none**, so there is no comparison position to carry and `priorUnitPhoto` is null on every object.

**Null here is not a failure to find one**, and the plan says so in `sections.comparisonPositionsDue` and in `warnings` rather than leaving an empty array to be read either way.

**There is deliberately no fallback to "the most recent photo on this pin."** The two canonical photographs stay distinct — the **unit shot** (condition over time) and the **nameplate shot** (identity and age evidence, Manifest Contract §7b) — and inventing a comparison position from an arbitrary photograph would conflate them. A scan holds it.

## 7. Two fields the receiver must not conflate

**`since` is the visit date.** *"Open since your March visit"* is what the field can say out loud. An import timestamp has no meaning there — the reference export was **visited on 2026-07-24 and imported on 2026-07-31**, and a receiver reading the wrong one would tell a client their gap opened a week after it did.

**`sinceImportedAt` is the import timestamp**, under its own name. It is here because it is the ordering key this repo actually sorts on.

**`since` is null when the visit carries no date, and does not fall back.** One field standing for two facts is how a zone `type` ended up doing a nickname's job. `sections.carriedGaps` reports how many are null and says explicitly that they were *not defaulted to the import timestamp*.

## 8. Every section says why it is empty

**Three of five sections are empty on the reference export**, and an empty section is identical whether the mechanism works and found nothing, was never built, or cannot be expressed by this config. That is Verification Discipline rule 7 at the payload level.

So `sections` carries a count **and a sentence** per section, and the sentence distinguishes the cases:

| Section | On the reference export |
|---|---|
| `monitorsDue` | *"no live pin carries the monitor flag — the mechanism ran and found none, which is not the same as it being unbuilt · flags on live pins: 2 issue"* |
| `comparisonPositionsDue` | *"this config declares no `.unit` items, so there is no comparison position to be due — unexercised rather than empty"* |
| `openConcerns` | *"recorded, not specced — concerns are Increment 5 and gated on manifest v4"* |

A count alone cannot say whether the mechanism ran. A scan asserts `SectionReport` carries both.

## 9. Pin flags — preserved, displayed, counted, marked

`monitorsDue` carries pins the field flagged `monitor`. **Every other flag value is counted and reported rather than ignored**, because *ignored* is none of the four things Observed Addendum §5 requires — it is the safe branch that never announces itself.

- **The pin `flag` has no declared vocabulary in the config.** `propertyFlags[]` is a different thing entirely: house-level facts like `well` and `municipal_sewer`. So the two values this build knows — `monitor` and `issue` — come from the Manifest Contract rather than from data, and anything else is genuinely unmet vocabulary.
- `sections.monitorsDue` lists **every flag value present with its count**, whatever this build does with it.
- A value this build has never met is additionally **named in `warnings`** and marked *not treated as a monitor* — preserved and counted, never dropped, and never guessed into being a monitor either.

## 10. What a receiver should still push back on

Two of the original four are now settled — `unanswered` was renamed and `since` became the visit date. These remain:

1. **`unanswered` is a current statement, not history.** It is derived from today's `zoneAttributes[]` minus what the zone recorded, so an attribute the config gains between visits appears here. **That is intended** — nobody has answered it and somebody should — but a receiver that treats it as *"was never asked on any visit"* will be wrong. The name was corrected from `neverAsked` for exactly this reason: *never* is a historical quantifier on a current fact, the same failure as *"we were not able to cover."*
2. **`monitorsDue` reads the field's `flag` vocabulary without interpreting it.** A third value is counted and reported, never guessed into being a monitor. If the field app expects a new flag to behave like one, it has to say so — the builder will not infer it.

---

**Status:** emitting, unreviewed by a receiver. **This document is the review surface.**
