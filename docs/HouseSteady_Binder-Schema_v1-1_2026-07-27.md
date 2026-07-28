# The Binder Schema — Design & First Pass (v1.1)

**Date:** 2026-07-27
**What this is:** the Master Spec expressed as data the builder can audit against. Section → slots → source → completeness rule. This is Increment 3's prerequisite and it is design work, not build work.
**Governing inputs:** `HouseSteady_Home-Binder_Master-Spec_v1_2026-07-20.md` (the content authority) · `HouseSteady_Client-Intake-Form_v1_2026-07-22.md` (input #2) · `HouseSteady_Object-Concern-Model_v1_2026-07-25.md` (ratified, binds both apps) · Manifest Contract v3 + Observed Addendum.
**Status:** coarse first, per the build ladder. **v1.1 (2026-07-27): the four conflicts in §5 are resolved by the owner; §0 records the Master Spec's new standing.** Sections a Baseline actually populates are specified in detail; the rest carry slot kinds and source mappings so the audit engine can be built against the whole shape.

---


## 0. The Master Spec's standing (resolved 2026-07-27)

The Master Spec was written before either app existed and drifts as they are built. **The Schema is now the operative authority; the Master Spec is its source document.** Where they disagree, the Schema wins and records the deviation and its reason.

This is the same pattern already used for the manifest: reality wins, divergence is recorded rather than hidden, nothing is quietly lost. The Master Spec is **not replaced** — it still holds content the Schema does not touch, notably the full checklist library in §15 and the regional appendix. It is superseded only on the points listed in §5.

---

## 1. The problem that shapes everything

The Master Spec says of itself: *"deliberately unconstrained by any current service tier — this defines the ceiling."*

**So auditing a binder against the Master Spec produces a gap report the size of a phone book, on every binder, forever.** Twenty-three sections of ceiling against one visit's capture. That is not an audit; it is noise that trains the concierge to ignore the gap report — the exact failure the report exists to prevent.

**The schema therefore has two layers, and they must never be collapsed:**

- **The vocabulary** — every slot the Master Spec defines. Complete, stable, the ceiling.
- **The profile** — which slots are *required* for a given deliverable. Swappable, and a business decision rather than a software one.

v0.5 ships one profile, **`baseline-v1`**, deliberately conservative: a slot is required only where the Baseline visit and intake form genuinely supply it. Everything else exists in the vocabulary and renders when populated, but its absence is not a gap.

**This is a decision for David, not for the schema.** The tier question, the physical/digital content split, and the economics session all bear on it. The schema's job is to make the profile a config file so changing the promise is an edit, not a rebuild.

## 2. Slot kinds

Sections differ too much for one shape. Five kinds, each with its own completeness rule:

| Kind | What it is | Complete when | Example |
|---|---|---|---|
| **fixed** | One value | Present, **or** explicitly `unknown` | §4 year built |
| **record-set** | Repeating records against a sub-schema | Every entity implied by the property's own triggers has a record (see §4) | §7 components, §10 concerns |
| **coverage** | A defined list, each item present / confirmed-absent / not-found | Every list item has one of the three states | §1 shutoff map, §5 documents index |
| **derived** | Computed from other sections | Its inputs are complete; never independently missing | §2 dashboard, §3 calendar |
| **narrative** | Free prose, unbounded | **Never "complete."** Only `empty` or `started` | §8 quirks |

**`narrative` is the honest one.** §8 — how this house runs — can never be finished; a house always has one more quirk. A schema that reports it 80% complete is lying. It reports *started*, with a count of entries, and the gap report never lists it.

**`coverage` is the load-bearing one**, and it is where confirmed absence becomes data. "No gas shutoff" is complete for a house with no gas. This is the same discipline as the field config's `none-present` na reason, one level up — and it means the audit must read the property's triggers before it can judge coverage at all.

## 3. Source → honesty label

The Master Spec requires a label on every claim. **The label follows from the source**, which is why the mapping belongs here rather than at render — and why Code was right that it must be pinned at Increment 3, before content flows.

| Source | Label | Note |
|---|---|---|
| Field pin, photo, or check | **Observed** | |
| Field measurement | **Measured** | |
| Desk memory note (2a) | **Observed** | Provenance carries *desk, from recall* — the label says who perceived it, the provenance says when it was written down |
| Intake form | **Reported by homeowner** | |
| Client document (permit, invoice, prior report) | **Documented** | The record is cited as part of the label |
| Lab or third-party test result | **Measured** | Provenance names the lab |
| Research or lookup (lifespan bands, decoded serial) | **Inferred** | |
| Not reached on the visit | **Not inspected** / **Not accessible** | Which one comes from the na reason |
| Judgement the concierge cannot make | **Specialist assessment recommended** | Never a softened opinion |

**The rule that matters most: a label can never be upgraded by a later step.** Confirmation means a human agreed with the sentence, not that the fact changed origin. Inferred does not become Observed because someone approved the wording. The label travels with the value from the moment it enters; it is never assigned at render.

## 4. How completeness is actually computed

The hard question for `record-set` and `coverage`: **how does the audit know something is missing if nobody captured it?**

It cannot know a house has a sump pump if no one pinned one. But it *can* know from two sources that already exist:

- **Property triggers** — the session's `flags` (`has-well`, `has-septic`, propane, generator, EV) and the config's `propertyFlags`. `has-septic` implies septic components, septic documents, and bed-protection content.
- **The intake form's services block** — water source, sewage, primary and backup heat, fuel, electrical service, generator, sump, pool. The form's own session-setup mapping table already does this work for the field app; the schema reuses it.

**So the audit's expectation set is derived from what the property declares it has, not from a universal list.** A house with no pool is never asked for pool records. This is the same mechanism that keeps the field checklist honest, applied to the binder.

Where the two disagree — intake says well, no wellhead pin exists — **that is a gap, and a good one.** It is precisely the "missing from us" the gap report is for.

## 5. Conflicts found, and how they were resolved (owner, 2026-07-27)

Four were raised. All four are decided; the Schema and the Master Spec now differ on each, and the Schema governs.

**C1 · Document-sourced facts had no honesty label. → `Documented` is adopted.** The list becomes: Observed · Measured · **Documented** · Reported by homeowner · Inferred · Not inspected · Not accessible · Specialist assessment recommended. A value taken from a permit, invoice, manual, or prior report is `Documented`, **with the record cited** — the citation is part of the label, not an optional extra. A furnace install date read off a permit is neither observed nor the homeowner's recollection, and calling it either was both imprecise and slightly unfair to the homeowner.

**C2 · §7's typed Condition field is removed.** A component's condition picture is its check history plus its open concerns — `wh.fittings` reading *pass, pass, pass, fail* across four visits is more defensible than a grade and comparable in a way a grade never is. Evidence points to the condition; the plan is made with the homeowner.

**The record may carry a recommended action; it may never carry a judgement of state.** *"Recommend an electrician assess this panel"* is a referral, which is what a triggered flag already is. *"Plan for a replacement window of 2–5 years"* is acceptable **only** as `Inferred`, derived from the §11 service-life bands, and framed as a window rather than a date. *"Condition: poor"* is a grade the concierge would have to defend and is not written. A strong recommendation lives in the conversation and in the action, never as a rating on the component.

**C3 · "Finding" and "concern" both survive, with distinct meanings. The promotion between them is a deliberate act.**

- **Finding** — a substantive observation worth recording in the binder. **Not every finding is a problem.**
- **Concern** — a finding promoted to tracked status: it has a lifecycle, it stays open, and it is eventually closed with a reason.

*No fireplace in the living room* is a finding: true, belongs in the binder, and must never appear on a client's list of open items. *Two ungrounded receptacles* is a finding that becomes a concern immediately, because something has to happen about it.

**Promotion rules:** failed checks promote automatically — tapping Fail *is* the judgement, already made by a human. **Confirmed absences never promote**; they are facts and land in §7 (systems inventory) or §12 (life safety). Desk-raised observations promote only when the concierge says so.

**Consequence:** §10 renders findings, of which the tracked subset are concerns carrying the lifecycle fields. §18 is those same concerns later in their life. **This is a clarification of the ratified Object/Concern Model, not a reversal** — that document already says failed checks create concerns while confirmed absences merely record findings. It routes back to the field session as a v2 of that record, since the field app was built against it.

**C4 · "Monitor" is permitted with a scoped rule.** The ban addressed the surveillance sense — the *"we check houses, not people"* line. Recommending that a crack be measured every April and October has nothing to do with it.

**The rule: "monitor" may take a component, a measurement, or a reading as its object. It may never take a home, a household, a person, or the service itself.** *"Monitor the crack"* passes. *"Monitoring service"*, *"we monitor your home"*, *"monitored household"* fail. This is checkable by lint rather than by judgement each time, and the lint belongs in the Increment 4 render path.

§2's **Monitor** status category passes — it is a status on a component, not a description of what is done to a family. **Recheck** remains available as a more precise alternative if more distance from the word is wanted; the rule holds either way.

## 6. The schema — sections a Baseline populates

Format is illustrative; the machine-readable file is `/schema/binder-schema-v1.json` with a `baseline-v1` profile alongside.

### §1 · Emergency sheet & shutoff map — `coverage`

The clearest field-to-binder path in the whole spec: the field's shutoff layer *is* this section.

- **Coverage list** (from Master Spec §1, gated by property triggers): main water shutoff · curb stop · well pump breaker · pressure-system shutoff · gas meter and shutoff · propane tank and appliance valves · oil tank shutoff · main electrical disconnect · panel location and directory · generator transfer switch · solar/battery disconnects · furnace emergency switch · boiler shutoffs · water heater shutoff (water and fuel) · sump breaker and discharge · sewage ejector / septic alarm · hose bibs · irrigation shutoff · fireplace gas valve · pool/spa disconnect · floor drains, cleanouts, backwater valve.
- **Per item:** state (`present` / `confirmed-absent` / `not-found`) · pin reference · **photo wide enough to locate it in the room** (the Master Spec is explicit; a close-up of a valve fails the slot) · plain-language description · label.
- **Source:** field pins carrying the shutoff layer predicate, read from the config snapshot's `layers` definitions — never a hardcoded list.
- **Complete when:** every trigger-applicable item has a state, every `present` item has a pin and a locating photo.
- Response procedures and emergency contacts are `coverage` lists too, sourced from templates plus §17 — not field-populated.

### §7 · Systems inventory — `record-set`

- **One record per component**, keyed to the field-minted uuid. Fields per the Master Spec's component schema, with sources: component and system group ← pin type *(Observed)* · exact location ← zone + anchor *(Observed)* · area served ← desk entry *(Observed, from recall)* · **make, model, serial ← nameplate extraction, human-accepted** *(Observed — read from a photo)* · fuel and capacity ← same · install date ← document if held *(C1)*, else `unknown`; **never decoded from a serial without an `Inferred` label** · warranty ← document *(feeds §11)* · consumables and sizes ← field capture *(feeds §9)* · normal settings ← intake or desk *(feeds §8)* · shutoff reference ← §1 link · **no typed condition field (C2)** — the condition picture is check history plus open concerns · known defects ← linked concerns · planning horizon and replacement allowance ← human judgement, **never AI** · last/next service ← document · photos ← the `.unit` whole-object shot and the nameplate shot, **kept distinct**.
- **Complete when:** every component implied by property triggers and intake services has a record; every record has a unit photo, a location, and either identity fields or an explicit unknown.
- **The `.unit` photo is the object-level comparison position** — it is what makes a year-over-year page real, and it only works if visit two is framed like visit one, which is the session plan's job.

### §10 · Baseline condition assessment — `record-set`

**§10 renders findings; the tracked subset are concerns** and only those carry the lifecycle fields below (C3). A confirmed absence is a finding that stays a fact and never joins the open list. One record each, carrying the Master Spec's finding fields: exact location · photograph · what was observed · why it matters · active / suspected / historical · recommended action · appropriate trade · urgency (the §2 category; **Monitor** is permitted per C4) · further investigation needed · planning cost range · target date · status and completion evidence.

- **Sources:** failed checks *(Observed)* · confirmed absences where `recordsFinding` *(Observed)* · pins flagged in the field *(Observed)* · desk-raised concerns from photo review *(Observed, from recall)* · document review · lab results *(Measured)*.
- **AI may propose the management-format wording; a human signs it.** Never the urgency, never the cost range, never the recommendation.
- **The specificity rule is a completeness rule, not style advice.** The Master Spec's example — *photograph and measure the horizontal crack, north basement wall, every April and October; current max width 1.5 mm; refer to a structural engineer if it widens* — means a concern with a watch schedule must carry a measurement, a cadence, and a named escalation trigger. **A concern that says only "watch this" fails the slot.** That is the identification/assessment line made checkable.
- **Complete when:** every source-stream entry has a concern; every concern links to a task, a project, or a watch schedule. *Nothing floats* — the Master Spec's own words.

### §5 · Documents index — `coverage`

Directly feeds the gap report's first column. Per document: held (physical / digital / missing-requested / unobtainable) · location of original. **Source:** intake Tier 3 checklist minus documents actually received. **Rule from the spec, carried verbatim: missing is labelled missing; nothing is reconstructed by guesswork.**

### §12 · Life-safety record — `coverage`

Alarms by location and type with ages, extinguishers, egress, radon system if present, pool barrier, fuel storage. **Source:** field alarm pins and coverage checks *(Observed)*, intake for install dates *(Reported)*. Cross-referenced from §7. Complete when every sleeping area and level has an alarm state.

### §13 · Testing & environmental program — `record-set` + late results

Water chemistry and bacteria (1–2 weeks), radon (~3 months), any indoor-air work. **The in-flight rule is a schema requirement:** a test underway renders with its deployment record, status, and expected completion — **never omitted, never faked as done.** Late results re-enter as new evidence and produce a new dated edition with a changelog.

### §4 · Property profile & site plan — `fixed` + `coverage`

Profile fields from intake *(Reported)*. Site plan from exterior and site zones — **which the reference export does not exercise at all**, and which use a photo-only canvas model rather than a floor plan. The regulatory overlay (conservation authority, floodplain, shoreline, unused wells) is research, not capture.

### §6 · Household & occupancy — `fixed`, entirely from intake

Approval chain · occupancy pattern · mobility considerations · sensitivities · DIY appetite · travel and vacancy · comfort complaints · known recurring problems · renovation intentions · horizon. **All `Reported by homeowner`.** Feeds §16, §22, and the capital plan. Policy exclusion holds: no sensitive medical, financial, or credential data.

### §8 · How this house runs — `narrative`

Never complete, by design. **Sources:** intake's quirks question (the highest-value question on the form) · field notes and chat threads · **the desk memory notes from the fresh pass**, which is the increment 2a feature earning its keep here. Reports as `started` with an entry count; never appears in the gap report.

### §9 · Finishes, spares & consumables — `coverage`, partial

Filter sizes are field-capturable and feed §7; paint codes and product names come from intake and documents. Low priority for `baseline-v1`.

## 7. The rest — vocabulary now, detail later

Slot kinds and sources assigned so the audit engine can be built against the full shape; content passes come later.

| § | Kind | Primary source | In `baseline-v1`? |
|---|---|---|---|
| 2 Dashboard | derived | §7, §10, §13, §15, §19 | yes — renders from what exists |
| 3 Calendar | derived | §15 | no |
| 11 Warranty & lifespan | record-set + static reference | documents; lifespan bands are reference data shipped with the schema | partial |
| 14 Insurance | record-set | client documents | no |
| 15 Maintenance system | derived | property triggers + component list | partial |
| 16 Seasonal & absence | narrative | intake + judgement | no |
| 17 Vendor directory | record-set | business data, not house data | no |
| 18 Project register | record-set | concern lifecycle — **the same entity as §10**, later in its life | Increment 5 |
| 19 Capital plan | derived + judgement | §7 + §11 lifespans + human judgement | no |
| 20 Utility history | record-set | client data over time | no |
| 21 Programs & rebates | record-set | research, regional, **carries a verified-date per the spec** | no |
| 22 Livability | narrative | intake §6 + judgement | no |
| 23 Transfer package | derived | an export of a named edition | spec only |

**§18 is not a new entity.** It is a concern later in its life — coordination, quotes, trades, verification. Modelling it separately would split one lifecycle across two systems, which is the failure the app seam was drawn to prevent.

## 8. Where the schema lives

- `/schema/binder-schema-v1.json` — the vocabulary. Versioned and content-hashed, exactly like the field checklist config.
- `/schema/profiles/baseline-v1.json` — which slots are required. Separate file, separate version, because it changes for business reasons rather than technical ones.
- `/schema/reference/lifespans-v1.json` — the §11 typical service-life bands. Reference data, versioned, **cited wherever used** so a planning window can always be traced to its source.

Every audit result records which schema version and which profile produced it. A gap report from March must remain explicable in September.

## 9. What Increment 3 builds

The audit engine only: load schema and profile → derive the expectation set from property triggers and intake → compare against the builder's own tables → emit per-section completeness and a gap list. **No rendering, no editing, no AI.** The output is data that Increment 4's gap report and the workbench's status pips both read.

**Deliberately not built:** any slot marked `narrative` never reports a gap · `derived` slots never report independently · the profile is read, never inferred.

---

**Open for David:** the `baseline-v1` profile's contents — which is the tier question in another form, and belongs with the economics session rather than here.

**Status:** v1.1. C1–C4 resolved. Sufficient for Increment 3's build. Full content passes for sections 11–23 follow once `baseline-v1` is settled.
