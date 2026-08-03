# HouseSteady — Baseline Service Design (v1.1)

**Date:** 2026-07-31
**Version:** v1.1 — v1 (same day) with six corrections from the owner's read: the note is the exception not the norm (§4.1) · the homeowner is invited to the Inspection Visit, never expected (§3) · position data explained properly and the canvas ruled out for placement (§4.3, §5.2) · the class frame asks an open question alongside the bounded one, or it calcifies (§6.2) · **the maintenance list is one list, and the split is the visit-three conversation** (§6.3, §7) · access observation named as its own capture category (§4.1). Plus §6.7, new — the AI cost structure.

> **The one-line version, in the owner's words:** *we are taking the guesswork out of the inspection checklist and removing generalities to make it specific.*
**What this is:** how a house enters the service. Three visits, the desk work between them, and the engine that turns captured objects into work. **This is the governing document for the process**; the Baseline Inspection Process v1 is rewritten under it, and change requests flow downhill from here to the field and binder tracks.
**Cause:** the first five-zone walk on a real house, 2026-07-31. The finding is in §1.
**Status:** design decisions, owner-authored. Sections marked *recorded, not specced* are reasoning written down without becoming requirements.

---

## 1. What the walk found

**The capture and the inspection do not fit in one visit, and trying to do both makes the concierge into an inspector.**

The owner walked five zones of his own house. What happened, in his words: capture alone took the whole visit · pinning stopped almost immediately · the natural motion was *walk into a zone, get its floorplan, move around the room clockwise, capture everything* · single-shot beat sweep capture · and every capture wanted a note attached explaining its significance.

**Pinning stopped because pinning is classification, and classification is desk work.** The fridge is obviously the fridge. Naming it as a component with a type and a checklist wants a screen, a keyboard, and no homeowner standing in the room.

**The named failure this design exists to prevent:** *a concierge in an unfamiliar house, on visit one, running tests and working a checklist while also trying to see the property — produces a worse inspection than a targeted one, a thinner record than a dedicated capture, and looks like a home inspector doing both badly.* That is the opposite of a relationship professional who knows the house.

**This is not a change of direction.** The four-pass room sequence already put capture first. The session plan round trip already existed as the mechanism for carrying one visit's findings into the next. What changed is the time boundary: **pass one is a visit; passes two to four are a different day** — and they are only possible on a different day because the desk work in between turns a pile of captures into a targeted list.

---

## 2. What does not change

Stated plainly, because a redesign invites people to reopen settled things.

**Identification, never assessment.** Unchanged, and it gets harder rather than easier — see §6.5. Better evidence makes overclaiming easier.

**The manifest contract · the Binder Schema · the audit engine · the four streams · overlays as the storage model · nothing renders unsigned · AI proposes and a human signs.** All unchanged.

**Everything Increment 4 built.** The gap report and the session plan v0 emitter are not wasted — **their order flips** (§4.4), which is a sequencing change rather than a rebuild.

**The concierge is not an inspector, and the software carries the expertise.** This design makes that more true, not less.

---

## 3. The shape of the baseline

| Stage | What happens | What the client gets |
|---|---|---|
| **Discovery conversation** | Needs, priorities, who else is authorised, what they already worry about. Sample Home Profile and sample Binder shown | Understanding of what the capture is for |
| **Visit 1 — Discovery Visit** | The conversation, then capture. Simple leave-behinds: air test canisters, water sample collection | Nothing on the day |
| **The desk pass** | §5. The captures become a house | — |
| **Between** | Home Profile delivered — emailed ahead of visit 2, or handed over on arrival | **The Home Profile** (§7) |
| **Visit 2 — Inspection Visit** | The targeted inspection, from a list the desk produced. Tests, measurements, operation checks | An inspection of named things rather than a general look |
| **Visit 3 — Handover** | The Binder, and **building the ongoing plan together** — what HouseSteady does, what the homeowner does, what gets coordinated | **The Home Binder** and the plan |

