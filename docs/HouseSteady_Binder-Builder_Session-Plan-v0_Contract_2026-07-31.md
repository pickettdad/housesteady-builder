# Session Plan v0 — the contract

**Date:** 2026-07-31
**Emitted by:** the binder builder, at `GET /api/properties/:id/session-plan`
**Consumed by:** nothing yet. `PLAN-STAGE-1` §7a and §7a-ii scope the field-side import in detail but it is not built.
**Status:** **specified and emitting.** Increment 4 §3 says to emit as though no receiver exists, and that is the correct sequencing — the import cannot be built until something emits an artifact to build against. **This document is the thing to review before the receiver is written**, and the field session should disagree with it here rather than after both halves exist.

---

## 1. What it is, and what it is not

**It is the return leg.** The manifest is the field's export; this is what goes back. §1 of the Object/Concern Model makes it structural rather than a convenience:

> Without it a five-year-old leak is minted fresh every visit and nothing lines up.

**It is session data, never config.** It never touches the generated config or its hash. A plan that modified the config would make the config a function of what the builder thinks, and that is backwards: the config is the field's declaration of *what a visit asks*, and the plan is *one visit's starting state*. A doctrine scan gives the emitter no write path into a config snapshot, and a test asserts no config key appears anywhere in the payload.

**Naming trap.** `src/engine/plan.ts` in the field repo exports `SessionPlan` and `compilePlan`. **That is the v1 slot-model plan compiler and is unrelated to this.** Nothing here binds to it or mirrors its shape, and a scan keeps the word `compilePlan` out of this module — two things with one name is how somebody eventually binds to the wrong one.

## 2. The failure it exists to prevent

From Increment 4 §3a:

> A concierge ticks `has_mechanicals` on the basement during the baseline. Visit two replays the zone as identity only. The attribute arrives absent, falls through to a default — and twelve of thirteen zone types have no default. The mechanical checklist is empty on visit two, and an empty checklist reads as already handled.

**Measured against the reference config, and it is worse than that.** `defaultsTrueFor` appears nowhere in field config v1.2.1, so **thirteen of thirteen zone types have no default for anything.** An attribute arriving absent has nothing to fall through to at all.

Three items in that config are gated on a zone attribute:

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

So the plan carries **the recorded map verbatim, falses included**, and names the never-asked attributes separately in `neverAsked`. A doctrine scan forbids filtering the map to its true values.

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
    "neverAsked": ["exterior_wall", "has_plumbing"]
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
    "since": "…"                 // first made due — "open since the baseline"
  }],

  "monitorsDue": [{ "pinId": "…", "componentType": "…", "label": null }],
  "comparisonPositionsDue": [{ "pinId": "…", "itemId": "wh.unit" }],

  // Recorded, not specced. Increment 5, gated on manifest v4.
  "openConcerns": [],

  "sections": { /* see §7 */ },
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

## 7. Every section says why it is empty

**Three of five sections are empty on the reference export**, and an empty section is identical whether the mechanism works and found nothing, was never built, or cannot be expressed by this config. That is Verification Discipline rule 7 at the payload level.

So `sections` carries a count **and a sentence** per section, and the sentence distinguishes the cases:

| Section | On the reference export |
|---|---|
| `monitorsDue` | *"no live pin carries the monitor flag — the mechanism ran and found none, which is not the same as it being unbuilt"* |
| `comparisonPositionsDue` | *"this config declares no `.unit` items, so there is no comparison position to be due — unexercised rather than empty"* |
| `openConcerns` | *"recorded, not specced — concerns are Increment 5 and gated on manifest v4"* |

A count alone cannot say whether the mechanism ran. A scan asserts `SectionReport` carries both.

## 8. What a receiver should push back on

Written down because the field session should disagree here rather than after both halves exist:

1. **`neverAsked` may be the wrong shape.** It is derived from the config's `zoneAttributes[]` minus what the zone recorded, so it changes when the config changes rather than describing what happened. A receiver that treats it as history will be wrong. It is a *current* statement: given today's vocabulary, these are unanswered.
2. **`since` is an import timestamp, not a visit date.** The visit date is on the visit row and the plan does not carry it. If the field app wants to say *"open since your March visit"*, it needs the visit date and this does not send one.
3. **Nothing here is versioned per zone or per object.** A receiver replaying a plan twice gets the same answer, but there is no changelog between two plans. If the field app wants *"what changed since the last plan"*, that is a second artifact rather than a field on this one.
4. **`monitorsDue` reads the field's own `flag` vocabulary and does not interpret it.** This export carries `issue` and `monitor`; only `monitor` is taken. A third value would be ignored rather than guessed at, and the receiver should assume that.

---

**Status:** emitting, unreviewed by a receiver. **This document is the review surface.**
