# Note — is the golden-set harness general, or nameplate-shaped?

**Date:** 2026-07-27
**Asked by the owner** before routing and pin-type suggestion land, on the grounds that
retrofitting generality is worse than building it.
**Short answer:** the expensive half is already general; the cheap half is nameplate-shaped
and should stay that way until there is a second task to generalise *against*.

---

## The split, precisely

The harness is two things wearing one filename.

**The ratification machinery is task-agnostic already.** An act is
`{ key, act, value, by, at }` — a key, a copy of what was approved, and who approved it.
Nothing in that shape knows what a nameplate is. The rules built on it are equally
general:

- a value is ratified only while the copy still matches, so editing lapses it;
- withdrawal appends rather than deletes;
- only ratified values gate;
- a difference on an unratified value summons a person to it;
- two ratifications to different answers is drift.

Every one of those applies unchanged to a ranked candidate list or a component type.

**The comparison is nameplate-shaped, and visibly so.** `ExpectedImage` has
`classification`, `fields` and `abstains`. `compareField` is string equality with a
case-and-spacing carve-out. `FieldVerdict` is `invented | missed | misread | match |
match-but-formatting`.

## Which half hurts to retrofit

Only the first. **The ratification log is data on disk** — once approvals exist in a
file, changing their shape means either migrating real human decisions or throwing them
away, and neither is acceptable for a record whose entire purpose is provenance. That is
why it was worth getting right before any of it existed, and it now is.

**The comparator is code.** Swapping it costs a morning and no history.

## What the next two tasks actually need

**Loose-photo routing** is a ranked-candidate problem, and its ground truth is *"which
pin is right, or none of them"*. Its verdicts do not map onto `compareField`:

| Verdict | Meaning |
|---|---|
| **suggested where nothing was right** | the cardinal error, same shape as `invented` |
| right pin, offered first | the good case |
| right pin, offered lower down | weaker but not wrong |
| stayed silent, correctly | `§1`: silence is a valid output for the whole task |
| stayed silent where a pin was right | safe, same shape as `missed` |

Note the asymmetry survives intact — *suggested-where-nothing-fits* is the one that
matters, and *stayed-silent* must not be penalised, for exactly the reason `missed` is
not penalised today. That is the principle generalising, not the code.

**Pin-type suggestion** is a single choice from the config's own closed list. Closer to
the current shape, but with one difference worth naming: its version of `invented` — a
type that is not in the list — should be structurally impossible rather than merely
counted, because §1 says an unrecognised component type is a vocabulary problem and not a
suggestion.

## The recommendation

**Do not generalise the comparator now.** A comparator abstracted against one task is an
abstraction fitted to a sample of one, and it would almost certainly be wrong in a way
that is harder to see than the concrete version. Write routing's comparator when routing
lands, with both cases in front of you, and lift what is genuinely shared then.

**Do keep the ratification machinery honest about being shared.** It currently lives
inside `ai/golden.ts` alongside the nameplate comparison. That is a module boundary rather
than a data problem, so it costs nothing to fix later — but when routing lands it should
move to its own file, because a second task importing from a file called `golden` for the
half that has nothing to do with nameplates is how a shared thing gets quietly forked.

**One thing to carry across deliberately:** whatever a routing entry looks like, its
approvals go in the same `ratifications` log with the same `by`. One company artifact,
one review role, one place to see drift — a second ratification format would fragment the
set exactly as a second golden set would.