**The homeowner is invited to every visit and expected at none of them.** The offer is standing and it is made at the discovery conversation, along with how sensitive spaces are handled — bedrooms, offices, anywhere they would rather accompany the concierge. **Transparency is the offer, not the requirement.** Most people will not want to follow someone around their house for three hours; the ones who do should never have to ask.

**Visit 3 is not a delivery, it is a working session.** The Binder is handed over and then the two of you build the ongoing plan from it — which items are HouseSteady's, which are the homeowner's, what gets scheduled, what gets quoted. That conversation is where the retainer stops being an abstraction.

**Naming.** *Discovery Visit* and *Inspection Visit* are the client-facing names. Internal shorthand leaks into client copy, so there is no separate internal vocabulary for them.

**The creepy problem is answered before a photograph is taken.** A concierge photographing a family's belongings is strange without context and ordinary with it. The sample Home Profile at the discovery conversation — and on the website — is what supplies the context. *This is what your home's record looks like; today is how we build yours.* **This is a service-design answer, not a software one**, and it is why the discovery conversation is a named stage rather than a courtesy.

---

## 4. Visit 1 — the Discovery Visit

### 4.1 · The capture loop

**The room stays the concierge's. The app asks for nothing that requires a decision.**

The loop: **walk in · capture the space · move around the room in one direction · capture everything.** Objects, concerns, the dirty and the unmaintained, windows, ductwork, surfaces, things that need fixing.

**What the app records at the moment of capture — three things, none of them a decision:**

1. **Position**, if RoomPlan is running. Where the concierge stood and which way they pointed. **Zero taps.** See §4.3 — this single thing decides whether the desk pass is confirmation or data entry.
2. **A note, on roughly one capture in ten.** The capture screen's third button becomes **"Use Photo and add Note"**, alongside Use Photo and Retake. Voice or text. **It is the exception rather than the habit** — most captures are self-explanatory at the desk — which is an argument for the button being available and unobtrusive rather than prominent.
3. **Walking commentary**, on its own — a voice note with no photograph attached. *"Basement, going clockwise, this wall is the mechanical side."* The concierge is already talking; the transcript is orientation the desk cannot otherwise get.

**Access is its own capture category, and it is easy to miss.** An attic hatch, a crawlspace entrance, a panel behind stored boxes, a shutoff behind an appliance — photograph the *access*, not just the thing. A pole-camera shot through a hatch is worth the ninety seconds. **This is what lets the Inspection Visit arrive knowing whether a space is reachable and what tool it needs**, rather than discovering it on a ladder.

**Every note is internal by default.** The desk decides what surfaces. A concierge observing *significant mould*, *very unmaintained*, or *filthy* is recording an observation that is useful internally and is not a sentence that belongs in a client's document — and any judgement in it must be adjudicated at the desk regardless. **Making notes internal by default is what keeps them honest.** No second button, no decision in the room.

### 4.2 · What is deliberately NOT captured in the room

**No classification. No tagging. No pinning. No checklist.**

*Equipment / plumbing / electrical / aesthetics* tagging was considered and rejected. It makes the concierge think in the app's categories while looking at a real thing, it is wrong often enough to need correcting anyway, and **AI reads it from the photograph better than a person deciding under time pressure.** Doing work in the room to produce a worse answer than the desk gets free is the failure.

**Pinning moves to the desk entirely** for the Discovery Visit. It returns in the field for the Inspection Visit, where a pin is a known object being checked rather than an act of naming.

### 4.3 · RoomPlan moves from parked to load-bearing

**Previously a nice-to-have. Now close to structural**, for four reasons at once:

- **The floorplan is a real deliverable.** Every home needs one and most do not have one.
- **Window and door measurement comes free** — no tape measure, and it feeds the Measured House thesis directly.
- **Room dimensions and areas** feed quoting.
- **Position data is what makes the desk pass forty minutes rather than four hours** (§5.2).

**Blocked on hardware, not design.** The owner's MacBook Air runs macOS Monterey 12.7.6 and cannot run current Xcode or live-debug the M1 iPad Pro. **Borrowing a Mac is now the highest-value unblock on the project.**

