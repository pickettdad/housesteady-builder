# Increment 4 Build Spec — Amendment 1

**Date:** 2026-07-30
**Amends:** `HouseSteady_BinderBuilder_Increment4_BuildSpec_2026-07-30.md`. Everything not listed here stands.
**Cause:** the first slice found three things wrong in the spec and routed one decision back. **All three corrections are already in the code** — this lands them in the spec so the remaining slices are not built against a document that disagrees with `main`.

---

## A. Three corrections from the build

### A1 · §8's twenty was a total, and a total is not evidence

The spec asserted *the reference export produces 20 field-checklist gaps — 19 unresolved, 1 `feedsGapList` na.*

**That test passes on a two-thirds-unbuilt implementation.** Zone scope alone also produces twenty on this export, because the component and session scopes happen to be fully answered — 5 of 5 on the one typed pin, 4 of 4 applicable session items. A stream built only for zones would have gone green and stayed silent until an export arrived carrying an unanswered component item.

**Corrected, as built:** assert the breakdown — **19 zone / 0 pin / 1 session** — and separately the denominators, **30 zone + 5 component + 4 session items due.** The total becomes a consequence of the derivation rather than a number that happens to match.

This is Verification Discipline rule 2 applied to a spec rather than a check. *A check must name the evidence behind its verdict* — and I wrote a verdict.

### A2 · §3c's origin field cannot be one field

The spec said the v3 and v4 adapters differ in *"a provenance field that says which"* — singular.

**That cannot hold once the audit is property-scoped**, which §1i already made it. A property with a v3 baseline and a v4 monthly holds both origins at once, and from v4 onward that is the ordinary case rather than an edge. One field on the set would have to lie about half of it.

**Corrected, as built:** origin rides **per item**, and the set reports `{ received, computed }`. Same discipline as §1g.1's refusal to return a bare count. The evidence line always states it — *"active item set: 0 received from the field, 39 computed here"* — because a locally computed *was due* must never pass as the field app's own answer.

### A3 · §2b's label derivation was wrong in the direction that matters

The spec said the two absence labels *"derive from the na reason."* Read literally that produces a test on the reason id, which is precisely what §1b forbids.

**Corrected, as built, and the asymmetry is the point:**

- **`not-inspected` is the default.**
- **`not-accessible` requires an explicit declaration.**

*We did not inspect it* is true of every gap in the report. *We could not reach it* additionally claims we tried and were blocked. **An unrecognised reason defaulting to `not-accessible` would put a claim about the visit into a client's document that nobody made.** Fail open, in the honest direction.

---

## B. Ruling — the na-reason to honesty-label mapping lives in the **Binder Schema**

Code found the mapping has no home. `naReasons[]` carries `label`, `feedsGapList` and `recordsFinding` but no honesty label; the schema's `labelRules` states the never-upgraded rule without a mapping. It currently sits in `clientVoice.ts` marked provisional.

**It goes in the Binder Schema, declared beside `labelRules`.** Not the field config.

**Why, and the reason generalises.** An honesty label is a claim the **binder** makes in a client's document about what kind of knowing a statement rests on. The field app makes no such claim — it records that a concierge chose a reason. Deciding that `no-access` reads as *Not accessible* **to a homeowner** is a binder-voice decision, and §2's whole composer boundary exists because internal vocabulary and client vocabulary are different things owned by different sides. Putting binder vocabulary into the field config would push a downstream concern onto a session that cannot validate it, and would go stale the moment a ninth label is added.

**Three consequences:**

1. **An unmapped reason is not an error.** It defaults to `not-inspected` per §A3 and is reported, not refused. §1b's rule is unchanged: membership in the gap list still comes from the boolean, and the row's words still come from the config's own `label`. Only the honesty *class* comes from the schema.
2. **Field config additions still need no code change.** A fifth gap-feeding reason arrives, feeds the list from its boolean, and speaks in its own label. It gains a non-default honesty label only if the design session decides it earns one.
3. **This is the first entry in the honesty-label mapping work**, not a separate task. Twenty-two of forty-one slots carry no label and eight are substantive. Splitting the na-reason mapping into a different home would guarantee the two drift.

**Recorded, not specced:** whether `deferred` should eventually carry a label of its own. It defaults to `not-inspected` today, which is true, and its reason line already says *Deferred to visit two*. Revisit with the slot mapping, not before.

---

## C. One thing to count before the editor ships

**§2b's withholding rule is right and unmeasured.** A row whose item has no plain-language name is withheld and reported as desk work rather than rendered as an id. Abstention as success, correctly.

**Nobody has counted how many of the 409 items have one.** If the client-facing name comes from a mapping that mostly does not exist, the report withholds most of itself and nothing says so — the mechanism looks like it is working because withholding is the safe branch.

This is the same shape as `proposed`: a mechanism that reads as sound until someone counts it, and the count is what turned a plausible position into an obviously wrong one. **Count it before the editor ships**, and if the coverage is thin, that is a content pass rather than a bug.

---

**Status:** amendment 1. The spec stands except where corrected above.
