# Binder Builder — Increment 5 pre-build findings

**Date:** 2026-08-03
**Status:** answers to the two things the Increment 5 spec asked to have flagged rather than built around, plus the media request and three pieces of feedback on the spec itself.
**Binds to:** `HouseSteady_Binder-Builder_Increment-5_Build-Spec_2026-08-02.md` §2, §3, §6, §8, §10.
**No code has been written for Increment 5.** This note is what the spec asked for before building.

---

## 1 · §2 — objects are not pins. Cost: cheap. One thing to fix first.

**The question asked:** *"If anything in the existing schema makes that expensive — if pins are load-bearing somewhere I have not seen — say so before building rather than working around it."*

**Answer: nothing in the schema fights it.** Three facts, each checked rather than recalled:

**No foreign key anywhere points at `pins`.** `grep "REFERENCES pins" server/src/db/migrations/*.sql` returns nothing across all sixteen migrations. Every pin-referencing column in the database — `media.owner_pin_id`, `resolutions.scope_pin_id`, `overlays.scope_pin_id`, `active_items.assigned_pin_number`, `desk_media.owner_pin_id` — is a plain `TEXT` or `INTEGER` column holding the field-minted uuid or the session-scoped number. Nothing is bound to a `pins` row by the database.

**`pins` is not an entity table.** Its grain is `(import_id, pin_id)` — one row per pin *per import*. It is per-import evidence, the same shape as `resolutions` and `zones`. There is no row in this database that means "the water heater"; there are N rows that mean "what the export said about this pin on visit N." An `objects` table with a property-lifetime grain is a genuinely new thing sitting beside it, not a refactor of it.

**Adopting the field-minted uuid as canonical (CLAUDE.md §7) means an object can reference the pins that evidence it with no mapping layer** — a plain TEXT column, exactly like the five that already exist.

So §2 costs a migration and a module. It does not cost a schema rewrite.

### 1a · The one thing to fix first, and it is a name

`server/src/plan/sessionPlan.ts:255` already declares `objects: PlanObject[]`, and line 360 builds it from pins:

```ts
const objects: PlanObject[] = pins.map((pin) => { … })
```

Under §2 an "object" is the desk's confirmed entity with a class and a property-lifetime identity. In the session plan today an "object" *is a live typed pin* — line 583's own note says so: `'live typed pins, by field-minted uuid'`. **Two different things, one word, and the second one is the exact thing §2 says must never be conflated with the first.**

This is the fourth instance of the same hazard in this repo — `compilePlan`, `type`/`label`, `sinceImportedAt`, now this — and the previous three were all cheaper to fix before the second meaning arrived than after. The session plan's `objects` should be renamed to what it actually holds (`typedPins` reads correctly and matches line 583's note) **before** the word is reused, not during. It is a mechanical rename of an internal type plus one key in the exported plan JSON; the Session-Plan Contract will need the field-name change recorded.

**Recommendation: do the rename as the first commit of Increment 5, on its own, before any object work.** If David would rather the exported key stay stable for the field app, say so — that is a contract question and it is his, not mine.

---

## 2 · §6 — the recorded-not-specced item. I agree with the workflow and disagree with the word.

**The question:** whether generated care items are individually confirmable or ride the object's confirmation. Builder Claude's reading: they ride it and are individually editable afterwards, because twelve confirmations per object is the four-hour desk pass returning by another door.

**The workflow is right.** One act per object, editable afterwards. Twelve clicks per object is not a confirmation surface, it is a data-entry screen, and §6's own reasoning about signature strength applies as much to repetition within an object as across objects.

**But the word "confirmed" cannot cover both halves of that act, because this repo has already defined what a signature means.** CLAUDE.md §6:

> Signing does not mean *"I certify this assessment."* It means **"I observed this, and this description matches what I saw."**

Hold the two halves of an object confirmation against that sentence:

| What is being confirmed | Can the concierge check it against evidence in front of them? |
|---|---|
| *This is an American Standard gas water heater, serial ending 4471* | **Yes.** The photograph is on screen. This is exactly what §6's definition describes. |
| *Descale every 12 months, procedure X, cartridge part number Y* | **No.** Nothing in the room tells them. They are ratifying a research result they have no basis to check. |

If both ride one signature recorded as *confirmed*, the record says a human verified the descaling interval. Nobody did. That is a laundered inference — doctrine 2 — arriving through a UI decision rather than through a data path, which is why it is easy to miss.

### 2a · The proposal: one act, two provenance records

Keep the single click. Split what it writes:

