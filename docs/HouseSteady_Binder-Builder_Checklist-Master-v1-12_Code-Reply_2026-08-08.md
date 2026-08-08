# Checklist Master v1.12 — Builder Code's ratifying interest

**Date:** 2026-08-08 · **Record of an event. This date never moves.**
**Answers:** the two render-gate sentences, the four retired option values, the binder half of Table A's `consumers` column, and the `municipal_sewer` ruling.
**Method:** every count derived from the artifact at source. **Where a number of mine turned out wrong, the wrong one is named.**

**Headline: the sentences fit and are landed; no condition of mine matches the four retired values; the design session's eight is exactly right — and one number in my 2026-08-07 reply was wrong in a way that changes the reasoning behind it.**

---

## 1 · The two sentences — they fit, and they are in

Each slot's `why` is the requirement. Both drafts answer it.

**`s19.reserve-figure` — why:** *A dollar figure HouseSteady sets as a judgement, not a measurement. It is not observed, documented, reported or inferred, so no honesty label fits it — and an unlabelled number beside labelled ones reads as the most certain thing on the page.*

> *"This is our recommendation, not a measurement of your house. We've based it on the equipment we found and how old it is — a contractor's quote, or your own plans, may point somewhere different."*

**It hits all three parts.** *Not a measurement of your house* is the judgement/measurement line verbatim. *A contractor's quote may point somewhere different* is the answer to *reads as the most certain thing on the page* — and it does it by naming who **is** authoritative, which is stronger than hedging. **And it lands the money doctrine exactly:** *a price derived from a measurement is an estimate; the trade's number is the only quote.*

**`s2.next-review` — why:** *A date HouseSteady chooses, not a fact about the house. A decision we take, not knowledge we hold.*

> *"This is when we think the next look makes sense. It's our judgement, not a date the house has set — tell us if it should be sooner."*

**Near-verbatim on the requirement**, and *tell us if it should be sooner* invites the correction rather than merely permitting it. **It states no interval**, so *no invented timescales* holds.

**Landed.** Both pass the House Style lint with zero violations — checked, because client copy the render rejects is worse than none: it clears this gate and dies at the next one with the figure already composed. That check is now a test.

### One observation, not an objection

**The reserve sentence says the basis is *"the equipment we found and how old it is."*** Age is often the least certain thing we hold — doctrine 4 keeps install dates `unknown` rather than guessing, and many will be `Inferred` at best. **The sentence asserts a firmer basis than the record will usually support.**

**Not blocking and not mine to reword** — voice is yours, and the sentence is honest about the *conclusion*, which is what §6a is about. Flagged in case a later cut wants *"how old it appears to be"* or similar.

---

## 2 · The four retired option values — no condition of mine matches, and the breaking change is elsewhere

**Direct answer: no.** Across `binder-schema-v1.json` and `maintenance-schedule-v1.json` there are **55 distinct condition expressions, and exactly two compare against a recorded answer:**

- `answer.radon.result = elevated`
- `answer.utl.drain-material-id in (clay, orangeburg)`

**Neither uses `n/a — countertop`, `none`, `none observed` or `no damper`.** The four strings appear in this repo exactly three times between them, all inside the walk fixture's config snapshot — declared option lists in imported evidence, never in a condition.

### But the retirement does change my streams, and that is the real interest

**Not my conditions — my four streams.** Read through the walk's own `naReasons`:

| item | retired value | replacement reason | `feedsGapList` | `recordsFinding` | lands in |
|---|---|---|---|---|---|
| `apm.vent` | `n/a — countertop` | `not-applicable` | false | false | **neither stream** — `applicable: false` |
| `pol.heater` | `none` | `none-present` | false | **true** | **a finding** — `confirmed-absent` |
| `irr.type` | `none observed` | `none-present` | false | **true** | **a finding** — `confirmed-absent` |
| `hum.season` | `no damper` | `none-present` | false | **true** | **a finding** — `confirmed-absent` |

**Three of four move from invisible into the findings stream**, which is exactly what the draft says it wants. **My side already handles it correctly:** `completeness.ts` resolves a `none-present` na to `state: 'confirmed-absent'`, a distinct state from `not-found`, so CLAUDE.md §5's requirement — *never render a confirmed absence under a heading that implies trouble* — is satisfied structurally rather than by anyone remembering.

**Two things worth naming anyway:**

**The finding count goes up on houses that have nothing wrong.** A house with no pool heater, no irrigation and no humidifier damper gains three findings, all of them good facts. Anything that reports a bare total will read worse for a simpler house. The breakdown exists; whatever renders it has to use it.

**`apm.vent` → `not-applicable` becomes silent in both streams.** Correct — a countertop appliance genuinely has no vent, and that is neither a hole nor a substantive fact. But the countertop fact now lives only in `resolutions[]` and the event log, where it was previously an answered value. **No objection; recorded so nobody later reads its absence from both streams as a bug.**

**And the strings never go away.** The walk's config snapshot declares all four and always will — imports are immutable evidence. Any code reading historical imports meets them forever, which is what Table G is for.

---

## 3 · Table A's `consumers` column, binder half — your eight is exactly right

