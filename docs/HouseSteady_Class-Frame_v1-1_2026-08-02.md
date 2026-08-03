# HouseSteady — The Class Frame (v1.1)

**Date:** 2026-08-02
**Version:** v1.1 — v1 (same day) with two additions from the owner's read: **consumables are a distinct kind of care category** (§3.3) and **the property pass** (§5), which exists because a per-object engine is structurally blind to absence.
**What this is:** the design of the engine. **Recognise a thing → know what that kind of thing needs → generate work.** This document specifies the frame's shape, what it declares, what AI supplies, and how the two stay honest about which is which.
**Governed by:** `HouseSteady_Baseline-Service-Design_v1-1_2026-07-31.md` §6, which decided the approach. This is the design that follows from it.
**Audience:** Builder Code, as the design input to the increment that builds it. **Not a build spec** — that comes after this is ratified.
**What it does not contain:** the class list itself. That is a content pass, owner-authored, and it is the largest piece of new content the redesign creates.

---

## 1. The problem it solves, stated as a failure

*A maintenance schedule that lists products grows with the number of products in the world. It is out of date the week it is written, it is wrong in exactly the ways a model is wrong, and nobody can tell which entries were checked and which were guessed.*

**So the schedule declares classes of object and the kinds of care they need — never specific products, intervals or procedures.**

Not *Keurig K-Elite → descale every 3 months.* Instead: **pod coffee maker → descaling · water filter · cleaning cycle** — the categories of care that exist for this class. AI supplies the model-specific interval, procedure and detail.

**The list stops growing with the world and starts growing with the number of kinds of thing**, which is small, stable and ours.

**This is the third instance of a move this project already makes twice.** The Binder Schema is the Master Spec as data — the frame, not the content. The checklist config declares what a visit asks — the frame, not the answers.

---

## 2. What a class is

**Granularity: roughly that of a trade call.** *Pod coffee maker · fridge · dishwasher · gas water heater · forced-air furnace · sump pump · sectional garage door.*

Specific enough that the categories of care are genuinely shared. Coarse enough that the list stays in the low hundreds and stops growing.

### 2.1 · The class is finer than the component type, and it arrives later

**This inverts what was true before the redesign, and it matters.**

The field config declares **component types** — `water-heater`, `smoke-alarm`, `water-treatment`. Those drive checklists. But a **gas** water heater and an **electric** water heater share a component type and do not share their care: only one has combustion venting.

**And under capture-first, most objects have no pin type at all when they are captured.** A photograph is taken; nothing is classified in the room. So:

| | |
|---|---|
| **Discovery Visit** | A photograph. No pin, no type, no class |
| **Desk pass** | AI proposes a class from the photograph and any nameplate. The concierge confirms |
| **Session plan** | Objects carry confirmed classes |
| **Inspection Visit** | Pins exist, with component types the class seeded |

**So a class declares which component type it maps to**, and that mapping is what seeds the right checklist for the Inspection Visit. **The class is upstream of the component type now**, where it used to be downstream of it.

### 2.2 · Named failure — two taxonomies drifting

*The class list and the component-type list are maintained separately, disagree, and nobody notices until a session plan seeds the wrong checklist.*

**Every class declares its component type, and that declaration is checked against the field config's own list.** A class naming a component type the config does not declare is a **visible error**, not a silent one. Same discipline as the trigger vocabulary cross-check.

**A class may map to no component type.** A Keurig is not on any checklist and never will be — it generates maintenance and nothing else. That is ordinary and must not be treated as an incomplete class.

---

## 3. Four outputs, and they are not the same shape

**One class lookup, four streams. This is what makes it an engine rather than a maintenance feature.**

| Output | What the class declares | What AI supplies | Balance |
|---|---|---|---|
| **Care** | The categories of maintenance that exist for this class | Interval, procedure, model-specific detail | **Mostly generated** |
| **Inspection** | The points to check, which are class-level facts | Model-specific additions only | **Mostly declared** |
| **Opportunity** | The conditions worth raising, and what each is | Whether the condition is met, and the specifics | **Declared, conditionally fired** |
| **Replacement horizon** | Only *that this class has a lifespan worth stating* | The band, and the basis for it | **Entirely generated** |

