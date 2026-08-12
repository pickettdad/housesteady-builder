# Where the build sequence lives, and the eleven stages

**Date:** 2026-08-11 · **Record of an event. This date never moves.**
**Answers:** does Builder Code have its own roadmap · and the stage list for the Build Roadmap's table.
**Method:** every "does it exist" answer derived by looking in the repo, not recalled.

**Headline: no, this repo has no roadmap and the Increment spec is it — and the Increment spec stops at the end of Increment 5, so past that there is no written sequence anywhere but the design session's Build Roadmap · eleven stages below · and four things in the existing plan are stale, TWO of them in this repo's own CLAUDE.md.**

---

## 1 · Where the sequence lives — the plain answer

**No. Builder Code has no roadmap, and the Increment 5 Build Spec plus its amendments is the whole of it.**

Derived by looking:

| what I checked | what is there |
|---|---|
| `/docs` for anything roadmap-shaped | **nothing.** The three files matching *plan* are the AI Assist Plan, the Session Plan contract, and a Code reply — none is a sequence |
| the repo root | `CLAUDE.md` and `README.md`. README says *"the current task lives in a dated build spec under /docs"* — **which is the answer, stated in the repo already** |
| `Open-Items.md` | **not a sequence.** It is decisions owed by David and questions routed to the field session. **Dated 2026-08-04 and a week stale** |
| anything naming Increment 6 | **five documents mention it in passing and none specifies it** |

**So the honest shape is:**

- **Inside Increment 5 — the spec and its eleven amendments are the sequence**, and they are detailed and current.
- **Past the end of Increment 5 — there is no written sequence in this repo at all.** What exists is Baseline Service Design v1.3 §8's *Binder builder* list, and the design session's Build Roadmap. **Both live in the project folder.**

⚑ **And I am not creating one here.** Rule 1: *a copy outside the canonical home is a copy, not a source.* A roadmap in this repo would be a second answer to a question the Build Roadmap already owns, and this project has met that failure enough times to name it. **The register should say the Increment spec is the sequence and point past it at the Build Roadmap.**

---

## 2 · The eleven stages

**Written for David. One line each, no jargon, and the state is what is true today.**

| # | Stage | What it delivers | State | What it unblocks | Blocked by |
|---|---|---|---|---|---|
| 1 | **Get a visit into the system** | A visit's photographs, rooms and notes stored exactly as the iPad exported them, with a report of what arrived and what didn't | **Done** | Everything | — |
| 2 | **Check what the visit covered** | A list of what the checklist asked, what got answered, and what didn't | **Done** | The gap report, the session plan | — |
| 3 | **Produce the client documents** | The gap report and the session plan, written and rendered, with nothing publishing until a person signs it | **Done** | The visit-to-visit loop | — |
| 4 | **Say what things are in each room** | A proposed list of the equipment in a room, from the photographs | **Done** | Stages 5–8 | — |
| 5 | **Read the writing on things** | Every label in a photograph, read field by field, with a record of what surface it was printed on | **Done** | Stage 6 — and it is the reason stage 6 can be cheap | — |
| 6 | **Look up what those model numbers are** | The actual product behind each number, and where the answer came from | **Next** | Stages 7, 8 and 9. **This is the keystone** | — |
| 7 | **Finish the room** | Every known product found in the photographs, everything else named, and each part joined to the system it belongs to | Not started | Stage 8, and the parts half of the binder | Stage 6 |
| 8 | **Say what's wrong, separately from what things are** | Conditions described and never diagnosed, attached to the thing they are about | Not started | The condition half of the binder | Stage 7 |
| 9 | **Work out what each thing needs** | Maintenance, what to inspect next visit, opportunities, and when it will need replacing | Not started | The Home Profile, the reserve figure, the capital plan | Stage 6 |
| 10 | **The desk screen** | The place you sit and confirm what the software proposed, instead of typing it in | Not started | Stage 11, and the whole desk pass being forty minutes rather than four hours | — |
| 11 | **The Home Profile** | The document the client gets between visit one and visit two — floorplan, inventory, maintenance calendar, what we're looking at next | Not started | The three-visit shape working end to end | Stage 10 |

