# Binder Builder — Increment 5 Build Spec: The Engine

**Date:** 2026-08-02
**Scope:** the class frame as data, the identification pass, the research pass, the property pass, and the desk surface that confirms all of it. **The engine and the thing that confirms it, in one increment** — a frame with nothing confirming its output is untestable, and a confirmation screen with nothing to confirm is empty.
**Binds to:** `HouseSteady_Class-Frame_v1-1_2026-08-02.md` (the design) · `HouseSteady_Baseline-Service-Design_v1-1_2026-07-31.md` §5–§6 · `HouseSteady_Baseline-Process_v2-1_2026-08-02.md` Stage 2 · Increment 2b's assist machinery · the AI Processing Decision.
**Renumbering note:** this displaces what was previously called Increment 5 — the concern register — which is gated on manifest v4 and now follows. **This one is gated on nothing.**

**Version skew, stated up front.** The walk export carries field config **v1.11.0**; the reference export carries **v1.2.1**. The walk fixture is the primary test material for this increment and the reference export cannot exercise most of it — no `.unit` items, no `choice`, no video, one typed pin. **Where a test can only run against the walk fixture, say so.**

**What does not exist yet and is not this increment's job:** the class list itself, which is an owner-authored content pass. **The frame ships with zero classes**, the way `retirement-lineage-v1.json` shipped with zero entries — and for the same reason: emptiness is the honest state, and a generated approximation would make acceptance the default.

---

## 0. Non-negotiables

1. **Nothing renders client-facing without a signature.**
2. **No path assigns an honesty label at render.** Everything AI returns about a specific model is `Inferred` and carries it from the point it enters.
3. **Identification, never assessment.** The engine proposes what a thing is and what its kind needs. It never states what condition *this* thing is in.
4. **Four streams never collapse.** Gaps · findings · triggered flags · concerns. **Engine output is a fifth thing and must not be folded into any of them** — a maintenance item is not a finding, and an opportunity is not a concern until a person makes it one.
5. **Abstention is a valid output everywhere**, and a declared category with an honest abstention beats one with a plausible guess.

---

## 1. The class frame as data

**A versioned, content-hashed file in `/schema`, shipping empty.**

Per class: an id · a client-facing label, used when no specific model is identified · **the component type it maps to, or an explicit none** · care categories · inspection points · opportunity conditions · whether a replacement horizon applies.

### 1a · The named failure: two taxonomies drifting

*The class list and the field config's component types are maintained separately, disagree, and nobody notices until a session plan seeds the wrong checklist.*

**Every class declaring a component type is checked against the import's own config snapshot**, never a hardcoded list. A class naming a type the config does not declare is a **visible error**. Same discipline as the trigger vocabulary cross-check.

**A class may map to no component type, and that is ordinary.** A pod coffee maker is on no checklist and never will be. **An explicit `none` and an absent key are different things** — the first says *this kind of thing is not inspected*, the second says *nobody filled this in.* Eighth instance of that distinction.

### 1b · Consumables carry a part identity

**A distinct kind of care category, because an interval alone does not let anyone act.** *Replace the fridge filter every six months* is useless without which cartridge.

**A wrong part number costs a trip**, which makes this the place where abstention is worth most. The part identity is `Inferred` until it has been bought and fitted once, then `Documented` from the purchase record — **and it never needs asking again for that house.**

`s9.consumables` already exists in the Binder Schema as a `presentWhenPopulated` slot, declared and never fed. **This is what feeds it.**

---

## 2. Objects — a new entity, and it is not a pin

**The named failure:** *the builder reuses pins to represent captured things, and a desk-side confirmed identification becomes indistinguishable from a field-side pin the concierge placed.*

Under capture-first **nothing is classified in the room.** A photograph is taken; no pin, no type. So:

| Stage | What exists |
|---|---|
| Discovery Visit | zone-owned media, no pins |
| Desk pass | **objects** — the desk's confirmed answer about a thing in a room |
| Session plan | objects carry confirmed classes outward |
| Inspection Visit | pins exist, with component types **the object's class seeded** |

