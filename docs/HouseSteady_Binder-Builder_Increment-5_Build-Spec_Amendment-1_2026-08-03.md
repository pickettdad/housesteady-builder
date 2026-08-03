# Increment 5 Build Spec — Amendment 1

**Date:** 2026-08-03
**Amends:** `HouseSteady_Binder-Builder_Increment-5_Build-Spec_2026-08-02.md`. Everything not listed here stands.
**Cause:** Builder Code's pre-build findings note, which answered the two questions the spec asked to have flagged and raised three the spec had not. **All five were right and none was built around**, which is the process working.

---

## A. Precondition — rename `objects` before any object work

**Code found the word taken.** `server/src/plan/sessionPlan.ts:255` declares `objects: PlanObject[]`, built from pins at line 360, with line 583's own note saying what it holds: *live typed pins, by field-minted uuid.* Under §2 an object is the desk's confirmed entity. **Two meanings, one word, and the second is precisely what §2 says must never be conflated with the first.**

**Rename to `typedPins`.** Standalone commit, before any Increment 5 work.

**On whether the exported key must stay stable — it must not, and the reason is definite.** Field Code confirmed the session-plan import is **scoped in detail and not built.** There is no receiver, so there is no stability obligation, and **this is the last moment the rename is free.** The contract is binder-owned; this is that owner's decision.

**`objects` is reserved, not vacated.** When the desk produces confirmed objects, the session plan will carry them — and it may carry both, since *what the field recorded* and *what the desk confirmed* are different facts about the same house. Two names because two things.

**Fourth instance of this hazard** after `compilePlan`, `type.label` and `sinceImportedAt`, and all three prior were cheaper before the second meaning arrived.

---

## B. `confirmed` and `adopted` — Code's proposal is adopted

**Code is right and the reasoning is doctrine, not taste.** `CLAUDE.md` §6 defines a signature as *"I observed this, and this description matches what I saw."*

| What is signed | Checkable against evidence on screen |
|---|---|
| *American Standard gas water heater, serial ending 4471* | **Yes** — the photograph is right there |
| *Descale every 12 months, cartridge Y* | **No** — nothing in the room says so |

**One signature covering both records that a human verified the descaling interval. Nobody did.** That is doctrine 2's laundered inference arriving through a **button label** rather than a data path — which is exactly why it is easy to miss and why no scan would have caught it.

**So: one click, two provenance records.**

- **Identification → act `confirmed`, label `Observed`.** Unanimity as 2b has it.
- **Research output → act `adopted`, label `Inferred`.** Individually editable afterwards.

**The workflow is unchanged** — one click per object, never twelve. **The cost is a column value, not a second surface.**

**What it buys:** when a care interval turns out wrong, and over five years several will, **the record already says nobody claimed to have verified it.**

### B1 · `CLAUDE.md` §6 needs a sentence

Code is right that the definition does not stretch. Proposed, for Code to word as it sees fit:

> **A signature is a claim about evidence the signer can see.** Where a proposal cannot be checked against anything on screen — a research interval, a lifespan band, a part number — the act is **`adopted`**, not confirmed, and the honesty label stays `Inferred`. **Adopting is taking something into the record; confirming is vouching for it.**

**Vocabulary check:** `adopted` does not collide. `accepted` and `edited` are 2b's nameplate acts; `carried` means carried items. `adopted` is unused and says the right thing.

---

## C. Which media kinds the identification pass consumes

**Code is right that §3 was under-specified**, and right about the shape of the fix: `CLAUDE.md` §5 means declaring **which kinds are consumed**, with everything else falling through to a report — **never a list of kinds to skip.** A skip list goes stale the first time a new kind arrives and fails silently.

**This increment: photographs are consumed. Nothing else.**

**Everything unconsumed is reported per zone and surfaced to the review queue.** Not dropped, not counted-and-forgotten.

### C1 · The reason this matters more than it looks

*A nameplate narrated in a voice note and never photographed is exactly the object the pass misses — and nobody knows it was missed.*

**Recorded, not specced, and it is the highest-value next addition to this pass:** a concierge's voice note is *the concierge telling the desk what something is.* **That is better identification evidence than any photograph** — it carries the name, often the brand, and always the reason the capture was taken. Transcription is built, authorised under the AI Processing Decision §5, and the walk has two voice notes waiting.

**Not this increment**, because merging transcript text with image evidence changes the call shape and the increment is already large. **But it is the obvious second slice**, and the unconsumed-media report is what will make the case for it with real numbers.

---

## D. The cost ceiling is denominated in the wrong unit

**Code measured it and §8 was measuring calls where the variance is in tokens.**

At the high-resolution image tier, the mechanical room's 58 photographs are up to **~280,000 image tokens in one call**; the entry's 3 are **~14,000**. **Twenty to one.** A ceiling of *three calls per room* permits ~840k tokens in one room and ~43k in the other — **and the runaway §8 exists to contain is the expensive one.**

**So §8's per-room and per-object ceilings are denominated in tokens or dollars, never in calls.** A call count is a proxy for cost that fails precisely where cost varies.

### D1 · Sub-batching must be recorded, never silent

**§3's accuracy claim rests on the model seeing a whole room.** A zone too large for one call must be split — **and a split zone no longer satisfies that claim.**

**So a split is recorded on the run and reported**, with how many batches and why. Same discipline as the active item set reporting `{received, computed}`: **a result produced under different conditions must not be indistinguishable from one produced under the stated conditions.**

**No threshold chosen here.** It wants the real photographs and one measured call.

---

## E. One neither of us caught — the property pass needs an explicit completeness state

**§5 says the property pass runs after identification completes. That is right and it is not sufficient.**

**The named failure:** *media arrives in slices. Zones one and two are identified while zones three to eight have no photographs on the machine at all. Nothing is queued, identification is "complete," and the property pass runs against two rooms of an eight-room house — reporting confident absences about six rooms nobody has looked at.*

**An empty work queue and a fully captured property are indistinguishable from inside**, which is rule 7 in the one place where the wrong answer is a client-facing claim about something not existing.

**So the property pass requires an explicit statement that the property is complete**, and it must be derived from something other than the absence of pending work:

- every zone in the import has media present, or is explicitly recorded as having none
- every zone with media has been through identification
- **and a zone with no media at all is a declared state**, not an inferred one — a zone can be created and never captured, and that is a real thing rather than an error

**Where completeness cannot be established, the pass does not run and says why.** It does not run partially, and it does not run and caveat.

---

## F. §1a's cross-check will be idle — noted, no answer needed

Code is right: the class file ships with zero classes, so the component-type cross-check iterates an empty list and **reports green forever without ever checking a class.** Rule 11's second instance in a fortnight.

**The consequence is a test requirement**, which Code has already stated and will build: §10's first behavioural test cannot use the shipped file. It constructs a class naming a type the walk's config v1.11 does not declare, and is negative-tested per §9b.

**Flagged here because *"the shipped file has no classes, so the test passes"* is very easy to accept without noticing** — which is the whole content of rule 11.

---

**Status:** amendment 1. The spec stands except where corrected above. **§A is a precondition; nothing else starts until the rename lands.**