**Two things about that table worth saying out loud:**

⚑ **Stage 6 is the single most valuable thing left, and it is small.** Seven of the eight confident wrong answers measured on your mechanical room die at a text-only lookup costing a fraction of a cent. **Nothing else on this list changes that many wrong answers for that little work.**

⚑ **Stage 10 is the one that decides whether the desk pass is affordable, and it has a dependency outside this repo.** Its value depends on the iPad recording *where the concierge stood* — with that, confirming three hundred photograph placements is a click each; without it, it is three hundred manual placements. **The Mac arrived today, so that is unblocked on the field side.** The screen itself is not blocked and can be built either way.

---

## 3 · ⚑ Four things in the plan that are now stale

**A stale stage in a list you read weekly is worse than no list, so here is everything I believe has gone out of date.**

### 3.1 · CLAUDE.md is stale in two places, and it is the file every session reads first

**This repo's own orientation document says:**

> *"Its first output is the **gap report** — one page, three columns, **to the client within a week of the visit**."*

**Baseline Service Design v1.3 §4.4 rules the opposite:** the Discovery Visit produces a **session plan**, not a gap report, and the gap report belongs to the **Inspection Visit** — because *a client document saying "we did not cover 380 things" is not a document.*

**It is not wrong about anything built** — the gap report exists and works — **it is wrong about when it is sent and which visit it belongs to.**

**And §10 line 145 carries the second one:**

> *"Two workspaces sit on it — **Triage** (fast, keyboard-driven, photo-heavy: verify what the field captured) and the **Section Workbench**."*

**v1.3 §5 replaces both with the desk pass** — assemble, place, identify, confirm — and says plainly that Triage *was designed for a different job*. **So CLAUDE.md §10 describes a working surface the service no longer wants.**

**⚑ Two stale paragraphs in the file every session is told to read first, and neither is detectable from inside the code**, because nothing is built against either sentence. That is exactly the error that survives — nobody re-reads an orientation document looking for what the world changed underneath it. **Both need a paragraph changed and neither is mine to change: CLAUDE.md is doctrine.**

### 3.2 · "Build a comparison pass" is not a stage and should not be listed as one

Amendment 11 ruled it **largely dissolved** — a known inventory turns *how many tanks are there* into *which of these two is in this photograph.*

**Stage 1 of it is built, free and read-only. Stages 2 and 3 may never be needed at all**, and the number that decides is the residue after stage 6 exists. **Putting it on a roadmap as work would show a task that is probably zero.**

### 3.3 · "Add a parent/component relation" is not a stage either

**The schema was never the blocker.** It is a column that stage 7 fills, and listing it separately would show a piece of work whose entire content is *stage 7 happens*.

### 3.4 · The Triage surface, as designed, is superseded

**Named as a deliverable in Design v1 §2, in its v1.1 Amendment, and in CLAUDE.md §10** — three places, so this is not one loose sentence.

**So stage 10 is not "build Triage."** Anything sequencing Triage as a deliverable is stale, and the nearest existing thing is a starting point rather than the answer. *Nothing is built against it — `web/src/pages` holds Audit, GapReport, ImportReport, Properties and Property, and no desk surface at all — so retiring the word costs nothing but the documents.*

### And one that is NOT stale, said because it looks like it should be

**"Build §4 research" is not a separate stage — it is stages 6 and 9** — but that is a renaming rather than a staleness. **The work is real and it is on the list twice under plainer names**, which is the correct outcome and not a duplication.

---

## 4 · What the register should say

**Three cells, and I would change them like this:**

| row | change |
|---|---|
| Increment 5 Build Spec | add **Amendment 11** — the row stops at 10 |
| the same row | say **this is Builder Code's build sequence**, and that it covers Increment 5 only |
| a new line, or a note on the Build Roadmap row | **past Increment 5 the sequence lives in the Build Roadmap and Baseline Service Design v1.3 §8** — this repo holds no copy, deliberately |

---

**1082 tests green, typecheck green.** Nothing was built for this note; it is two answers and a table.
