# Note — the red X on PR #71 was not a failure, and not a hang

**Date:** 2026-08-06
**Written because** the working diagnosis was wrong twice, and the second wrong reading is the dangerous one: *a check that reliably fails to complete trains people to merge past a red X*. If this is remembered as "CI is flaky" the lesson lands backwards — **CI did not misbehave here at all.**
**Method:** the run history and the job records, read from the Actions API. Not a re-run — a green on a re-run would have proved nothing about the first one.

---

## What the evidence shows

**29 completed runs, median 55 seconds.** Then a hard wall at one minute of one day:

| created (UTC) | event | outcome | duration |
|---|---|---|---:|
| …13:07 → 15:23 | alternating | success ×10 | **53–108 s** |
| **15:57:18** | push · `main` @ `9afdf5e` | **cancelled** | **951 s** |
| **16:13:52** | pull_request · #71 | **queued, never started** | hours, still attempt 1 |

Everything before 15:57 finished in about a minute. Nothing since has run at all.

**The job record is the proof.** For the 15:57 run:

```
runner_id: 0        runner_name: ""
created_at: 15:57:19    started_at: 15:57:19    completed_at: 16:12:21
conclusion: cancelled
```

**No runner was ever assigned.** `started_at` equals `created_at` because GitHub stamps both when it accepts the job, not when a machine picks it up — and then it was cancelled at 15m02s. The PR #71 run is worse and clearer: **zero jobs exist for it.** GitHub never created one, and it is still `run_attempt: 1` — its `run_started_at` keeps being bumped forward as GitHub re-queues it, which is the clearest possible statement that it is waiting for capacity rather than doing anything.

**Nothing executed. There was nothing to hang.**

### And GitHub says so itself, in the run's own annotations

The inference above was drawn from the job record. The run page carries the same
finding stated outright — **two annotations, quoted verbatim:**

> ❌ `The job was not acquired by Runner of type hosted even after multiple attempts`
>
> ❌ `Internal server error. Correlation ID: 92db80b8-a0c5-43e6-a794-4fb8b51a30c7`

**That is GitHub confirming no hosted runner ever picked the job up**, and pairing
it with an internal server error. The first line is the whole diagnosis in one
sentence; the second says the cause is on their side of the line.

**The correlation ID is the actionable artifact.** It is the identifier GitHub
Support asks for, it is the only part of this that cannot be reconstructed later,
and it is recorded here for that reason.

---

## What this rules out, with the check that rules it out

**Not suite size.** Median 55 s across 29 runs, and the suite grew all day without moving that number. This was the first reading and it was wrong.

**Not duplicate triggers.** Across the last 30 runs, **no commit has more than one run** — the decisive check, and it comes back empty. This repo's `push:` is restricted to `branches: [main]`, so a feature-branch push fires nothing and only the merge commit gets a second run. That is one run per commit, by design.

**Not the concurrency group.** `cancel-in-progress` cancels a run that a *newer* run supersedes. No newer run on `refs/heads/main` exists after 15:57 — and a superseded job still gets a runner and still reports which run replaced it. This one never got a machine.

**Not billing.** The repository is **public**, and public repositories get unmetered GitHub-hosted minutes. There is no spending limit to hit.

**What is left is runner availability**, which is GitHub's side of the line and not visible from in here. The clean temporal boundary — everything fine until 15:57, nothing since, across two repositories on one account — is the shape of a capacity problem rather than a configuration one.

---

## The correction that matters for the other repo

Field's diagnostic was read as *two triggers on one commit, one of them hangs*, from the observation that on one commit the `pull_request` run passed in 2 minutes and the `push` run was cancelled at 15.

**That observation is equally well explained by starvation, and the two are indistinguishable from the pull-request page.** A run that never gets a runner shows a red X after fifteen minutes and looks exactly like a run that hung. One trigger got a machine and the other did not.

**The check that separates them is `runner_name` on the cancelled job.** Empty means it never ran, and there was no hang to explain. That takes one API call and it is worth making before any workflow is changed on the strength of the hang theory.

**One genuine difference is still worth Field's attention, on its own merits:** if its `push:` is not restricted to `main`, a PR branch fires both `push` and `pull_request` on the same commit and every commit costs two runs. That does not *cause* starvation — but it doubles demand on shared account capacity, which makes starvation arrive sooner and hit harder. Restricting it is right whether or not it is implicated here.

---

## What was deliberately not done

**No re-run**, per the standing instruction: a green tells you nothing about why the first one did not finish.

**No change to `check.yml`.** The evidence says the workflow is correct, and editing a file this investigation just exonerated would leave the next reader thinking the config was at fault.

**PR #71 is held, not merged.** Its only check is the queued run, so there is no verdict to merge on. This is the whole point: the discipline only means something if it survives an outage that makes it inconvenient.

**A `timeout-minutes` on the job is worth adding and would not have helped here** — that timer starts when a job begins executing, and this job never did. It bounds a genuine hang, which is a different failure this repo has not had. Recorded as a separate small improvement rather than folded in as a fix.

---

## The thing to carry

**A red X is a claim that something ran and failed. This one ran nothing.** The reason to write that down is that the alternative reading — *CI is unreliable, merge anyway* — is a habit that costs the suite its whole purpose, and both the owner and the design session had already acted on it once today.
