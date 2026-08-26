# Binder audit — raw harvest, 2026-08-26

**Status: PARTIAL.** Harvested from the running workflow's journal while it was still in its verify
phase, because the container is ephemeral and the findings had to leave it. `raw-findings.json` is
the machine record; this file is the index.

**Run id `wf_4d6ed210-c17`.** Ten independent lenses, then two adversarial refuters per deduped
finding, each defaulting to *refuted* when uncertain. **Most of these will not survive** — this repo
builds walls that read like gaps, and a refuter's job was to find the comment that defends one.
⚑ **Nothing here is verified. Do not act on a row in this file without checking it at source.**

| lens | raw findings |
|---|---:|
| Declared in a schema/config and consumed by nothing — every field, column, and vocabulary term in `/schema/*.j | 8 |
| Values computed and never read — exported functions with no non-test caller, object fields populated on a writ | 10 |
| Capability silently dropped by a migration or refactor — a reader left pointing at nothing, or a value compute | 6 |
| The write path and the read path disagree — who INSERTs vs who SELECTs, per table in server/src/db/migrations | 5 |
| doctrine 6 — never drop anything silently | 5 |
| checks whose output does not depend on what they check | 4 |
| Client-facing overclaim — every rendered sentence held against the provenance behind it, across `server/src/re | 6 |
| Free sweep — first-tour reading of server/src, server/scripts, schema/, prompts/ and web/src, plus a real end- | 9 |
| Field 6 seam readiness — the IMPORT path (server/src/import/**, and the two call planners downstream of it) | 5 |
| Field 6 seam readiness — downstream consumers (media batching/grouping, the session-plan return leg, existing  | 6 |
| **total** | **64** |

Refuter verdicts captured at harvest: **73**.

## Two findings already checked at source by the parent session

Both were proven by agents planting synthetic data, and both are the audited class exactly:

1. ⚑ **`scanForPersonalData` never inspects `modelRead`.** A planted string carrying a licence
   number, a phone number and a street address produced **zero scan hits** in `modelRead`, and three
   hits in `models[]`. `modelRead` is a string read off a plate. The scan that exists to keep plate
   text out of a public repo does not look at one of the two places plate text lives.

2. ⚑ **The House Style lint does not gate the property label or address.** An edition signed with
   `label: 'The Smith place — recurring damp issue'` was **SIGNED with no refusal**, and the stored
   HTML carries it. The lint guards the prose and not the heading above it.

*(The synthetic strings above are the agents' own test data — no real personal data is in this
harvest. Scanned before commit: no emails, no owner name, no real numbers.)*