- **Identification** — class, label, make/model/serial → provenance `Observed`, act = **confirmed**. Unanimity applies as Increment 2b already has it.
- **Research output** — care items, intervals, part identities, replacement horizon → provenance stays `Inferred`, act = **adopted**. Not signed as observation, because it was not observed. Individually editable afterwards, exactly as Builder Claude reads it; an edit is an edit and gets recorded as one.

One screen, one click, two rows with two different words. The cost is a column value, not a second surface.

**What it buys:** when a care interval turns out wrong — and over five years several will — the record already says nobody claimed to have verified it. Under a single *confirmed*, the concierge is on the hook for a research claim they had no way to check, and the binder asserts a verification that never happened. That is the overclaim CLAUDE.md §1 calls the cardinal sin, and it would have entered through a button label.

**This is a proposal, not a decision.** §2's `adopted` is new vocabulary and vocabulary is Builder Claude's and David's. If the answer is "confirmed covers both, the desk understands the difference," I will build it that way and say so in the code — but the definition of a signature in §6 of CLAUDE.md would then want a sentence added, because as written it does not stretch to cover a descaling interval.

---

## 3 · The media — what I need, in what shape

David has 157 photos, 4 videos, 2 voice notes, 529 MB. **The manifest's own numbers agree exactly**: 163 media rows, 528.6 MB, `{photo: 157, video: 4, voice: 2}`. Nothing is missing from the export.

### 3a · Where it goes — and what must never happen

**`/data/`, never the repo.** CLAUDE.md §14. `/data/` is gitignored and stays that way; 529 MB of real interior photographs of a real house is precisely the thing that clause exists for. The redacted fixture in `/fixtures/walk-2026-07-31/` is 424 KB of JSON with **no media and no media derived from it, ever** — that boundary does not move.

Put it next to the manifests already staged there:

```
/data/incoming/2026-07-31-walk/
    manifest-open.json          ← already here
    manifest-closed.json        ← already here
    media/                      ← this is what I need
        019fb92d-afd2-…/
            _zone/019fb92f-5250-….jpg
            _canvas/019fb92e-3299-….jpg
        …
```

### 3b · The shape — three requirements, each for a stated reason

**1 · Keep the export's own directory layout, unzipped.** The manifest declares each file by relative path: `media/<zoneId>/_zone/<mediaId>.jpg`. If the zips already contain that structure, extracting them side by side into `media/` is the whole job. **Do not rename anything** — the filename *is* the media id and it is the only thing tying a file to its manifest row.

**2 · Originals, at original resolution.** Not resized, not re-exported, not compressed on the way out of Photos. §6's defect is specifically that the assist screen renders a 1200px thumbnail of a ~4000px nameplate and gives the concierge no way to zoom. **A resized export makes that fix untestable** — the bug is invisible if the source is already small.

**3 · All of it eventually, but a first slice is enough to start.** In priority order:

| Priority | What | Files | Size | What it unblocks |
|---|---|---|---|---|
| **1** | the **entry** zone, whole | 4 | 11 MB | end-to-end path on a small zone; includes one voice note, which proves the non-image media handling before it matters at scale |
| **2** | the **mechanical room**, whole | 59 | 178 MB | §3's batching claim, §8's real cost number, the nameplate zoom fix, and one video |
| **3** | everything else | 100 | 340 MB | the property pass (§5), which is structurally incapable of being right on a half-loaded house |

Priorities 1 and 2 are ~190 MB and unblock every part of Increment 5 except §5. **§5 must not be run at all until priority 3 lands** — that is the spec's own hard ordering constraint (§5), and a property pass over a partially loaded house produces confident nonsense about absences that are really unloaded photographs.

### 3c · What I will do on arrival, before using any of it

Every manifest row carries a `sha256`. **I will verify every file against it and report the count**, rather than assume the transfer was clean. Rule 9: a document asserting a checked state carries the check. If any file fails, it is named, not silently skipped.

---

## 4 · Feedback on the spec — three things, offered because they were invited

### 4a · §3's input is under-specified for the media kinds this walk actually contains

§3 says the identification pass's input is *"a zone's media."* On the real walk, a zone's media is not all photographs:

| zone | files | MB | kinds |
|---|---:|---:|---|
| mechanical room | 59 | 177.8 | 58 photo, **1 video** |
| kitchen | 39 | 122.1 | 38 photo, **1 voice** |
| full bath | 31 | 111.3 | 28 photo, **3 video** |
| front | 13 | 55.0 | 13 photo |
| mudroom w/ washer | 16 | 49.8 | 16 photo |
| entry | 4 | 10.6 | 3 photo, **1 voice** |
| bedroom | 1 | 2.0 | 1 photo |

