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

## 5. Distinctions that are easy to get wrong

**Four streams, never collapsed.** A checklist item resolved as `satisfied / via check / result: fail` is *resolved* — it records a problem, not a hole.

| Stream | What it is | Feeds |
|---|---|---|
| **Gaps** | Unresolved items + `na` where the config's `naReasons` marks `feedsGapList: true` | Gap report, session plan. **Never becomes a concern** — a missing photo is not a problem with the house |
| **Findings** | `result: fail` + `na` where `recordsFinding: true`. **Not synonymous with problems** | Condition assessment |
| **Triggered flags** | Property flags and specialist referrals | Referral list, gap report column three |
| **Concerns** | Tracked things needing attention, with their own identity and lifecycle | Dashboard, project register, session plan |

Collapsing findings into gaps is the most damaging modelling mistake available here.

**"Concern," never "issue."** "Issue" asserts a defect and carries quasi-legal weight; the concierge does not assess. "Concern" says this was noticed and is being tracked — true, and claims nothing more. Schema and client-facing copy use the same word.

**The config decides, not the builder.** Which na reasons feed the gap list is declared in each import's own config snapshot (`naReasons[].feedsGapList` / `.recordsFinding`). Read it per import. Never hardcode the list.

**"Finding" does not mean "problem."** `records_finding` marks *a substantive fact that belongs in the binder* — which includes failed checks (defects) **and** confirmed absences (no fireplace; no moisture suspected). Never render the two under a heading that implies trouble. Report the total and the breakdown.

