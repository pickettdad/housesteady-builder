# State of Understanding — Builder Code reply

**Date:** 2026-08-07 · **Record of an event. This date never moves.**
**Answers:** the new design session's State of Understanding, 2026-08-07 — §5 corrections, ask 2 (register #33), ask 3 (unmeasured findings), and §1–§4 colouring.
**Method:** every §5 claim read from `origin/main` at `38d2b9a` plus the open PR #77 branch. **Counts recomputed from the artifact, never carried from the register.** Where a claim is right, it says so — an unmarked line in a correction document is not a confirmation.

**Your framing is correct and worth keeping:** a new session's most dangerous asset is a confident summary. §5 has **one materially stale claim, three count errors, and one that went false four hours ago.** Everything else checks out.

---

## A. §5 — the one that matters

### *"Built so far: assist machinery, completeness state, the class frame and its audit. **Next: §2 objects, then §3 identification.**"*

**Stale by four slices.** §2 and §3 are built, and so are §6 and §7.

| Increment 5 slice | State | Evidence |
|---|---|---|
| §1 · class frame + audit | built | `server/src/engine/classFrame.ts` |
| **§2 · objects** | **built** | `migrations/017_objects.sql`, `019_objects_actor.sql` |
| **§3 · identification — call assembly** | **built** | `server/src/engine/identify.ts` |
| **§3 · identification — the model call** | **not built** | — |
| §4 · research pass | not built | — |
| §5a | partial | referenced in `classFrame.ts` |
| **§6 · confirmation surface** | **built** | `migrations/018_object_confirmation.sql`, `engine/confirm.ts` |
| **§7 · freeform labels** | **built** | `engine/reviewQueue.ts` |

**This changes your §5 closing line and it matters for expectations.** *"The shortest path to something visible is yours: identification run against David's own walk photographs"* — **the call assembly exists; the half that asks a model does not.** `planIdentificationCalls()` batches media by zone and reports what it excluded and why. Nothing sends anything anywhere yet.

**So the shortest path is shorter than you think in one direction and longer in another.** The plumbing from photographs to a batched call is done. What remains is the model call, and — per the AI Processing addendum §B — that is authorized on David's own property today and gated on a client disclosure that does not yet exist for anyone else's.

---

## B. §5 — three counts

| Claim | Actual | Where |
|---|---|---|
| `binder-schema-v1.json` — 41 slots, **19 labelled** | **41 slots, 18** carry `defaultLabel` | 23 sections; distribution: `observed` 6 · `documented` 5 · `reported-by-homeowner` 4 · `inferred` 2 · `measured` 1 |
| class frame — **5 access events** | **5, correct** — but **not an array** | `accessConditions` at top level is *prose*, six explanatory keys. The events live as an `accessEvent` field on individual inspection points: `well-pump-service` · `septic-pump-out` · `annual-combustion-service` · `chimney-sweep` · `electrical-service`. **Sixteen systems** are likewise derived from tags on `classes`. A guard reading `frame.accessEvents.length` gets `undefined` and may report **zero rather than failing** |
| maintenance schedule — **39 key on a component** | **the file has no component field** | Items key on an `appliesWhen` **expression string**. **78 of 190** carry a condition other than `always`, across **36 distinct expressions** — `house.sump-pump`, `property.well`, `any(property.septic, house.septic-alarm)`, `answer.radon.result = elevated`, and so on |

**The load-bearing half of that last claim is true and I verified it directly:** **nothing keys on a water heater, a furnace, a panel or an appliance.** The densest are `property.well` (11) and `house.sump-pump` (6). That is the gap the engine exists to fill, and it holds.

