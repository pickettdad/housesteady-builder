# Binder Builder — Increment 2c Build Spec: Operator Identity

**Date:** 2026-07-29
**Why this exists:** Builder Code audited the schema against the multi-operator constraint and found **exactly one table carries an actor — `overlays`.** Nine do not. There is also no concept of an operator at all, so this is a small identity piece rather than nine columns.
**Sequencing:** **before the rest of Increment 3.** Its own PR, one concern.

---

## 1. Why now rather than later

**The argument is about the code, not the existing rows.** Today's records are test data, and losing their attribution costs nothing. But **a table without an actor column teaches every write path built on top of it to omit one.** Increment 3 adds an audit engine, Increment 4 a gap report and a session plan, Increment 5 the concern register — each with its own writes. Retrofitting then means touching every one of them.

And a concierge in training is planned immediately after launch, so **this is a launch requirement rather than a scaling one.**

`desk_media` is the sharpest case Code named: **a recording of somebody's voice with nothing recording whose.**

## 2. What an operator is

Not a login. A **named person whose acts are attributable**, with one client-facing surface: the *visited by* line that appears on every report.

- `operators` — id, display_name (as it appears to a client), short_code, active (0/1), created_at, deactivated_at
- **Never deleted.** An operator who leaves is deactivated; their records keep pointing at them. Same reasoning as retirement lineage: the record of who did something outlives their employment.
- **Current operator** is set per session, from config for now. **Authentication is deliberately out of scope** — this is attribution, not access control. Access control arrives with hosting.

## 3. Where the actor goes

Add `actor_id` (and `actor_at` where no timestamp exists) to: `properties` · `visits` · `imports` · `passes` · `pass_zone_opens` · `pass_events` · `desk_media` · `ai_jobs` · `ai_generations`. `overlays` already has one and keeps it.

**Distinguish three roles rather than flattening them into "the actor":**

- **`visits.performed_by`** — who was in the house. Client-facing; this is the *visited by* line.
- **`passes.worked_by`** — who did the desk pass. **May differ from who visited**, and that difference is worth being able to see rather than assume away.
- **Everything else: who performed this act.** Ordinary attribution.

**On `ai_generations`,** the actor is who *triggered* the run, never the model — the model is already recorded in its own column, and conflating them would make a generation look like a human act. `human_decision` already carries who decided.

**Ratifications already carry `by`.** Reconcile it to the same operator id rather than leaving two identity systems; the golden set's drift signal depends on `by` meaning one thing.

## 4. Migration

- Append-only, per doctrine. Nothing is rewritten.
- Existing rows get a **`legacy` operator** — a real row in `operators`, deactivated, display name *"pre-attribution"*. **Not null, and not the owner.** Backfilling to the owner would assert something untrue about who did the work; a named legacy operator says honestly *"this predates attribution."*
- New rows require an actor. Enforce it at the write path.

## 5. Tests

Every insert on the ten tables carries an actor · a deactivated operator's existing records still resolve to their name · `visits.performed_by` and `passes.worked_by` are independently settable and both surface · `ai_generations.actor_id` is a human, never a model.

**Doctrine scan:** no write path to an attributed table without an actor argument. This is the rule that survives the next feature; a behavioural test only covers paths that exist today.

## 6. Deliberately out of scope

Authentication · access control · per-operator permissions · anything about who may *see* what. **This increment answers "who did this," never "who is allowed to."** Those arrive with hosting and want their own decision.

---

**Status:** ready for Claude Code, ahead of the rest of Increment 3.
