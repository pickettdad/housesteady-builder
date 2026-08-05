# Increment 5 Build Spec — Amendment 4

**Date:** 2026-08-04
**Amends:** §1 and §3 of the Increment 5 Build Spec, and Amendment 3 §B. Everything not listed stands.
**Cause:** the owner raised a question the pilot could not answer — *can a Discovery photograph show whether a TPR valve will reseat?* **It cannot, and the answer to what to do instead is a fifth class output.** Ratified by the owner 2026-08-04.
**Urgency:** **this changes the per-class shape and Amendment 3 §C just authorised shipping that file.** It lands now rather than as a later amendment, because the shape is cheaper to get right than to migrate.

---

## A. The fifth output — owner questions

**A class declares the questions its kind of thing raises for the person who lives there.**

**The named failure it solves:** *the desk pass identifies a fifteen-year-old gas water heater and the Inspection Visit arrives to test its relief valve without ever asking the one person who might know when it was last tested. The concierge either operates a valve nobody has touched in fifteen years, or does not, and either way the household's own knowledge — which was free — was never collected.*

**Photographs cannot supply it.** A Discovery capture can show mineral crust at the discharge, staining on the pan, corrosion, or a capped discharge pipe. **Prior weeping leaves a mark and is the strongest available predictor.** What no photograph shows is the seat. So *there is mineral deposit at the discharge* is `Observed`; *this valve may not reseat* is `Inferred`; **and *it was replaced in 2023* is `reported-by-homeowner` and only the household has it.**

**This is not a sixth stream.** §0.4 stands: an owner question is **engine output**. Its unanswered state becomes a **gap** only after a human has signed and sent it. **The engine never writes a gap row.**

### A1 · A declared vocabulary, like the other three

**Same shape as Amendment 3 §B3**, and for the same reasons — reuse is heavy and the review queue must be able to count them.

**Shared across most serviceable classes:** *when was this last serviced, and by whom* · *has this ever leaked or failed* · *is this owned or on a rental agreement* · *do you have the paperwork for it*.

**Class-specific:** the TPR question · *when was the well last shock-chlorinated* · *when was the tank last pumped*.

**A class naming an undeclared question is a visible error**, and the check carries Amendment 3 §B3's two weaknesses unchanged — internal, and idle from birth unless negative-tested.

### A2 · The wording is human-written and human-signed, exactly like a client name

**The class declares the question id. The client-facing wording lives beside it in a declared file** — same discipline as `client-names-v1.json`, whose own rule reads: *a human writes these and a human signs them. Doctrine 5 — AI may propose wording; nothing client-facing is AI-signed.*

**Layout is Builder Code's call**; a sibling file is the obvious shape.

**And §2b's withholding rule generalises unchanged:** a question with no ratified wording is **withheld and reported as desk work, never rendered as its id.**

---

## B. It rides the Home Profile, and the tone is a hard constraint

**Ratified: the questions go out on the Home Profile**, which already reaches the client between the desk pass and the Inspection Visit and already says what we are looking at next visit.

**The named failure, and it is the one the owner named:** *the Home Profile becomes a form. Twenty questions with blanks arrive, the client reads it as homework, and it does not come back — so the Inspection Visit runs without the one thing only they knew, and a relationship document has become an obligation.*

**The owner's constraint, verbatim: *not hard homework questions, just "this is what we saw and what do you know about it" type questions.***

**Three consequences that bind the render:**

1. **A question renders attached to the thing, beside its photograph** — never collected into a questionnaire section. The Home Profile is a document about their house; the question is a caption on something in it.
2. **House Style applies in full** — no jargon without its plain-language twin at first use, no internal vocabulary, no judgement words.
3. **Answering is optional and the document must read that way.** It is an invitation, not a return.

### B1 · "I don't know" is a first-class answer and the render must make it easy

**The named failure:** *the form makes not knowing look like failing. The homeowner writes "maybe 2015," it enters the record as reported, and a guessed date is believed for five years.*

**This is the nameplate abstention rule, one surface out:** *a wrong serial is worse than a blank one, because a blank one gets chased and a wrong one gets believed.* Doctrine 4 — **an explicit unknown is information**, and for these questions it is often the most useful answer in the set, because it says nobody has been tracking it.

**So *I don't know* is offered as plainly as an answer**, and it records as an explicit unknown rather than as an absence.

---

## C. Two relationships to name, without specifying the mechanism

**C1 · An answer can change what the Inspection Visit does.** *Replaced in 2023* and *never, in fifteen years* lead to different conversations at the same valve. **The relationship exists; how the session plan carries it is Builder Code's**, and it may be nothing more than the answer being visible on the pin.

**C2 · An answer is evidence for a slot.** *It is on a rental agreement with [company]* feeds the systems inventory and, per the owner's ruling, tells the concierge who to coordinate with rather than which trade to call. **Label is `reported-by-homeowner` from the point it enters**, and §0.2 stands — no path assigns a label at render.

---

## D. The per-class shape, restated whole

**Because three amendments have now touched it and the file is about to ship:**

| field | note |
|---|---|
| id | |
| client-facing label | used when no specific model is identified |
| component type **or explicit `none`** | §1a. **The join to the maintenance schedule** — Amendment 3 §A1 |
| **system membership — a set** | Amendment 3 §B1 |
| care categories | declared vocabulary — Amendment 3 §B3 |
| inspection points | declared vocabulary; **a measure declares its unit or explicitly none** — §B2 |
| opportunity conditions | declared vocabulary |
| **owner questions** | declared vocabulary — **new, §A** |
| replacement horizon | **boolean only.** The band is entirely generated |

**All four vocabularies ship empty**, with the frame, for the reason §1 already gives: emptiness is the honest state and a generated approximation makes acceptance the default.

---

**Status:** amendment 4. **The fifth output is decided and the shape in §D is complete as of this date.** Nothing here changes what ships — it changes what the empty file has room for.