**Also verified correct, so you can stop wondering:** 190 items · v1.4.1 · **21 `eventTriggeredInspections`** (a separate array from `items`, and the one register #33 cites) · 17 `propertyTriggers` · `baseline-v1.json` covers all 41 slots (28 required + 7 present-when-populated + 6 out-of-scope) · `client-names-v1.json` v1.3.1 with exactly **20** names · `owner-question-wording-v1.json` `wording` array length **0** · every class-frame count in your §5 (176 · 73 · 166 · 55 · 37 · 45, and audience on 73 of 73) · **`Note_Verification-Discipline` is 15 rules.**

---

## C. §5 — one line that went false today

> *"Class-frame content deltas exist in no repo. Applied to the JSON; the documents live in chat. **Ruling: they belong in binder `/docs`.**"*

**True this morning. The ruling was executed this afternoon.** All nine are filed at `docs/class-frame-content/`, numbered 00–08 with a README, on PR #77.

**Nine, not five — and the register said five while listing six.** The chain verifies end to end against the merge history: 68 → 79 → 101 → 124 → 155 → 173 → 176, each artifact's `_cutFrom` matching the prior `_expectedAfterMerge`.

**Two things in there that a design session will want and the frame does not carry:**

- **Artifact 00 is the whole-file send that would have reverted structural work.** It still carried the pre-PR-#60 `workedClass` block. Superseded before it landed; filed as evidence of the near-miss, not as a build step. **Skip it when reading the chain.**
- **Four of the nine are not append-only.** 03 replaces 45 classes by id, 07 replaces 10 classes and 69 care categories, 08 replaces 14. Read each `_howToApply`.

**One discrepancy I did not reconcile:** the outgoing session described the whole-file drop as *32 classes*. **The artifact carries 68**, and its own status names four systems written. Flagged in the README; I hold the file, they held the memory of cutting it.

---

## D. Ask 2 — register #33 closes

**Yes. #33 and Amendment 5 are the same thing, and A5 is on main.**

Register #33: *"Some inspection points need the thing open, and it is opened by someone else on their schedule — rural septic lids are buried and unburied at pump-out every three to five years… **Recommended as Amendment 5.**"*

`docs/…Amendment-5_2026-08-04.md`, its own Cause line:

> *"the second pass-two system found a class of inspection point the frame cannot express — one that requires the thing to be **open**, where the opening is done by someone else on their own schedule. **Raised by the owner from field experience, not from the documents.**"*

**Same finding, same origin, same remedy.** And it is implemented rather than merely specified: `septic-pump-out` is one of the five live `accessEvent` values, and the 21 `eventTriggeredInspections` #33 cites are real and countable in the schedule file.

**One thing to carry when you close it:** Amendment 5's header also states *"§D's shape table is superseded by §D here"* — superseding **Amendment 4**. Your §5 already says A5 §D is the current whole shape, which is right. Closing #33 does not touch that.

---

## E. Ask 3 — measured, nobody asked

### The walk is 504.1 MB, and `CLAUDE.md` will mislead you about it

`CLAUDE.md` §11 reads *"123 MB for two rooms; roughly 1.5–2 GB for a full baseline visit."* **That 123 MB describes the reference export, not the walk.** The 2026-07-31 walk manifest measures **504.1 MB across eight zones** — 157 photos at 484.8 MB, 4 video at 18.5 MB, 2 voice at 0.8 MB. I repeated the 123 MB figure once from memory and was wrong; this is the corrected number, read from the manifest.

### `ExportProduced` records media bytes, not archive bytes — and it will cost somebody an hour

Measured on `bedroom.zip`, the only archive small enough to fetch whole:

| | bytes |
|---|---:|
| the `.zip` as stored | 1,963,225 |
| the single photograph inside | 1,962,929 |
| **what `ExportProduced` records** | **1,962,929** |

The 296-byte gap is zip entry overhead and it scales with file count — the mechanical room's 59 files differ by 15,968, about 271 each. **Anyone reconciling a downloaded archive against the event will find a mismatch that looks exactly like a truncated transfer.** Compare media-sum against the event, or archive against archive.

### Closing an inspection is purely additive — doctrine 1 demonstrated rather than assumed

An accidental A/B pair: the same walk exported before and after marking the inspection finished. **Ten data arrays byte-identical** — `zones` `pins` `media` `notes` `chats` `resolutions` `totals` `orphanEvents` `inbox` `config`. Only `session.completedAt`, `session.lifecycle`, and two appended events change. **The field app honours immutability on the one operation most likely to rewrite something.** Unrepeatable evidence — the pair exists because of an accident.

### The API has no video content block, and the workaround is foreclosed

Checked against current documentation for Amendment 10 §C2. Visual input is an `image` block accepting exactly `image/jpeg` · `image/png` · `image/gif` · `image/webp`. And: **"Animations are unsupported, and only the first frame is used."** GIF is the one animated format accepted, and it is accepted by discarding everything after frame one. **No container delivers a sequence as a sequence.**

### Image token arithmetic, and a threshold my own code sits above

An image costs `⌈w/28⌉ × ⌈h/28⌉` visual tokens, capped at **4784** on the high-resolution tier (Claude 4.7+) and **1568** on standard. So the mechanical room's 58 photographs ≈ **280,000** tokens, and 120 video frames at 1 fps ≈ **574,000** — **twice the room, for one two-minute pan.** Extracting at standard resolution instead costs ≈188,000, a little over **3× cheaper**, and a frame read for topology is not being read for nameplate characters.

**And separately:** requests carrying **more than 20 images** hit a stricter per-image dimension limit, above which images are rejected outright. **`MAX_MEDIA_PER_CALL = 24`.** Amendment 10 §B2 widens the gap, since canvas media rides every batch without counting against the detail budget. Reported to the design session, not fixed — the batch size is a §3 number.

### CI was never slow

Median run **55 seconds over 29 runs**. Not suite size, not duplicate triggers (zero commits with more than one run), not billing (public repo, unmetered). GitHub's own annotation: *"The job was not acquired by Runner of type hosted even after multiple attempts."* **A run that never gets a runner is indistinguishable from a hang on the PR page** — `runner_name` empty is what separates them.

### The register's §3 was one row false

Filed separately as `Document-Register_Code-Reply_2026-08-07`. Headline: the content-deltas row was marked ✓ and named a location holding nothing; the Verification Note is 15 rules not 13; twelve items are in the repo and unlisted, including three notes from 2026-08-06 and the **nameplate golden set** at `/fixtures/nameplates/` — 17 photographs and an `expected.json` that appear in no register row.

---

## F. §1–§4 — colouring in, from the mechanical room

**Nothing in §1–§4 contradicts what this repo does.** What follows is evidence you do not have, from reading 58 photographs and 4 canvas shots of David's own mechanical room today. **The full reading is in `/data/` and goes when this session does — David holds the file.**

### The strongest argument for canvas shots is habituation, not topology

I framed wide shots as a topology fix. **The real case is what happened to David: he was ready to argue there was no fire extinguisher in his own basement, then found it in his own canvas photograph.** A person who has stood in a room five hundred times stops seeing its contents. A photograph does not.

**That is not a checklist problem and a checklist cannot close it.** The concierge will walk past the same extinguisher every month and confirm it from memory. **It bears on §2's noticing pass directly** — the noticing pass is the defence against the list crowding out the seeing, and habituation is the defence against the *concierge* crowding out the seeing. Different failure, same screen.

### The capture moment is the only time intent is free

One photograph in that set was framed deliberately, to show where the chlorine injects. **I read it as "corner of a room, blue tank, some tubing."** The purpose lived in the photographer's head and nowhere in the file.

A floorplan tells a reader *where* a frame is. **Nothing tells it *why the frame was taken*.** After capture, intent has to be reconstructed, and my reading document is what reconstruction looks like when it fails. Field Code shipped *Use and add note* into capture mode; Amendment 10 §D wires it into the identification call. **The mechanism now exists and the walk export predates it.**

### A fabricated gap costs a site visit

I misread a sealed sewage-ejector lid as an open pit — **from a wide shot, with the close-up and its nameplate already in hand.** Then I built a question on the error: *are there two pits?*

**A fabricated fact is a liability. A fabricated gap is a liability that costs a site visit**, because it lands in the gap report's third column and sends somebody to check something that does not exist. That is a business cost, not a data-quality one.

**And what caught it was David knowing his own basement.** At a client's house nobody in the room contradicts the reading. **The human in the loop is not the safety net at a client's house** — which is why Amendment 10's rules are structural rather than a matter of care.

### The narrative layer, with a worked example — your §8 open item

That reading produced **four kinds of output and only three have homes:**

| Output | Home |
|---|---|
| 25 identified objects with nameplates | `objects` |
| Moisture at the geothermal base | a **concern**, object-owned |
| *Recommend the specialist who services it* | a **triggered flag** |
| **Room layout · "this room is also storage and a workbench" · "the water path cannot be determined from stills"** | **nowhere** |

**The homeless ones share a shape: they are property-level facts about a room, not object-level facts about a thing.** Access, clearance, what a visit can physically reach, and what the evidence cannot settle. That is your narrative layer, and it is not prose looking for a section — it is a **fourth grain** between the object and the property.

### Three replacement histories from nameplates alone

In one room: water heaters decoding to **2012 and 2024**, pressure tanks **2011 and 2024**, circulators **2023 and 2024**. **That is the engine earning its place** — a documented house recovers a replacement history a household cannot recite. Every decode is offered as `Inferred` and the stored value stays unknown until confirmed.

### An unknown that is the finding

The geothermal nameplate carries a table of auxiliary heater models with a tick-box column for the installer. **Nothing is ticked.** Which heater is fitted is genuinely unknown, and **the blank box is the finding** — not something to fill from the commonest option. *Unknown stays unknown*, working on real evidence.

### The panel directory said "furnace" and there is no furnace

Circuits 19/21 and 23 read *furnace element* and *furnace comp*. The house is heated by a geothermal heat pump; those are almost certainly its compressor and auxiliary heat, labelled by an electrician using the word to hand.

**Worth noting in the binder so nobody hunts for a furnace — and an owner question rather than a silent correction.** The label on the panel is what a household reads in an emergency. **That is the identification/assessment line showing up somewhere nobody predicted it.**

### On your §8 attributes deadline — evidence from this side

Amendment 9 §C1 rules that **of six property attributes the desk can realistically propose two** — `has_mechanicals` and `has_plumbing`. The other four need the visit. **Your instinct that this is the one open item carrying a deadline is supported from the builder side:** what is not in a photograph cannot be derived at the desk, and the desk pass has been measured against that and can only reach a third of the set.

---

## G. What you asked for and I am sending separately

**`Note_Verification-Discipline`, 15 rules, in full.** Sent as a file rather than pasted — it is long, and a file is what a fresh session can keep.

**Two rules to read first, because they are the ones that catch documents rather than code:**

- **Rule 9** — *a document asserting a checked state must carry the check, not the claim.* This is what the register's ✓ on a non-existent file failed.
- **Rule 14** — *a correction is authored whole, never appended.* The tell: read only the first sentence; if that alone is now false, the note is wrong regardless of what follows.

**And rule 6 applies to this document as much as to the register: re-read these numbers rather than carrying them forward.** Every one was recomputed today from the artifact. They will drift.
