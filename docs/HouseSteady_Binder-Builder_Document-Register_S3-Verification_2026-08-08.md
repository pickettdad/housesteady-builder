# Document Register §3 — Builder Code verification at the 2026-08-08 cut

**Date:** 2026-08-08 · **Record of an event. This date never moves.**
**Answers:** *"verify §3 of the register — your section, at this cut."*
**Method:** every row recomputed from `origin/main` at **`fd87a3b`**, read with `git ls-tree` and through the parsers that own each file. **Counts re-read per rule 6, never carried forward — including my own from yesterday.**

> **One thing to say first, plainly.** The 2026-08-08 register was not among the three documents I was sent — I have the Roadmap, State of Understanding v3 and Business Plan v5. **So this is not a row-by-row ✓/✗ against that file.** It is the ground truth §3 describes, measured today, in a shape the design session can diff against whatever §3 currently says. Where I can tell what the register asserts (from the Roadmap's own header, and from the 08-07b rows I verified yesterday), I have said so.

**Headline: §3's subject matter moved more in one day than in the three before it.** Eighteen files landed, the false row acquired a real home at a different address, and **a new carried copy went stale within twenty-four hours of arriving — structurally, not by neglect.**

---

## A · The ground truth — `/docs`, at `fd87a3b`

**84 files under `/docs`.** Yesterday: 50. The arithmetic:

| | Files | |
|---|---:|---|
| `/docs` top level | **57** | up from 50 |
| `/docs/archive` | **5** | 4 superseded documents + README |
| `/docs/class-frame-content` | **10** | 9 artifacts (00–08) + README — **new since 08-07** |
| `/docs/images` | **1** | the rule-1 worked example |
| `/docs/reference` | **11** | 10 documents + README |
| **Total** | **84** | |

**Elsewhere in the repo, for the rows §3 also carries:**

| | |
|---|---|
| `/schema` | **7 files** — `binder-schema-v1` · `class-frame-v1` · `client-names-v1` · `owner-question-wording-v1` · `retirement-lineage-v1` · `profiles/baseline-v1` · `reference/maintenance-schedule-v1` |
| `/prompts` | **8 files** — README + **5 prompt names, 7 versions** (`nameplate_extract` and `photo_routing` each at v002) |
| `/brand` | **19 files** — zip, README, `assets.json`, 1 PDF, 14 PNG, 1 SVG |
| `/fixtures` | **3 sets** — `nameplates` (17 photographs + `expected.json` + README = 19) · `reference` (1 manifest) · `walk-2026-07-31` (manifest + `photo-dimensions.csv` + README) |
| `server/src/db/migrations` | **19 `.sql`**, latest `019_objects_actor.sql` |
| Tests | **906 tests · 192 suites · 0 fail**, across **38 test files**. Typecheck green |

---

## B · Counts re-read, including two of mine

| Asserted | Re-read at `fd87a3b` | |
|---|---|---|
| `Note_Verification-Discipline` — 13 rules | **15** | unchanged since 08-06; still 15 |
| Increment 5 — *Amendments 1–6, 8, 9, 10* | **All ten present on main** | **The register was ahead of the repo yesterday and the repo has caught up.** The row is now correct — but it became correct by the world moving, not by the row being fixed |
| `class-frame-v1.json` — 176 · 73 · 166 · 55 · 37 · 45 | **176 · 73 · 166 · 55 · 37 · 45** | all six exact |
| every care category declares an audience | **73 of 73** | exact |
| every zero-care class states a ruling | **45 of 45 carry a `note`** | exact |
| 5 access events | **5** | `well-pump-service` · `septic-pump-out` · `annual-combustion-service` · `chimney-sweep` · `electrical-service` |
| 16 systems | **16 distinct values across `class.systems`** | derived, not declared — see the caveat below |
| `maintenance-schedule-v1.json` | **v1.4.1 · 190 items · 17 propertyTriggers · 21 eventTriggeredInspections** | exact |
| `binder-schema-v1.json` — labelled slots | **23 sections · 41 slots · 18 carrying `defaultLabel`** | observed 6 · documented 5 · reported-by-homeowner 4 · inferred 2 · measured 1. **The Roadmap header records the register carrying 19; 18 is the number** |

**The shape caveat still stands and got worse, not better.** `careCategories`, `inspectionPoints`, `opportunityConditions` and `ownerQuestions` are **top-level vocabulary arrays**; classes reference them by id. A count taken off the classes gets 252, 441, 0 and 216 — every one of them a real number, none of them the register's. `accessEvents` and `systems` are **not arrays at all**: the five events are an `accessEvent` field on inspection points, the sixteen systems are distinct values across `class.systems[]`. **`frame.accessEvents.length` is `undefined`, and a count that trusts it reports zero rather than failing.** *I made exactly this mistake on the first probe today and caught it against the parser — rule 15 in one sitting.*

---

## C · What moved since yesterday — the eighteen files

Diffed `38d2b9a` → `fd87a3b`, `/docs` only:

**Seven documents to `/docs` top level:**
`Increment-5_Build-Spec_Amendment-10` · `AI-Processing-Decision_Addendum_Identification` · `Note_Vision-Input-Limits` · and four Code replies — `Document-Register`, `State-of-Understanding`, `Harvest-Verification`, `Property-Flags-and-Session-Plan`.

**Ten files to `/docs/class-frame-content/`** — nine artifacts numbered 00–08, plus a README.

**One file to `/docs/reference/`** — `HouseSteady_Build-Roadmap_2026-08-07.md`.

**Nothing was deleted or renamed.** The insertion count is 10,717 lines and 8,000 of them are the class-frame content JSON.

---

## D · Findings at this cut

### D1 · The false row now has a home, at a different address and a different count

Yesterday: *`Class-frame content deltas | 5 cut, all merged | ✓ | /docs`* — and no delta file existed anywhere in the repository.

**Today they exist.** They are **nine**, not five; they live in **`/docs/class-frame-content/`**, not `/docs`; and they are numbered 00–08 with a README that verifies the chain end to end. Artifact 00 is the whole-file send that would have reverted structural work had it been applied.

**So the row is still wrong, in all three particulars, and it is now wrong against something real** — which is the more dangerous state. A row pointing at nothing gets caught the first time someone looks. A row pointing at the right neighbourhood with the wrong street number gets believed.

### D2 · A carried copy that goes stale by construction

**`/docs/reference/HouseSteady_Build-Roadmap_2026-08-07.md` landed yesterday and is superseded today.** I am holding the 08-08 cut in session and was told not to file it, correctly.

**This is not neglect — it is the interaction of two rules that each work.** The roadmap is *replaced wholesale by rule*; `/docs/reference` exists so *staleness shows up as a diff instead of as a wrong answer three weeks later*. Put a wholesale-replaced document into a carried-copy folder and you get a file that is stale on most days, and whose staleness looks identical to every other file in that folder — which is the folder's own stated failure mode running in reverse.

The Roadmap's §9 already learned the dated-pointer half of this lesson and dropped its date. **The carried copy is the same lesson one layer down.** Three options and none is mine to pick: refresh it every cut, drop it from `/docs/reference` and let the Roadmap live only in the project folder, or keep it under a name without a date so the diff is always visible.

**And it has no row in `/docs/reference/README.md`.** That table lists nine documents; the folder holds ten. The roadmap was added without the folder's own index being updated — a smaller instance of exactly what §3 is for.

### D3 · There is no Amendment 7

The Increment 5 series on main is **1, 2, 3, 4, 5, 6, 8, 9, 10**. No file named Amendment-7 exists anywhere in the repo, at any commit reachable from main.

**A gap in a numbered series is the one thing a careful reader silently repairs.** *"Amendments 1–10"* is the natural compression and it is false. If §3 carries the compressed form it should be corrected; if it carries the explicit list it is right and worth a footnote saying the gap is real, so the next reader does not fix it.

### D4 · `expectationSource` is on two slots, not one — and the string appears three times

My 08-07 property-flags reply named `s7.components` alone. **The declaration is on two slots:**

| | |
|---|---|
| `s7.components` | `"property triggers + intake services block"` |
| `s13.tests` | `"property triggers"` |

**A third occurrence at line 1264 is prose** — the `technologySection` narrative proposing `expectationSource: "session-attestation"` as a future value. Not a slot, not declared, not parsed. **A grep for the field returns three; the answer is two.**

**All of it is still read by nothing.** `audit/schema.ts:89` types it `unknown` — parsed, carried, never interpreted. Unchanged today.

### D5 · `preferredLabel` remains 0 of 41 and 0 in code

The proposal is in `dualSourcedFacts` with its own 2026-07-29 correction beside it. **No slot declares it and no code references it.** Third consecutive cut at zero.

### D6 · If §3 carries a test number, it needs to say which number

`node --test` reports **906 tests, 192 suites** and a top-level plan of **`1..186`**. Those are three defensible answers to *how many tests* and they differ by a factor of five. The Roadmap's 08-07 cut carried **196**, which matches none of them at this cut.

**A bare count in a register is a number nobody can check.** *906 assertions across 38 files* can be reproduced by anyone in ninety seconds; *196 tests* cannot.

---

## E · A correction to my own 08-07 reply

**I wrote:** *"Archive holds **only** Increment-1 v3.1 and Increment-2a."*

**The archive holds five entries** and did yesterday too:

`AI-Assist-Plan_v1_2026-07-25` · `Increment-1_Build-Spec_v3.1_2026-07-25` · `Increment-2a_Build-Spec_2026-07-26` · `Manifest-Contract_v3_Observed-Addendum_2026-07-25` · `README.md`

**The claim I was making was true and the sentence I wrote was not.** Of the five increment specs the register describes as *superseded in `/docs/archive`*, exactly two have an archived predecessor — that is the finding and it stands. But *"the archive holds only"* asserts the folder's whole contents, and it does not. **Two documents were made invisible by a word.**

Rule 14: this is authored whole here rather than appended to yesterday's file, which stays as the record of what was said on 08-07.

---

## F · What this cannot tell you

**I did not verify §3 against the 08-08 register**, because I was not sent it. Everything above is the repo measured today. **Where a row of §3 disagrees with a number here, the number here was recomputed from the artifact and the row was not.**

**§4 is the field repo. I have not read it and nothing here bears on it.**

**Presence is not currency.** I verified that files exist, where they live, what they are named, and every count they assert about themselves. **I did not re-read 84 documents for internal staleness** — D2 is the one staleness finding, and it surfaced because the file's supersession is a fact I happen to be holding, not because I audited for it.

**One commit, one date.** `fd87a3b`, 2026-08-08. **Rule 6 applies to this reply as much as to the register: re-read these numbers rather than carrying them forward.**
