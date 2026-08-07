# Increment 5 Build Spec — Amendment 9

**Date:** 2026-08-06
**Amends:** §5, the property pass, by giving one of its inputs a stated source. Everything else stands.
**This replaces an earlier cut of the same date, authored whole per rule 14.** The first version ruled that the desk may fill `not asked`. **Field Code then established from the code that `not asked` is not always a void** — see §C. The correction narrows the capability rather than complicating it, and the superseded rule is quoted in §C rather than deleted.
**Cause:** Field Code asked whether the desk decides zone attributes, and found and closed a worse hole while checking — `ZoneAttributesSet` was folded and never dispatched, so a capture-created zone could never have attributes set at all, in any mode.
**There is still no Amendment 7.**

---

## A. What made this answerable, and it arrived a day before the question

**§5 lists among its inputs *the zone attributes as decided*, and never said what decides them.** Survivable while attributes were creation-only and every visit created its own zones.

**Field Code's fix created the state that makes an answer possible.** Unset now renders as **`not asked`** rather than as off, because absent is not false.

---

## B. The ruling — the desk proposes from evidence, and evidence is positive

> **The desk pass may propose a zone attribute from the objects it has confirmed in that zone. It never decides one, it never touches an attribute the field has answered, and — because it proposes from confirmed objects — it can only ever propose `true`.**

**That last clause is the one that does the work.** A confirmed furnace is evidence a zone has mechanicals. **The absence of confirmed objects is not evidence a zone lacks them** — it is §5's own central point, the reason the property pass exists and the reason §5a makes an absence state its basis. **So the desk has no ground on which to propose `false`, ever.**

**Three constraints, all existing doctrine:**

1. **A field answer is settled, either way.** A desk proposal over it would be the engine overruling somebody who stood in the room.
2. **A field answer is `Observed`; a desk proposal is `Inferred`.** §0.2 stands — no path assigns or changes a label at render, and a label is never upgraded. **The desk can never promote its own inference to the thing a concierge saw.**
3. **It is a proposal against the record, never a fact about the house** — §4b, one level out. Review queue, confirmation surface, and a client only through a signature.

### B1 · The capability this grants is small, and worth stating before anyone builds for it

**Of six attributes, the desk can realistically propose two:** `has_mechanicals` from a confirmed furnace, boiler or water heater, and `has_plumbing` from a confirmed fixture. **`finished`, `sleeping`, `has_stairs` and `exterior_wall` have no object class that evidences them**, and will not unless the frame gains one.

**Two attributes, one direction. That is the whole of it.**

---

## C. `not asked` is two states, and Field Code found the one that matters

**The superseded cut said:** *it fills `not asked` and nothing else.* **That reads as though absent means nothing was decided. It does not.**

**`effectiveAttributes` resolves absent attributes against `defaultsTrueFor` at derivation.** Exactly one pair defaults today:

| attribute | defaults true for |
|---|---|
| `has_mechanicals` | **`utility`** |
| everything else | — |

**So on a utility zone, absent `has_mechanicals` already derives as `true` in the field.** A proposal filling that slot is not filling a void; it lands on a default already applying.

**§B's positive-only rule dissolves the conflict rather than managing it.** On a utility zone the default is `true` and the only thing the desk could propose is `true`. **They agree, so nothing is overridden.** Had the superseded rule stood, a desk proposing `false` on a utility zone would have changed what the checklist showed — silently, for the one attribute §7a-ii is about.

### C1 · Four states downstream, and recovering them needs the config

**Field Code's framing, in their words because it is the precise one:** *three states in the field are really four downstream* — **observed true · observed false · not asked and defaulting to true · not asked and defaulting to nothing.**

**The manifest carries the raw map, so the distinction is recoverable — but only by a consumer that also reads `defaultsTrueFor` from the config snapshot.** Deriving without it silently collapses states three and four.

**That is §1a's discipline on a different field** — read the import's own config snapshot, never a hardcoded list. **Second instance, and this one was found from the code rather than from the spec.**

---

## D. What §5 must now be able to tell apart

| state | what the property pass may conclude |
|---|---|
| **Field-answered** | The strongest input. A person was in the room |
| **Config default** | Not a decision. It is what the field *showed*, and it is only knowable by reading `defaultsTrueFor` |
| **Desk-proposed** | Usable, and **every absence derived through it carries that in its basis** — §5a already requires it, and *derived from a proposed attribute* is materially weaker than *derived from an observed one* |
| **Genuinely unanswered** | **Not an answer.** Amendment 1 §E stands: where completeness cannot be established, the pass does not run and says why |

**The named failure:** *the property pass reports that a floor has no CO alarm, deriving it from a zone the desk guessed was mechanical, and the report reads identically to one derived from a room a concierge stood in.*

---

## E. Where this bites is the session-plan import, and Field Code named it first

**There is no hole today** — each visit is its own session and the Inspection Visit creates its own zones, so creation-time asking runs.

**It opens when zones arrive pre-created from the Discovery Visit.** Creation-time asking never runs for them, and without Field Code's fix nothing could set them at all — `PLAN-STAGE-1` §7a-ii's failure arriving through the capture-mode door.

**So: not urgent, and urgent with the import.**

---

## F. Recorded, not specced

**Whether a concierge confirms a proposed attribute explicitly, or it rides the object's confirmation.** §6's open question about generated care items has the same shape and the same likely answer — **but attributes gate checklist content in a way care items do not**, so it may not follow. It wants a real screen in front of a person.

---

**Status:** amendment 9, recut. **§B is the ruling and its positive-only clause is load-bearing. §C is why. §E says it can wait.**
