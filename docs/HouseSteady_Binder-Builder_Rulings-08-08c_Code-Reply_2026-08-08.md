# The 08-08c rulings — Builder Code reply

**Date:** 2026-08-08 · **Record of an event. This date never moves.**
**Answers:** rulings 2, 3 and 4 of the 08-08c set, and §27's render gate. Ruling 1 — the `capture` tag is desk-facing — is Field Code's and the design session's; nothing in this repo turns on it.

---

## Ruling 2 · The copy rule, sharpened — nothing to change, and the reason is worth recording

> **Repos keep no copies of documents replaced wholesale. A copy with a named consumer stays.**

**That is a better rule than the one I applied**, and it happens to reach the same three files — but not by the same reasoning, and the difference matters for the next file somebody considers.

**I kept the Checklist Master because a doctrine scan required it present.** That is a consumer, but it is a *test* — and had the scan not existed I would have had no principled ground to keep it. The sharpened rule names the actual consumer: **the schema cross-check, run by hand.** The scan is how that consumer is enforced, not the reason the file is here.

**The second scan stays**, as ruled. Both remain: one forbids any code path from reading the master, one requires it present. **The pair is the point** — a copy that nothing may parse and nothing may delete.

---

## Ruling 3 · The Brand Guide is restored, and the flag it came back with is not the one expected

**Restored** to `/docs/reference/`. I extended the removal to it on the reasoning that leaving one copy behind recreates the class for one file. **The ruling is right and my reasoning was wrong in a specific way:** I tested *is this a copy of a project-folder document* when the test is *does anything break without it*. The report design reads this guide. That is a consumer, and I did not look for one.

> ⚑ **But it is not undated, and that changes where the flag belongs.**
>
> The ruling asked that it be marked as needing a date, since *an undated file cannot show staleness as a diff.* **It carries one in both places.** The filename is `HouseSteady_Brand-Guide_v1_2026-07-17.html`, and line 56 of the document itself reads:
>
> > *HouseSteady · Brand Identity Guide · v1 · July 17, 2026*
>
> **So the register's §2 row — `Brand Guide | undated | ○ △ | Undated, against rule 2` — does not describe this file.** Whatever is undated is the project folder's copy, and rule 2 is a rule about filenames, so that is where the flag belongs.
>
> **Reported rather than edited.** §2 is the design session's section, and the file I can see is the one that is fine.

`/docs/reference/README.md` is rewritten to carry the sharpened rule and to name each remaining file's consumer explicitly.

---

## Ruling 4 · `CLAUDE.md` §11 — corrected, and the fix carries its own re-derivation

**The instruction was not to swap the number**, and that is the harder and better version of the request. §11 now reads:

| Export | Zones | Media | Declared bytes |
|---|---:|---:|---:|
| `fixtures/reference/` | 2 | 37 photos | **117 MB** |
| `fixtures/walk-2026-07-31/` | 8 | 157 photos · 4 video · 2 voice | **504 MB** — 485 photo, 18 video, 1 voice |

**Three things changed, not one:**

1. **Each figure names its export.** The old sentence — *"123 MB for two rooms"* — named no artifact, so it read as the scale of a visit rather than of the smaller of two samples.
2. **Both figures are derived from the manifests' own declared `bytes`**, and the entry says so and says where. Your rule about hand-kept numbers applies to the fix, so the table is marked a convenience rather than a source.
3. **"Measured" is now split from "estimated."** The old line said *"Scale, measured: … roughly 1.5–2 GB for a full baseline visit."* **Neither export is a baseline** — one is two rooms, the other is eight zones of a partial visit. The 1.5–2 GB is a projection from these two and has never been measured; it now says so.

**The old figure was 123 MB and the declared bytes are 117.0 MB.** I have not called 123 wrong — the repo's copy is redacted to the manifest, so I cannot check the delivered export, and 123 plausibly counted the container. **What I could derive, I derived; what I could not, I did not assert.**

**And a fourth thing the correction turned up.** The walk's four videos are **2.5% of its files and 3.7% of its bytes** — 4.6 MB each against a 3.1 MB photograph. A mild skew today because the clips are short, and nothing about it holds as they lengthen. That is now in §11 as the reason bytes are always reported broken out by kind, which was previously a rule with no evidence beside it.

*(My first draft of that sentence said 3.7% of files. It is 2.5%. Caught by computing it rather than by reading it back.)*

---

## §27 · The render gate is built, and it refuses today

**Ruled:** the reserve figure and `s2.next-review` render **outside the honesty vocabulary, marked in words, as a render gate rather than an optional field.**

### What was built

**`schema/binder-schema-v1.json`** — both slots now declare:

```
"outsideHonestyVocabulary": { "why": "…", "renderNote": null }
```

**`server/src/report/renderGate.ts`** — `gate(slot, value)` returns a **branded** `GatedValue` that no caller can construct. The same shape `completeness.ts` uses for `PropertyReady`: a renderer that wants to emit the reserve figure has exactly one way to obtain the value, and that way checks the words are there.

**Thirteen tests.** Including the three that make it a gate rather than a field:

- **An empty note refuses as firmly as a null one.** Otherwise the gate is opened by typing a space — which is worse than no gate, because it looks satisfied.
- **A malformed declaration refuses rather than falling through.** Absent means *an ordinary labelled slot*, which is a value that goes straight past the gate; a declaration this code cannot read must not be read as absent.
- **Reporting clears nothing.** `blockedSlots()` exists so a screen can say *this is why the binder will not render* — and every slot it names still refuses when handed to `gate()`.

### Why an optional field was the wrong build, in one sentence

**A `renderNote` a renderer *may* emit is Table I** — `provenance.ts`, five exported functions built, tested, and called by nothing, idle for weeks with no test able to notice. **An optional field is satisfied by declaring it; the failure it exists to prevent survives untouched.**

### Both slots refuse right now, and that is the honest state

**`renderNote` is `null` on both, because the words are client-facing copy and this repo does not invent client-facing copy.** They are the design session's to write, exactly like the ratified twenty.

**A refusal is therefore correct today and it is visible.** The alternative — rendering the figure bare until somebody remembers the sentence — is §6a's failure, shipped. **Increment 6's renderer will meet this gate on its first run and be told what is missing**, which is the whole reason for building it before the renderer rather than after. Same reasoning as `confirm.ts`'s `adopted` path, built before §4 could produce anything to adopt: *the guard has to be in place before the temptation.*

> **What the design session owes for this to unblock:** two sentences, one per slot. The `why` on each slot states what the sentence has to convey; the sentence itself is voice, and voice is not mine.

### Scope, stated because it was easy to overrun

**No binder-section renderer exists and this does not begin one.** Increment 6 is not started. What is built is the gate and its refusal, so that when the renderer arrives it cannot be written around.

---

**970 tests green, typecheck green.** Still no photograph through identification — that remains the shortest path to something visible, and it is on your machine.
