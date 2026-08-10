# The comparison pass — scope, and the `readable` wording drafted

**Date:** 2026-08-09 · **Record of an event. This date never moves.**
**Answers:** *scope the comparison pass before anything is added to the object model*, and *draft the replacement `readable` wording for a ruling.*
**Status: nothing here is built.** Both halves are for the design session to rule on. The prompt draft is deliberately **not** in `/prompts` — see §2.0.

**Headline: the pass has three stages and only the third costs money · the first stage is free and may answer a surprising amount of it on its own · and the surface vocabulary needs a fifth value, because four of them force a guess in exactly the case the split exists to prevent.**

---

# PART ONE — the comparison pass

## 1.1 · The act that is missing, stated precisely

**Identification proposes into a void.** Every call sees a batch of photographs and the class list. It sees **no other call's output**, and it sees **no earlier proposal** — including its own, from three photographs ago in the same call.

So the pass can answer *what is in this picture* and has never once been asked **is this the thing you already told me about.**

**Both open questions are that one gap:**

| question | what it asks of two proposals |
|---|---|
| **deduplication** | is A **the same as** B |
| **parent / component** | is A **part of** B |

**Neither is answerable by looking at one proposal.** A schema column for `parent_id` does not make the second answerable; it makes it *recordable*, and with no pass to populate it the desk populates it by hand, forever. **The design session's correction is right and it reorders the work.**

**And the evidence says the ceiling is not the alternative explanation.** Batch #1 proposed **two `well-pressure-tank`s with all its photographs in one call and full mutual context.** More context per call cannot fix that. The missing thing is not what the model can see; it is what it is asked.

---

## 1.2 · Three stages, and only the third costs money

### Stage 1 — candidates, mechanical, free

**Group proposals within a zone that might be the same thing.** No model, no cost, and it runs on data already stored.

Three signals, strongest first:

| signal | why |
|---|---|
| **shared evidence photograph** | Two proposals citing the same `media_id` are looking at the same picture. **Near-conclusive as a candidate**, and free — `object_media` already holds it |
| **same `class_id`** | The four pressure tanks. Weak alone — a house genuinely has two water heaters — but a strong pairing signal |
| **overlapping label tokens** | `"Captive air pressure tank"` and `"Water pressure tank assembly"`. Weakest, and needed because a duplicate can land under two different classes — the Vanée did |

**⚑ The first thing to measure, and I cannot measure it now.** The container holding the first run is gone, so **I do not know whether the four pressure-tank proposals share photographs.** If they do, stage 1 alone identifies most duplicates for nothing, and stage 3 shrinks to the hard cases. **If they do not, stage 1 is only a filter.** That measurement is the cheapest thing in this whole document and it should be taken on the next run before any of stage 3 is built.

### Stage 2 — the question, per candidate group

Send the **evidence photographs of every member of the group**, each labelled with its proposal's id, label, class and readings, and ask one question with four allowed answers:

- **`same`** — one object, proposed more than once
- **`part-of`** — A is a component of B, naming which is which
- **`different`** — genuinely two things
- **`cannot-tell`** — **a first-class answer, not a failure.** Two photographs of two identical tanks from two angles may be undecidable, and *"I cannot tell"* routed to a human is worth more than a coin flip recorded as a fact

### Stage 3 — proposals about proposals, never applied

**The pass writes relation *proposals*. It merges nothing, deletes nothing, and edits no existing object.**

Doctrine 5: AI drafts, a human writes. **A merge is an assertion that two records are one thing**, which is exactly the kind of claim a person signs. And doctrine 6: nothing vanishes — **a proposal merged away stays in the record**, marked, exactly as `retired` objects do rather than being deleted.

---

## 1.3 · What it must not do

**It must not run inside identification.** A pass that both proposes and reconciles has no state anyone can inspect between the two, and *"why did it merge those"* becomes unanswerable. Separate task, separate generation row, separate prompt version.

**It must not be cross-zone in v1.** Zone assignment comes from the manifest's ownership, so the same physical object photographed in two rooms is a **different and harder problem** — and the frequent case, one room's duplicates, is fully solved without it. *Named so v1's boundary is a decision rather than an oversight.*

**It must not silently prefer the longer label.** *"Water Depot softener system — Platinum"* beating *"Water softener"* looks obviously right and is a rule nobody chose. **Which surviving label is correct is a human's call**, and the pass should carry both.

**It must not become a confidence score.** Four discrete answers, one of which is *cannot-tell*. A percentage invites a threshold, and a threshold is a policy nobody wrote down.

---

## 1.4 · What it costs

**Derived from the measured figures — 1,591 input tokens per image, 3,701 fixed per call.**

The mechanical room's eight duplicate classes, as eight candidate groups averaging six evidence photographs:

| | |
|---|---:|
| calls | ~8 |
| input | **~106,000 tokens** |
| output | ~4,000 tokens |
| **at $1/$5** | **~$0.13** |

**Roughly the same as identifying the room in the first place** — $0.16 — for a duplicate-dense room. Most rooms will be far cheaper, and **stage 1 costs nothing at all**, so a build that stops after stage 1 and reports candidates to a human is a legitimate first increment.