**The differing balance is deliberate and worth preserving.** A TPR valve is a TPR valve on every gas water heater — declaring it is right, and asking a model to rediscover it every time is both wasteful and less reliable. A descaling interval genuinely varies by model. **Declaring what is stable and generating what varies is the whole design.**

### 3.1 · Worked example — gas water heater

- **Care:** anode rod · sediment flush · TPR valve exercise · combustion air check
- **Inspection:** TPR discharge piping · expansion tank · drain pan and its drain · venting condition · seismic or tip restraint where required · visible corrosion at fittings
- **Opportunity:** *no drain pan present* · *no expansion tank on a closed system* · *unit age past the band's midpoint* · *electric resistance where gas is available*
- **Replacement horizon:** the band, against the manufacture date decoded from the serial

**One capture. Four streams. One confirmation pass at the desk.**

### 3.3 · Consumables are a care category with a part identity

**A distinct kind, because an interval alone does not let anyone act.** *Replace the fridge water filter every six months* is useless without knowing **which cartridge.** Same for furnace filters and their size, range hood grease and charcoal filters, sediment and carbon cartridges, humidifier pads, softener resin cleaner, sump check valves, water-heater anode rods.

**Three things make consumables their own shape rather than an ordinary care category:**

- **They carry a part identity**, not just an interval — a model number, a size, a rating. **AI supplies it, and a wrong one costs a trip**, which makes it a place where abstention is worth far more than a plausible answer.
- **They can be bought ahead.** A known filter with a known interval is stock, and **across a client base it is the clearest group-buy there is** — twenty furnace filters bought together, the whole discount theirs per Entry 14. A homeowner acting alone can never replicate that, and it is a reason the retainer is worth more in year three than in year one.
- **They are the most frequent recurring work in the house**, which makes them the bulk of what the maintenance calendar actually contains.

**The binder already has the hook.** `s9.consumables` exists in the Binder Schema as a `presentWhenPopulated` slot — declared and never fed. **The class frame is what feeds it.**

**Honesty:** the part identity is `Inferred` like any other research, **until it has been bought and fitted once.** After that it is `Documented`, from the purchase record — and it never needs asking again for that house.

### 3.2 · The fourth has the longest reach

*"This water heater was manufactured in 2011. Units of this type typically last 8–12 years."*

**Two labelled facts side by side, and the homeowner draws the conclusion.** That is the sentence a household remembers, and it is why serial decoding is a dependency of a promised deliverable rather than enrichment.

---

## 4. The two questions

**Every identified object produces one call carrying two questions.**

### 4.1 · Bounded

*For each category this class declares, what is the interval and procedure for this model?*

Structured, comparable across houses, and **a category with no answer is a visible gap** rather than a silent nothing.

### 4.2 · Open — and the frame fails without it

**Named failure, and it is one the frame itself creates:** *the class declares descaling, filter and cleaning cycle. A newer model needs a fifth thing. Asking only the declared categories means that fifth thing can never surface — and the frame that stops invention also stops discovery.*

*What else does this specific model need that this list does not cover?*

**Anything the open question returns is a proposal against the class, never a fact about the house.** It does not reach a client, it does not reach the maintenance list, and it does not become a task. **It goes to the review queue** (§7).

**Without the open question the frame is correct on the day it is written and quietly wrong for years afterwards.**

### 4.3 · Abstention is a valid answer to both

*I do not know* is correct and is recorded as such. **A declared category with an honest abstention is more useful than one with a plausible guess**, because the abstention can be chased and the guess gets believed.

---

## 5. The property pass

**The named failure, and it is the sharpest one in this document:** *a per-object engine can only generate work from things that exist. It is structurally incapable of noticing what is missing.* Nothing about a water heater says the house has no CO alarm near it. Nothing about twelve supply registers says there is only one return.

