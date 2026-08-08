# Property flags, the session plan, and the expected-objects set — Builder Code reply

**Date:** 2026-08-07 · **Record of an event. This date never moves.**
**Answers:** the design session's architecture question, the second-consumer proposal, the `attached_garage` ruling, and the two rulings to build against.
**Method:** read at source. Every number recomputed from the artifact — the maintenance schedule, the binder schema, the class frame, and **the walk's own config snapshot**, which turns out to be the one that settles it.

**Short version: the machinery you are asking for mostly exists and is unwired, the flag count is wrong three different ways, and your instinct that several flags are mine is right and stronger than you put it.**

---

## 1 · Does session-plan generation consume the property flags? No — and the evaluator already exists

`buildSessionPlan` (`server/src/plan/sessionPlan.ts:320`) reads four things: **zones with their zone attributes**, typed pins, gaps, and carried items. **No property facts, no trigger evaluation, no `FactSet` at all.**

> **Do not confuse the two grains.** The session plan *does* carry `attributes` — but those are **zone** attributes, the six `askAtCreation` booleans like `has_mechanicals`. That is §3a's list-gate problem and it is solved. **Property flags are a different scope and are absent entirely.**

**But the shared evaluator is built, and it was built for exactly this.** `server/src/audit/triggers.ts:1–17`:

> *"It answers one question — **does X apply to this house** — for two consumers that do not know about each other: binder slots (`appliesWhen`, `expectationSource`) and the maintenance schedule's eighteen property triggers.*
>
> *…**a doctrine scan keeps it that way.** The spec is explicit that the alternative is it gets built twice and the two drift — and **two evaluators that disagree about whether a house has a well is not a bug anyone finds quickly. It would show up as a shutoff nobody was asked about.**"*

**So what would it need? Less than you would expect:**

1. **A `FactSet` for the property.** The interface is already defined (`triggers.ts:41`) and already separates **values from vocabulary** — `property` (flags true) and `propertyVocabulary` (every flag the config declares). That separation is what makes fail-open work: *a declared flag that is not set is a confident NO; an undeclared flag is "the builder has not met this word."*
2. **`buildSessionPlan` calling `evaluate()`** with that FactSet, and emitting the flags plus what they gate.

**Neither is new machinery.** The evaluator takes facts and a condition and returns a verdict, touches no database, and is exhaustively testable without an import. **The session plan simply never asks it anything.**

---

## 2 · The count is wrong three ways, and the disagreement is the finding

| Source | Property flags |
|---|---:|
| `audit/triggers.ts:7` — the evaluator's own comment | **18** |
| `schema/reference/maintenance-schedule-v1.json` `propertyTriggers` | **17** |
| **`fixtures/walk-2026-07-31/` — the field config the walk actually shipped** | **8** |
| `property.attached_garage`, anywhere | **0** |

**The eighteenth does not exist.** `attached_garage` is absent from the maintenance schedule, the class frame, the binder schema, and the Checklist Master v1.11. Either `triggers.ts` carries a stale comment, or it anticipated a flag never added. **Your ruling creates it — it is not a flag being reassigned, it is a flag being minted.**

---

## 3 · "Eight trigger nothing" — I get a different eight, and the real split is sharper

**Eight is not how many are dead. Eight is how many the field can ever set.**

The walk's config snapshot declares exactly eight `property.*` ids — and they are precisely the eight the Checklist Master gates on:

> `gas` · `municipal_water` · `oil` · `propane` · `septic` · `waterfront` · `well` · `wood_heat`

**Nine can never be true from a manifest**, because the field never asks them:

| Flag | Gates a schedule item? | In a binder slot? | **Can the field set it?** |
|---|---|---|---|
| `municipal_sewer` | no | — | **no** |
| `pool` | yes | s1, s7 | **no** |
| `generator` | yes | s1, s7 | **no** |
| `pre_1990` | yes | — | **no** |
| `solar` | yes | s1, s7 | **no** |
| `ev` | yes | s7 | **no** |
| `seasonal_vacancy` | yes | — | **no** |
| `secondary_suite` | yes | — | **no** |
| `flat_roof` | yes | — | **no** |