**An object is: a property, a zone, a class, a label, the media that evidence it, and who confirmed it and when.** It is a builder-side entity. **A pin is a field-side entity.** They may come to reference each other; they are never the same row.

**This inverts the old order and Code should know it:** the class is now upstream of the component type, where it used to be downstream.

---

## 3. The identification pass

**Batch by room, never by photograph.**

**The named failure:** *three hundred photographs asked one at a time is three hundred calls, and it is also less accurate — the model sees disconnected frames instead of a room.* One call per zone is five to ten on a five-zone house.

**Input:** a zone's media, its label and type, and the property flags.
**Output:** proposed objects, each with a class where one fits, a proposed label, and the media that evidence it.

**An object with no matching class is proposed anyway**, carrying the concierge's or the model's freeform description. **It is captured, researched openly, and generates work** — it simply does not get the frame's structure. Fail open on vocabulary, exactly as everywhere else. **It also goes to the review queue** (§7).

**One photograph may evidence several objects and one object several photographs.** Neither is an edge case; the kitchen shot holds the fridge, the range and the dishwasher.

---

## 4. The research pass

**Batch by object. Both questions in one call.**

### 4a · Bounded

*For each category this class declares, what is the interval and procedure for this model?*

**A declared category with no answer is a visible gap**, reported per object, not a silent nothing.

### 4b · Open — and the frame fails without it

**The named failure, and the frame itself creates it:** *the class declares descaling, filter and cleaning cycle. A newer model needs a fifth thing. Asking only the declared categories means the fifth thing can never surface, and the frame that stops invention also stops discovery.*

*What else does this model need that the list does not cover?*

**Anything it returns is a proposal against the class, never a fact about the house.** It does not reach a client, does not reach the maintenance list, does not become a task. **It goes to the review queue.**

### 4c · The four outputs have different declared-to-generated balances

Care is mostly generated. **Inspection points are mostly declared** — a TPR valve is a TPR valve on every gas water heater, and asking a model to rediscover it is wasteful and less reliable. Opportunity conditions are declared and conditionally fired. **The replacement horizon is entirely generated**, and the class declares only that one applies.

**Do not normalise these into one shape.** The differing balance is the design.

---

## 5. The property pass

**The named failure, and it is the sharpest here:** *a per-object engine can only generate work from things that exist. It is structurally incapable of noticing what is missing.* Nothing about a water heater says the house has no CO alarm near it. Nothing about twelve supply registers says there is one return.

**It runs last, after everything is identified.** A property pass over a half-identified house produces confident nonsense about absences that are really unprocessed photographs. **That is a hard ordering constraint, not a preference**, and it is the failure most likely to ship if left implicit.

**Bounded the same way:** a declared list of property-level questions, plus one open question. **Inputs are what no object has** — the full confirmed inventory, the property flags, the zone attributes as decided, and the floorplan when it exists.

### 5a · An absence states its own basis

**The difference between *there is no CO alarm on this floor* and *we did not photograph one* is the difference between a useful finding and a liability.**

**So every absence proposal carries what it is derived from** — *no object of this class was identified on this floor, and this floor's capture covered N rooms.* Where the capture cannot support the claim, **the pass says so instead of making it.**

Rule 9 at the point it matters most: a document asserting a checked state must carry the check.

---

## 6. The confirmation surface

**Bind to Increment 2b rather than re-specifying it.** The assist machinery already carries: proposals quarantined until signed · accept, edit-first, or reject · a suggestion shown and never pre-filled · unanimity, so one corrected character marks the whole reading edited · abstention ending in an explicit act · classifications rendered as evidence beside what they gated, never in the proposal list.

**What is new is the breadth, not the mechanism.**

**The one thing 2b does not have, and it is a live defect:** the assist screen renders a nameplate at 1200px with no zoom, against ~4000px originals. **§9's first guard is *evidence first, suggestion second — photo large*, and a photograph the concierge cannot read is not doing the job the guard assigns it.** The suggestion becomes the only legible thing on screen, which is the acquiescence the guard exists to prevent. **Fix it here.** `mediaUrl` exists and is referenced nowhere in the web app despite a comment claiming a lightbox.

