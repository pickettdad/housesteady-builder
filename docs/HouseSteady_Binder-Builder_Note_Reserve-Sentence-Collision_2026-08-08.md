# The reserve sentence collides with House Style §6

**Date:** 2026-08-08 · **Record of an event. This date never moves.**
**Reports:** the one-word correction is landed, and it cannot render. Two ratified documents disagree and neither is this repo's to amend.
**Needs:** one ruling from the design session. Nothing else is blocked on it.

---

## The short version

**The correction is right and it is in.** `s19.reserve-figure` now reads *"how old it appears to be."*

**And the House Style lint bans *"appears to be"* by name**, so the sentence cannot go to a client. The render gate refuses it today, loudly, naming the rule.

**This was found by the check written yesterday for exactly this** — the v1.12 reply added a lint pass over both render-gate sentences because *"client copy the render rejects is worse than none: it clears this gate and dies at the next one with the figure already composed."* It earned its place in under a day, on the very next sentence to land.

---

## 1 · Both sides, quoted

**The ruling, 2026-08-08e:**

> *"This is our recommendation, not a measurement of your house. We've based it on the equipment we found and **how old it appears to be** — a contractor's quote, or your own plans, may point somewhere different."*

**House Style §6, carried verbatim in `prompts/house-style/v001.md` line 86:**

> *"**Never write a sentence whose confidence exceeds its label.** Probably, **appears to be**, seems are usually a sign that an `Inferred` value is trying to pass as `Observed`. Either the evidence supports the claim or the label changes."*

**Measured, not recalled** — the lint run over both sentences:

| slot | violations |
|---|---|
| `s2.next-review` | **0** |
| `s19.reserve-figure` | **1 — a hedge that outruns its label, found `appears to be`** |

`s2` is clean, so this is one sentence and not a broken rule.

---

## 2 · Why the rule and the sentence can both be right

**House Style §6 is about a hedge doing *upward* work.** It sits directly beneath the table of the eight honesty labels, and its whole frame is a sentence *whose confidence exceeds its label* — an `Inferred` value dressed as `Observed`. The two remedies it offers are *the evidence supports the claim* or *the label changes*.

**Neither remedy exists here, and that is structural rather than awkward.**

- *The evidence supports the claim* — it does not. That is the entire reason the correction was ruled.
- *The label changes* — **there is no label.** `s19.reserve-figure` is one of exactly two slots in the schema declared `outsideHonestyVocabulary`, and §6a's ruling is that no honesty label fits it. There is nothing for the hedge to exceed.

**And the hedge is doing the opposite work.** The rule catches a phrase that *raises* apparent certainty. *"How old it appears to be"* **lowers** it — from a fact about the house to an appearance of one, which is identification rather than assessment, which is what the correction was for.

**So the collision reads as a rule meeting a case it predates.** House Style v1.1 is from before §6a existed; label-less slots were not a category when it was written.

**Stated and not resolved.** That reasoning is an argument, not a ruling, and House Style is ratified. **This repo does not amend ratified documents and does not reword client copy.** Both are the design session's.

---

## 3 · What was built, because the collision exposed a real hole

**The gate now lints the words it clears.** New refusal: `gate.unrenderable-words`.

Before today `gate()` checked that words *existed*. Words that exist are not words that can ship: a `renderNote` carrying a banned phrase passed the gate, would be composed into a document beside the figure, and would die at the House Style lint in the render path — **after** composition, with nothing pointing back at the sentence that caused it.

**That is the same failure shape the module was built to prevent** — a check satisfied by declaring something, while the failure it names survives untouched. The lint now runs at the single point these words can be cleared.

**`blockedSlots()` reports it too, and both directions now hold.** Every slot it names refuses at the gate; every slot that refuses is named by it. The second half is the dangerous one to miss — a screen reporting *nothing is blocking* while the render refuses reads as done.

**Twelve new assertions.** The four that pin today's blocked state are deliberately brittle: each goes red the moment either side of the collision is resolved. **That is correct.** A resolution should force a change here rather than slip past — rule 11b, a check whose two sides cannot disagree has not been passing. Four more are built on constructed slots, so the gate's linting survives the collision being settled.

---

## 4 · The ruling needed, and the three shapes it could take

**Only one of these is mine to implement; none is mine to choose.**

| | What it would mean |
|---|---|
| **Reword the sentence** | Say the same thing without the banned phrase. *"…and the equipment's likely age"* is not it — `likely to be` is also on the list. Voice is yours. |
| **Narrow House Style §6** | Say the rule binds sentences carrying a label, which is what its own text already implies. Amends a ratified document. |
| **Exempt the two label-less slots** | Narrowest, and the one I like least — an exemption list is a door, and doors get used. |

**Nothing else waits on this.** The reserve figure has no renderer yet; Increment 6 is not started. The cost of leaving it blocked is zero today and the gate makes it impossible to forget.

---

## 5 · What did not change

**The old wording is gone and is not coming back as a fallback.** *"How old it is"* asserted a firmer basis than the record supports — most install dates are `unknown` or `Inferred` under doctrine 4. **A live overclaim that renders is worse than a corrected sentence that refuses**, and the choice between those two was the only one available. A test now asserts the old phrase is absent, so it cannot return quietly.

---

**982 tests green, typecheck green.** Still no photograph through identification — that remains on your machine.