**Eight of the nine gate real schedule work that can therefore never fire.** `property.well` gates eleven items and works; `property.pool` gates two and cannot.

### Your instinct is right, and it is stronger than "several are mine rather than oversights"

**Eight of those nine are not observations at all. They are desk knowledge.**

- **`pool` · `generator` · `solar` · `ev` · `secondary_suite`** — every one is an **intake fact**. The household knows before anyone walks in.
- **`pre_1990`** — a document fact. Year built comes from a deed, a permit or an assessment, never from looking.
- **`flat_roof`** — visible, but from the exterior or an aerial, not from a room the concierge is capturing.
- **`seasonal_vacancy`** — a fact about how the household *lives*, and the concierge cannot see it at all.

**Only `municipal_sewer` is different, and it is a fourth thing again:** the complement of `septic`. Nobody should ever be asked both — it is derivable, and asking twice invites the two to disagree.

> **So the reason these "trigger nothing" is not that they were forgotten. It is that they were put on the wrong side of the seam.** A capture-only Discovery Visit *cannot* produce them, and asking the concierge to tick them is exactly the classification-during-capture the pivot removed. **They are the desk's, and the desk has the intake form.**

---

## 4 · The second consumer already exists as a declaration — and it is the same unbuilt shape as `preferredLabel`

**`s7.components` in `binder-schema-v1.json` already declares precisely what you proposed:**

```
"id": "s7.components",
"kind": "record-set",
"keyedBy": "field-minted uuid",
"expectationSource": "property triggers + intake services block",
"sources": ["field.pin", "ai.nameplate-extraction", "documents", "intake"]
```

**`expectationSource` is read by nothing.** `audit/schema.ts:89` types it as `unknown` — parsed and carried, never interpreted. `triggers.ts:6` names it in a comment as an intended consumer. **Declared, awaiting a consumer, exactly like `preferredLabel`.** Binder Schema v1.1 got there first and nobody wired it.

**And the receiving machinery is built.** `audit/completeness.ts:364` already handles `slot.kind === 'record-set'` against `expected` · `withRecord` · `shortfalls`. The slot-level shape for *we expected N and have M* exists and is exercised.

### So the pool case is buildable on existing parts

> intake says **pool** → `s7.components`' expectation set includes pool equipment → no component record of that class → **a shortfall with a named reason**

**And you are right that this is categorically better evidence than the alternative.** *"No object of this class was identified"* is an absence of evidence — it fires on every class the house does not have, which is most of them, and it is unfalsifiable noise. *"The household told us there is a pool and no capture shows pool equipment"* is **a disagreement between two sources**, and a disagreement is a fact.

**One thing to decide, because it changes the record shape.** That disagreement resolves three ways and they are not the same:

1. **The equipment exists and the visit missed it** → a **gap**, ours to carry.
2. **The equipment exists and is outside the captured zones** — a pool shed, a buried line → also a gap, but with a *where* attached.
3. **The intake is wrong or stale** — the pool was filled in, or the household means a neighbour's → **a correction to the intake**, and the flag should stop being true.

**Only the third changes a stored fact.** If the builder resolves silently to (1) it will generate a chase for a pool that does not exist; if it resolves silently to (3) it will delete a real one. **The proposal must be *the household reported X and we did not find it*, presented for a decision** — not a gap row and not a flag edit.

---

## 5 · `property.attached_garage` — accepted, and here is what it costs

**It does not exist anywhere**, so accepting the ruling is an addition rather than a move:

- **A `propertyTriggers` entry** in the maintenance schedule — that is the reference list's job and it is the design session's file.
- **A home for the CO-alarm condition.** The class frame's `safety` system holds four classes. A CO alarm required where a garage is attached is a **property-level condition on an object class**, which is the `opportunityConditions` shape — *"opportunity recommends"*, and this recommends.
- **No field change**, which is the point of the ruling. It never enters a config, so the field never asks it.