**Media kinds are open vocabulary.** Today `photo` and `voice`; the field app is adding **video**, and `voice` may be renamed to audio. Treat `media.kind` as fail-open like every other vocabulary field — never switch on an exhaustive list. Video also changes the storage arithmetic materially (minutes of video can outweigh a whole visit's photos), so always report **bytes broken out by kind**.

**`resolutions[]` is state; `events[]` is history.** The array is a projection of the log — resolves minus reopens. The audit reads `resolutions[]`; the audit trail reads `events[]`. Store both.

## 6. The concierge is not an inspector

The person doing the visit is a relationship professional who knows the house and coordinates the work. They are not a career home inspector and not a trades expert. **This is the service's design, not a gap in hiring.** Two consequences bind every line of code and every prompt:

**The software carries the expertise, not the person.** The checklist decides what gets looked at; the audit decides whether it was covered; the house style decides how it is written. The concierge supplies accurate observation and accountability. Software that assumes a technical expert on the other end will produce inconsistent binders the moment there is more than one concierge.

**Identification, never assessment.** The service identifies and documents; licensed specialists assess. *"The panel is a Federal Pacific Stab-Lok"* is identification. *"The panel is unsafe"* is assessment, and it is not the concierge's to make — professionally, contractually, or legally. Every template, rendered sentence, and AI prompt keeps the concierge on the identification side of that line. Where a judgement is genuinely required, the correct output is a **triggered flag recommending a specialist**, never a softened opinion.

This reframes what a signature means. Signing does not mean *"I certify this assessment."* It means **"I observed this, and this description matches what I saw."** The AI supplies the framing; the concierge supplies the observation and owns its accuracy. That division is what makes AI drafting compatible with the honesty doctrine rather than in tension with it.

## 7. The object / concern model — ratified, binds both apps

Governing record: `/docs/HouseSteady_Object-Concern-Model_v1_2026-07-25.md`. Ratified by the owner; **neither Code session invents changes to it** — changes return through the owner as a new version of that file.

Four kinds of thing. **"Pin" now means the marker on a canvas, not the entity.**

| | What it is | Lifespan |
|---|---|---|
| **Zone** | A room or area | The house |
| **Object** | A thing that lives in the house — water heater, panel, deck | Years; replaced, not resolved |
| **Concern** | Something observed that needs tracking | Opens, is watched or acted on, closes |
| **Capture** | Photo, audio, video, note, AI thread | Attached to any of the above |

**Objects and concerns are separate entities, not one entity with a flag.** One object has many concerns over its life; each concern has its own history. Concerns may be zone-owned (a sloping floor belongs to the room, not to any object) or object-owned, and may float unattached until assigned.

**The seam: the field app owns observations; this repo owns the concern record.** Field says *"on this visit, concern #47 was observed, still present, two photos."* The builder holds *"#47 — opened Aug 2026 at the water heater, observed on four visits, contractor engaged November, completed January, verified February."* Coordination, quotes, trades, and verification never touch the field app.

**A concern never auto-closes from field data.** A previously-failed check passing on a later visit records *this check now passes* against an open concern; it does not resolve it. **Resolution is this repo's, always with a reason** — repaired by trade on date, homeowner fixed it, no longer observable. Two systems disagreeing about whether something is closed, with no adjudicator, is the failure this rule prevents.

**Identity:** uuids are minted offline in the field and **this repo adopts them as canonical** — no mapping layer, no reconciliation. The session-plan export (this repo → field) is therefore the cross-visit identity mechanism, not a convenience: without it a five-year-old leak is minted fresh every visit and nothing lines up.

**Retirement reasons drive binder inclusion, never deletion.** The event log is append-only and nothing vanishes. `misplaced` / `duplicate` → retained in the log, excluded from the binder. `removed` / `replaced` → retained and **included as house history** ("furnace present until 2027"). Same discipline as `none-present`: the reason *is* the data.

**No condition grading on objects.** "Condition: poor" is a professional judgement a concierge cannot defend and a homeowner may act on. Component checklist answers across visits — `pass, pass, pass, fail` — tell a comparable story a grade cannot.

## 8. Manifest versions — adapters, not assumptions

The manifest **breaks cleanly to v4** when concerns become entities. There is exactly one real v3 export and it is archived, so **no dual support is required** — but the architecture must make the swap cheap:

**One thin versioned adapter per manifest version. Everything downstream reads this repo's own tables, never manifest JSON.** The audit engine, the gap report, the schema work, and the workbench must not know which manifest version produced their data. v4 should be a new adapter module, not a rewrite.

Treat the v3 import path as a **proving exercise, not production**. It exists to make the contract executable and to flush out mismatches early. The production path starts at v4.

## 9. AI assist — why it exists and what it may not do

AI is not a convenience feature here. At one concierge the binder sounds like one person; at five, without intervention, clients receive documents that read like different companies. **AI assist is the mechanism by which many operators produce one consistent service.** The concierge supplies observation and accountability; the software supplies consistency.

- **Prompts are versioned, content-hashed config files in `/prompts`.** No model call ever uses an inline prompt string. Every artifact records which prompt version produced it — so "why does this binder read differently" is always answerable.
- **Every generation is a row in `ai_generations`** — model, prompt version, inputs, output, tokens, cost, and the human decision that followed (accepted / edited / discarded). Provenance, cost ledger, and improvement data in one table.
- **An `ai_generations` row is never itself client-facing.** Client-facing content is an overlay record a human signed, which may cite a generation as its origin.
- **Abstention is success.** Every extraction prompt asks explicitly for `unknown` over a plausible guess, and `abstained = 1` is a valid outcome, never an error. A wrong serial number is worse than a blank one: the blank gets chased, the wrong one gets believed.
- **Tier deliberately.** Extraction, classification, transcription → cheap fast model, batched. Client-facing prose and synthesis → strong model. At 400–600 photos per baseline the difference is the whole operating cost.
- **Every AI feature has a manual path.** The builder is fully usable with the API unreachable; assists queue and fill in later. Nothing blocks on a model call.
- **Never summon a human to a blank space.** Every AI-to-human handoff carries the best read available, the evidence behind it, what specifically is uncertain, and — where there is genuine variance — ranked alternatives. **This does not conflict with abstention: the record abstains, the prompt does not.** The stored value stays `unknown`; the person is told *"the third and seventh characters are under glare; what I can make out is Q1373_5_9, and the barcode line below may repeat it."* Nothing false enters the data and nobody starts from zero.
  Three guards, because a suggestion done badly is worse than none:
  - **Evidence first, suggestion second — physically, in the layout.** A confident string beside a thumbnail changes the human's task from *what does this say* to *does that look right*, and the second is a far weaker act. Photo large, suggestion beside it.
  - **"None of these" is always present and exactly as easy as the top option.** Otherwise acquiescence sets in and the model's framing quietly becomes the answer.
  - **The suggestion is shown, never pre-filled.** A guess sitting in the input box makes acceptance the default and rejection work. That inverts the burden and is how a wrong value gets ratified.
- **Never AI:** priorities, the reserve figure, what to tell a client about a safety risk, anything constituting advice.

Full plan, including which task lands in which increment: `/docs/HouseSteady_Binder-Builder_AI-Assist-Plan_v1-1_2026-07-31.md`.

## 10. Design decisions already made (don't relitigate; ask if they seem wrong)

- **Working surface:** the binder's table of contents is the spine. Two workspaces sit on it — **Triage** (fast, keyboard-driven, photo-heavy: verify what the field captured) and the **Section Workbench** (slow, text-heavy: assemble and write). Renders are outputs, not places.
- **One state, many views.** A missing item appears as a dashed slot in the workbench, a status pip in the table of contents, and a row in the gap report — all reading the same state. Nothing tracked twice.
- **Stack:** local-first. Node + SQLite + media on disk, Vite/React front end, runs on the owner's machine. Longitudinal schema from the first commit — many visits per property, and **the field-minted uuid is the identity that carries across visits.** The human-facing *number* is session-scoped: the counter lives on the session row and restarts at 1 every visit. It is a display label, never a join key. Moves to hosted database and object storage when a second operator, a client portal, or backup risk forces it. Not before.
- **Editions:** a delivered binder is a dated snapshot with a changelog. Late results produce a new edition. In-flight items render as *underway* with dates — never omitted, never claimed done.

Full reasoning: `/docs/HouseSteady_Binder-Builder_Design_v1_*.md`.

## 11. Expect messy input

Real exports are structurally clean and substantively messy. The reference export in `/fixtures/reference/` contains typeless pins, retired pins, unanchored pins, and 28 of 37 photos owned by a zone with nothing pointing at them. That is a normal visit, not a corrupt file. **Graceful handling of mess is a feature requirement.** Never design against a pristine sample.

**Scale — and each figure names the export it came from**, because a bare number here is the one a future reader sizes storage against. **All byte figures in this repo are decimal MB — bytes ÷ 1,000,000**, which is what `runImport.ts` prints, what the import report screen shows, and what the Observed Addendum used. **The unit is stated because omitting it cost a correct number once:** §11 carried a right figure, a later pass recomputed it in MiB and labelled it MB, and both readings looked equally plausible sitting alone in a cell.

| Export | Zones | Media | Declared bytes (decimal MB) |
|---|---:|---:|---:|
| `fixtures/reference/` | 2 | 37 photos | **123 MB** |
| `fixtures/walk-2026-07-31/` | 8 | 157 photos · 4 video · 2 voice | **529 MB** — 508 photo, 19 video, 1 voice |

**Both are partial visits, and neither is a baseline.** A full baseline visit is *estimated* at 1.5–2 GB; that figure is a projection from these two and has never been measured.

**Re-derive rather than trust this table** — both manifests declare their own `bytes`, so the figures are one pass over `media[]` and the numbers here are a convenience, not a source. *(§11 once carried "123 MB for two rooms" with no artifact named, so it read as the scale of a visit rather than of the smaller of two samples. Naming the artifact was the fix; changing the number was a mistake inside it.)*

**Video changes the arithmetic, and the walk shows it starting:** four videos are **2.5% of that export's files and 3.7% of its bytes** — 4.9 MB each against a 3.2 MB photograph. A mild skew today because the clips are short, and nothing about it holds as they lengthen. **That is why bytes are always reported broken out by kind.**

## 12. How to work here

- **Build in increments, one at a time.** Each is a dated spec in `/docs`, independently usable, ending with something the owner can run and look at. Don't build ahead into the next increment because the code seems to want it.
- **The owner is not a developer.** Explain in plain language what you built and what it does. Skip jargon in summaries; keep it in the code.
- **Ask before expanding scope.** If a task seems to need something outside the current spec, say so and wait. An unrequested feature is a cost, not a gift.
- **When the spec and this file disagree,** this file wins on doctrine, the spec wins on detail. Flag the conflict either way.
- **Tests are part of done,** not a follow-up.

## 13. Repo layout

```
/server     API, database, migrations
/web        Vite + React front end
/schema     the Binder Schema — the Master Spec as machine-readable data (Increment 3)
/docs       specs, the manifest contract + addendum, design decisions
/fixtures   reference exports from the field app + generated synthetic exports
/data       runtime data — gitignored, never committed (real house data lives here)
```

## 14. Privacy

This repo will hold complete records of real people's homes — interior photos, documents, addresses. Test data from friends' houses gets the same treatment as client data. `/data` is gitignored and stays that way. Nothing goes to a third-party service without an explicit decision recorded in `/docs`.
