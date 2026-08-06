# Increment 5 Build Spec — Amendment 6

**Date:** 2026-08-04
**Amends:** §2's stage table and §3, by giving both a reason they did not carry. Everything else stands.
**Cause:** Builder Code's stub report — three classes map to stub component types, so a `cistern` pin seeds an empty checklist. The design session asked whether a class's inspection points become field checklist items or ride alongside, framed it as a dichotomy, and **Builder Code found a third option with two independent arguments.** Ratified here.

---

## A. The boundary

> **The field checklist is what the concierge is asked to do at the visit. The class frame's inspection points are what the binder expects to know about that kind of thing.**

**They are not competing for one job, and neither generates the other.** The dichotomy assumed they were, and that assumption is what made the stub look like a defect.

---

## B. Two independent reasons the generative reading fails

**B1 · Eight of the 69 inspection points are `requires-access-event`**, and Amendment 5 ruled those are **coordination items, never visit items.** Generating checklist items from points would put all eight onto a visit list as work the concierge cannot do — a heat exchanger behind a sealed cabinet, a flue liner wanting a camera, three points inside a buried septic tank. **Exactly the failure Amendment 5 was written to prevent.**

So the answer is at minimum conditional on access, and never *all of them.*

**B2 · And this one holds even if every point were `direct`.**

**§1a is the strong cross-check precisely because the class list and the field config are maintained separately and can disagree.** If this repo's inspection points generated the field checklist, the two could never disagree — and **§1a would be idle from birth.** That is §B3's documented weakness, both sides authored by one session, promoted one level up onto the check that was supposed to be the reliable one.

**Rule 11 in its cleanest form: a check whose two sides cannot disagree has not been passing.** The design session's dichotomy would have destroyed the only cross-vocabulary check the engine has, and it would have looked like tidying.

---

## C. What a stub actually costs — and it is information

**A stub component type means the field app asks nothing at that pin.** The class frame still declares what the binder wants to know about that kind of thing. **The difference lands in the gap report's *missing from us* column** — the visit did not cover it, which is true, and is exactly what that column is for.

> **So a stub produces a gap, and a gap is information.** It tells the field team their config has catching up to do — **per property, with evidence attached**, rather than as a hunch.

**Three of 68 classes today:** `cistern` · `booster-pump` · `iron-filter`. All three were marked stub in Class List v0.2 and all three behave exactly as the model says they should.

**Two caveats, both Builder Code's and both kept:**

1. **This is what the model implies, not shipped behaviour.** The join from inspection points into the gap report is unbuilt engine work.
2. **Whether the field app grows items for `cistern` and `iron-filter` is a field decision** and goes through the owner. What has changed is that the case now carries evidence rather than a hunch.

---

## D. §2's stage table is unchanged, and now has a reason

> *Inspection Visit — pins exist, with component types **the object's class seeded**.*

**The class seeds the pin's component type. The type brings whatever the field config declares for it. Nothing about the class's own inspection points crosses the wire.**

That was already the design; it was never explained, and the absence of an explanation is what let the dichotomy get asked.

---

## E. A care category and an access event may share an id, and that is not a collision

`chimney-sweep` is both. **Sweeping the chimney is the care task and is what opens the flue** — an identity rather than a clash, and the namespaces are separate.

**They are not required to align in either direction.** `pump-out` is a care category whose event is `septic-pump-out`; `annual-combustion-service` and `well-pump-service` are events with no care category at all, because they are somebody else's trade visit rather than our maintenance item.

**Recorded so a later author does not "fix" the inconsistency into false precision.** Where the same act is both the work and the occasion, one id is honest. Where they differ, two are.

---

**Status:** amendment 6. **§A is the ruling; §B is why; §C makes the stub report a design confirmation rather than a defect.** Nothing here changes what is built — it changes what may be built next.
