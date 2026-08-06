# HouseSteady — Monthly Service Design (v0.3)

**Date:** 2026-08-05
**Version:** v0.3 — catches the document up to everything decided or corrected since v0.2 was cut this morning.
**Changes from v0.2:**
- **§5 corrected.** v0.2 named a third source of work — measured property services. **Wrong**, and both build sessions caught it independently. There are two sources and one missing dimension.
- **§5.3 added** — wishes are plan items, not concerns. Capture and triage are build-side and already handled.
- **§7 expanded** — the credit curve, seasonality, what credits are *not* for, and the credits-versus-coordinated routing decision.
- **§10.1 added** — bright lines are role-scoped. Scope v4's were written for a one-role business.
- **§13 corrected** — electrical is settled as coordinated work; heights remains open.
- **§12 collapsed** — from questions routed to the Code sessions into a parking list. Those questions belong where the building is happening.
- **Label fix** — a field measurement is `Measured`, not `Documented`.

**What this is:** the governing design for the **recurring service** — the counterpart to `Baseline-Service-Design`, which governs how a house *enters* the service. This governs what happens every month afterwards.
**Status: provisional, and deliberately high in places.** Several sections stay at concept level because the answers are being discovered in the field and builder tracks, not here. **⚑ marks what is open. Where it is marked open, it is not to be resolved by reasoning in this document.**

---

## 1. What the month is for

> **Your home's record stays true, its work stays visible and owned, and someone who knows the house — and knows what you want for it — handles what comes up.**

*Stays true* is documentation. *Visible and owned* is planning. *Knows what you want for it* is the relationship. *Handles what comes up* is coordination. **None of them is labour**, and that is the change this document exists to absorb.

---

## 2. What does not change

**Identification, never assessment.** **Payment does not purchase authority.** **No markup on anyone else's work**, and the record is the client's. **The concierge observes, documents and coordinates.** **One number, triage same or next business day**, never metered.

---

## 3. The shape of the month

| | What happens | Who |
|---|---|---|
| **Before** | The agenda goes out: the current list, what the visit will cover, what is due | Concierge |
| **The visit** | The house's checklist · the noticing pass · change capture · the list review at the table | Concierge |
| **Alongside** | Credit work, scheduled into the same day wherever it can be | Handy / tech |
| **After** | The report, the record updated, the horizon moved | Concierge, desk |
| **Between** | The number. Triage, coordination, the running list | Concierge |
| **Across the book** | One coordinated service, batched — the month's visible event | Concierge manager |

**Agenda → visit → report is unchanged from Scope v4.** What changed is what fills it.

---

## 4. The visit

**A checklist specific to this house** — its actual objects, the season, and what the last visit deferred. **⚑ How that list is produced is build-side and being worked out in the builder track.** What matters here is the promise: the household gets the professional standard *specialised to their property*, which is the thing a homeowner working from a generic list can never produce for themselves.

**Change capture is part of the visit.** A new appliance is a new object; the engine turns it into new work. **Named failure:** *a record built once and never updated decays into a snapshot, and the snapshot is worth less every month.*

**The visit contains no physical work.** Testing an alarm, exercising a valve, taking a measurement — inspection. Changing the filter, salting the walk — work. **The line: operating something to learn is inspection; operating something to improve it is work.**

### 4.1 · The noticing pass, and the drift it prevents

**Named failure — the monthly inspector:** *a visit that opens with generated checklist debt produces a concierge working a screen instead of seeing a house. The better the engine gets, the more debt it generates, and the more completely the list crowds out the noticing.*

**Not hypothetical — the app caused it once already.** The first five-zone walk found every zone screen leading with checklist debt and the photographs at the bottom, and the concierge worked the debt.

**So the visit carries a deliberate portion where nothing is being ticked.** Walking the house, looking at rooms rather than items, seeing what has changed and what is bothering the household. Together with the table conversation, it is where §5's second source comes from — **and it is the difference between a concierge and an inspector with better software.**

---

## 5. Two sources of work, and one missing dimension

> **The engine knows what the house needs. The concierge knows what the household wants.**

**v0.2's error, corrected:** it named a third source — property measurement generating services like window cleaning and gutter work. That was wrong. **`window` and `eavestrough` are already classes**, so the engine does know a window wants cleaning. What it doesn't know is *how many there are, which storey they're on, and whether a ladder reaches them.*