**What position data is, since it decides §5.2.** RoomPlan runs on ARKit, which tracks where the iPad is in space as it moves — that is how it builds a floorplan at all. **The tracking does not stop when a photograph is taken.** So each capture can record where the concierge stood and which way they pointed, in the same coordinate space as the plan. Not *somewhere in the kitchen* — *stood here, faced that wall.*

**Which means the canvas photograph does not help with placement — the floorplan already knows.** Canvas shots keep a narrower job: a wide orienting shot of a utility room, kitchen or laundry, **sent with a trades request** so a contractor arrives familiar with the workspace. Real use, different use.

**Two honest caveats.** ARKit drift over a long walk is real — usually good to about a metre indoors, occasionally worse — so placement is a proposal to confirm, not a fact. And **none of this is built**, because RoomPlan is parked on the Mac.

### 4.4 · The gap report moves to visit 2

**The named failure:** *after a capture-only visit, nearly every checklist item is unresolved. A client document saying "we did not cover 380 things" is not a document.*

So: **the Discovery Visit produces a session plan, not a gap report.** The gap report belongs to the Inspection Visit, where it says what could not be reached or completed on a visit that was genuinely trying to complete things.

**The session plan does more work than it was built for.** It was specified as the recurring-visit mechanism. It is now also the visit-one-to-visit-two mechanism, and it carries the targeted inspection list. Increment 4 built the emitter; what it emits grows.

---

## 5. The desk pass

**Four stages. Every one is confirmation of a proposal, never authorship.** That is the design rule, and it is what makes the difference between forty minutes and four hours.

### 5.1 · Assemble the house

RoomPlan produces rooms; the concierge says how they connect and which floor. **Done once, and it produces the floorplan deliverable.**

### 5.2 · Place the captures

**With position data this is confirmation** — the photographs are already on the plan, each one sitting where it was taken and pointing where it pointed, and the concierge is fixing the ones that drifted. **Without it, this is manual placement of several hundred photographs**, and it is where the desk pass becomes unaffordable.

**That is the whole argument for the Mac.** The difference between confirming three hundred placements and making three hundred placements is the difference between a desk pass that works and one that does not.

*Recorded, not specced:* the fallback without RoomPlan is click-to-place against a room outline, in capture order, which the clockwise walk makes roughly sequential. Usable, not good.

### 5.3 · Identify

**AI reads the photographs and proposes what things are** — *that is a fridge · that is a pod coffee maker · that is an American Standard water heater and the serial reads this.* The concierge accepts, corrects, or rejects.

**This machinery exists.** Increment 2b built it for nameplates: the assist screen, quarantine until signed, one signature per plate, unanimity, abstention as a valid output, the golden set. **It generalises from nameplates to objects**; what changes is the breadth of what is proposed, not the mechanism.

### 5.4 · Confirm what the engine generated

**§6. This is the stage that should feel like reward**, because it is where a pile of photographs becomes a plan for a house. The concierge is reviewing generated work — maintenance items, inspection targets, opportunities, replacement horizons — not creating it.

---

## 6. The engine

**Recognise a thing → know what that kind of thing needs → generate work.**

This is the centre of the design. Everything else serves it.

### 6.1 · The class frame

**A maintenance schedule that lists products grows with the number of products in the world, goes stale silently, and is wrong in the same ways a model would be.** That is the named failure.

**So the schedule declares classes of object and the kinds of care they need — never specific products and intervals.**

Not *Keurig K-Elite → descale every 3 months.* Instead: **pod coffee maker → descaling · water filter · cleaning cycle** — the *categories of maintenance that exist for this class.* AI supplies the model-specific interval, procedure, and detail.

**The list stops growing with the world and starts growing with the number of kinds of thing**, which is small, stable, and ours.

**This is the third instance of a move this project already makes twice:** the Binder Schema is the Master Spec as data — the frame, not the content. The checklist config declares what a visit asks — the frame, not the answers. Same shape, new surface.

