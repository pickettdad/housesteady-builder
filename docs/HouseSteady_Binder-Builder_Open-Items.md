# Binder Builder — Open Items & File Index

**Date:** 2026-07-27
**What this is:** the single place open items live. Everything previously buried as an "open for David" note inside a spec is collected here.
**Discipline:** this file is **undated in spirit and replaced wholesale** each session — same pattern as the Build-Roadmap on the business track. It is never appended to; it is rewritten so it is always current. If an item is not here, it is not tracked.

---

## 1. Decisions owed by David

| # | Item | Blocks | Notes |
|---|---|---|---|
| D1 | ~~`baseline-v1` profile~~ | — | **Answered 2026-07-27** — see `Baseline-Profile-and-Effort-Map v1`. Effort columns remain open, and are the mock run's output. Sequencing corrected: this precedes economics, not the reverse. |
| D2 | Physical / digital content split — what the ~40–60pp physical binder carries | Increment 6 render profiles | Business track (Roadmap §5). Design is built so either answer is a config change. |
| D3 | Manifest Contract promotion — should the standalone contract file become the single truth, with both product plans pointing at it | Nothing today; prevents future drift | An interface between two repos shouldn't live inside either one. Requires the field session to accept a pointer. |
| D4 | `Recheck` vs `Monitor` as the §2 status word | Increment 4 copy | Optional. `Monitor` passes the rule as decided; `Recheck` is more precise if more distance is wanted. |
| D5 | Transcription provider — local model vs cloud service | Increment 2b's transcription task only | Code investigates and reports options; **David decides**, because audio leaving the machine needs its own recorded decision. Other three 2b tasks proceed regardless. |

## 2. Routed to the field session (**F7 now blocks Increment 3's binding**)

Accumulated for a cross-app change request. **Claude drafts this document when David says it's time.**

