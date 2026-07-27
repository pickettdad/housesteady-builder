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

---

## What happened when routing landed (added the same day)

Both recommendations were followed, and both held up.

**The ratification machinery moved to `server/src/ai/ratification.ts`**, unchanged in
behaviour. The one seam that needed inventing is `ratificationView(currentValue)`: the log
knows an act carries a copy of the value approved, but not that a nameplate entry keeps
its classification beside its fields while a routing entry holds a pin id. Each task
supplies that one function and gets the other five unchanged. Routing's golden set shares
the log, the authors, the lapse-on-edit rule, the never-delete rule, and the drift signal —
a test pins that last one by contesting a routing entry through the same `contested()` the
nameplate set uses.

**The comparator was written fresh**, and the prediction was right — it could not have
been shared. `compareField` has no way to express *offered the right pin, second*, which
is neither right nor wrong, or *said nothing, correctly*, which is a success routing has
and nameplate reading does not. Six verdicts, not the five sketched above: the sketch
folded "suggested a pin when a different one was right" into "suggested where nothing was
right", and they are different failures. `invented` is a suggestion where silence was
correct; `misrouted` is a confident answer to a question that had a different answer. Both
gate. `missed` and `stayed-silent` never do.

**One thing the sketch did not anticipate.** A routing verdict depends on the confidence
bar as well as on the model, because what the harness measures is what the concierge was
*shown*. So a run records its bar the way it records its prompt version, and `offeredPins`
is shared between the harness and the read path so the two can never apply it differently.

**Still outstanding: the fixture set itself.** Ground truth here is "which pin is this
photograph of", which needs a visit whose room photographs are on disk. The reference
export is manifest-only — 28 zone-owned photos with no bytes behind them — so there is
nothing to run against. The comparison logic is built and tested against plain data; the
loader, the report and the approve command follow the first export that carries its media.
Writing them now would be writing a harness for a set that cannot exist yet.
