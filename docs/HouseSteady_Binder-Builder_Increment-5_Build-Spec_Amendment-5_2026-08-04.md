# Increment 5 Build Spec — Amendment 5

**Date:** 2026-08-04
**Amends:** §1's per-class shape and §3's identification pass. Everything not listed stands.
**Cause:** the second pass-two system found a class of inspection point the frame cannot express — one that requires the thing to be *open*, where the opening is done by someone else on their own schedule. **Raised by the owner from field experience, not from the documents.**
**Relationship to Amendment 4:** §D's shape table is superseded by §D here.

---

## A. The named failure

*The desk pass generates "measure the sludge and scum depth" for a septic tank. The concierge arrives at the Inspection Visit and the lids are under eight inches of sod, because between pump-outs that is where rural lids live. Either the visit becomes an excavation nobody agreed to, or the item is silently skipped and the record shows an inspection that did not happen.*

**The owner's framing, which is the correction:** *a concierge will not ask an owner to unbury septic lids for Discovery photographs and then not really do anything.*

**And this is not one system's quirk.** The schedule's own cautions already describe the same shape elsewhere: *never remove panel covers — visual only, from outside the enclosure.* **The interior of an electrical panel is access-gated on an electrician's visit**, and the caution has been saying so all along without anything downstream being able to represent it.

Others in the same class: a sealed combustion chamber, opened at annual service · a chimney interior, opened at a WETT inspection or a sweep · duct interiors, opened at cleaning · a crawlspace or attic with no built hatch.

---

## B. An inspection point declares its access condition

**Three values. `direct` is the default and most points are it.**

| value | meaning | when it happens |
|---|---|---|
| **`direct`** | Visible or reachable without anything being opened | Inspection Visit |
| **`requires-access-found`** | Needs an access point to exist and be exposed — a riser at grade, an uncovered lid | Inspection Visit **if Discovery found the access**; otherwise reported as unreachable with its basis |
| **`requires-access-event`** | Needs the thing opened by a third party on their own schedule | **Rides the event.** Never an Inspection Visit item |

**Where gated, the point names its event** — `septic-pump-out`, `annual-combustion-service`, `panel-service`.

**An access-gated point is not a gap and must not read as one.** *We did not look inside the tank* is not a failure to inspect; **it is a thing that happens when the tank is next opened, and we will be there.** §5a already requires an absence to state its basis, and this is the same rule one step earlier.

### B1 · Applied to the septic classes

| class | point | access |
|---|---|---|
| `septic-tank` | `tank-lid-security` · `riser-and-access-condition` | `requires-access-found` |
| `septic-tank` | `sludge-and-scum-depth` | **`requires-access-event`** — `septic-pump-out` |
| `septic-effluent-filter` | `effluent-filter-condition` | **`requires-access-event`** — `septic-pump-out` |
| `septic-distribution-box` | `riser-and-access-condition` | `requires-access-found` |
| `septic-pump-chamber` | `tank-lid-security` · `riser-and-access-condition` | `requires-access-found` |
| `septic-effluent-pump` | `float-and-pump-operation` | **`requires-access-event`** |
| `septic-bed` | `bed-surface-condition` · `bed-encroachment-and-loading` | `direct` — the bed is above ground |

**The bed is the useful contrast.** Everything about a leaching bed is observable from the surface, and it is the most consequential component in the system. **The tank is where the access problem lives; the bed is where the failures show.**

---

## C. What Discovery captures, and why it cannot come from the engine

**The owner's model:** *the discovery would be what the access looks like, if any.*

**So Discovery photographs the access itself** — a riser at grade, a lid in the lawn, a pair of marker stakes, or nothing visible at all. **That is a capture, and it is what decides whether a `requires-access-found` point is reachable.**

**It cannot be a class output, and this is a boundary worth stating once for the whole engine:**

> **Every engine output lands after identification. Discovery precedes identification, so nothing the engine produces can direct a Discovery capture.**

**Anything Discovery must capture comes from the Checklist Master, driven by a property flag** — `property.septic` asks for the access. **That makes it an F-4 content item**, in the capture-versus-inspection split the owner already carries, **and it is recorded here so it is not rediscovered as a question later.**

**Nothing found is a real answer.** No visible access is exactly what the Home Profile should say, and the class's own owner question — `where-are-the-lids` — is how the household fills the gap the camera could not.

---

## D. The per-class shape, restated whole

**Superseding Amendment 4 §D. Fourth amendment to touch this table, so it is restated rather than patched.**

| field | note |
|---|---|
| id | |
| client-facing label | used when no specific model is identified |
| component type **or explicit `none`** | §1a. The join to the maintenance schedule — Amendment 3 §A1 |
| system membership — **a set** | Amendment 3 §B1 |
| care categories | declared vocabulary |
| inspection points | declared vocabulary; **a measure declares its unit or explicit null; each declares its access condition, defaulting to `direct`** |
| opportunity conditions | declared vocabulary |
| owner questions | declared vocabulary — Amendment 4 §A |
| replacement horizon | **boolean only** |

---

## E. Two consequences for the session plan and the Home Profile

**E1 · A `requires-access-event` point does not go on the Inspection Visit list.** It waits on its event, and **the event is one the concierge coordinates anyway** — the pump-out, the annual service. **The engine's output here is a coordination item, not a visit item**, which is the role the service actually performs.

**E2 · The Home Profile can say what it has not seen, and should.** *We have not seen inside the tank. Here is what your access looks like. We will document the interior when it is next pumped.* **Honest, specific, and it sets an expectation rather than leaving a silence** — and it is the first place the Home Profile carries a forward commitment rather than a finding.

**Recorded, not specced:** whether a completed access event writes back as a comparison position, so the second pump-out has the first to compare against. It probably should; it wants the concern lifecycle first.

---

**Status:** amendment 5. **§B is decided. §C's capture item is an F-4 obligation and is named rather than built. §D is the current whole shape.**