| # | Question | Source |
|---|---|---|
| F1 | Is a separate `pin.label` nickname field implemented, distinct from `type.label`? The contract's telemetry requirement depends on it. | Observed Addendum §8 |
| F2 | v1 exported `visitTwoGaps[]`; v3 has no equivalent. Confirm the builder deriving gaps from resolutions + `naReasons.feedsGapList` is deliberate. | Observed Addendum §8 |
| ~~F-comparison~~ | **CLOSED** — `comparison-position` already exists as a component type with its own layer. The 'third kind of persistent identity' question is answered by the field app. | — |
| F3 | Confirm `resolutions[]` is authoritative and the per-zone audit summary is a convenience rollup. | Observed Addendum §8 |
| F4 | **Manifest Contract §7b needs rewording.** It requires serial and install date as structured fields and names the manifest as the equipment registry's data source. The field app doesn't capture them; extraction is the builder's. The registry's source is the builder's enriched record. | Increment 2b |
| ~~G1–G8~~ | **ALL CLOSED by Field, 2026-07-27** — master v1.5 / v1.5.1, field PR #50. Field reframed six of the eight as one hole (the library could not populate §1's emergency shutoff map) and made §1 a **standing acceptance test** in the master: every §1 entry must have somewhere to land, and every future component type is checked against §1 before it is called done. The G8 test — *does the thing need its own position on the map?* — is adopted verbatim into master §2 and applied both ways (curb stop becomes a pin; water-heater shutoff stays an item). Two more found while closing: `blr.switch` and `sp.breaker`. | — |
| ~~B1~~ | **CLOSED 2026-07-27** — reconciled against Checklist Master v1.5.1. See the Reconciliation report. |
| ~~B1-old~~ | ~~Re-reconcile against v1.5.1.~~ The 2026-07-27 reconciliation read 48 types / 266 items; current is **73 types / 427 items**. Affects §7 expectations, §1 bindings, and the equipment-registry work — `water-softener` and `appliance-dishwasher` are real types now, not nicknames on a generic parent. **Blocks Increment 3.** | Field's v1.5.1 note |
| ~~B2~~ | **CLOSED** — inheritance shape confirmed from the master; 11 relations, graph in the schema. |
| **B4** | **Eight schedule conditions have no flag in Table A** — dehumidifier · humidifier · leak sensors · flat roof · elevated radon · higher-risk lateral · **seasonal vacancy** · **secondary suite**. Those items now apply universally. The last two are real service considerations (egress and alarm requirements; §16 procedures) and probably want Table A entries. **Field session.** |
| ~~B2-old~~ | ~~Component inheritance.~~ Sub-types inherit a parent's items; a `water-softener` pin must satisfy a `water-treatment` expectation. Binding becomes a graph walk in the shared evaluator. Specced in Increment 3 §1b; **confirm the declaration's actual shape against a current config before building.** | Field's v1.5.1 note |
| ~~B3~~ | **DISSOLVED** — validation is per-import against each export's own config snapshot; no checked-in copy is needed. Field independently confirmed: `manifestV3.ts` untouched across all eleven master versions. |
| ~~B3-old~~ | **A fresh export carrying the v1.5.1 config** — preferred vehicle for B1, and it would also exercise the `measure` path and an exterior zone, neither of which any export has ever exercised. | — |
| ~~F7~~ | **CLOSED 2026-07-27.** The vocabulary was inside the manifest all along — the config snapshot carries the full `componentLists`, 48 canonical types. Schema reconciled. | — |
| **G7** | **No `air-conditioner` component type** among the 48. Under `heat-pump`, under `appliance`, or a genuine omission? | Dry-Run Findings |
| F6 | **Capture-completeness protocol for Mode A** — a fixed sweep discipline replacing the checklist's attention-directing function when checklists are deferred to the desk | Open Items §3a |
| **F10** | **Table F as a machine-readable file in `/schema`**, the way `maintenance-schedule-v1.json` already is. Increment 3 §1d asks the builder to cross-check a retirement against Table F — *"this binding refers to an item retired at v1.8; Table F records the successors"* — and **the builder cannot.** Table F lives in the Checklist Master, which is read-only reference in `/docs/reference/` and which a doctrine scan forbids any code path from reading; the binder schema records the *rule* (`retirementLineage`) and not the *data*. Built 2026-07-31 with `successors: null` and `lineageAvailable: false` beside it, because an empty array would say *this item has no successors* when the truth is *this repo has never been given the lineage.* **Software still refuses the join either way** — this is only about showing a person where the thread continued. Pairs with F8's governance proposal: the lineage is exactly the kind of builder-binding surface it names. **The ask now has an artifact rather than a description:** `schema/retirement-lineage-v1.json` ships with the shape, the worked `liv.egress` example, and **zero entries** — and the builder's reader ships with it, so the day the table is filled the display gains successors with no code change. **Routes to the field session when the master next opens**; the master is frozen pending the walk. |
| F5 | **Finding/concern promotion clarification** — confirmed absences never promote to concerns; they are facts landing in §7 or §12. Failed checks still promote automatically. A v2 of the ratified Object/Concern Model. | Binder Schema v1.1 C3 |

**Closed since raised:** anchor semantics (answered by the real export — normalized 0–1) · pin identity across visits (answered by the ratified model — uuid is identity, number is session-scoped) · zone-close guard (field app already flags it) · the "monitor" language question (decided, §C4).

## 3. Operational — must happen before real client data

