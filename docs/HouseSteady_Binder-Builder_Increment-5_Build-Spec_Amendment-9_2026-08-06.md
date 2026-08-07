# Increment 5 Build Spec — Amendment 9

**Date:** 2026-08-06
**Amends:** §5, the property pass, by giving one of its inputs a stated source. Everything else stands.
**Cause:** Field Code asked whether the desk decides zone attributes, having established from the code that the field still asks them at creation in inspection mode — and having found and closed a worse hole while checking: `ZoneAttributesSet` was folded and never dispatched, so a capture-created zone could never have attributes set at all, in any mode.
**There is still no Amendment 7.**

---

## A. What made this answerable, and it arrived a day before the question

**§5 lists among its inputs *the zone attributes as decided*, and never said what decides them.** That was survivable while attributes were creation-only and every visit created its own zones.

**Field Code's fix created the state that makes an answer possible.** Unset now renders as **`not asked`** rather than as off, because absent is not false. **So there are three states where there were two** — asked and true, asked and false, and never asked — and that is the tenth instance of that distinction deciding a shape in this project.

**A proposal can only ever fill the third.**

---

## B. The ruling — the desk proposes, the field decides

> **The desk pass may propose a zone attribute from the objects it has confirmed in that zone. It never decides one, and it never touches an attribute the field has answered.**

**A furnace confirmed in a zone is evidence that zone has mechanicals.** That is an ordinary inference from identified objects and it is exactly the kind the engine exists to make.

**Three constraints, and all three are existing doctrine rather than new machinery:**

1. **It fills `not asked` and nothing else.** An attribute the field answered — either way — is settled, and a desk proposal over it would be the engine overruling a person who was standing in the room.
2. **A field answer is `Observed`; a desk proposal is `Inferred`.** §0.2 stands: **no path assigns or changes an honesty label at render**, and a label is never upgraded. **So the desk can never promote its own proposal to the thing a concierge saw**, however many times it is confirmed.
3. **It is a proposal against the record, never a fact about the house** — §4b's rule, applied one level out. It reaches the review queue and the confirmation surface, and it reaches a client only through a signature.

---

## C. What §5 must now be able to tell apart

**The property pass reads attributes to decide what a house should have.** With this amendment it can read three things where it read one, and **conflating them is the failure worth naming:**

| state | what the pass may conclude |
|---|---|
| **Field-answered** | The strongest input it has. A person was in the room |
| **Desk-proposed** | Usable, and **every absence derived through it carries that in its basis** — §5a already requires an absence to state what it rests on, and *derived from a proposed attribute* is a materially weaker basis than *derived from an observed one* |
| **Never asked** | **Not an answer.** §E of Amendment 1 stands — where completeness cannot be established the pass does not run and says why, and a zone whose attributes nobody has answered is exactly that case |

**The named failure:** *the property pass reports that a floor has no CO alarm, deriving it from a zone the desk guessed was mechanical, and the report reads identically to one derived from a room a concierge stood in.*

---

## D. Where this bites is the session-plan import, and Field Code named it first

**There is no hole today** — each visit is its own session and the Inspection Visit creates its own zones, so creation-time asking runs.

**It opens when zones arrive pre-created from the Discovery Visit.** Creation-time asking never runs for them, and without Field Code's fix nothing could set them at all — a basement without `has_mechanicals` showing an empty mechanical checklist, which is `PLAN-STAGE-1` §7a-ii's failure arriving through the capture-mode door.

**So the sequencing is: this amendment is not urgent and becomes so with the import.** Recorded here rather than in the import's spec, because the import is field-side and this decides binder behaviour.

---

## E. Recorded, not specced

**Whether a concierge confirms a proposed attribute explicitly, or it rides the object's confirmation.** §6's own open question about generated care items has the same shape and the same likely answer — it rides, and is individually editable — **but attributes gate checklist content in a way care items do not**, so it may not follow. **It wants a real screen in front of a person before it is settled.**

---

**Status:** amendment 9. **§B is the ruling; §C is what §5 must now distinguish; §D says why it can wait.**