Six of the seven zones with media are photo-only in the sense the spec assumes; **two of the busiest are not.** An image call cannot take a QuickTime file or an m4a. So the pass will, on its first real run, receive media it cannot send — and **doctrine 6 says nothing may be dropped silently.**

**This needs one declared sentence in the spec, not a build decision by me:** which kinds the identification pass consumes, and what happens to the ones it does not. My read of doctrine is that unconsumed media must be *reported per zone* — *"4 files not sent to identification: 3 video, 1 voice"* — and surfaced to the review queue, because a nameplate narrated in a voice note and never photographed is exactly the object the pass will miss and nobody will know it missed. CLAUDE.md §5 also forbids switching on an exhaustive kind list, so the rule has to be expressed as *which kinds are consumed*, with everything else falling through to the report by default — never a list of kinds to skip.

### 4b · §8's ceiling is counted in the wrong unit

§8 asks for *"a hard call ceiling per object and per room."* Per object, that works. **Per room, a ceiling in calls does not contain cost**, because rooms are not comparable:

- mechanical room, 58 photos → at Opus 5's high-resolution image tier (~4,784 visual tokens per image, upper bound) that is **up to ~280,000 image tokens in a single call**
- entry, 3 photos → **up to ~14,000**

Twenty to one. A ceiling of "3 calls per room" permits ~840k tokens in the mechanical room and ~43k in the entry, and the runaway §8 exists to contain is the expensive one. **Suggest the per-room ceiling be denominated in tokens or dollars rather than calls** (or both, with the token one binding). That is a one-line change to §8 and it makes the containment actually contain.

Related, and the same measurement: **§3's one-call-per-zone will need a sub-batch rule for the tail.** 58 photos in one call is feasible against a 1M context but it is lopsided, and if a baseline visit runs 400–600 photos as CLAUDE.md §11 says, the mechanical room is not the worst case — it is the median. When a zone splits, **the split must be recorded and reported, not silent** (§10's no-silent-caps discipline), because §3's accuracy claim rests on the model seeing a whole room, and a split zone no longer satisfies it. The review queue should be able to see which proposals came from a split.

I have not chosen a threshold. That wants the real photographs and one measured call, which is another reason for §3b priority 2.

### 4c · §1a's cross-check will be idle, not passing, and the test must know that

§1a requires every class's declared component type to be checked against the import's own config snapshot. Correct, and it matches the trigger vocabulary cross-check.

**But the class file ships with zero classes** (§1, and rightly). So on day one, and for however long the class list takes to author, that cross-check iterates an empty list and reports green — forever, with no class ever having been checked.

That is Verification Discipline **Rule 11** exactly: *a check whose distinguishing input is never present has not been passing — it has been idle.* The rule was written three days ago about a different check and this is its second instance.

**The consequence is a test requirement, not a spec change:** §10's first behavioural test — *"a class naming a component type absent from the import's config snapshot is reported"* — **cannot be written against the shipped file.** It has to construct a class naming a type the walk's config v1.11 does not declare, run the check, and assert the report. And per §9b it gets negative-tested when written: break the check, watch the test fail. I will build it that way; flagging it here because "the shipped file has no classes, so the test passes" is a very easy thing to accept without noticing.

---

## 5 · Two small confirmations against the code

**§6's zoom defect is exactly as described.** `web/src/api.ts:775` defines `mediaUrl` with the comment *"Full-size original. Used for the lightbox, never for a grid."* `mediaUrl` is referenced nowhere else in the web app. All three render sites — `Assist.tsx:314`, `Assist.tsx:487`, `Canvas.tsx:127` — use `thumbUrl(…, 1200)`. **The comment asserts a lightbox that does not exist**, which is how the defect survived: anyone grepping for the full-size path finds it and reads the comment as evidence it is wired up.

**The two new reference documents are already under the existing doctrine scan** with no test change. The scan matches `/docs\/reference|Checklist-Master/i` across `server/src` and `web/src` by path, so `Baseline-Service-Design` and `Baseline-Process` are covered by virtue of where they sit — which is the point of putting them there.

---

## 6 · What happens next

Nothing is built until §1 (the rename), §2 (`adopted` vs `confirmed`), and §4a (which media kinds the pass consumes) come back. **§4b and §4c need no answer to proceed** — 4b is a spec refinement I have flagged and will honour whichever way it lands, 4c is a test I will write correctly regardless.

The media in §3b priorities 1 and 2 unblocks everything except the property pass.
