# Where sticker content lands, which way the image check runs, and what I would want captured

**Date:** 2026-08-11 · **Record of an event. This date never moves.**
**Answers:** the three corrections of 08-11, taken · a destination for adjacent-sticker content · the lookup's product images · and the question nobody had put to me.
**Method:** every claim about the schema re-read from the migrations; every claim about the room re-derived from the committed record at source.

**Headline: all three corrections are landed and committed · the three destinations are three different shapes and only one of them is a field · the image check belongs in pass 3 and must run one way only · and the capture I want most is not an image at all.**

---

## 1 · The three corrections — taken, in commit `0bf1f55`

| correction | what changed |
|---|---|
| **The WellMate is not a pressure vessel** | Product corrected at source to `Pentair WellMate UT-450 universal retention tank`. The test's premise failed, so its example moved to the GSW heater. **The WellMate stays as its own test, proving the better thing** — plate, lookup and household agree |
| **The 47% measures the wrong thing** | Withdrawn. **22 of 34, and a gradient** — model + serial → the unit, model → the line, brand + name → the family. The struck claim stays visible in the note with the reason it was wrong |
| **The key goes in the repo** | Committed at `fixtures/room-records/mechanical-room_2026-08-10.json`; `--key` defaults to it. Scanned first — six pattern classes, each proven to fire on planted data before its zero was trusted, zero hits |

**One thing I want to say plainly about the second, because it is the most useful mistake I have made here.** I measured how many objects populate a `model` field and reported it as how many objects a lookup could resolve. **Those are the same number only if the extract's schema and the pipeline's input are the same set** — and the record disproves it in one row: `Franklin Water Treatment FWPS20B20 polypropylene cartridge` carries a part-number-shaped string in its *product* field, and my count scored it as *nothing to resolve*.

**A measurement that changes when a substring moves between two fields was never measuring the pipeline.** That belongs beside rule 15 — *a grep's zero is ambiguous* — as its sibling: **count the evidence, not the column.**

---

## 2 · Adjacent-sticker content — three roles, and only one of them is a field

**The ruling is right and the schema is further from it than it looks.** Read from the migrations rather than remembered:

| destination named | what exists today |
|---|---|
| manufacturer **on the object** | `objects` has `id · property_id · zone_id · import_id · class_id · label · confirmed_by · confirmed_at · actor_id · created_at · generation_id`. **No manufacturer. No model. No serial** |
| distributor **on the parts path** | **There is no parts path.** Not a table, not a concept |
| servicer **in the service history** | **There is no service history.** Same |

*Derived by applying all twenty migrations to an empty database and reading the schema back, rather than by recalling it. Thirty-seven tables; **none matching `part`, `service`, `manufactur` or `distrib`.** The word `model` does appear — on `ai_generations` and `chat_messages`, where it means the language model. **No table in this repo holds a piece of equipment's model number.***

**So all three are unbuilt and two are unbuilt *concepts*, and I am not building them ahead of pass 1** — pass 1 emits nothing yet, and a destination with no content is a column that gets filled by hand and drifts. What follows is the shape they should take when it lands.

### ⚑ The three roles have three different shapes, and a single column is wrong for all three

**Manufacturer is not a field — it is a competing claim.** The NextEnergy error *was* a decal-manufacturer displacing the nameplate's. A11 §C's rule — *a label may not assert a manufacturer that only a non-nameplate surface supports* — **is only enforceable if both claims are stored, each with its surface, and the nameplate wins at render.** A single `manufacturer` column has room for exactly one, so it re-creates the bug the surface tag was added to kill: whichever read arrives last is the manufacturer, and nothing records that there was ever a second answer.

**Distributor belongs to the part, not to the object.** A distributor sticker says where to re-buy a consumable. **The object outlives the part; the part's supplier outlives this particular install.** Hung on `objects` it is on the wrong entity and goes stale the first time the object is replaced and the same cartridge is still correct.

**Servicer is not an attribute at all — it is an event.** *Serviced by X on date Y* is dated, repeatable and append-only, which is the shape `events[]` already has. **A `servicer` column holds the most recent one and silently discards the history**, which is the one thing a service history is for.

### ⚑ And the record already carries a fourth role that none of the three covers

**The single `readings` entry in the committed room record is an adjacent sticker, and its content is none of manufacturer, distributor or servicer:**

```
read_from:          "separate reference card attached above/near the housing"
product_reference:  "Excelpure spun polypropylene sediment filter cartridge"
part_number:        "PP20B-20"
nominal_filtration: "20 micron"
attached_to:        { product: null, role: "whole-house sediment-filter housing" }
```

**It is the specification of a consumable the object consumes** — what this housing takes. **And `PP20B-20` is the exact string A11 §A names as the source of the `reverse-osmosis` false positive.**

**The record's own shape is the fix, and it got there without a schema.** Not an object — a *reading*, attached to a housing whose own product is `null`, with the surface it was read from recorded in plain words. **A consumable specification is a fourth destination: the parts path, as the part's identity rather than as its supplier.**

*Offered because it is the one of the four that has already cost a wrong class, and because the record reached the right shape by hand — which is usually a sign the shape is real rather than convenient.*