**One caution, since it is the first flag of its kind:** `attached_garage` is a *desk-set* flag, and the eight above are *field-set*. Once both exist, the evaluator's `propertyVocabulary` has to declare both or a desk-set flag reads as unrecognised vocabulary and fails open into "the builder has not met this word." **That is the right failure but the wrong message** — it would report a vocabulary gap where there is a scope difference. Worth declaring the flag's *origin* alongside it.

---

## 6 · The two rulings, and what I would build

### Reserve figure and `s2.next-review` — outside the vocabulary, marked in words

**Accepted, and it is the right answer.** *An unlabelled number reads as the most certain thing on the page* because every other number carries a label.

**What I would build, and the one thing that matters:** it must be a **render gate, not an optional field.** A slot declaring `renderNote` that a renderer *may* emit is Table I again — built, tested, and called by nothing (see the harvest reply §3). **The render must refuse to emit these two slots without the words**, the same way it refuses to render anything unsigned.

Concretely: the two slots declare their words; the render check treats a missing note on a `neverAI` / `classD_irreduciblyHuman` slot as a **hard refusal**, not a warning. And the words are the design session's to write — they are client-facing copy, and this repo does not invent client-facing copy.

### `property.triggers` — Reading B as the model, Reading A as the surface, and it must not resolve-and-discard

**Understood exactly, and the trap has a name in this repo already.**

`dualSourcedFacts` in the binder schema warns about precisely this: *"Overlays hold a history of values resolving to one current value **by recency**. Two simultaneously-valid values from different sources is a different shape."*

**Resolve-and-discard is what the overlay model does by default.** If the trigger set is computed as one resolved answer and the inputs are dropped, the disagreement — *household says septic, visit found municipal* — is destroyed at exactly the moment it was worth the most.

**So: store per source, resolve for the surface, keep the loser queryable.** Three properties, and I would test each:

1. **Both source values are recorded**, with their own honesty labels — the session's flag is `Observed`, the intake's is `Reported by homeowner`.
2. **The surface resolves to one**, by declared preference rather than by time — and *which* preference is a slot declaration, not a constant, because for a current-state question the observation wins and for a historical one the document does.
3. **A disagreement is retrievable and countable**, because it is an output in its own right — §4 of the binder schema already says so.

**That is `preferredLabel`'s shape arriving through the back door**, which is what the Honesty-Label Mapping §3 Reading B predicted. **Building Reading A as the surface is fine and cheap. Building it in a way that cannot become Reading B later is the failure to avoid** — and the way that happens is a single resolved column with no room for the second value.

---

## 7 · The projection finding does land here, and the arithmetic gets better

**Confirmed.** If the desk generates the visit-two list from the frame locally, then the identification call answers only *what is this* — and the ids-and-labels projection is enough:

| | ≈ tokens | in high-res images |
|---|---:|---:|
| Whole `class-frame-v1.json` | ~62,200 | 13 |
| **ids and labels only** | **~9,600** | **2** |
| A 24-image call | 114,816 | 24 |

**The frame's prose is roughly five-sixths of its bulk and answers a question the call is not asking.** Sending the projection adds ~8% to a call; sending the file adds ~54%.

**And there is a second reason beyond cost, which is the stronger one.** The frame's notes carry rulings — *zero care is a ruling* · *this held on a different axis than it was split on* · the owner's electrical line. **Those are arguments aimed at a human reading the frame, not context for a model naming a water heater.** Sending them invites the model to reason about *what this thing needs*, which is §4's job and a different act with a different honesty label. **Keeping them out of the call is a doctrine benefit that happens to also be cheaper.**

---

## What is unresolved, said plainly

**Where the desk-set flags are stored is not decided here, and it is not mine to decide alone.** They cannot live in the import's config snapshot — that is field-owned and immutable evidence. They are a property-level record this repo holds and maintains, which means a table, an actor, and an overlay history, and it touches Increment 5's object model. **Flagged rather than designed.**

**And I have not built any of this.** Everything above is what the repo currently contains, measured today. The evaluator exists; the session plan does not call it; `expectationSource` is declared and unread; `attached_garage` does not exist. **Rule 6: re-read these numbers rather than carrying them forward.**