**Granularity: roughly that of a trade call.** *Pod coffee maker · fridge · dishwasher · gas water heater · forced-air furnace · sump pump.* Specific enough that maintenance categories are genuinely shared; coarse enough that the list stays in the low hundreds.

**It sits on top of the component types the field config already declares**, rather than being a second vocabulary. Two taxonomies drifting apart is a failure this project has met repeatedly.

### 6.2 · Three things the frame buys that raw AI cannot

**It constrains the question.** *"What maintenance does this Keurig need?"* is open-ended and invites invention. *"This is a pod coffee maker. Descaling: what interval and procedure for a Keurig K-Elite?"* is bounded — a specific question about a known category, which is where a model is strongest and where abstention is cleanest.

**It makes absence visible.** If the class says a gas water heater needs an anode-rod check and the research returns nothing, that is **a gap in the record** rather than a silent nothing. Without the frame there is no way to know a question went unanswered.

**It is where the business judgement lives.** Whether a category is worth raising with a client at all is a decision about what the service covers, and it belongs in a file the owner controls rather than in a model's opinion.

### 6.2a · But a bounded question alone would calcify the frame

**The named failure, and it is one the frame itself creates:** *the class declares descaling, filter and cleaning cycle. A newer model needs a fifth thing. Asking only the declared categories means that fifth thing can never surface — and the frame that stops invention also stops discovery.*

**So every object gets two questions in one call, not one:**

- **Bounded** — for each category this class declares, what is the interval and procedure for this model? Structured, comparable, and a category with no answer is a visible gap.
- **Open** — what else does this specific model need that this list does not cover?

**Anything the open question returns is a proposal against the class, never a fact about the house.** It lands in a review queue: *three water heaters this quarter returned "expansion tank inspection" and the class does not declare it.* The category gets added once, and every future house has it.

**That is the §6.6 feedback loop pointed at the frame instead of the vocabulary** — and it is what makes the class list improve from real houses rather than from someone guessing in advance. Without it, the frame is correct on the day it is written and quietly wrong for years afterwards.

### 6.3 · Four outputs from one lookup

**This is what makes it an engine rather than a maintenance feature.**

| Output | Goes to | Example — gas water heater |
|---|---|---|
| **Maintenance** | The house's maintenance list — **one list, unsplit** | Anode rod interval; sediment flush |
| **Inspection** | The session plan for visit 2 | TPR valve, expansion tank, drain pan |
| **Opportunity** | Concerns, quotes, the trades network | Twelve windows means a cleaning quote; a sump with no backup means a conversation |
| **Replacement horizon** | §19 reserve figure and replacement windows | *Made 2011, these run 8–12 years — a conversation for next year rather than an emergency at 2am* |

**The fourth has the longest reach and is the sentence a homeowner remembers.** It is also why serial decoding is a dependency of a promised deliverable rather than enrichment.

**The maintenance list is one list and it is the client's.** It is not split into homeowner tasks and HouseSteady tasks by the software, because **that split is the conversation at visit three** — item by item, which they want covered and which they will do themselves. Arriving with the division pre-made presumes the answer, and it turns a working session into a presentation. It also risks the wrong impression: a long list already assigned to HouseSteady reads as an invoice rather than as a plan.

### 6.4 · What the schedule declares and what AI supplies

| | Declared in the schedule | Supplied by AI |
|---|---|---|
| **What** | The class · the categories of care that exist for it · whether a category reaches a client at all | Model-specific intervals, procedures, common failure modes, typical lifespan · **and anything the class does not declare** (§6.2a) |
| **Why** | Business judgement, stable, ours | Open-ended, improves as models improve, and gets better without us doing anything |
| **When wrong** | Visible — a category with no answer is a gap | **Abstention is a valid output.** *I do not know* is a correct answer |

**The existing 190 maintenance items are not wasted — they are a content pass in the wrong shape.** They are instances; they want to be classes. The rewrite is smaller than what is there.

### 6.5 · Honesty labels, and the line that gets harder

