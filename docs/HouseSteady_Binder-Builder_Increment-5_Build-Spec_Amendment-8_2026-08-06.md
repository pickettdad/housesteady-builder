# Increment 5 Build Spec — Amendment 8

**Date:** 2026-08-06
**Amends:** §1's care-category vocabulary shape. Everything else stands.
**Cause:** Builder Code's precedence worked case, gap 2 — every schedule item declares an audience and no care category declares anything equivalent. Routed to the owner as a consistency question; **the owner deferred the decision to the design session on 2026-08-06.**
**There is still no Amendment 7.** Written and withdrawn on 2026-08-05.

---

## A. The argument, and why it survives the test that killed two fields yesterday

**Two fields in this territory were proposed and withdrawn in one day** — a licensed-work flag and a procedure-render flag. **Both failed the same test: the frame answers *what does this kind of thing need*, and every labour fact answers *who may do it*.**

**This one is not a labour fact. It is a consistency fact.**

> **The schedule and the engine feed one list. One of them declares an audience default and the other does not.** So `s15.owner-pro-split` — required in the baseline profile, a month-one deliverable — is populated for the schedule's 190 items and blank for everything the engine produces. **The two halves of one list render differently in front of the client the list is for.**

**And the precedent is exact rather than analogous.** `Maintenance-Schedule-as-Data` §3 line 41, quoting Master Spec §15: *every checklist item carries a DIY/Pro designation set with the owner.* **A default, not an assignment, overridden per household.** The engine's items need the same field for the same reason, and adding it changes nothing about who does the work.

**What this still does not do.** It assigns no labour, names no licence, and says nothing about what HouseSteady may sell. The concierge is not a value in this vocabulary — that ruling stands and this does not touch it.

---

## B. Three values, matching the schedule exactly

**`owner` · `professional` · `both`.** Not two.

**Measured from the schedule's 190 items: 117 professional, 44 both, 29 owner.** `both` is 23% and it is load-bearing rather than a dodge.

### B1 · `both` is what keeps this at category grain, and that matters

**Builder Code's effort-estimate finding applies here unchanged:** 13 of 26 care categories were shared across classes at the time, and `air-filter-replacement` alone spans 13. **One value on a shared category has to cover a bathroom fan and a furnace.**

**Some categories genuinely do vary.** `gutter-clearing` is owner work on a bungalow and professional work at three storeys; `valve-exercise` on a main shutoff is not the same act as on a mixing valve.

**`both` carries those honestly, and the per-household override at `s15.owner-pro-split` is where they resolve** — which is where the schedule already resolves its own 44.

**Without `both` this would need class × care-category grain**, turning `careCategories` from an array of ids into an array of objects across 173 classes. **A breaking shape change avoided by using the vocabulary that already exists rather than inventing a finer one.**

### B2 · Every category declares one; absence is a bug

**No default.** The zero-care lesson applies directly: an unstated audience and a deliberate `both` are different facts, and if absence is allowed they become indistinguishable. **Tenth instance of declared-versus-absent deciding a shape here.**

**Scan:** *every entry in `careCategories` declares an `audience` of `owner`, `professional` or `both`.* Negative-test it — an entry with no audience, and an entry with a value outside the three.

---

## C. Content follows the outside review, and that is sequencing rather than deferral

**69 audience values are owed and they are not being written yet.**

**The reason is specific:** outside review across all 173 classes is due now that the content pass is complete — Document Register §6 #45, owner-agreed. **Its first use corrected a ruling with a stated reason that neither internal pass caught.** If it moves, splits or merges care categories, 69 values written today get rewritten.

**So: the shape lands now, the content lands with the review's corrections.** The scan in §B2 will fail against the shipped file until it does, which is correct — **a declared-and-unfilled field failing loudly is the honest state**, and it is the same reason `class-frame-v1.json` shipped empty rather than approximated.

---

**Status:** amendment 8. **§B is the shape. §C is why the content waits and what triggers it.**
