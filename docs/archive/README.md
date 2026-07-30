# Archive — superseded documents

**Superseded, not wrong.** Everything here was current when it was written and was
replaced by a later revision that lives in `/docs`. Kept rather than deleted for the same
reason the event log is append-only: *why* a spec changed is sometimes the thing somebody
needs, and a deleted file cannot answer it.

**Nothing here is authoritative. Nothing reads it.** No code path, no test, and no live
document references anything in this directory — checked at the time of archiving.

| Archived | Superseded by | What changed |
|---|---|---|
| `Increment-1_Build-Spec_v3.1_2026-07-25` | `Increment-1_Build-Spec_v3.4_2026-07-26` | Versioned manifest adapters and the identity check arrived between the two. |
| `Increment-2a_Build-Spec_2026-07-26` | `Increment-2a_Build-Spec_v2_2026-07-27` | The overlay layer's second pass — room-photo counting moved when a photo is attached. |
| `Manifest-Contract_v3_Observed-Addendum_2026-07-25` | `..._Observed-Addendum_2026-07-27` | §1–§7 unchanged. Adds a status blockquote marking §8's question list partly stale, and a fifth §8 question — pin identity across visits, which records that pin *numbers* are session-scoped and the longitudinal join is blocked on the session plan rather than merely unbuilt. |

**If you archive something else, add a row.** A directory of files with no account of why
they are here is a slightly tidier version of the problem it was meant to solve.