**Confirmation is per object, not per output.** A concierge confirms *this is an American Standard gas water heater, serial ending 4471* once — and the four streams follow from it. **Confirming a class four times gets a weaker signature each time**, the same reasoning as one signature per nameplate.

*Recorded, not specced:* whether generated care items are individually confirmable or ride the object's confirmation. My reading is they ride it and are individually **editable** afterwards, because a concierge confirming twelve maintenance intervals per object is the four-hour desk pass returning by another door. But it wants a real screen in front of a person before it is settled.

---

## 7. The review queue

**One queue, three inputs, running from the first house.**

Unclassed objects · open-question returns · **freeform pin labels, which have been exported verbatim and flagged since the Manifest Contract was written and which nothing has ever aggregated.**

**All three are proposals against the frame.** Grouped, counted, ranked. *Three water heaters this quarter returned "expansion tank inspection" and the class does not declare it.*

**The named failure:** *the class list is written once from imagination and never grows, because the evidence that it should grow sits in the exports and nobody counts it.*

**The first ten houses are when the frame is emptiest and the proposals most numerous.** That is the harvest, not the warm-up.

---

## 8. Cost containment

**Specified in Service Design §6.7. The structure ships now; the numbers come from measurement.**

- **One retry, then abstain.** An unparseable answer is an abstention, not a reason to ask again.
- **A hard call ceiling per object and per room**, so a runaway is contained to one object rather than one house.
- **A per-house budget as a reported backstop**, never a silent refusal.

**The named failure:** *one unnoticed loop eats the house's budget, and then legitimate work is refused while nobody knows why.* An aggregate ceiling fails late and punishes the wrong thing.

**Report actual cost per house from the first run.** The walk export is the first material that can say how many objects a real five-zone house produces.

---

## 9. Deliberately deferred to a later slice

**Desk pass stages 1 and 2 — assemble the house, and place the captures.** Both need floorplan geometry and per-capture position from RoomPlan, which is blocked on hardware and on a field-app change. **Stages 3 and 4 — identify and confirm — need only the photographs, and those exist.**

**So this increment builds the half that is unblocked**, and placement arrives with RoomPlan. **Do not build a manual-placement fallback yet** — it would be built against a guess at what RoomPlan returns, and Design v1.1 §C3's adapter pattern is the right home for the difference when it comes.

---

## 10. Tests and scans

**Behavioural, and the walk fixture is the material:**

- A class naming a component type absent from the import's config snapshot is reported, not silently accepted
- **An explicit `none` component type and an absent key produce different states**
- An object with no class is still proposed, still researched, and appears in the review queue
- A declared care category with no answer is a reported gap per object
- **An absence proposal without a stated basis cannot be constructed** — the type or the constructor forbids it
- The property pass refuses to run before identification completes
- One retry then abstain; a per-object ceiling contains a runaway to that object

**Doctrine scans — the durable half:**

- **No engine output reaches a client-facing render without a signature.**
- **No path assigns or changes an honesty label at render**, extended to engine output.
- **Engine output cannot be written into the findings, gaps or concerns tables.** §0.4 — it is a fifth stream.
- **The class file's component types are read from an import's config snapshot, never from a literal.**
- **The property pass has no code path reachable before identification is complete.**
- **Nothing in the research path can construct an absence claim without a basis.**

**Negative-test every new scan when written**, per §9b. CI history is empty signal here.

---

## 11. Out of scope

The class list · prompt text, which is versioned prompt files per the AI Assist Plan · desk pass stages 1 and 2 · concern lifecycle and the concern register, which is gated on manifest v4 · the Home Profile render · **whether opportunity output ever reaches a client unprompted, which is a live business question and deliberately open.**

---

**Status:** ready for Builder Code on the owner's ratification. **The class list is the content pass this unblocks, and the file ships empty until it exists.**
