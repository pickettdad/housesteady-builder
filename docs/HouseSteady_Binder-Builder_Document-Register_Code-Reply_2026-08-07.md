# Document Register — Builder Code reply, §3 verified at source

**Date:** 2026-08-07
**Record of an event. The date never moves.**
**Answers:** Document Register 2026-08-07b §6 item — *"the register's §3 and §4 describe repo contents, and this session listed them from what the Codes sent rather than from the repos."*
**Method:** every row read from `origin/main` at `38d2b9a` with `git ls-tree` and `git show`, not from this session's memory of what it wrote. **Counts re-read per rule 6, never carried forward.** Where the register asserts a number, the number was recomputed from the artifact.

**Headline:** §3 is **substantially accurate and one row is false**. The false row is the one marked ✓.

---

## A. The row that is wrong

### `Class-frame content deltas | 5 cut, all merged | ✓ | /docs — records of an event`

**There are no delta files in this repository.** Not in `/docs`, not anywhere:

```
git ls-tree -r --name-only origin/main | grep -i delta   →  no matches
```

Three things are wrong in one row:

1. **The location is false.** The deltas were *applied* to `class-frame-v1.json`; the delta documents themselves were never filed here. They exist as chat payloads and nowhere else.
2. **The ✓ cannot be true.** ✓ means *read and confirmed this session*. A file that does not exist was not read.
3. **The row contradicts itself** — it says *5 cut* and then lists **six** systems (water heating · wells and septic · heating and cooling · appliances · electrical · plumbing). And the frame's own `contentPassProgress.written` records **sixteen** systems written, so the list is stale besides.

**The count cannot be corrected from the repo**, because the artifacts it counts are not in the repo. That is the finding: **the register asserts a location for a class of document that has no home.** Either they get filed here — in which case rule 2's *record of an event* class applies and the dates never move — or the row moves to a canonical home that actually holds them. **This is the design session's call, not mine.**

**This is exactly the failure the register exists to catch, and it took reading the repo to see it** — the row was plausible, specific, and marked verified.

---

## B. Counts that are wrong

| Register says | Actual | Evidence |
|---|---|---|
| `Note_Verification-Discipline` — **13 rules** | **15 rules** | Rules 14 (*a correction is authored whole, never appended*) and 15 (*where data has a declared shape, read it through the thing that parses it*) both landed 2026-08-06 |
| Increment 5 — *+ Amendments 1–6, 8, 9, **10*** | Amendments 1–6, 8, 9 **on main**; **10 is not merged** | Amendment 10 is in PR **#77**, open. The register is ahead of the repo |
| Increment specs 1, 2a, 2b, 2c, 3 — *"superseded in `/docs/archive`"* | Archive holds **only** Increment-1 v3.1 and Increment-2a | 2b, 2c and 3 have no archived predecessor. True of two of five |

**Everything else numeric checks out.** `class-frame-v1.json`, recomputed from the file rather than accepted:

| Register | Re-read | |
|---|---|---|
| 176 classes | **176** | ✓ |
| 73 care | **73** | ✓ |
| 166 inspection | **166** | ✓ |
| 55 opportunity | **55** | ✓ |
| 37 owner questions | **37** | ✓ |
| 45 zero-care, all carrying a stated ruling | **45** | ✓ |
| every category declaring an audience | **73 of 73** | ✓ |
| 5 access events | **5** | ✓ *with a caveat below* |

**The caveat, because it matters to anyone who greps for them.** `accessEvents` is **not a top-level array**. `accessConditions` at the top level is *prose* — six explanatory keys, no vocabulary. The five events live as an `accessEvent` field on individual inspection points: `well-pump-service` · `septic-pump-out` · `annual-combustion-service` · `chimney-sweep` · `electrical-service`. **Sixteen systems** are likewise derived from tags on `classes`, not declared as an array. A future count that looks for `frame.accessEvents.length` finds `undefined` and may report zero rather than failing — worth knowing before someone writes that check.

Schema file count is exact: the register lists seven under `/schema`, and there are seven.

---

## C. In the repo, absent from the register — twelve items

### C1 · Five notes and records in `/docs`

| File | Why it matters |
|---|---|
| `Note_CI-Starvation_2026-08-06` | The runner-starvation diagnosis. **Both repos hit this**; the field session was told, and this is the written form |
| `Note_Manifest-Close-AB_2026-08-06` | The accidental A/B pair — what *closing an inspection* writes. Ten arrays byte-identical, two events appended. **Unrepeatable evidence** |
| `Note_Schedule-Engine-Precedence-Worked_2026-08-06` | The worked precedence case the owner asked for |
| `Transcription-Options_2026-07-29` | Bears directly on Amendment 10 §C step 1, which is *already authorized* partly on this file's reasoning |
| `Session-Handoff_Code-Addendum_2026-07-30` | Handoff record |

