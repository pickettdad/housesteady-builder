# Session Handoff — addendum from Builder Code

**Date:** 2026-07-30
**Read with:** `HouseSteady_BinderBuilder_SessionHandoff_20260729.md`, which is the orientation. This adds only what the outgoing design session could not know from its own side: **how the two of us actually work together, and what the repo will tell you that a document will not.**

Increment 3 is complete as of this note. §1g.1 landed last.

---

## 1. The workflow, as it actually runs

Not as either of us specified it. This is what the last several increments looked like.

**A round is: spec → build → PR notes → your review → merge.** One concern per PR. You write a build spec into `/docs`; I build it in slices, each ending with something the owner can run; each slice is a PR whose description carries the reasoning.

**The PR description is the handover, not the chat message.** The owner asked for this explicitly after reading the same content twice. Everything substantive goes in the PR body — corrections, findings, decisions, what I did not do and why. The chat reply is two lines. **If you want the reasoning behind a change, read the PR, not the transcript.** Every PR from #22 onward is written to be read cold.

**A spec claim I cannot verify gets flagged, not built around.** Three times in five rounds a spec asserted something about the schema that the schema contradicted. The pattern that worked: I state the correction in one paragraph, build the corrected version, and name it at the top of the PR. **Do not treat that as friction.** It is cheaper than the alternative, and every one of those corrections was load-bearing.

**Questions routed to me arrive as questions, and I answer them before building.** §1k.2's identity-versus-state was the model: you asked whether the config declares it, said *don't invent the rule*, and I found `attest` rather than inventing anything. **Ask rather than specify when you suspect the config already knows.** Five instances now say it usually does.

**I will say when a spec item is blocked or wrong rather than silently narrowing it.** If something in a spec cannot be built as written, the PR says which part and why, and the rest ships complete.

## 2. What I need from a spec to build it well

**A named failure, not a requirement.** The specs that produced the best work all had this shape: *"if the audit evaluates only the current visit, the gap report says no components recorded for a house whose furnace has been in the binder for a year."* That sentence made §1i unmissable. A requirement that says *"the audit should be property-scoped"* would have been built, and built shallowly.

**Say which of two plausible readings you mean, or say you do not know.** §1k.2 said *"the config may not declare which is which; route the question."* That was more useful than a confident guess, because it told me what to do with the uncertainty.

**Distinguish what is decided from what is recorded.** `dualSourcedFacts` and `technologySection` arrived marked *recorded, not specced*, and nothing was built from them. That marking is worth keeping as a convention — it lets you write the reasoning down without it becoming a requirement by accident.

**Do not specify the mechanism when the outcome is what matters.** §1a said *"the unmatched rate is a first-class output"* and let me decide the shape. §1g.1 said *"the flag must survive aggregation"* — and the implementation that followed has no function returning a bare count, which is stronger than any wording either of us would have specified.

**Version-skew is worth stating explicitly.** The reference export carries field config v1.2.1; the schema is reconciled against master v1.11. Half of what looks like a defect on that export is the gap between those two numbers. Where a spec item can only be exercised by a newer config, saying so saves a round.

## 3. What the repo will tell you that no document will

**The doctrine scans in `server/test/doctrine.test.ts` are the durable part.** Forty-five of them. They encode rules as properties of the code's shape rather than of any output, and they catch things nobody was looking for — one written two rounds earlier caught an unsigned AI reading getting a second route to a rendered page, unprompted. **When you want a rule to survive a session change, ask for a scan rather than a note.** That is the single highest-leverage request you can make of me.

**Ask me what the code does; do not reason about it.** The handoff note already says this and it is the right rule. Concretely: I can read migrations, tests, and every module in seconds, and the answer will be checked rather than recalled. Three of the last five rounds' corrections were exactly this — a spec asserting a schema fact that was one query away.

**Some things are decided in code comments and nowhere else.** Where a decision has no spec home, I record it at the site with the reasoning — why the migration manages its own transaction, why `attest` is the identity predicate, why a discard targets the generation rather than the pin. **Those comments are the record.** If a decision seems to have come from nowhere, it is written where it applies.

**The tests name their reasons.** Every non-obvious assertion carries the failure it prevents. `server/test/` is readable as a specification of what must not happen, and it is more current than any spec file because it fails when it goes stale.

## 4. Four rules from the last five rounds, for the verification note

The handoff note has three. These are the ones the recent work added.

**Never re-derive a boundary the producer already has.** Four instances now: escaped pipes in a master table, a NUL byte used as a map-key separator, a dash inside a composed sentence, and a section end assumed rather than located. **The sharper form is not "delimiters are hard" — it is that the producer knew the parts, composed them, and the consumer tried to un-compose it.** Information destruction followed by guessing. Carry the parts; compose in one place.

**A fix that removes a symptom has not removed a class.** The same false sentence — *"its inputs have not been assessed"* — appeared twice in one increment from two different directions. The second time, two individually correct rules combined to produce it: §0.5's ordering guarantee ran before the unwired-source note could be read. **Neither rule was wrong and the output was false.** Only running it showed that.

**Before building a check, look for whether the config already declares it.** Five instances. It is a rule, not a coincidence, and the fifth one — `attest` — was found by asking rather than by inventing.

**Where a missing state would read as a confident answer, add the third state.** Three instances: typed / stub / undeclared for component types; declared-and-false / never-declared for flags; verified / unverifiable / unknown-provenance for Table I values. **In each case the two-state version reports the unknown case as the safe one, which is the failure.**

## 5. What Increment 4 will find already built

So the spec can bind to it rather than re-specify it.

**The audit output is the gap report's input.** `audit_runs` + `audit_slots`, stored and reproducible, with `missing` carrying `{ what, why? }` structured rather than as a sentence — so the gap report can group, re-word, or render however the house style requires without parsing anything.

**The gap list already distinguishes three things** the client-facing report will need to keep apart: nothing captured · captured but short · never reached because no room where it is asked was walked. The third exists because *"nothing captured"* read as *the concierge missed it*.

**`satisfied_by_visit_id` on every slot** answers *what did this visit change* — which the monthly report needs and the gap report must not use as a filter.

**The trigger evaluator is shared and standalone**, and a scan keeps it that way. The session plan's `answer.*` conditions (§1f) plug into it; nothing new is needed for the grammar.

**Provenance verification exists and has no lossy path.** If the gap report or a registry view ever shows a transcribed value, `aggregate()` gives it the breakdown and there is deliberately no function that gives it a number.

**What Increment 4 will need that does not exist:** the intake form as a table (six of the binder's inputs are unwired, and the audit says so per slot), the house-style lint in a render path, and the golden set ratified past zero. The last two are the gates the handoff note already names.

---

**One thing worth saying plainly.** The corrections in the last five rounds ran in both directions, and the specs were consistently better than what I would have specified alone — §1i in particular was a catastrophe caught before it shipped, and no amount of care on my side would have found it, because it needed someone thinking about visit two. The division worked. It is worth preserving in the next session rather than rebuilt from scratch.
