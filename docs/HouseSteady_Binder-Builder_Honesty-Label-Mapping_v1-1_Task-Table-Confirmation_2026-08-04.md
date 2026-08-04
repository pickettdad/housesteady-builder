# Honesty-Label Mapping v1.1 §2b — the task table, confirmed

**Date:** 2026-08-04
**Answers:** `Honesty-Label-Mapping_v1-1` §2b, the one item marked *reasoned, not checked*.
**Method:** **checked** — read from `server/src/ai/tasks/index.ts`, `screen.ts` and `accept.ts` on 2026-08-04.

---

## Your reasoning holds on all four

**The four tasks are exactly as you have them**, declared in one place (`TASK_RUNNERS`, and `ASSIST_TASKS` at `screen.ts:249`): `nameplate_classify` · `nameplate_extract` · `pin_type` · `photo_routing`.

| task | what an acceptance writes | claims something about the house? |
|---|---|---|
| `nameplate_classify` | **nothing.** Never becomes a proposal, so never takes a decision | **No** — a gate |
| `nameplate_extract` | `kind: 'accept'`, **one overlay per field** | **Yes** |
| `pin_type` | `kind: 'accept'` via `acceptProposal` → `acceptReading`, one field | **Yes** |
| `photo_routing` | `kind: 'assign'` on the media, `newValue: {toKind, toId}`, **no `field`** | **No** — filing |

**Your `nameplate_classify` reasoning is confirmed by a comment that says it in as many words.** `screen.ts:154` — *"Classifications are indexed rather than listed: they are evidence for an extraction, not proposals of their own."* It is `Map`ped by media id and attached to the extraction it gated. Nothing offers it to a person, so its `human_decision` stays `pending` for the life of the row, exactly as you reasoned.

**`photo_routing` is confirmed too, and its doc-comment makes the same distinction you did:** *"An ORDINARY ASSIGNMENT, not a new kind. A photograph on pin 4 is one fact whether somebody dragged it there or agreed with a suggestion."* It targets the **media**, not the pin, and carries **no `field`** — there is no value on it to label.

**So yes: the first table has two rows.** And you are right that it must still be declared as a table, because serial decoding is the row that arrives `inferred`.

---

## But there is a structural discriminator, and it is better than the list

**The two tasks that need a label are exactly the two whose acceptance writes `kind: 'accept'` carrying a `field`.** The two that do not write either nothing at all or an `assign`, which has no field.

That is not a coincidence of these four. **A `field` on an `accept` is the record saying *a person took an AI-proposed value and made it the value*** — which is precisely the thing an honesty label describes. An `assign` moves a photograph rather than setting a value on the house.

> **Proposed, to replace "these two tasks of the four": a task needs a row in the label table exactly when its acceptance routes through `acceptReading` — that is, writes `kind: 'accept'` with a `field`.**

**The first version of this sentence said "any overlay carrying a `field`" and was wrong** — `memory` overlays carry `field: 'text'` and `field: 'audio'` (`pass/memory.ts:113`, `index.ts:569`). A memory is the concierge's own recollection, not an answer to a proposal, and it has no generation behind it. Narrowing to `accept` excludes it. *Caught by checking the thing I had written down as not checked, which is the third time this fortnight that the unchecked corner was the wrong one.*

Three reasons it is worth taking over the enumeration:

**1 · It survives tasks nobody has written.** Serial decoding will write a field, so it will need a row, and the rule says so without anybody remembering to extend a list. Transcription mostly will not — a transcript is evidence, and the values pulled *out* of it are the claims.

**2 · It fails in the safe direction.** A new task that writes a field and has no row is a *missing* label, which is loud. The enumeration fails the other way: a new task nobody adds to the list gets no label and nothing notices, which is the shape of every idle check this fortnight.

**3 · It is scannable, which the enumeration is not.** *Every task whose runner reaches `acceptReading` has a row in the label table* is a check over source plus a JSON file. **A list of two task names is a fact about today that a scan can only restate.** Rule 12's lesson applied one level up: the enumeration would look like a rule and behave like a snapshot.

**This is a proposal, not a correction** — your two-row table is right about today, and if you prefer the enumeration for v1.2 it costs nothing except that someone must remember. I would rather the schema remembered.

---

## One thing worth recording separately

**A `memory` overlay carries a value and has no honesty label**, and it is outside this table because it is not an AI task. A concierge's recorded recollection — *"the previous owner said the roof was done around 2019"* — is a real claim about the house arriving through neither evidence nor research.

`reported-by-homeowner` is the nearest existing label and it is not right: the concierge is the reporter, not the homeowner. **Noted rather than proposed** — it belongs with §6a's question about `s19.reserve-figure` rather than with mechanism 3, because both are *the label vocabulary has no slot for a HouseSteady-originated statement.* Two instances now, which may mean it is one gap rather than two.

---

**Status:** §2b confirmed as reasoned. One proposal against it, which is yours to take or leave.