**That isn't another source of work. It's the same engine missing a dimension.**

### 5.1 · Objects → the engine

Identified objects produce maintenance on a rhythm, inspection targets, opportunities, and replacement horizons. **Services live here too** — window cleaning, gutter clearing, eave lighting, pressure washing are opportunity outputs on classes that already exist. Predictable, recurring, generated.

### 5.2 · The humans → condition and wishes

**No object class produces these.** A room that wants painting · baseboards to replace · drywall to patch · door seals gone hard · trim scuffed by a walker · a handrail that would help on the basement stairs. Two sources, both human:

- **The homeowner's wishes** — what they want for the house, what is bothering them, what needs doing before the family visits.
- **The concierge's observation** — what a person who knows this house notices while walking through it, which requires walking through it looking at rooms rather than items (§4.1).

**This is where the relationship compounds.** Year three, the concierge knows the hallway is meant to be done before Christmas, knows the roof is being saved for, knows which jobs the homeowner still wants to do himself and which he has quietly stopped wanting to. **No generated output holds any of that**, and it is the part a competitor with the same software could not reproduce.

### 5.3 · Wishes are plan items, not concerns

**Settled, and both build sessions reached it independently.** A concern is something *observed that needs tracking*, and it resolves by the house changing. A wish resolves by being **done** or **dropped** — nothing was observed and nothing is wrong. **Filing wishes as concerns turns the concern list into a defect list**, which is §6's indictment binder arriving through a different door.

Wishes belong in the **Annual Home Plan's now / soon / later**; noticed conditions genuinely are concerns. **Capture and triage are build-side and already handled** — spoken during the noticing pass, sorted at the desk, zero decisions in the room.

### 5.4 · The missing dimension: attributes and measurements

Window count, storey and access · eave linear feet · roof facet count and area · yard area, edging run, obstacles · exterior surface area · where a ladder can stand, where a vehicle parks, whether side access is passable.

**These are not work. They are what turns generated work into *quotable* work** — the difference between *your windows want cleaning* and *twelve windows, second storey, ladder access on the west side only, so it's this much.* **⚑ Where they live in the data is build-side.**

**But the urgency is real and it belongs here:** what is not visible in a photograph cannot be derived later. **Every baseline run without this set produces a house that can never be quoted from its record** — not later, not with better software, not without going back. `Measured-House_Asset-Data-Thesis_v1` §3 makes the argument; the field track holds the capture list.

**One list to the client, always.** Whatever the sources, the household sees the running list and the plan — never a software list beside a relationship list.

---

## 6. The list, and why disposition is the product

**Named failure — the indictment binder:** *the engine generates more work per house than any homeowner would have noticed. Undifferentiated, the monthly document becomes a list of everything you have not done, and the better the engine gets the worse the document feels.*

**Every item carries a disposition, not a status.** Who owns it, what the path is, where it sits in the plan. The Handover Visit sets the first split; the month re-agrees it as things change.

*"Your house needs forty things a year. Twelve are yours, eighteen are coordinated, ten are on the horizon"* is a plan. **The same forty undifferentiated is a guilt machine**, and the difference is entirely in the rendering.

**Nothing falls off silently.** Items owned outside HouseSteady keep their date and are re-raised; safety-relevant items carry a written recommendation not to defer, and the decision stays the homeowner's.

---

## 7. Credits

**The tier is the credit number.** Base is the service in §1; above it, a household chooses a monthly credit level. **⚑ Levels and pricing are the owner's, in progress.**

**One currency, time-based.** A credit is a defined block of on-site work, spent on handy or tech alike. **Named failure:** *different consumption rates per work type turn credits into a pricing puzzle the client has to solve before they can ask for help.*

**The engine can carry the cost**, which makes the monthly advice concrete: *your list is fourteen credits this month, you have eight, here is what I would spend them on.* **⚑ How effort estimates are held and improved is build-side** — the principle that matters here is that an estimate is visibly an estimate until real time data replaces it.