| # | Item | Trigger |
|---|---|---|
| O1 | **Backup: archive raw exports separately · automated local backup · one encrypted offsite copy** | Before the **first real house**, not the first paying client. A friend's test house is a real address and real interior photos. |
| O2 | First restore test | One quarter after O1 |
| **O5** | **AI Processing & Data Handling Decision — ratify, and complete §2.5.** Drafted 2026-07-27. §2.5 (establish and record the API account's retention and training terms in writing; take a zero-retention arrangement if one is available) **cannot be deferred — it must be done before the first real client import.** Loose-photo routing is authorized only once the client disclosure exists. | Before the first real client import |
| **N5** | **Equipment registry as a service line — two modes, and one hard constraint.** **Mode A, aggregate intelligence** (*"340 water heaters in the region, median age 9"*): no client identity, potential third-party value, **needs the consent framework and the lawyer pass.** **Mode B, actionable list** (*"these eleven clients have furnaces past eighteen years"*): client identity required, purely internal, **no new consent needed — it is the service coordinating work for its own clients.** Most of the business value is Mode B.<br><br>**No condition grading, internal or otherwise.** A **computed replacement indicator with its inputs always visible** — age against lifespan band, service-call count, open concerns, failed-check history — is stronger than a grade, comparable across a fleet, and defensible in the conversation that matters. Counting, not judging.<br><br>**THE CONSTRAINT, banked now while it is cheap: the replacement signal is computed identically whether or not a supply deal exists.** Group-buy availability must never influence what gets flagged. Margin on replacements creates a financial interest in flagging replacements, against a Scope position of advocate-never-marks-up — and that corrosion is slow, invisible and unprovable either way. **DECIDED by David 2026-07-28: savings pass through to the client in full. The retainer is the only revenue line, and profit is priced into it.**

This is stronger than disclosure — **the incentive problem does not get managed, it stops existing.** There is no version of the system in which flagging a replacement is worth more than not flagging one. Same structural move as the rest of the doctrine: make the wrong thing impossible rather than discouraged.

It also inverts the group-buy into a compounding benefit: **the more clients, the more buying power each one gets** — something a homeowner acting alone can never replicate, and a real reason the retainer is worth more in year three than year one.

**Consequence for the economics session:** the retainer must carry the whole operation. Sourcing, negotiating and coordinating are real hours producing no separate revenue, so they belong in the effort map's **Class D** beside the client conversation and **must be measured in the mock run**, not assumed free. **Business track → Scope pending entry.** |
| **F8** | **Checklist Master governance proposal** — the master graduates to a governed cross-app contract: Field custodian, Builder ratifying consumer on the named builder-binding surfaces (satisfy types, choice values, id lifecycle, component types/inheritance, trigger tables, na-reason semantics, `.unit`/`.wide` classes, measure units). Includes four concrete v1.7 candidates. **Pairs with D3 (manifest promotion) — same move, could be decided together.** Proposal drafted 2026-07-28. **Field ratifies with three amendments, all accepted:** (1) name the **equipment registry as a third consumer** — same four surfaces, but the blast radius differs in kind: a field break costs a visit, a builder break costs a binder, a registry break costs every client's longitudinal series permanently, and it has no session to argue for itself; (2) add **Table D layers** (the shutoffs layer *is* §1's rendered map; comparison *is* §10's protocol) and **attest semantics** to the ratification surfaces; (3) **acceptance tests are a minimum, never a maximum** — the master may always capture more than the schema requires, never less, because Field discovers what the binder cannot anticipate. **Field's added v1.7 candidate: no markdown emphasis in parsed cells** — `**mechanical-base**` forced the emphasis-stripper that corrupted three attribute ids. |
| **F9** | **No trigger namespace expresses "this house has a zone of type X."** `outbuilding` is a zone type and a stub component type, but not a Table B attribute — so `zone.outbuilding` was wrong and `house.outbuilding` only fires if someone pins an outbuilding *component* rather than creating an outbuilding *zone*, which seems the less likely capture. Same shape would apply to any zone-type-driven schedule item. **Field session: is a `zoneType.*` namespace warranted, or should outbuildings be pinned?** |
| ~~B5~~ | **CLOSED at master v1.11** — `leak-sensor`, `humidifier` and `dehumidifier` are declared component types. All three `house.*` conditions now resolve. |
| ~~B5-old~~ | **Two schedule items reference component types that don't exist** — `house.leak-sensor` and `house.humidifier`. Both fire nowhere until the field app declares a type. **Field session:** are these worth a component type, or should the items be dropped? Leak sensors in particular are increasingly common and would be pinnable. |
| ~~B6~~ | **CLOSED 2026-07-27** — six items were still firing on every house after v1.6 added `secondary_suite`, `seasonal_vacancy` and `flat_roof`. Found by Builder Code running the cross-check the file declares on itself. **The exact mirror of the zone-dependency defect: that one silently under-fired a shutoff map, this one silently over-fired into every schedule.** Re-conditioned; `flagVocabularyRule` rewritten as `vocabularyCrossCheckRule` covering all four namespaces. |
| **N3** | **Warranty tracking as a timed service, not a binder section.** §11 currently records warranties; the value is in the *dates*. Registration windows (often 30–90 days from install, and missing one voids extended coverage), Tarion's 1/2/7-year milestones which the Master Spec already flags as unrecoverable, and a standing "expiring in 60 days — anything you want looked at first?" prompt. **Mostly rules and arithmetic, Class B, no AI.** Where AI helps is looking up published manufacturer terms when the document is missing — and a looked-up term is `Inferred`, never `Documented`. **The binder never says "you are covered"** — coverage depends on registration and service history it cannot see. |
| **N4** | **Second-reader QA on assembled binder sections.** Deterministic checks stay deterministic (the audit engine and lint already do them). The genuine gap is *does this sentence claim more than its evidence supports*, which resists being written as a rule. **Must not be the drafting model, must work backwards** — given the sentence, name the evidence that would support it, then check whether that evidence exists. Flags for human attention; never passes or fails. Increment 5+. |
| O3 | **Lawyer pass: AI-processing consent, data-handling disclosure, retention posture, breach response** | Before real client data enters the builder. Binds harder here than in the field app — permanent, multi-client store. |
| O4 | Nameplate photos into `/fixtures/nameplates/` **with David's own reading of each**, including which he can't read himself | Blocks 2b being trustworthy (not being built) |


## 3a. Three field workflows — the builder must support all of them (2026-07-27)

The owner identified three ways a Baseline visit can run. They are a spectrum, not alternatives, and the right point depends on the house and the client.

| Mode | Shape | Supported today? |
|---|---|---|
| **B · Full inspection on site** | Objects and concerns pinned, photos attached, checklists done in the field | **Yes** — everything built so far assumes it |
| **A · Capture and go** | Exhaustive capture within zones, minimal pinning, short time in the home. Objects, concerns and checklists worked at the desk. Visit two is a targeted test strategy informed by what the photos showed | **No** — blocked on desk entity creation |
| **C · In between** | Some pinning on site, the rest at the desk | Partial |

**Consequence: desk entity creation is not a deferred nicety — it is the enabling feature of Mode A.** It was held on sequencing grounds (under v4 it becomes object-or-concern) without knowing an operating model depended on it. **It should be built into the fresh pass screen** rather than as a separate surface: that screen's structure — zone by zone, in visit order, with memory capture — holds for all three modes. Only the balance between creation and confirmation shifts.

**The checklist line is already drawn in the field config.** Every item carries `attest: evidence` or `attest: action`.

- **`evidence` items can be satisfied at the desk from captures.** *Is there an alarm in the upstairs hall* is answerable from a photo of the hall.
- **`action` items cannot.** *Do the receptacles test correctly* requires a tester in hand, in the room. No photo satisfies it. These carry to visit two — which is the targeted second visit Mode A produces by design.

**Risk to be closed before Mode A is used on a real client:** the checklist does not only audit, it **directs attention** while the concierge is standing there. Removed from the field, nothing prevents a room being photographed thoroughly and the thing in the corner never being noticed. **You cannot photograph what you did not think to photograph, and at the desk it is too late.** Mode A therefore needs a **capture-completeness protocol** — a fixed sweep discipline (every wall, ceiling, corner, nameplate, in order) replacing the checklist's attention-directing function. **Field-app content question; belongs in the cross-app queue.**

**New assist implied:** in Mode A, photo routing cannot route to pins that do not exist. The useful assist becomes *"these 40 photos appear to show equipment — create objects from them?"* — grouping and detection rather than routing. Not specced.

## 4. Builder track — sequenced

*Increment states below updated 2026-07-30 by Builder Code — repo facts only. Nothing else
in this register has been edited; the routing, priorities and reasoning are the design
session's.*

| Increment | State |
|---|---|
| 1 · Import | **Done.** PRs #1–#4 merged. |
| 2a · Fresh pass | **Done.** Overlays, screen, memory capture, anchor placement. PRs #5–#7. |
| **2b · First assists** | **Done.** Nameplate classification + extraction, loose-photo routing, pin-type suggestion, the assist screen. *(Freeform-vocabulary clustering moved here from Increment 3 — it never needed the schema.)* Transcription decided; see the AI Processing Decision §5. |
| **2c · Operator identity** | **Done.** Inserted before the rest of Increment 3 — ten tables gained an actor, enforced by a database trigger rather than only a write path. |
| 3 · Audit engine | **Done 2026-07-30.** All of §0–§4 plus §1g.1, §1h, §1i, §1j, §1k. 533 tests, 45 doctrine scans. `npm run dev` → open a property → run the audit. **Not built, deliberately:** §1d's cross-visit discontinuity display and §1f's `answer.*` operators — the spec places both with the session plan, so Increment 4 should claim them explicitly rather than inherit them. |

| 4 · Carried items | **Done 2026-07-31.** Gap report **and** session plan v0 — same data, two outputs. **= v0.5 finish line.** §4 closed the two items claimed from Increment 3: §1d's cross-visit discontinuity display (internal only) and §1f's `answer.*` operators. §7's desk-work timing collects and deliberately reports nothing. 710 tests, 83 doctrine scans. **The two §6 gates still stand between this and anything a client sees:** the golden set ratified past zero, and the house-style lint in the render path. |
| 5 · Concern register + dashboard | **Gated on manifest v4.** No concerns to adopt until the field app emits them. **Sized bigger than its name — see `Note_Increment-5-Scope_2026-07-31`:** Field Code established that `issue` decomposes into object-plus-concern the same way `monitor` does, so v4 retires the pin flag **as a concept** rather than shrinking an enum. Three streams read that flag today and all three re-source — findings from `issue` (Observed Addendum §3b), `monitorsDue` (Session-Plan Contract §9a), and layer derivation (Design v1.1 §C5). So it is *build a register and re-point three existing streams*, not *add a register*. |
| 6 · Workbench + first sections + editions | Was 5 in the original ladder. |

**New work surfaced 2026-07-27, not previously on any list:**

| # | Item | Why it matters |
|---|---|---|
| ~~N1~~ | **Done 2026-07-27** — `maintenance-schedule-v1.json`, 190 items, 40 shared triggers, 21 event inspections. Evaluator ships with Increment 3. Four content passes still owed (see the design note §8).|
| ~~N1-old~~ | ~~§15's checklist library as data~~ — `/schema/maintenance-schedule-v1.json`, eighteen property triggers as its rule set | Powers three of the nineteen month-one deliverables (calendar, custom seasonal checklists, owner-vs-pro split). Rules, not AI — the second-largest effort reduction in the product and it needs no model. **A content pass, like the Binder Schema.** |
| N2 | **Serial decoding moves up, from Increment 5+ to immediately after 2b** | It gates §19's capital plan, which is in the month-one *minimum*. Reads the same values 2b already extracts. Decoded dates are always `Inferred`. |

**Held deliberately:** the two-visit fixture generator (v4-shaped — building it now means building it twice) · anything client-facing before the language lint exists.

**Small, waiting for a slice that touches the same file:**

| # | Item | Where |
|---|---|---|
| S1 | ~~`a.ghost` missing from the button styles~~ | **Done 2026-07-31** in the `planned_date` PR — the session-plan download link was rendering as a browser-default blue underline between two styled ghost buttons. Two selectors. Caught in a screenshot, not a test. |

**No longer merely held — see §3a:** **desk entity creation.** Still shaped by v4's object-or-concern split, so it lands with v4 rather than before it, but it is now understood as gating an operating model rather than as an optional convenience.

**Owed to Code, not yet sent:** honesty-label mapping is pinned at Increment 3 — the source→label table now exists in Binder Schema §3 and includes the new `Documented` label.

## 5. Current files — what governs what

**In the repo now:**

| File | Status |
|---|---|
| `CLAUDE.md` | **Current.** Doctrine. Read every session. |
| Manifest Contract v3 | Current as source; **superseded by the Observed Addendum where they disagree** |
| Manifest Contract v3 — Observed Addendum (2026-07-26) | **Current.** Authoritative on manifest shape. |
| Object/Concern Model v1 (2026-07-25) | **Current, ratified, cross-app.** F5 is a pending v2. |
| Design v1 (2026-07-24) | Current except where amended |
| Design v1.1 Amendment (2026-07-26) | **Current.** Corrects the identity model, adds the concern register, revises the ladder. |
| AI Assist Plan v1 (2026-07-25) | Current |
| Backup Decision (2026-07-26) | Current. Not yet implemented (O1). |
| Increment 1 Build Spec v3.4 | Built. Superseded copies retained with banners. |
| Increment 2a Build Spec v2 (2026-07-27) | Built |
| Increment 2b Build Spec (2026-07-27) | **In build** |

**Held by David, not yet in the repo:**

| File | Note |
|---|---|
| **Binder Schema v1.1 (2026-07-27)** | **Send to Code when Increment 3 starts** — not needed for 2b. |
| **Baseline Profile & Effort Map v1 (2026-07-27)** | Answers D1. Send with the Schema at Increment 3. Effort columns for the mock run. |
| **Increment 3 Build Spec + `binder-schema-v1.json` + `baseline-v1.json`** | **Send together when 2b lands.** The two JSON files go to `/schema/` and `/schema/profiles/`. |
| **`maintenance-schedule-v1.json` + its design note** | Goes to `/schema/reference/` with the same batch. Increment 3 builds only its *evaluator*; the schedule renders at Increment 6. |
| **House Style v1.1 (2026-07-27)** | **In the repo 2026-07-30**, at `/prompts/house-style/v1.1.md` — the version is in the path, not the filename, because `/prompts/README.md` requires identity to come from the path and the file's own §11 requires it to be versioned and hashed. Also the concierge writing-training document. *(Was listed as v1; the document's status line said v1.1 all along.)* |
| Home Binder Master Spec v1 | **Source document, no longer the operative authority.** The Schema governs where they disagree. Still holds the checklist library (§15) and the regional appendix, which the Schema does not touch. |
| Client Intake Form v1 | Input #2. Needed at Increment 3 — the audit's expectation set derives from its services block. |
| Baseline Inspection Process v1 | Phase 11 is the gap-report spec. Needed at Increment 4. |
| Brand Guide + logo assets | **Guide in the repo 2026-07-30**, at `/docs/reference/HouseSteady_Brand-Guide_v1_2026-07-17.html` — authoring reference, and a doctrine scan keeps `/docs/reference/` unread by any code path. The render carries its own tokens, citing the guide. **Logo asset files have not arrived**; `HouseSteady_Brand-Assets.zip` is named in §05 of the guide and is what the render needs for a mark it must not redraw. |
| Launch Brief v1 (2026-07-24) | **Spent.** It was the design session's agenda; the design is done. Retire it. |

---

**Next action, smallest first:** **G1–G7 to the field session** — six concrete config gaps, G1 first · the two abstention photos to Code (O4) · the mock run is yours and unlocks pricing · Claude still owes the full item-level §1 map and the §7 expectation review before Increment 3 builds · send House Style with 2b's golden-set work · the mock run is yours and unlocks pricing · remaining Claude-side work is the four maintenance content passes and the cross-app change request · the mock run against a real house fills the effort columns and feeds pricing · N1's content pass can run in this chat whenever · everything else waits on those or on Code.
