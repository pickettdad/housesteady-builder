# CLAUDE.md — housesteady-builder

Orientation for anyone (human or Claude) working in this repo. Read this first, every session. It explains what this software is for and what the rules are. The current task lives in a separate, dated build spec under `/docs`.

---

## 1. What HouseSteady is

A home concierge service in the Bay of Quinte region of Ontario. A homeowner pays a flat monthly retainer; they get a documented monthly visit to the house, coordination of trades when work is needed, monthly reports, and a **Home Binder** — a complete, maintained record of their house.

The owner-operator is the concierge. He is an advocate for the homeowner: he coordinates work but never performs licensed trades, never marks up trades, and never assesses beyond identification. The guiding line for the whole service is **"we check houses, not people."**

Two things follow, and they matter for every line of code here:

- **The binder is the product clients actually see and value.** Software exists to make the binder consistent and complete, not to be impressive on its own.
- **Overclaiming is the cardinal sin.** If something wasn't inspected, the record says so. If something is a guess, the record says so. Software that quietly smooths over a gap is worse than software that doesn't exist.

## 2. Three products, and which one this is

| Product | Job | Where |
|---|---|---|
| **HouseSteady Field** | Capture. An iPad app used during the visit: free walk through the house, drop pins on things, checklists audit for completeness. | Separate repo, actively being built |
| **Binder builder** | Assemble. Turn raw capture into the Home Binder and its reports. | **This repo** |
| Equipment registry | Cross-client analytics on regional equipment. | Future, concept only, not built |

**The boundary between Field and this repo is the manifest** — the export a visit produces. It is a contract: `/docs/HouseSteady_Manifest-Contract_v3_*.md` plus its **Observed Addendum**, which corrects the contract against a real export. **Where they disagree, the addendum wins** — it was written from the actual file.

Treat the manifest as fixed input. If something about it seems wrong, say so and stop — the owner routes the change to the Field team. Never fork it, never quietly work around it.

**Scope bleed is the expensive mistake here.** This repo does not touch the Field app, does not redesign the binder's contents, does not build the registry.

## 3. What the binder builder actually does

A field visit populates maybe eight of the binder's twenty-three sections. The rest comes from elsewhere. This is not a report generator — it's an **assembly and enrichment workstation** with six inputs:

1. The field manifest and its photos
2. The client's intake form, filled out before the visit
3. The client's own documents — permits, manuals, invoices, prior inspections
4. Lab results, which arrive late (water chemistry in weeks, radon in about three months)
5. Research — equipment lifespans, serial decoding, recalls, replacement costs
6. **Human judgement** — priorities, the capital plan, what to tell the client. Not automatable and not trying to be.

The loop: **ingest → organize → audit against the spec → enrich → draft → human writes → render.**

The audit is the heart of it. The Home Binder Master Spec defines what a complete binder contains; the builder continuously compares what exists against that and surfaces what's missing. Its first output is the **gap report** — one page, three columns, to the client within a week of the visit: **missing from you** (documents owed), **missing from us** (what the visit couldn't reach), **triggered flags** (specialist assessments the visit tripped).

## 4. Doctrine (non-negotiable — outranks convenience)

1. **The manifest is immutable evidence.** Imports are stored verbatim and never mutated. Every change the builder makes is a separate overlay record pointing at the original. A correction adds a layer; it never overwrites. This makes provenance a property of storage rather than a feature someone must remember to maintain.
2. **Honesty labels survive the pipeline.** Observed, Measured, Reported, Inferred, Not inspected, Not accessible travel from field to binder unchanged. **Never launder an inference into an observation.**
3. **Provenance travels.** Every value knows its origin: which pin, which document, which lab report, which human edit — and whether a human confirmed it.
4. **Unknown stays unknown.** No guessed install dates, no invented model numbers. An explicit unknown is information; a plausible fabrication is a liability.
5. **AI drafts, a human writes.** AI may propose wording, decode a serial, estimate a lifespan, group observations. A human signs everything a client sees. Nothing client-facing is AI-signed, and nothing renders until signed.
6. **Never drop anything silently.** Unassigned items, orphans, failed checks, unrecognized vocabulary — all surface.
7. **Fail open on vocabulary, fail closed on structure.** Unknown resolution kinds, pin types, item IDs, na reasons, event types: preserve, display, count, mark unrecognized — never fail an import over a word the builder hasn't met. Wrong schema version, unparseable JSON, missing top-level sections: refuse loudly.
8. **The Master Spec is the definition of done.** This software does not invent what a binder contains.

## 5. Three distinctions that are easy to get wrong

**Gaps are not findings.** A checklist item resolved as `satisfied / via check / result: fail` is *resolved* — it records a problem, not a hole. Keep three streams separate:

- **Gaps** — unresolved items + `na` where the config's `naReasons` marks `feedsGapList: true` → gap report
- **Findings** — `result: fail` + `na` where `recordsFinding: true` + pins flagged `issue` → condition assessment
- **Triggered flags** — property flags and specialist referrals → gap report, third column