**Absence is invisible to every pass that walks objects one at a time.** And absence is where a great deal of the value is.

### 5.1 · Systems cross zones, and so do the questions

The furnace is in the mechanical room; its registers are in every room, its return is somewhere else, its thermostat is on a hallway wall. The water heater is in the mechanical room; its effects are at every tap. The panel is in the basement; its circuits are everywhere.

**Two things follow.**

**Classes declare system membership** — `forced-air furnace`, `supply register`, `return grille` and `thermostat` all belong to `hvac`. Cheap to declare, and it is what makes a system addressable at all. The binder's systems inventory is a grouping over it rather than a separate structure.

**And some questions can only be asked of the whole property.** Supply-versus-return balance. Two atmospherically vented appliances sharing a chimney. Alarm coverage against sleeping areas. Whether every fixture has a shutoff. Whether the sump has a backup and whether the panel could power one.

### 5.2 · The field side already has this shape

**`ses.termination-reconcile` is exactly a property-level question:** *every interior exhaust matched to a pinned exterior termination.* It cannot be answered in any one zone — it is a reconciliation across the whole house, and it is the one session-scoped item the walk actually carried.

**So the checklist's `session` scope is the field's property-level layer, and it already works.** What does not exist is the desk-side counterpart: **a pass over the assembled inventory that can see relationships and absences the checklist did not think to ask about.**

### 5.3 · The pass, and its one hard constraint

**It runs last, after everything is identified.** A property pass over a half-identified house produces confident nonsense about absences that are actually just unprocessed photographs. **That is a sequencing constraint on the desk pass, not a preference** — and it is the failure most likely to ship if the ordering is left implicit.

**It is bounded the same way everything else is.** A declared list of property-level questions, plus one open question — *what does the shape of this property suggest that the list does not ask about?*

**Its inputs are what no object has:** the full confirmed inventory, the assembled floorplan with rooms and adjacencies, the property flags, and the zone attributes as decided.

### 5.4 · Where its output goes, and where it must not

**Everything it produces is a proposal**, and it routes exactly like the per-object streams — inspection targets to the session plan, opportunities to the concern and quoting side, and **anything about the class list itself to the review queue.**

**But it needs one thing the object streams do not:** an absence is a claim, and **the difference between *there is no CO alarm on this floor* and *we did not photograph one* is the whole difference between a useful finding and a liability.**

**So an absence proposal states its own basis** — *no object of this class was identified on this floor, and this floor's capture covered N rooms.* **A person confirms it or does not.** Where the capture cannot support the claim, the pass says so instead of making it. Rule 9, at the point it matters most: a document asserting a checked state must carry the check.

**Nothing from this pass renders as an assertion about the house without a human signature.** Same gate as everything else, and it is the pass where the gate does the most work.

---

## 6. Honesty labels

**Everything AI returns about a specific model is `Inferred`, never `Observed`, and it renders labelled.**

| Fact | Label |
|---|---|
| *This is a gas water heater* — concierge confirmed from the photograph | **Observed** |
| *Manufacturer, model, serial* — transcribed from the nameplate | **Documented**, citing the plate ▸ |
| *Manufactured 2011* — decoded from the serial | **Inferred**, citing the decode |
| *Descale every three months* — research | **Inferred** |
| *Units of this type last 8–12 years* — research | **Inferred** |
| *Common failure modes include a failed thermocouple* | **Inferred**, and about a product line — **not about this household's unit** |

▸ *The nameplate label wants confirming against the honesty-label mapping work rather than asserting here. A plate is a record affixed to the machine, which argues `Documented`; the concierge also looked at it, which argues `Observed`. It is one decision and it belongs with the other 22 undeclared slots.*

**The line that gets harder, not easier.** *"Common failure modes include X"* is research about a product line. Rendered next to a photograph of their water heater, it reads as a statement about their water heater. **Better research makes overclaiming easier** — the same point the Exterior Capture note makes about aerial photographs, and the frame has to hold it because nothing else will.

