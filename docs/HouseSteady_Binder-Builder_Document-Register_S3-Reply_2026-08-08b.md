# Document Register §3 — Builder Code reply against the 2026-08-08 cut

**Date:** 2026-08-08 · **Record of an event. This date never moves.**
**Verifies:** §3 only, row by row, against the register as sent.
**Method:** every cell recomputed from `origin/main` at **`465538f`** (PR #79 merged), read through the parsers that own each file. **Counts re-read per rule 6.** Where I guessed a shape and got a wrong number, I say so.

**Short version: §3 is the most accurate cut of this section yet — two rows are now false because the world moved, four counts are exact to the digit, two §6 rows it owns are closed, and twelve documents in `/docs` are in no row.**

**Also done in this turn, by owner ruling:** the carried copies are out of `/docs/reference`. §6 #59 is closed. §7 below.

---

## 1 · The two rows that are now false

### Line 65 — `Class-frame content deltas | NOT IN ANY REPO | △`

**They are in this repo, and have been since 2026-08-07.**

`/docs/class-frame-content/` holds **nine artifacts numbered 00–08 plus a README** — heating and cooling · electrical · appliances · plumbing · envelope, site and waterfront · safety tier two · audience and review · regional, and **artifact 00, the whole-file send** that would have reverted structural work had it been applied.

**The ruling in the row was carried out exactly as written** — records of an event, binder `/docs`, dates immovable, owner sent and Builder Code filed. **§6 #54 is closed.**

*(The 08-07b cut marked this row ✓ at a location holding nothing. That was the false tick rule 8 was written for; this cut correctly demoted it to △ and named it. The correction is now that it can be closed rather than merely marked.)*

### Line 64 — `Amendments 1–6, 8, 9 on main` + `Amendment 10's merge state needs confirming — §6 #63`

**Amendment 10 is on main.** `docs/HouseSteady_Binder-Builder_Increment-5_Build-Spec_Amendment-10_2026-08-07.md`, landed with the PR #77 merge, present at `465538f`. **§6 #63 is closed** and the version cell should read **Amendments 1–6, 8, 9, 10**.

**And the *why* was new to me.** I reported on 08-07 that no Amendment 7 exists. **The register says it was written and withdrawn 2026-08-05, never sent** — which is the fact that stops the next reader repairing the gap. My note recorded the absence; the register records the reason, and the reason is the useful half.

---

## 2 · Every count in §3, re-read

| Row | Register says | Re-read at `465538f` | |
|---|---|---|---|
| 63 | `Note_Verification-Discipline` — **15 rules** | **15** | ✓ |
| 66 | `class-frame-v1.json` — 176 · 73 · 166 · 55 · 37 · 5 · 45 | **176 · 73 · 166 · 55 · 37 · 5 · 45** | ✓ all seven |
| 66 | `envelope` holds 17 classes, no roof covering, cladding or foundation | **17, and none of the three** | ✓ |
| 67 | `binder-schema-v1.json` v1.0.0 · 41 slots, **18 labelled** · 6/5/4/2/1 | **41 · 18 · observed 6, documented 5, reported-by-homeowner 4, inferred 2, measured 1** | ✓ exact |
| 68 | `profiles/baseline-v1.json` — covers all 41 slots | **41 of 41**: 28 required, 7 present-when-populated, 6 out-of-scope, none uncovered | ✓ |
| 69 | `client-names-v1.json` v1.3.1 — **the ratified twenty** | **20** | ✓ |
| 70 | `owner-question-wording-v1.json` — shipped empty | **`wording` is an array of 0** | ✓ |
| 71 | `retirement-lineage-v1.json` — zero entries | **`entries` is an array of 0** | ✓ |
| 72 | `maintenance-schedule-v1.json` v1.4.1 · 190 items · 78 of 190 across 36 expressions · densest `property.well` (11), `house.sump-pump` (6) | **v1.4.1 · 190 · 78 · 36 · well 11 · sump-pump 6** | ✓ every figure |
| 73 | `reference/lifespans-v1` does not exist | **`schema/reference/` holds one file**, and `s11.lifespans` declares `sources: ["reference:lifespans-v1"]` | ✓ |
| 74 | `provenance.ts` — **five exported functions**, called by nothing but its test | **five** — `provenanceMap` · `verify` · `aggregate` · `mergeBreakdowns` · `describeProvenance`. One caller: `server/test/provenance.test.ts` | ✓ |
| 101 | Walk fixture · **424 KB** | **3 files, 424 KB**, manifest + `photo-dimensions.csv` + README | ✓ |

**Twelve counts, twelve correct.** After two cuts of wrong numbers that is worth saying plainly rather than only reporting the misses.

**One correction to my own working, not to the register.** Checking line 69 I first read `client-names.names` as an array and got 13. **It is an object with twenty keys.** The register's cell was right and my probe was wrong — the same guessed-shape failure rule 15 exists for, twice in two days.

---

## 3 · Two cells that are wrong, both small

**Line 100 — `Brand assets | zip + 15 files, checksummed`.** `/brand` holds **18 files**: the zip, `README.md`, `assets.json`, one PDF, fourteen PNG and one SVG. Read as *zip + 15 assets* it undercounts by two; read as *zip + 15 files* by three. **The asset count alone is 16.**

**Line 95 — `/docs/reference/ carried copies | nine, two stale`.** It was **ten documents plus a README** at the time of the cut — the Build Roadmap landed with PR #77 and was never added to the count. **And only one stale copy is named** where the cell says two. **This row is resolved rather than corrected — see §7.**

---

## 4 · Twelve documents in `/docs` and in no row of §3

Checked by transcribing §3's rows by hand and diffing against the directory, after a fuzzy filename matcher gave a useless answer — **`Increment-5_Build-Spec` and *"Increment 5 Build Spec"* do not match on any normalisation worth trusting**, so the list was built deliberately.

**59 markdown files at `/docs` top level. 45 are named in §3, 2 are named elsewhere by design** — `Object-Concern-Model` in §5, `Class-Frame v1-1` in §1 — **and 12 are in no row:**

| File | What it is |
|---|---|
| `AI-Processing-Decision_Addendum_Identification_2026-08-07` | **A decision record.** Line 98 lists *Decisions — Backup · AI Processing*; this is the third and it is the one authorizing identification to send the interior of a house |
| `Note_Vision-Input-Limits_2026-08-07` | Answers Amendment 10 §C2 — the API takes no video natively |
| `Document-Register_Code-Reply_2026-08-07` | The §3 verification the register's own §6 asked for |
| `Property-Flags-and-Session-Plan_Code-Reply_2026-08-07` | The property-flag architecture answer. **§6 #27 cites its conclusions** and §3 does not list it |
| `Document-Register_S3-Verification_2026-08-08` | This morning's §3 verification |
| `Note_Identification-Model-Call_2026-08-08` | What §3's model-call half does and costs |
| `Note_CI-Starvation_2026-08-06` | The runner-starvation diagnosis. **Both repos hit this** |
| `Note_Manifest-Close-AB_2026-08-06` | The accidental A/B pair — what *closing an inspection* writes. Ten arrays byte-identical, two events appended. **Unrepeatable** |
| `Note_Schedule-Engine-Precedence-Worked_2026-08-06` | The worked precedence case the owner asked for |
| `Transcription-Options_2026-07-29` | **Amendment 10 §C step 1 is authorized partly on this file's reasoning** |
| `Session-Handoff_Code-Addendum_2026-07-30` | Handoff record |
| `HouseSteady_BinderBuilder_SessionHandoff_20260729.md` | Handoff record — **and the only rule-2 filename violation in this repo.** Unhyphenated `BinderBuilder`, separator-less `20260729`, no version. A record of an event, so the date is correctly immovable; the format is not |

**Five of these were in my 08-07 reply's §C1 and none was added.** Not a criticism — the 08-07b cut was made before that reply merged. **Flagged so this cut is not the third.**

### And three directories have no row at all

- **`/prompts` — 8 files, 5 tasks, 7 versions.** The directory whose whole reason for existing is *no model call may ever use an inline prompt string*, enforced by a doctrine scan, with every generation recording `prompt_id`, `prompt_version` and `prompt_hash`. **It governs what every binder sounds like and it is not in the register.**
- **`/fixtures/nameplates` — 17 photographs, `expected.json`, a README.** The nameplate golden set: the only evidence in the repo of what extraction was tested against. Line 101 lists the walk fixture and not this one.
- **`/docs/images` — 1 file**, the rule-1 worked example the Verification Note points at.

---

## 5 · One row that is right and points at an uncorrected file

**Line 61 — `CLAUDE.md ... §11's "123 MB" describes the reference export; the walk is 504.1 MB across eight zones`.**

**The note is correct and `CLAUDE.md` still says 123 MB.** Line 156: *"Scale, measured: 123 MB for two rooms."*

**That is true of the reference export and reads as the scale of a visit**, which is the number a future reader will size storage against — off by a factor of four. The row records the discrepancy with **no △ and no §6 row**, so nobody owns fixing it. It is a one-line correction to a file I can edit; **I have not made it, because `CLAUDE.md` is doctrine and this repo does not rewrite doctrine on its own initiative.** Say the word and it is one commit.

---

## 6 · §6 rows this section owns

| # | Status |
|---|---|
| **54** — class-frame content deltas | **CLOSED.** Nine artifacts in `/docs/class-frame-content/`, filed 08-07 |
| **63** — Amendment 10's merge state | **CLOSED.** On main at `465538f` |
| **59** — `/docs/reference` stale copies | **CLOSED by the ruling** — §7 |
| **27** — honesty-label assignment | **Answered, and steps 3–7 are the build work, not a discrepancy.** The reserve figure and `s2.next-review` need a **render gate, not an optional field** — a `renderNote` a renderer *may* emit is Table I again. The words are the design session's; the refusal is mine |
| **25** — the carried Manifest Contract copy | **Still open and now the only carried copy of its kind left in `/docs`.** §7 did not touch it — it is a cross-app contract under §5, not a design-session document, and the register says the source has corrected while the copy has not |
| **56** — `provenance.ts` idle | Confirmed idle: five functions, one caller, and that caller is its own test. **Design session's to place** |
| **68** — declared and consumed by nothing | My half unchanged: `preferredLabel` **0 of 41 slots, 0 code** · `s7.components`' `expectationSource` still typed `unknown` — **and it is on two slots, not one.** `s13.tests` declares `"property triggers"`. A third occurrence at line 1264 is prose. **A grep returns three; the answer is two** |

---

## 7 · The carried copies are gone

**Ruling applied: repos stop keeping design-session copies at all.** Eight files removed from `/docs/reference/`:

`Baseline-Process v2-1` · `Baseline-Service-Design v1-1` · `Build-Roadmap 2026-08-07` · `Monthly-Service-Design v0-3` · `Plan v4` · `Scope v4` · `Scope-Pending-Changes v4-1` · `Brand-Guide v1`

**The Brand Guide is the one I extended the ruling to and it is owner-authored, not design-session.** Removed on the same reasoning — its canonical home is the project folder, nothing in this repo reads it, `/brand/assets.json` already carries the five hex values and the type rules copied from §03, and **leaving one copy behind recreates the whole class for one file.** One `git revert` if that is wrong.

**Two files stayed, and neither is a copy of a project-folder document:**

- **`HouseSteady_Component-Types_config-v1.11.0.csv`** — **generated by this repo**, by `server/scripts/component-types.ts`, from an import's own config snapshot. Its canonical home *is* here. Read by `walk-fixture.test.ts`.
- **`HouseSteady_Checklist-Master_v1-11.md`** — a copy, kept on a **recorded decision** rather than by default. Two doctrine scans bracket it: one forbids any code path reading it, one **requires it to be present** so the schema cross-check can be run by hand. **If the ruling extends here too, the second scan comes out with it — that is the owner's call, so it is flagged rather than taken.** Note the same risk applies: this is v1.11 and the field repo is the source.

**`/docs/reference/README.md` is rewritten** to say what the folder is now and why the copies went — *the copy goes stale the moment the source is recut, and a stale copy looks exactly like a current one.* The Build Roadmap proved it inside twenty-four hours.

**One pointer updated:** `Open-Items` said the Brand Guide was in the repo at a path that no longer exists. It is a living document replaced wholesale, so the cell was corrected.

**Nothing else was edited.** Several build specs and records of an event *cite* the removed documents by name — `Increment-5_Build-Spec`'s *Binds to*, `Class-Frame v1-1`'s *Governed by*, `Note_Increment-5-Pre-Build-Findings`. **Those citations are still correct**: the documents exist, in the project folder, which is where they always belonged. **A record of an event does not get rewritten because a file moved.**

**951 tests green** after the removals.

---

## What this reply cannot tell you

**§1, §2, §4, §5, §6 and §7 were read for context and not verified.** The instruction was §3 only and this is §3 only. **§4 is the field repo and I have not read it.**

**Presence is not currency.** I verified location, filename and every asserted count. **I did not re-read fifty-nine documents for internal staleness** — §5 is the one staleness finding and it surfaced because the register itself names the discrepancy.

**One commit, one date.** `465538f`, 2026-08-08. **Rule 6 applies to this reply as much as to the register.**