**Measured from conditions only**, not from vocabulary declarations. That distinction is the whole of §4 below, so it is stated here first: `triggerVocabulary` lists a flag; `appliesWhen` consumes one. **Counting the former as the latter is what produced the error I am about to report on myself.**

| | flags |
|---|---|
| **Binder consumes** (schedule and/or binder-schema conditions) | 16 |
| **Field consumes** (a Checklist Master item gates on it) | 8 — `gas` `municipal_water` `oil` `propane` `septic` `waterfront` `well` `wood_heat` |
| **Binder only** | **8 — `ev` `flat_roof` `generator` `pool` `pre_1990` `seasonal_vacancy` `secondary_suite` `solar`** |
| **Neither side** | **1 — `municipal_sewer`** |

**8 + 8 + 1 = 17.** Your proposed eight is precisely the binder-only set. Confirmed.

**Density, since it decides what the session-plan import has to carry first:** `property.well` gates **12** schedule items and 3 binder-schema conditions — far and away the heaviest. `septic` 5, `generator` 4, `pool` 3, `secondary_suite` 3, `waterfront` 3, `wood_heat` 3.

---

## 4 · A correction to my own 2026-08-07 reply, and it changes your reasoning

**I filed this, and it is false:**

> *"The walk's config snapshot declares exactly eight `property.*` ids — and they are precisely the eight the Checklist Master gates on."*

**The walk's config declares all seventeen.** The number eight is real but it counts a different thing: **the flags the Checklist Master's items gate on.** I measured the consumers and labelled them the vocabulary.

**Three counts, and I ran them together:**

| | |
|---|---|
| **17** | flags the walk config **declares** — the vocabulary |
| **5** | flags the walk session **set true** — `well` `septic` `propane` `generator` `ev` |
| **8** | flags the **Checklist Master gates an item on** — the field-side consumers |

**That is the values-versus-vocabulary distinction, conflated in the very reply that explains it** — `triggers.ts` separates `property` from `propertyVocabulary` precisely so a declared-but-unset flag reads as a confident no rather than an unmet word, and I wrote the note explaining that and then miscounted along the same axis.

### What it changes

**My claim that nine flags "can never be true from a manifest" is wrong.** The config declares all seventeen, the field app asks the concierge all seventeen, and **the walk session set `generator` and `ev` true** — two of the eight now proposed as binder-only. The field demonstrably produces them.

**So "yours alone" is about consumption, not production.** Your eight is right; the reason in the roadmap — *a capture-only visit structurally cannot produce them* — is right about a **Discovery** visit and wrong as a statement about the field app, which asks all seventeen at session start.

**And it sharpens register #64.** The session-plan import must carry **all seventeen**, not eight — which is what #64 already says (*re-answers all seventeen property toggles from memory*) and what my reply would have argued against. **The register was right and I was the one out of step.**

*(Three shape errors in this session — `naReasons` under `config` rather than `config.snapshot`, `propertyTriggers` ids already carrying their prefix, and vocabulary counted as conditions. Each found by printing the shape before trusting it. Rule 15 earns its place daily.)*

---

## 5 · `municipal_sewer` — retire it, and the evidence is that its real consumer already exists and is better

**Consumed by nothing, anywhere:**

- **Zero** conditions in the maintenance schedule. `property.septic` carries **five**.
- **Zero** conditions in the binder schema, **zero** in the class frame.
- **Zero** items in the Checklist Master gate on it.
- It exists only in two `triggerVocabulary` declarations and its Table A row.

**The complement argument does not survive contact with the schedule either.** The evaluator supports `not(...)` — and **no condition anywhere in either schema uses negation.** Nothing asks *not septic*. The flag is not doing implicit work.

### The decisive evidence: the one municipal-sewer item already exists and keys on something finer

**`my.04` — "Sewer camera on identified higher-risk laterals."** It is the only item in the 190 about a municipal lateral, it is `evaluatedBy: "builder"` — mine — and it keys on:

```
answer.utl.drain-material-id in (clay, orangeburg)
```

**Clay and Orangeburg are municipal sewer laterals by definition.** The item reaches the fact through **what the concierge observed**, not through what the household declared.

**That is better on doctrine as well as on wiring.** `answer.utl.drain-material-id` is `Observed`; `property.municipal_sewer` would be `Reported by homeowner`. **The finer read already exists and is already the one wired up** — Amendment 10 §B1's principle arriving in a different part of the system.

**And the "neither" case keeps a home.** A house on neither sewer nor septic is not represented by two false flags — `holding-tank` is its own class in the frame, so that house has an **object**, which is stronger evidence than an unset flag.

### The one thing retirement owes

**The intake form asks about sewage** — Table A gives `municipal_sewer` the intake source *Sewage*. Register #65's rule cuts both ways: *a form pointing at an unauthored flag is the same error as a flag nothing asks, from the other end.* **So the intake's sewage question needs somewhere to land: `septic` yes/no, with the material question doing the rest at the visit.** That wiring is the design session's; the flag's retirement is what makes it necessary.

**Recommendation: retire `municipal_sewer` in v1.12**, and record in Table G that its consumer is `answer.utl.drain-material-id`.

---

**973 tests green.** Both sentences landed, linted, and under test. Still no photograph through identification.