**Everything AI returns about a specific model is `Inferred`, never `Observed`**, and it renders labelled.

*"Common failure modes include a failed thermocouple"* is research about a product line. It is **not** a statement about this household's water heater. The distinction is identification-versus-assessment wearing new clothes, and **the frame has to hold it, because better research makes overclaiming easier rather than harder** — the same point the Exterior Capture note makes about aerial photographs.

*"This water heater was manufactured in 2011"* — `Documented`, from the nameplate.
*"Units of this type typically last 8–12 years"* — `Inferred`, from research.
*"This water heater is near the end of its life"* — **not ours to say.** The two labelled facts sit next to each other and the homeowner draws the conclusion, or a licensed specialist does.

### 6.6 · The feedback loop — half built, and the missing half named

**When no class fits, the concierge types what the thing is, and the capture proceeds normally.** Fail open on vocabulary is already doctrine: an unclassed object is still captured, still researched, still generates work — it simply does not get the frame's structure until a class exists.

**The first half of the loop exists.** Manifest Contract §7 requires freeform types to export with their verbatim text, flagged distinctly and never collapsed to a bare string, and nicknames to export as their own field — explicitly so that *recurring freeform labels are the signal a new class is warranted.*

**The second half does not exist and this document is the first place to say so.** Nothing aggregates that telemetry across visits. The equipment registry that would do the grouping is named in Manifest Contract §7b as a future product and has never been built. **So the data is preserved and nobody is counting it.**

**Build it from the first house, not from the second concierge.** An earlier draft placed it at the point a second person is capturing, on the reasoning that one person's memory is a substitute until then. **That is wrong, and it is the same mistake in both directions.** The class list has to grow from the first ten houses — that is precisely when the frame is emptiest and the freeform entries most numerous — and memory is exactly what fails: the concierge who typed *wine fridge* in house three will not recall it in house nine, and nothing will have counted it.

**It is also cheap.** Group verbatim freeform labels across imports, count, rank. No new capture, no new field, no client-facing surface — the data already travels by contract. It is a query and a screen.

**Same queue, same shape as §6.2a.** Unclassed objects and open-question returns are both proposals against the frame, they both want the same review, and they both make the class list improve from real houses rather than from guessing.

### 6.7 · What this costs, and where the guardrail goes

**The named failure:** *one unnoticed loop eats the whole house's budget, and then legitimate work is refused while nobody knows why.* **A single aggregate ceiling fails late and fails by punishing the wrong thing.** So the primary guard is per-unit and the house budget is a backstop.

**Batching decides the cost, more than any ceiling does.**

| Work | Batch by | Calls on a five-zone house |
|---|---|---|
| **Identify what things are** | **The room**, not the photograph | ~5–10 |
| **Read a nameplate** | The plate | one per plate |
| **Research an object** | **The object** — bounded and open questions in one call | one per identified object |

**Batching identification by room is the significant one.** Three hundred photographs asked one at a time is three hundred calls; one call per room is five, and it is *more* accurate, because the model sees the room rather than a series of disconnected frames.

**Where loops actually come from.** Not from the schedule questions — those are a fixed list derived from the class, and a fixed list cannot loop. Loops come from retrying: an unparseable response re-asked, an abstention re-prompted, a chain that re-checks its own work. **So the guard belongs on the retry, not on the total.**

- **One retry, then abstain.** An unparseable answer is an abstention, not a reason to ask again. Abstention is already a valid output everywhere else here.
- **A hard call ceiling per object and per room**, so a runaway is contained to one object rather than one house.
- **A per-house budget as the backstop**, reported when hit rather than silently enforced.

**The numbers come from measurement, not from guessing** — and the walk export is the first chance to take it. The structure has to exist before the first real run; the thresholds can be tuned after it. **What cannot be added afterwards is the shape.**

*Recorded, not specced:* tiered models. Identification is cheap-model work; research and nameplate reading want the better one. Already the pattern in the AI Assist Plan.

---

## 7. The Home Profile

