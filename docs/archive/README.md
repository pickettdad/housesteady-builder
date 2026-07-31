# Archive — superseded documents

**Superseded, not wrong.** Everything here was current when it was written and was
replaced by a later revision that lives in `/docs`. Kept rather than deleted for the same
reason the event log is append-only: *why* a spec changed is sometimes the thing somebody
needs, and a deleted file cannot answer it.

**Nothing here is authoritative. Nothing reads it.** No code path, no test, and no live
document references anything in this directory — checked at the time of archiving, and
re-checked 2026-07-30.

**Who cites the Observed Addendum, and by what name.** Two places name it by dated
filename, and both were moved from `_2026-07-25` to `_2026-07-27` in the same commit that
archived the older copy:

| Citing | Line | Cites |
|---|---|---|
| `server/src/import/manifest.ts` | 13 | `..._Observed-Addendum_2026-07-27.md` |
| `docs/HouseSteady_Binder-Builder_Increment-1_Build-Spec_v3.4_2026-07-26.md` | 7 | `..._Observed-Addendum_2026-07-27.md` |

**A dated citation is correct here and should stay dated.** Two addenda exist; a citation
that named the document without its date would be unanswerable the moment a third arrives.
*(Correcting the record: a PR body of 2026-07-30 said "none cite a date." That was wrong.
What was true is that no citation still points at the archived copy — a different claim.)*

| Archived | Superseded by | What changed |
|---|---|---|
| `Increment-1_Build-Spec_v3.1_2026-07-25` | `Increment-1_Build-Spec_v3.4_2026-07-26` | Versioned manifest adapters and the identity check arrived between the two. |
| `Increment-2a_Build-Spec_2026-07-26` | `Increment-2a_Build-Spec_v2_2026-07-27` | The overlay layer's second pass — room-photo counting moved when a photo is attached. |
| `Manifest-Contract_v3_Observed-Addendum_2026-07-25` | `..._Observed-Addendum_2026-07-27` | §1–§7 unchanged. Adds a status blockquote marking §8's question list partly stale, and a fifth §8 question — pin identity across visits, which records that pin *numbers* are session-scoped and the longitudinal join is blocked on the session plan rather than merely unbuilt. |
| `Binder-Builder_AI-Assist-Plan_v1_2026-07-25` | `..._AI-Assist-Plan_v1.1_2026-07-30` | Same document with a supersession banner: **its Increment 3 row placed AI in the audit engine and that is no longer the design.** §1a made slot binding deterministic — the audit reads the config's own declarations rather than inferring them. Everything else stands, including the standardization argument, versioned prompts, the provenance table and abstention as a valid output. |

**If you archive something else, add a row.** A directory of files with no account of why
they are here is a slightly tidier version of the problem it was meant to solve.