---

## 3 · The lookup's product images — pass 3, and one direction only

**The addition is right and it collides with a line in A11.** §C pass 2 reads *"Text only. No images. May search. Nearly free."* **An image comparison is none of those.**

**It should not be fixed by loosening pass 2.** Pass 2 being text-only is why it costs a fraction of a cent and why it can run over every string in the room without a budget conversation. **Put the comparison in pass 3, where both sides are already in the room.**

| | |
|---|---|
| pass 2 | resolves text → product, **and returns the product image reference with the source it already has to record** |
| pass 3 | input is *already* **all photographs plus the known inventory**. The room side of the comparison costs nothing extra — **only the product image is new tokens** |

### ⚑ The direction matters more than the placement

**A product image may raise a doubt. It may never confirm.**

**A mismatch is real evidence:** if the returned image looks nothing like the thing in the room, either the lookup resolved the wrong product or the plate was misread, and both are worth surfacing. **A match is worth nothing at all** — and the reason is measured, in this repo, on this room: **`well-pressure-tank` × 4 was produced by exactly that reasoning.** A grey cylinder resembling a grey cylinder. **Two vessels, one of them a contact tank.**

**So: mismatch demotes; match does not promote.** Wired symmetrically, this takes the appearance failure A11 exists to eliminate and readmits it as a confirmation step **wearing the lookup's authority**, which is worse than where it started — an appearance guess that has been checked by an appearance guess reads as corroborated.

*(The fetch itself is inbound rather than a send, so §14's third-party rule is lighter here than for a photograph going out — but the image's URL is part of *where the answer came from*, which pass 2 already has to record, so it should be stored with the resolution rather than fetched and forgotten.)*

---

## 4 · What I would want captured

**Both of yours are good and I want to say what each specifically fixes before adding to them.**

**The panoramic sweep per zone** is the fix to `well-pressure-tank` × 4, and it is the cheapest one available. Those four proposals happened because three batches each saw a tank and none could see the others; **a sweep is the mutual context that was missing**. A few frames per zone against 508 MB is a rounding error. **And F-26 lands today** — a sweep with bearings gives the desk a frame of reference for every other photograph in the zone, which nothing currently does.

> ⚑ **CORRECTED 2026-08-11, and the error was mine.** This paragraph originally read *"…better than the canvas because the canvas is a floor plan and a sweep is what the room actually looks like."* **Both halves are wrong.** Baseline Service Design §4.3: **RoomPlan produces the floor plan**, which is precisely why a canvas photograph does not help with placement — the plan already knows. **A canvas is orienting context riding every identification call** (Amendment 10 §B2), read for *there are tanks along this wall* and never for plates.
>
> **It propagated**, because the sentence was repeated into a cut without being checked against §4.3, which says the opposite. **The one thing that would have caught it is the check this repo already has a rule for** — verify against the file, not against the report of it. I asserted a fact about a document I had not opened in the same turn.
>
> The real question is now register **#124**, and it is open: **whether the sweep should replace the canvas rather than precede it.** The restriction is technical, not conceptual — a sweep across a room carries roughly a quarter the linear resolution per wall of four canvases — **but a canvas is not read for plates, and one sweep riding three calls is three canvas sends where four canvases are twelve.** So it may be both better and cheaper, and that is empirical.

**The declared run trace** is what makes A11's plate-to-object join reliable instead of inferred. Today the join rides on timestamp order, and **any pause, backtrack or second thought breaks the inference silently.** Declared, an orphan plate becomes *detectable* rather than *misattached* — which is the difference between a gap the desk can see and a wrong answer it cannot.

### The filter I would apply to every capture rule, including my own

**Can it be executed correctly by someone who does not know what they are looking at?**

**§6 is not a caveat here, it is the design constraint.** The concierge supplies accurate observation and accountability; the software carries the expertise. **Any capture rule that requires deciding what a thing is before photographing it will produce inconsistent binders the moment there is more than one operator** — and it fails in the worst possible way, because the photograph looks fine and only the desk discovers the decision was wrong.

Everything below passes that filter. **Nothing below is "take more photographs."** A partial visit is already 157 photographs and 508 MB and a baseline is projected at 1.5–2 GB. **The answer to a bad photograph is a framing rule, not another photograph.**

### 1 · The household's sentence, spoken at the object — and this is the one I want most

**Every fact the desk could not derive came from the household, and none of it came through the capture.**

The GSW's breaker off on purpose. The Stenner wired to the well-pressure switch so it doses only while water moves. The WellMate's role. The floor staining being old, dry and explained. **All of it arrived through a separate conversation and was reconstructed afterwards.**

**Ten seconds of voice, standing at the object, while the homeowner is standing there too.** *"Anything I should know about this one?"* — that is the whole prompt, and it needs no expertise to ask.

⚑ **What its absence costs is measurable in the most careful record this project has.** Two of the 34 confirmed objects have `role: null`. **The key does not know what two of its own objects are for** — not because the answer was unavailable, but because nobody asked while standing in front of them, and by the time the desk needed it the room was two hundred kilometres away.