**The first three are all from 2026-08-06** — the same day the register's own §5 header notes eleven documents were produced without it reopening. **They are the tail of that same gap.**

### C2 · A filename that breaks rule 2

**`HouseSteady_BinderBuilder_SessionHandoff_20260729.md`** — unhyphenated `BinderBuilder`, undated separator style `20260729`, no version. Against rule 2 and against every other filename in `/docs`. **A record of an event, so the date is correct to be immovable — but the format is not.** Renaming it is the only rule-2 violation I can see in this repo.

### C3 · Two carried copies — rule 1 exposure

| File | Canonical home per the register |
|---|---|
| `HouseSteady_Class-Frame_v1-1_2026-08-02.md` | **§1 — project folder** |
| `HouseSteady_Object-Concern-Model_v1_2026-07-25.md` | **§5 — "both repos"**, so this one is legitimate, but §3 does not list it |

**And `/docs/reference/` is nine documents, not one.** The register credits it with the Component-Types CSV alone. It also holds Baseline Process v2-1 · Baseline Service Design v1-1 · Brand Guide · Checklist Master v1-11 · Monthly Service Design v0-3 · Plan v4 · Scope v4 · Scope Pending Changes v4-1 — **every one of them a §1 or §2 document whose canonical home is the project folder.**

**This is deliberate and it is documented.** `/docs/reference/README.md` states these are carried context, not sources. **But rule 1 says a copy outside the canonical home is a copy, and nine of them sitting unlisted is the shape of a rule-1 problem even when each one is intentional.** Two of them are already stale against §1: reference holds **Baseline Process v2-1** where §1 lists **v2.2**, and the register's §1 flags v2.2's own date discrepancy as #24.

> **Recommendation:** one row in §3 reading *"`/docs/reference/` — nine carried copies, canonical elsewhere, see README"* closes this. Enumerating them here would duplicate §1 and §2 and drift.

### C4 · Two directories with no row at all

**`/fixtures/nameplates/`** — 17 photographs, `expected.json`, and a README. **The nameplate-extraction golden set.** The register lists the walk fixture and not this one, and it is the only evidence in the repo of what extraction was tested against.

**`/docs/images/`** — one file, `verification_guard-1-worked-example_2026-08-04.png`, referenced by the Verification Note. Minor, but a reader following the note to the image finds no register row saying it should be there.

---

## D. Confirmed correct, listed so the ✓ means something

`CLAUDE.md` at root · `Open-Items` · Increment 4 + Amendment 1 · Honesty-Label Mapping v1.2 and both records · Design v1 + v1.1 Amendment · `Note_Assist-Screen` · both Increment-3 notes · `Note_Increment-5-Scope` · `Note_Increment-5-Pre-Build-Findings` · `Golden-Set-Generality` · `Verbatim-Extraction` · Binder Schema v1.1 · all seven `/schema` files · Component-Types CSV in `/docs/reference` **and** the generator at `/server/scripts/component-types.ts` · AI Assist Plan v1.1 · Manifest Contract v3 carried copy · Observed Addendum · Session Plan v0 Contract · both Decisions · all three Findings · `/brand` (zip + assets + `assets.json` + README) · **Walk Fixture Pin Parse** and **Schedule/Engine Overlap Parse**, both present under their full filenames · walk fixture at `fixtures/walk-2026-07-31/`.

**`/docs` holds 50 files** against §3's 40 rows. The gap is C1–C4 plus the multi-file rows.

---

## E. In flight — the register will be wrong again within the hour

**PR #77 is open** and adds four documents:

- `Increment-5_Build-Spec_Amendment-10_2026-08-07` → `/docs`
- `AI-Processing-Decision_Addendum_Identification_2026-08-07` → `/docs`
- `Note_Vision-Input-Limits_2026-08-07` → `/docs` *(new — answers Amendment 10 §C2)*
- `Build-Roadmap_2026-08-07` → `/docs/reference/`

**This reply is itself a fifth**, and it lands in `/docs` as a record of an event.

**So §3 will be six rows short the moment #77 merges** — which is rule 3 working exactly as written (*any turn that creates a document*), not a criticism. Flagged so the next cut is made after the merge rather than before.

---

## F. What this reply cannot tell you

**§4 is the field repo and I have not read it.** Nothing here bears on it.

**A file existing is not a file being current.** I verified presence, filename, location, and every asserted count. I did not re-read forty documents for internal staleness — the register's own ○ marks already carry that distinction, and inventing a ✓ I had not earned would be the failure this exercise is meant to catch.

**One date, one commit.** Read at `38d2b9a`, 2026-08-07. Rule 6 applies to this reply as much as to the register: **re-read these numbers rather than carrying them forward.**