**Rules that keep credits from becoming a currency:**
- **Rollover is capped**, expiring on cancellation, non-refundable. *Unlimited carryover is an accumulating obligation, exercised in the month someone cancels.*
- **Transferable within the household's Trusted Circle only.**
- **Family may buy; the homeowner still directs.** **This is where "payment does not purchase authority" gets tested first.**

**The fence:** **credits buy work; the retainer buys knowing, watching and coordinating — and those are never sold by the unit.**

**What scales with the credit level: quantity and price per credit. Nothing else.** Not triage speed, not urgent handling, not report quality, not batch access, not judgement.

> *Every household gets the same attention. The only thing that changes is how much work you would like done.*

### 7.1 · The curve, and why it is the proof rather than the problem

**Credit demand has three parts and they behave differently.** The **backlog depletes** — year one carries a catch-up bulge that does not return. **Routine work recurs**, and is the honest floor. **Wishes do not deplete**, and replacement horizons keep maturing.

**Named failure — the metric trap:** *size credits from list length and a well-maintained house buys fewer every year, so the model punishes exactly the client the business most wants.* The same trap the Object/Concern Model already ruled on for concern counts.

**Two consequences.** **For the economics: do not size the business on year one.** The retainer carries the economics; credits are margin, not spine. **For the relationship: the decline is the strongest sentence this business can say** — *"three years ago your list was forty items; today it's twelve, and you need fewer credits than last year."* **Recommending a downgrade at annual review is the best available proof that the service works**, and it arrives exactly at the tenure window where a client is asking what they are paying for.

**And it tells you which half of §5 sustains the tier:** generated work has a floor but no growth. **Wishes are the half that doesn't run out.**

### 7.2 · Seasonality

**Exterior work concentrates.** Gutters in October, windows in spring, lights in November. **If every household's credits are spent in the same eight weeks, capacity fails regardless of how good the pricing is.**

**The smoothing mechanism is the advisory itself** — *"windows are better in June, and we'll get to you properly"* — which is capacity management that is also genuinely better for the client. **So credit advice is year-shaped, not month-shaped.**

### 7.3 · What credits are not for

**Recurring seasonal services are standing arrangements, not credit spend.** Lawn through a season, snow through a winter. **A weekly commitment would consume an entire allotment and turn the relationship into a lawn service.** Priced from the same measured record, sitting beside the retainer rather than inside the credits.

**The distinction: credits are for the variable list; recurring services are standing arrangements.** *(This is also where the parked robotic-mowing and tractor-snow model eventually attaches — Plan, expansion pack.)*

### 7.4 · The routing decision: credits or coordinated

For any service, two routes: **our labour, spent as credits** — or **coordinated, quoted by a trade.** Deciding factors: skill and licensing · height and risk · equipment owned · volume that month · current capacity.

**No markup on coordinated work, ever** — the trade bills direct and the batch discount goes entirely to the client. **Our own labour is sold openly at a disclosed rate.** *That line does not move as trades are brought in-house; it only relabels which side a service sits on.*

**Estimate discipline, and it is the money version of identification-never-assessment:** a field measurement is `Measured`; a price derived from it is an **estimate**; **the trade's number is the only quote.** We never warrant a third party's pricing any more than their workmanship.

---

## 8. Between visits

**Unchanged, and identical at every credit level.** The number, triage same or next business day, routine coordination, the running list, urgent incident coordination. **Scope v4's Ring 1 survives this redesign intact.**

**⚑ Away-checks are not a promise and are not offered upfront.** Owner ruling. **Supersedes** pending-changes Entry 7.

---

## 9. The record, and the homeowner's pride in it

**Trued up by observation and conversation, never by homework.** Most completions are visible — the filter is new, the caulk is fresh — and the concierge closes those by looking. The rest close in the list review. **Named failure:** *a monthly self-report form is a compliance exercise, it decays by month four, and for a proud independent homeowner it reads as being graded on their own house.*

**Work done by the homeowner is recorded exactly as work done by anyone else** — same line, same weight, same photograph. **The record ends up demonstrating that they maintain their house**, which is the difference between a document that dignifies and one that supervises.

**⚑ The report's contents beyond the value strip are unsettled.** The requirement: a month in which nothing broke still shows the household something true and specific.

---

## 10. The operating layer

**Roles, not people.** At launch one person may hold several. **The roles stay separate in the record and in the client's experience regardless**, because the eventual split must be a scheduling change and never a service change.