**And it improves the one layer AI may not touch.** Role is the desk's and the household's; the lookup stops at the product by design. **This is the only capture on this list that adds evidence to a layer no model is allowed to fill in.**

*The landing place is already built* — `voice` is an existing media kind and A10 §D already has capture notes travelling with media. **What is missing is the habit, not the schema.**

### 2 · For anything connective, frame the join rather than the thing

**A connective is defined by what it connects** (A11 §B), which makes a photograph of a bare pipe uninformative *in principle*, not merely in practice. **No pass can identify it and no amount of model quality will help.**

**The rule: if you are photographing a pipe, a duct, a wire or a manifold, step back until you can see what is at both ends.**

⚑ **This is the capture that makes A11's ordering argument finishable.** §B's whole claim is that the plated objects scaffold the unplated remainder, and that the remainder is *mostly connective*. **Pass 3 is currently being asked to name that half from photographs that structurally cannot support an answer.** One framing rule, no extra files, and it targets the only half of the room with no other route in.

### 3 · Photograph the indicator close enough to read it

**Breaker positions, valve handles, gauge needles, filter date stickers, the salt level in the brine tank.** These are the things that change between visits — and **§7 rules out condition grading precisely because the checklist answers across visits are the story.**

**That story cannot be told from a gauge photographed at four feet.** *pass, pass, pass, fail* requires that each visit produced a readable value; a blurred dial is not a `pass` and it is not a `fail`, it is a hole that looks like neither.

**This is the only item on the list that makes the longitudinal claim real** rather than aspirational, and it costs one step forward.

### 4 · On an object the session plan already names: same unit, or replaced?

**Identity across visits is the spine of the whole design** — field-minted uuids are canonical, and the session-plan export is *the* cross-visit identity mechanism. **The plan goes field-ward and proposes; nothing comes back confirming.**

**One tap: *same one · replaced · not sure*. Plus a plate photograph when it is *replaced*.**

⚑ **This is the only capture that can write house history.** §7 says `replaced` is retained and **included** — *"furnace present until 2027"*. **That sentence can only be written if somebody recorded the moment**, and no photograph carries it. Today a replacement between visits is indistinguishable from a re-identification of the same unit, and the binder quietly loses a date it should have had.

*And it costs the concierge nothing on the overwhelming majority of objects, because the honest answer is almost always "same one".*

### 5 · One plate per frame, square to it — and a third frame when two labels are adjacent

**The NextEnergy class, killed at the source instead of reported after.**

**`UP26-99U` against `UPS26-99U` came from one photograph holding two plates at an angle.** `CLIMATEMASTER` against `NextEnergy` came from a warranty decal in the same frame as a data plate.

**Two rules, neither requiring any knowledge of what the labels say:**
- **One plate per frame, camera square to it.**
- **If there is a second label beside it, take a third frame showing both together** — so the desk can see the spatial relation without going back to guess.

**Pass 1's surface field can only report the surface it was told.** A frame containing a nameplate and a decal forces the model to choose, and **the desk cannot audit that choice from the file list** — only by re-opening the photograph and squinting at it, which is exactly the work the surface field exists to remove.

### 6 · Give absence a verb

**Right now the field app can record that something is present. It has no way to record that somebody looked and there is nothing there.**

**So an absence and a gap are indistinguishable in the capture** — and they are opposite kinds of thing. `records_finding` already covers confirmed absences (*no fireplace; no moisture suspected*), and `none-present` already exists in the object model. **The doctrine is settled; the capture cannot express it.**

**A photograph of the empty spot plus *"no sump here"* is not a judgement** and needs no expertise. **What it buys is the gap report's second column shrinking by exactly the items that were checked and found absent** — items currently sitting in *missing from us* alongside things nobody reached at all.

### 7 · Something of known size in frame, on unplated objects — and I would rank this last

**Every plated object gets its dimensions from the lookup. The unplated half does not, and that is exactly where appearance is doing the guessing.** A folding rule, a tape, a hand at the object makes volume and diameter readable.

**But I would not oversell it.** A11 says the unplated remainder is *mostly connective*, and **scale does not identify a manifold.** It helps on the unplated things that are objects — a tank, a vessel, a pump — and those are a minority of a minority. **Real, cheap, and third-tier.** Named here so it is on the list rather than rediscovered later, not because I would spend capture discipline on it before the six above.

### And one thing I would decline to ask for

**Any rule that requires the concierge to decide what a thing is before photographing it.** *"Photograph the manufacturer's plate"* fails, because on the ClimateMaster cabinet there were two candidates and choosing between them is the very judgement the surface field was invented to defer. *"Photograph the pressure tank"* fails on this room twice over.

**Every rule above tells the concierge where to stand, what to include in the frame, or what to ask.** **None of them asks what anything is.** That is the line, and I would hold it even where breaking it would obviously produce a better photograph — because a capture rule that needs expertise produces a binder that varies by operator, which is the failure the whole software exists to prevent.

---

**1020 tests green, typecheck green.** §2's destinations and §3's image check are **unbuilt by intent** — pass 1 emits nothing yet, and a destination with no content is a column that drifts.