**A new client-facing deliverable, between the Discovery Visit and the Inspection Visit.** Emailed ahead, or handed over on arrival at visit 2.

**It is not the Binder and it is not the gap report.** It is *what your home has*:

- **The floorplan**
- **The inventory** — what is in the house, room by room, with photographs
- **The maintenance calendar** — what this house needs and on what rhythm. **One list.** Who does what is the visit-three conversation, not something the Profile decides in advance
- **What we are looking at on the next visit, and why**
- **Any test results already back** — water, where the lab was quick

**Three things it does at once.** It makes the capture visibly *for* something. It invites correction — the client tells you what you got wrong, free. And it means the Inspection Visit begins with a client who already knows what is happening and why.

**A sample version is what the discovery conversation shows** — and it belongs on the website. *This is what you will get.*

**It costs almost nothing to produce if the desk pass is built properly**, because every element is already assembled by §5. That is the test of whether the desk pass is right.

---

## 8. What each track has to change

### Field

1. **RoomPlan.** Blocked on a Mac, not on design. Highest-value unblock on the project.
2. **The capture flow** — floorplan or canvas first, then free capture; single-shot preferred over sweep; **"Use Photo and add Note"** as the third capture-screen button; standalone voice notes for walking commentary. Screenshots and the owner's flow notes exist.
3. **Position on capture**, wherever RoomPlan supplies it.
4. **A second visit kind in `scope[]`** — capture items and inspection items are different sets. The mechanism exists and is used; it needs a second value and **a content pass deciding which items sit where.** This is Checklist Master content and therefore owner-authored. **It is the largest single piece of work in this redesign.**
5. **The session plan import** — already scoped at `PLAN-STAGE-1` §7a and §7a-ii, and now carrying the targeted inspection list rather than a handful of carried gaps.

### Binder builder

1. **The class frame as versioned data**, in `/schema` beside the others.
2. **The research step** — bounded by the class, provenance-tagged, abstention valid, labelled `Inferred`, quarantined until signed.
3. **The desk pass surfaces** — assemble, place, identify, confirm. The Triage surface in Design v1 is the nearest existing thing and it was designed for a different job.
4. **The Home Profile as a render**, alongside the gap report and the Binder.
5. **The session plan grows** to carry the inspection list.
6. **The frame review queue** — freeform labels (§6.6) and open-question returns (§6.2a) in one place, counted and ranked. **From the first house.** Small, and it is the mechanism by which the class list stops being a guess.

---

## 9. What this does not decide

- **Economics.** Three visits before a Binder changes the inputs to a session that was already outstanding. Deliberately not addressed here.
- **Whether the Discovery Visit is separately priced**, or the baseline is one fee across three visits.
- **What HouseSteady covers versus what the homeowner keeps** — a per-client conversation at visit three, informed by the retainer's scope. Not a software decision and not decided in advance.
- **The class list itself** — a content pass, and the largest piece of new content this creates.
- **Which checklist items are capture and which are inspection** — Checklist Master content, owner-authored.
- **Concern lifecycle**, which the ratified Object/Concern Model already governs.
- **Anything about monthly visits**, which are unchanged and remain fast and targeted.

---

## 10. Sequencing

**The binder side leads, with two exceptions.**

**Start now, independent of everything:** borrowing a Mac and unblocking RoomPlan. Pure hardware, no design dependency, and it is on the critical path for both the deliverable and the desk pass.

**Start now, because this document settles what capture must record:** the field capture flow. §4.1 names what is recorded — position, an occasional note, standalone commentary, and access as its own category — and nothing downstream changes them. Screens can be built against that.

**Wait for design:** the `scope[]` split, the class frame, the desk pass surfaces, the Home Profile render. These need the class frame designed first, because it decides what the desk pass confirms and what the Profile contains.

**And import the walk export regardless.** It is the first real multi-zone export with media, video, audio and AI interaction, it exercises enormous amounts of code that has never run, and none of its findings depend on any decision in this document.

---

**Status:** v1, service design. The Baseline Inspection Process v1 is rewritten under this. Scope entries follow.