---

## 1.5 · What I would want ruled before building

1. **Does stage 1 alone earn its place as increment one?** Candidates surfaced to a human, no model call. Free, useful immediately, and it produces the measurement that sizes stage 3.
2. **Where does a relation live?** A `object_relations` table (`kind: same-as | part-of`, both object ids, generation, human decision) is the shape I would propose — **not** a `parent_id` column, because a column cannot hold *proposed but unconfirmed* and cannot hold `same-as` at all.
3. **What happens to a confirmed `same-as`?** The losing proposal is retired with a reason and kept, on the `misplaced`/`duplicate` precedent in the Object/Concern Model — retained in the log, excluded from the binder. **That precedent already exists and I think it is the right one**, but it is the owner's model.

---

# PART TWO — the `readable` wording, drafted

## 2.0 · Why this is here and not in `/prompts`

**`currentPrompt` returns the last version in the directory.** A `v002.md` dropped into `/prompts/identify_objects/` would be **live on the next call**, before any ruling. So the draft sits in this document until it is ruled, then lands as v002 in one commit.

## 2.1 · The replacement

> - **`readable`** — every piece of text you can actually read on or beside the thing, as a list. **Each entry says what it says and what it is written on.** Empty when there is nothing legible.
>
>   - **`text`** — exactly what it says. **Do not guess at characters.** Where a string is partly obscured, write what resolves and use an underscore for each character you cannot make out.
>   - **`surface`** — one of:
>     - **`nameplate`** — the unit's own data plate: the metal or foil label the manufacturer fixed to it, usually carrying model and serial together.
>     - **`fascia-brand`** — a name moulded, printed or badged into the housing itself.
>     - **`adjacent-sticker`** — a label stuck on or beside the thing by somebody other than its maker: an installer, a dealer, a service company, a warranty registration.
>     - **`handwritten-tag`** — anything written by hand, on a tag, a label or the equipment.
>     - **`surface-unclear`** — you can read the text and cannot tell what it is written on. **This is a correct answer, not a failure.**
>
> **A plate outranks a decal.** When two readings disagree about who made a thing, **the `nameplate` reading is the answer** and the other is a fact about the sticker. The name of the company that installed or services a thing is not the name of the company that made it.
>
> **So: only name a manufacturer in the `label` if a `nameplate` reading supports it.** If all you have is a decal or a fascia badge, describe the thing without the maker and put the text in `readable` where it belongs.

## 2.2 · Why each part is there

**`nameplate` vs `fascia-brand` is a real distinction, not a fine one.** A fascia badge is frequently the *brand* rather than the *manufacturer* — the same unit is sold under several. The plate is the one that resolves it.

**`adjacent-sticker` is where the NextEnergy error lived.** A dealer's sticker is a true reading of a true label, and it answers *who sold or serviced this*, which is a genuinely useful fact — **for a different field.**

**The ordering claim is Amendment 10 §B1 applied to text.** *The finest read of an object is the authoritative one.* A close-up outranks a room shot for the same reason a data plate outranks a decal: it is the reading closest to the thing itself.

## 2.3 · ⚑ The fifth value, which is mine to raise rather than assume

**The four approved values force a guess in exactly the case the split exists to prevent.**

A tight crop can be perfectly legible and give no evidence of what it is printed on. **With four values the model must pick one**, and a `nameplate` guessed under pressure is worse than the single field it replaced — because now a wrong answer carries a *provenance claim*, and §2.1's rule will trust it.

**`surface-unclear` fixes it and makes the enforcement rule stricter rather than looser:** a manufacturer claim requires `nameplate`, and `surface-unclear` does not qualify. **The uncertain case correctly fails the check** instead of being rounded up into passing it.

*This is the same shape as `unsure` being its own field rather than a low-confidence object: a maybe in the same list as a yes gets read as a yes.*

## 2.4 · What the ruling commits to

**Not just wording.** Landing this is four coupled changes in one commit, and it is worth seeing the whole surface before ruling:

| | |
|---|---|
| `prompts/identify_objects/v002.md` | the wording above |
| `IDENTIFY_SCHEMA` | `readable` becomes an array of `{ text, surface }` |
| `normaliseIdentification` | **fail open on the surface vocabulary** — an unrecognised value is preserved and reported, never fatal, exactly as an unknown class id is |
| a `readings` table | the approved promotion — the plate strings become queryable rows with provenance |

**And the promotion is why I would land them together rather than separately.** A readings table built against the current one-string shape would be built twice. **The design session's own note is the reason: the §4 lookup stage has nothing to look up while 32 plate strings sit inside a JSON blob** — so the table's shape is the thing that matters, and its shape is what this wording decides.

**Existing rows survive unchanged.** The current run's `readable` strings stay inside `ai_generations.output` as they are; imports are immutable evidence and a v001 generation is a v001 generation. **Anything reading them meets both shapes, which is what `promptVersion` on every row is for.**

---

**995 tests green, typecheck green. Nothing in this document is built.**