**And the conclusion stays the homeowner's.** *This water heater is near the end of its life* is not ours to say. The two labelled facts sit next to each other and the household draws the inference, or a licensed specialist does.

---

## 7. The review queue

**One queue, three inputs, and it runs from the first house — not from the second concierge.**

1. **Unclassed objects** — the concierge typed what a thing was because no class fit
2. **Open-question returns** — categories a model needed that its class does not declare
3. **Freeform pin labels** — already exported verbatim and flagged by Manifest Contract §7, and **nothing has ever aggregated them**

**All three are proposals against the frame.** Grouped, counted, ranked. *Three water heaters this quarter returned "expansion tank inspection" and the class does not declare it.* *Six objects across four houses were typed "wine fridge."*

**Named failure:** *the class list is written once from imagination and never grows, because the evidence that it should grow exists in the exports and nobody is counting.*

**Build it from the first house.** The first ten houses are exactly when the frame is emptiest and the proposals most numerous — that is the harvest, not the warm-up. **And memory is precisely what fails:** whoever types *wine fridge* in house three will not recall it in house nine.

**It is cheap.** No new capture, no new field, no client-facing surface. The data already travels by contract. It is a query and a screen.

---

## 8. Fail open, always

**An object with no class is captured, researched openly, and generates work.** It simply does not get the frame's structure until a class exists.

**Nothing about a missing class blocks anything**, and the gap is visible, counted and named. Same rule as unknown resolution kinds, unknown pin types and unknown na reasons: **preserve, display, count, mark as unrecognised. Never drop, never guess.**

---

## 9. What the frame declares — the shape

**Recorded, not specced.** The outcome matters more than the shape, and Builder Code decides the shape. But the fields below are what the design requires to exist, and a shape that cannot express one of them is the wrong shape.

Per class: **an id** · **a client-facing label**, used when no specific model is identified · **the component type it maps to, or an explicit none** · **care categories** · **inspection points** · **opportunity conditions** · **whether a replacement horizon applies.**

**Three properties the file must have**, because they are the ones that go wrong:

- **Versioned and content-hashed**, like every other schema file, and **every engine output records the version it was generated under.** *Why did March word this differently* stays answerable.
- **Owner-authored, whole-file replacement.** Same discipline as the Checklist Master.
- **Declared-empty and never-declared are different.** A class declaring zero care categories says *this kind of thing needs no maintenance* — a real and useful statement. A class with no care key at all says *nobody has filled this in yet.* **Collapsing them reports the second as the first**, which is the eighth instance of that distinction deciding something here.

---

## 10. Cost and containment

**Specified in Service Design §6.7 and not restated.** In brief: **batch identification by room, not by photograph** — one call per room is five on a five-zone house rather than three hundred, and it is more accurate because the model sees the room. **Research batches by object**, both questions in one call. **The guard belongs on the retry, not on the total** — one retry then abstain, a hard ceiling per object and per room, and the per-house budget as a reported backstop rather than a silent one.

**The numbers come from measurement.** The walk export is the first material: it can say how many objects a real five-zone house actually produces.

---

## 11. What this does not decide

- **The class list.** The content pass, owner-authored
- **Prompt text.** Versioned prompt files, per the AI Assist Plan
- **The desk surfaces** — how a concierge confirms four streams of generated work
- **Concern lifecycle** — the ratified Object/Concern Model governs, and Increment 5 builds it
- **Whether opportunity output ever reaches a client unprompted.** It is the revenue-adjacent stream and it is the one most able to read as selling. **A live question and deliberately open**

---

## 12. Where it lands in the sequence

**Increment 5 is already the concern register and is gated on manifest v4.** The class frame is not gated on anything — it needs the desk pass to exist and the desk pass needs it.

**Recommendation: the frame and the desk pass are one increment**, because a frame with nothing confirming its output is untestable, and a desk pass with nothing to confirm is an empty screen. **They fail as halves and work as a pair.**

---

**Status:** v1, design. Not a build spec. **The class list is the content pass this unblocks.**
