# Increment 5 — a scope statement, recorded not specced

**Date:** 2026-07-31
**Status:** **recorded, not specced.** Nothing here is a build instruction and nothing is being built from it. It exists so the increment gets sized correctly when its spec is written, rather than discovered mid-build.
**Source:** the owner, relaying Field Code, 2026-07-31.

---

## The statement

> Field Code established that **`issue` decomposes into object-plus-concern the same way `monitor` does**, so v4 retires the pin flag **as a concept** rather than shrinking an enum.
>
> Three streams read that flag today and **all three re-source at v4.**
>
> So Increment 5 is not *"add a concern register"* — it is **build a register and re-point three existing streams at it.**

## The three streams

| Stream | Reads the flag as | Governing record | Where it goes |
|---|---|---|---|
| **Findings** | `issue` | Observed Addendum §3b | object + concern |
| **`monitorsDue`** | `monitor` | Session-Plan Contract §9a | a query over open concerns, no field input |
| **Layer derivation** | the flag generally | Design v1.1 §C5 | the concern register |

`fine` decomposes into nothing at all: a satisfied checklist item already records it. There was never a second fact.

## Why this changes the sizing rather than the design

**"Add a concern register" is one new thing. "Build a register and re-point three streams" is one new thing plus three migrations of live behaviour**, each with its own tests, its own honesty-label path, and its own way of being wrong.

The three are not equally hard, and the difference is worth having in front of whoever writes the spec:

- **`monitorsDue`** is the cheapest. It is one emitter section, no client-facing text, and the Session-Plan Contract §9a already states what it becomes.
- **Findings** is the expensive one. `issue` currently feeds the condition assessment, which is client-facing, and CLAUDE.md §5 keeps findings and concerns as **separate streams that must never be collapsed**. Re-sourcing findings *from* concerns without merging the two is the part that needs designing rather than porting.
- **Layer derivation** is the one most likely to be forgotten, because nothing about it is visible in a gap report.

## What is NOT being decided here

- **No schema, no tables, no API.** The register's shape is Increment 5's spec to write.
- **Nothing about how a concern closes.** CLAUDE.md §7 already binds that: a concern never auto-closes from field data, and resolution is this repo's with a reason. Unchanged and not reopened.
- **Nothing about v4 adoption timing.** The manifest adapter question is separate.

## The one thing already true in the code

`sessionPlan.ts` carries `openConcerns: never[]` — **recorded, not specced, and nothing writes to it.** The key exists so the payload shape has room. Session-Plan Contract §9a names it as where `monitorsDue` is re-sourced from.

The flag vocabulary this build knows (`monitor`, `issue`) comes from the Manifest Contract, and the outstanding change request — Session-Plan Contract §9b — asks for it **versioned**: v3 is `fine | monitor | issue`, all three retire or decompose at v4, and **archived v3 exports carry all three forever.** That last clause is what makes this a re-sourcing rather than a deletion: a 2026 manifest read in 2031 still has flags in it, and the register has to be able to say what they became.