Collapsing findings into gaps is the most damaging modelling mistake available here.

**The config decides, not the builder.** Which na reasons feed the gap list is declared in each import's own config snapshot (`naReasons[].feedsGapList` / `.recordsFinding`). Read it per import. Never hardcode the list.

**`resolutions[]` is state; `events[]` is history.** The array is a projection of the log — resolves minus reopens. The audit reads `resolutions[]`; the audit trail reads `events[]`. Store both.

## 6. AI assist — why it exists and what it may not do

AI is not a convenience feature here. At one concierge the binder sounds like one person; at five, without intervention, clients receive documents that read like different companies. **AI assist is the mechanism by which many operators produce one consistent service.** The concierge supplies observation and accountability; the software supplies consistency.

- **Prompts are versioned, content-hashed config files in `/prompts`.** No model call ever uses an inline prompt string. Every artifact records which prompt version produced it — so "why does this binder read differently" is always answerable.
- **Every generation is a row in `ai_generations`** — model, prompt version, inputs, output, tokens, cost, and the human decision that followed (accepted / edited / discarded). Provenance, cost ledger, and improvement data in one table.
- **An `ai_generations` row is never itself client-facing.** Client-facing content is an overlay record a human signed, which may cite a generation as its origin.
- **Abstention is success.** Every extraction prompt asks explicitly for `unknown` over a plausible guess, and `abstained = 1` is a valid outcome, never an error. A wrong serial number is worse than a blank one: the blank gets chased, the wrong one gets believed.
- **Tier deliberately.** Extraction, classification, transcription → cheap fast model, batched. Client-facing prose and synthesis → strong model. At 400–600 photos per baseline the difference is the whole operating cost.
- **Every AI feature has a manual path.** The builder is fully usable with the API unreachable; assists queue and fill in later. Nothing blocks on a model call.
- **Never AI:** priorities, the reserve figure, what to tell a client about a safety risk, anything constituting advice.

Full plan, including which task lands in which increment: `/docs/HouseSteady_Binder-Builder_AI-Assist-Plan_v1_2026-07-25.md`.

## 7. Design decisions already made (don't relitigate; ask if they seem wrong)

- **Working surface:** the binder's table of contents is the spine. Two workspaces sit on it — **Triage** (fast, keyboard-driven, photo-heavy: verify what the field captured) and the **Section Workbench** (slow, text-heavy: assemble and write). Renders are outputs, not places.
- **One state, many views.** A missing item appears as a dashed slot in the workbench, a status pip in the table of contents, and a row in the gap report — all reading the same state. Nothing tracked twice.
- **Stack:** local-first. Node + SQLite + media on disk, Vite/React front end, runs on the owner's machine. Longitudinal schema from the first commit — many visits per property, and **pin number is the join key identifying the same thing across years.** Moves to hosted database and object storage when a second operator, a client portal, or backup risk forces it. Not before.
- **Editions:** a delivered binder is a dated snapshot with a changelog. Late results produce a new edition. In-flight items render as *underway* with dates — never omitted, never claimed done.

Full reasoning: `/docs/HouseSteady_Binder-Builder_Design_v1_*.md`.

## 8. Expect messy input

Real exports are structurally clean and substantively messy. The reference export in `/fixtures/reference/` contains typeless pins, retired pins, unanchored pins, and 28 of 37 photos owned by a zone with nothing pointing at them. That is a normal visit, not a corrupt file. **Graceful handling of mess is a feature requirement.** Never design against a pristine sample.

Scale, measured: 123 MB for two rooms; roughly 1.5–2 GB for a full baseline visit.

## 9. How to work here

- **Build in increments, one at a time.** Each is a dated spec in `/docs`, independently usable, ending with something the owner can run and look at. Don't build ahead into the next increment because the code seems to want it.
- **The owner is not a developer.** Explain in plain language what you built and what it does. Skip jargon in summaries; keep it in the code.
- **Ask before expanding scope.** If a task seems to need something outside the current spec, say so and wait. An unrequested feature is a cost, not a gift.
- **When the spec and this file disagree,** this file wins on doctrine, the spec wins on detail. Flag the conflict either way.
- **Tests are part of done,** not a follow-up.

## 10. Repo layout

```
/server     API, database, migrations
/web        Vite + React front end
/schema     the Binder Schema — the Master Spec as machine-readable data (Increment 3)
/docs       specs, the manifest contract + addendum, design decisions
/fixtures   reference exports from the field app + generated synthetic exports
/data       runtime data — gitignored, never committed (real house data lives here)
```

## 11. Privacy

This repo will hold complete records of real people's homes — interior photos, documents, addresses. Test data from friends' houses gets the same treatment as client data. `/data` is gitignored and stays that way. Nothing goes to a third-party service without an explicit decision recorded in `/docs`.