**Concierge** — the relationship, the visit, the list, coordination, the record. Never physical work.
**Handy / tech** — credit labour. HouseSteady labour, employed or subcontracted. **⚑ At launch the first concierges are hired handy or tech-capable**, and a concierge may serve as tech support for other concierges' households. *A household that knows three HouseSteady people has bought the company, not a person.* Every one of them VSC'd, insured, introduced, on the binder's people page — **a cost line and a hiring gate.**
**Concierge manager** — the schedule, the kit, and supply. **The supply list is generated, not assembled:** consumables carry a part identity, so next month's demand across the whole book is an engine output, and the manager buys against it.

**Scheduling is where the margin is.** Credit work lands on the visit day wherever possible — one trip, one disruption, one drive. **Named failure:** *credit labour scheduled independently spends its margin on travel, and the client experiences two interruptions instead of one.*

**⚑ Capacity per handy and per tech is unknown and will be measured in year one.**

### 10.1 · Bright lines are role-scoped

**Scope v4's bright lines were written for a one-role business** — when the concierge was the only person and also did small tasks, *no ladders, no roofs, no heavy lifting* was a sensible fence around that person. **With the roles separated, some of those lines were concierge protections and should not bind a role whose entire job is physical work.**

**Company-level, binding everyone:** no personal or medical care · no money handling · no licensed trade work HouseSteady is not licensed for.
**Role-level:** the concierge does not perform work — **a role definition, not a safety rule.** For handy and tech, **ladder work is ordinary**, and both temporary and permanent lighting stay on the table.

**What that obligates:** WSIB coverage or subcontractor clearance, fall protection, and a CGL policy that contemplates ladder work rather than excluding it. **This is a broker conversation before anyone quotes a gutter job, not after.**

---

## 11. The batch

**The coordinated focus is the month's visible event** — the our-hands lane died with the role change and this lane inherits its job. One outsourced service run across the book, opt in or out at triage: gutters in October, window cleaning in May, duct cleaning in February. **The full discount is the client's.** Consumables group-buying is the same mechanic, monthly rather than seasonal.

**Named failure — the thin month:** *a diligent homeowner in a quiet house gets a walk-through and a chat.* **The batch is what makes something happen in a month where nothing needed to.**

---

## 12. Waiting on the build

**Not questions and not asks** — things this document deliberately leaves high because they are being discovered in the field and builder tracks, and will be answered there.

- **How the house's monthly checklist is produced** — the generation path, and how much standing content sits under it.
- **How effort estimates are held**, and how real time data replaces seeded ones.
- **Where attributes and property measurements live**, and the capture set that has to be settled before the next real baseline (§5.4 — **the one item with a deadline**).
- **How wishes are captured and queued** — build-side, already handled in both apps.
- **Multi-role visit records** on one property on one day, and what the client sees.

*Design pressure from both tracks is expected. Several things in earlier versions of this document were already answered in a repo before they were written down here.*

---

## 13. What this does not decide

- **Credit levels, pricing, per-credit rates**, and how many credits a household needs — the economics work, downstream of measurement.
- **The credit task catalogue.** **⚑ Electrical is settled: work for compensation requires a licensed electrician, so it is coordinated work until one is inside the company.** **⚑ Working at heights is open**, and it determines whether gutters and window cleaning can be credit labour at all. Both belong in the pass the lawyer and broker are already owed.
- **Hiring sequence and compensation** for handy, tech, and the manager role.
- **Anything about the baseline**, governed by `Baseline-Service-Design`.
- **The Scope's promise wording** — Scope v5's job, and it derives from this once it settles.

---

## 14. How this document changes

**A change is a new dated version, and the sections it invalidates are named in the version line.** ⚑ marks the invitation.

**The chain: this design governs → a process document operationalises it → Scope v5 states the promises to the client.** **Scope v5 should not be cut while §4 and §7 are still moving**, because they are what it would be promising.

**And the discipline this document has already failed once:** it routed a question that had been answered in a repo the day before. **Where a section is marked ⚑, the answer is more likely to arrive from the build than from reasoning here.**

---

**Status:** v0.3. Caught up as of 2026-08-05. **The only item carrying a deadline is §5.4's capture set.**
