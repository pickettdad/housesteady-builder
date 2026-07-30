# Binder Builder — Session Handoff Note

**Date:** 2026-07-29
**Why this exists:** the design-session context is very large and has started showing a specific failure — working from memory of its own earlier work rather than re-reading it. Three instances: asserting `imports` lacked `property_id` by reading a spec as though it were the schema; miscounting component types by assuming where a section ended; reporting a stale binding that was a parser dropping escaped pipes. Each was the same error — **trusting an earlier assertion instead of re-deriving it.**

**A fresh session reads these files as documents to verify rather than as things it remembers writing.** That difference is exactly where the current one is weakest.

**Break point:** after Increment 3 completes, with §1g.1 done by the current Code session — it is about a flag surviving the aggregation layers Code just built, and handing it to the one participant guaranteed not to have that context would repeat the failure this note exists to avoid.

---

## 1. First task — write the Increment 4 build spec

**Not implementing. Specifying.**

Increment 4 is **carried items**: the client-facing gap report *and* session plan v0 — the same underlying data, two outputs. **It is the v0.5 finish line**, the point at which the loop with visit two closes and the software earns its keep.

**Why this is the right first task rather than a reading exercise:** writing it requires reading the house style, Baseline Process Phase 11, the Binder Schema, the audit output, and the session-plan half of the manifest contract. It produces something instead of only absorbing. **And it gets written from the documents rather than from a memory of writing them**, which is the entire reason for starting clean.

**What it must carry** — from the register and the prior specs, to be verified rather than trusted:
- Gap report per Phase 11: one page, three columns — *missing from you* (intake documents owed), *missing from us* (gaps), *triggered flags*
- **The gap report is client-facing from its first render.** Brand system applies. The language lint applies.
- Session plan v0 — gaps, open concerns, monitors due, comparison positions, **prior unit photos**, desk-placed anchors flagged *confirm on site*, `answer.*`-derived carried items
- **Two gates before anything client-facing ships:** the golden set must be ratified past zero, and the lint must exist in the render path
- **Doctrine 6 is not discharged by storing a reason.** A reason no screen reads is a reason nobody has — carried from the audit screen

## 2. What to attach

**Doctrine and orientation:** `CLAUDE.md` · **Open Items register** *(the live tracking file — read this first; it is the only complete list)* · Build-Roadmap

**Design:** Binder Builder Design v1 + v1.1 Amendment · Binder Schema v1.1 · AI Assist Plan v1 · **House Style v1.1** *(gates Increment 4)*

**Contracts:** Manifest Contract v3 + **Observed Addendum** *(the addendum wins where they disagree)* · Object/Concern Model v1 · Checklist Master v1.11 *(reference only, never parsed at runtime)*

**Schema data:** `binder-schema-v1.json` · `profiles/baseline-v1.json` · `reference/maintenance-schedule-v1.json`

**Content authority:** Home Binder Master Spec v1 — **a source document, not the operative authority.** The Binder Schema governs where they disagree.

**Prior increments:** specs for 1, 2a, 2b, 2c, 3 · Dry-Run and Load-Check Findings · Reconciliation v1.6.2 · Backup and AI Processing Decisions

**Also useful:** Baseline Profile & Effort Map · Measured House thesis · Exterior & Aerial Capture Data Requirements · Baseline Inspection Process v1 *(Phase 11 is the gap-report spec)* · Client Intake Form v1.2

## 3. Rules the incoming session should adopt immediately

**The one that matters most: check, do not recall.** Every claim about an artifact is read from the artifact in the session where it is made. **Mark each claim as checked, reasoned, or general knowledge** — that convention caught three errors the moment it was adopted.

**Locate every boundary; never assume one.** An unbounded slice of a structured document is the most productive source of confident wrong answers in this work.

**A check must name the evidence behind its verdict** — *"absent from a snapshot declaring 409 items"*, not *"broken binding"* — so an implausible result is visible as implausible.

**Never re-derive a boundary the producer already has.** Three bugs from one cause: escaped pipes in a table, a NUL byte as a map-key separator, a dash inside a composed sentence. **Carry the parts; compose in one place.**

**Before building a check, look for whether the config already declares it.** Five instances: `naReasons.feedsGapList` defines the gap list · `wm.wide` enforces the locating photo · 23 `.unit` items enforce the unit photo · 36 `satisfy: pin` items declare the §1 binding · **`attest: evidence|action` declares identity versus state.** It is a rule, not a coincidence.

**A fix that removes a symptom has not removed a class.** The same false sentence appeared twice in one increment from two different directions.

**Code is authoritative on what the repo contains.** Reason about strategy, content and doctrine; never assert facts about code you cannot read.

## 4. What the owner is carrying

**The mock run** — a real house, walked and assembled, timing each effort class. **The only item blocking an entire track.** Everything in Track C waits on it.

Then: ratify ~20 golden-set values *(abstentions first, then serials — the set gates nothing at zero)* · a fresh export carrying master v1.11 · backup before the first real house · the lawyer pass.

## 5. What the current session leaves unfinished

- The four maintenance content passes — **durations wait on the mock run rather than being guessed**
- A house-style addition for capture at altitude — *better evidence makes overclaiming easier, not harder*
- `dualSourcedFacts` and `technologySection` are **recorded in the schema, not specced.** Field is writing the Master Spec section upstream of the technology slot; the slot gets written properly once it lands
- Nine of seventeen Table A flags have no trigger references in the field config — dead vocabulary, ranked but not resolved

---

**Status:** handoff note. The register is the complete list; this is the orientation.
