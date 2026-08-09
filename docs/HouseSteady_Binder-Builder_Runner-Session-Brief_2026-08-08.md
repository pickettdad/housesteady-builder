# Brief for the runner session — identification against the walk photographs

**Date:** 2026-08-08 · **Record of an event. This date never moves.**
**Written by:** Builder Code (the main session), for a second, bounded Builder session with Google Drive enabled.

> ### ⚑ Check the tree before you start — this is a command, not a claim
>
> ```bash
> ls server/scripts/preflight.ts server/scripts/smoke.ts && \
>   grep -q currentOperator server/scripts/identify.ts && \
>   grep -q HOUSESTEADY_ANTHROPIC_API_KEY server/src/ai/models.ts && \
>   grep -q "tier === 'strong'" server/scripts/identify.ts && echo "TREE OK"
> ```
>
> **`TREE OK` or stop.** Those four files carry everything this brief depends on: the foreign-key fix that makes `--run` work at all, `preflight`, `smoke`, the API-key variable, and `--tier`.
>
> **Why a command rather than a commit hash.** The 2026-08-09 runner cloned `main` while the branch this brief described was an open PR, and reported two defects that were real *for them* and already fixed *here* — `preflight` missing and the key variable unread. **Both commands had been executed before being written down, on a commit nobody else had.** A hash would have told them the same thing one step later; **this tells them before they spend anything.**
>
> *(And it earned itself immediately: PR #87 merged at commit 1 of 6, stranding the foreign-key fix on a branch. A brief that claimed "merged" would have been wrong for the second time in two runs.)*
**Answers register #86.** Every command below was executed in this repo before it was written down. Where a number is quoted, it was measured on the walk fixture's manifest, which is the same manifest the real export carries.

---

## 0. Read this part twice

**You are a runner, not a developer.** You clone, you run, you report in prose. **You never commit, never push, never open a pull request, never edit a file that is tracked by git.** Two sessions writing one repo is the v1.2.1 fork with better tooling, and that is the specific failure this arrangement exists to avoid.

**The repository is public.** The photographs are not.

**The photographs contain real personal data.** At least one — a pressure-test tag on the mechanical room's equipment — carries a **real street address, a contractor's name, a telephone number, a registration number, a fitter's name and a licence number.** Identification reads nameplates and labels, so **any of those strings can come back in a model's output and land in your terminal.**

Three rules follow, and they are absolute:

1. **Nothing from `/data/` is ever committed.** It is gitignored (`.gitignore` line 2) and stays that way.
2. **No photograph, no manifest, no file path under `/data/`, and no string a model read off a label goes into a commit message, a PR body, a tracked file, or anything published.**
3. **When you report back, redact.** If an object's label contains an address, a person's name, a phone number or a licence number, replace it with `[redacted — address]` and say what kind of thing it was. **The fact that the model read a plate correctly is the finding. The plate's contents are not.**

---

## 1. Getting to a runnable state

**Node 22.** The repo declares `>=20`; 22 is what it is developed against.

```bash
git clone <repo> housesteady-builder
cd housesteady-builder
npm install
```

`npm install` builds two native modules — `better-sqlite3` and `sharp`. It takes a few minutes and needs no special toolchain on a normal Linux container.

**Confirm the repo is sound before spending anything:**

```bash
npm run typecheck
npm test
```

Expect **typecheck clean** and **all tests passing**. If either fails, stop and report — a red suite means you are running something other than what this brief describes.

**Disk.** The export is **529 MB**. The import **moves** files rather than copying them, so it does not double — but the Drive download itself is 529 MB, plus `node_modules`. If you hit "no space left on device", delete the download's staging copy rather than starting a new session.

---

## 2. Environment

> ### There is exactly one secret here
>
> **`ANTHROPIC_API_KEY` is the only credential in this brief.** Everything else below is a plain setting — a model name, two prices, an operator's name. **They look alike in a table and they are not alike**, and an earlier cut of this table did not say so.
>
> **They belong in the environment's own variables** — the same place the network allowlist is configured — **not in GitHub repository secrets.** Repository secrets are read by GitHub Actions workflows; nothing in a Claude Code session reads them, so a key placed there is a key that is not set.

**The field takes `.env` format, one `NAME=value` per line.**

**For a run that includes `--tier strong`, this is the complete list.** Every name below is read by this repo — verified at source, not inferred:

```
HOUSESTEADY_ANTHROPIC_API_KEY=[insert API key]
HOUSESTEADY_MODEL_FAST=claude-haiku-4-5-20251001
HOUSESTEADY_MODEL_STRONG=claude-sonnet-5
HOUSESTEADY_OPERATOR=Runner session
HOUSESTEADY_FAST_INPUT_PER_MTOK=1.00
HOUSESTEADY_FAST_OUTPUT_PER_MTOK=5.00
HOUSESTEADY_STRONG_INPUT_PER_MTOK=[strong model input price]
HOUSESTEADY_STRONG_OUTPUT_PER_MTOK=[strong model output price]
```

> ### ⚠ The last two lines are not optional on a `--tier strong` run
>
> **The rate variables are per tier**, built as `HOUSESTEADY_{FAST|STRONG}_{INPUT|OUTPUT}_PER_MTOK`. **A strong run reads the STRONG pair.** With only the fast pair set, the spend cap sees $0.00 on every strong call and never fires — the same inert-cap failure as setting no rates at all, arriving through a door that looks configured.
>
> *This was worse until 2026-08-09: every generation was priced at the fast tier regardless of what ran, because nothing passed the tier through to the ledger. A strong run would have been costed at Haiku's rates and capped at them. Fixed, and under test.*
>
> **`HOUSESTEADY_STRONG_MAX_IMAGE_EDGE` also exists** and defaults to 1568, same as fast. Leave it alone for the comparison run — changing two things at once makes the result unreadable.

*(An earlier cut of this brief gave these as a Name/Value table — a screen layout, not a file format — and it produced two variables literally called `Name` and `Value`. A brief claiming every command was executed before it was written down handed over the one block that had not been.)*

> ### Why `HOUSESTEADY_ANTHROPIC_API_KEY` and not `ANTHROPIC_API_KEY`
>
> **A Claude Code cloud environment warns that `ANTHROPIC_API_KEY` will not authenticate its requests, because the session authenticates through the user's account.** That warning is **true, and about the session** — `identify.ts` is an ordinary Node program and the SDK reads whatever is in its environment.
>
> **But "the host ignores this variable" and "the host removes this variable" are different claims, and the warning does not distinguish them.** Rather than reason from the wording to a conclusion, this repo now reads its own name first: **`HOUSESTEADY_ANTHROPIC_API_KEY`.** Nothing else claims it, so it cannot be shadowed or confused with the host's own auth, and nobody setting it is shown a warning that is true of something else.
>
> **`ANTHROPIC_API_KEY` still works** — every local shell and SDK example uses it. Set either; the preflight below prints which one it found.

**Both of the first two are mandatory.** Neither has a default and nothing runs without both.

| Variable | Secret? | Why |
|---|---|---|
| `HOUSESTEADY_ANTHROPIC_API_KEY` | **yes — the only one** | No key, no calls |
| `HOUSESTEADY_MODEL_FAST` | **no** — a model id string | **Identification runs on the fast tier.** An unset model is a refusal, not a fallback |
| `HOUSESTEADY_OPERATOR` | **no** — a name | Recorded against the import and every generation |

> ### ⚠ That field is not a secret store, and the fix is the key's lifetime
>
> The environment screen says plainly: *these are visible to anyone using this environment — don't add secrets or credentials.* **It is right, and no storage location available here changes that.**
>
> **So make the key disposable rather than hidden.** A key created for this run, used nowhere else, and **revoked the moment the run finishes** is safe almost anywhere; a key that outlives the run is a problem no storage location fixes. Put a spend limit on it in the console if you can — this run should cost well under a dollar.
>
> **And a key that has appeared in a screenshot, a chat, or a log is already spent.** Revoke it and mint a new one; do not reason about who saw it.

> **Which model to put behind `MODEL_FAST`, and it is a real choice rather than a formality.**
>
> **In production it should be the cheap fast model.** AI Assist §9 is explicit: extraction and classification go to the cheap tier, batched, because at 400–600 photographs per baseline the tier difference *is* the operating cost.
>
> **The first run is not production — it is a measurement**, and the cheap model makes one specific question unanswerable. If the pass comes back poor, *"the prompt and the frame are wrong"* and *"the model is too small for this"* look identical. **A stronger model on the mechanical room separates them**, and that room is the only one that can be graded at all.
>
> **Recommendation: cheap for the bedroom pipe test, and the owner's call for the mechanical room.** Cost is not mine to decide — the trade is real and it is a business fact, so it goes to you rather than being assumed here.

**Two optional lines, and neither is a secret.** Add them to the same block if you have the model's published prices to hand:

```
HOUSESTEADY_FAST_INPUT_PER_MTOK=[input price per million tokens]
HOUSESTEADY_FAST_OUTPUT_PER_MTOK=[output price per million tokens]
```

**They change nothing about what is sent or what comes back.** They exist so the spend cap can bite and so the cost report is a number rather than an unknown. **If the prices are not to hand, leave both lines out** — the run is identical, the cost prints as unknown rather than as a false zero, and `--zone` and `--limit` are the bound.

---

## 2a. Step zero — prove the variables arrived, before anything moves

**Run this first. It costs nothing, sends nothing, and takes a second.**

```bash
npm run preflight
```

It prints whether the key is present (**never the key itself**), **which variable supplied it**, the model id, whether rates are set, and the image edge. It exits non-zero if either mandatory variable is missing.

**This exists because the expensive way to discover a missing key is to move 178 MB of photographs and find out afterwards.** The first attempt at this run found both mandatory variables unset — after doing everything else.

**What it does not prove:** that the key is *valid*. For that, one command:

```bash
npm run smoke
```

**One real call against the repo's own synthetic fixture — a few cents, no house involved.** It imports 11 placeholder images across 3 zones, resolves the operator, inserts the job, makes the call and writes the objects, then deletes its scratch database. **It exercises the exact line `--run` used to die on**, and it is the check that would have caught the 2026-08-09 foreign-key bug before a single photograph moved.

> **⚠ What a green smoke does NOT cover** — written here because green starts reading as *covered* the moment nobody re-reads the caveat:
>
> - **It never splits a batch.** 11 media against a ceiling of 24, so the multi-batch path — `1/3`, `2/3`, canvas riding every batch, cross-batch duplication — is never exercised. **That is the path that produced four proposals for one pressure tank.**
> - **It never exercises the image-edge cap.** `edgeForCall` only lowers the edge above 20 images in one call, and 11 total cannot reach it. **The >20-image rejection case stays unproven.**
> - **It says nothing about identification quality.** The fixture's images are 4–6 KB generated placeholders. **Zero objects proposed is a pass.**
>
> **Only a real multi-zone export covers those two paths.** Smoke proves the pipe, not the arithmetic.

> ### ⚠ The spend cap does not work unless rates are set
>
> `HOUSESTEADY_VISIT_SPEND_CAP` defaults to **$5 per visit** and is checked before every call. **But the check is on dollars, and dollars are computed from the rates above — which default to zero.** With no rates configured, every call costs $0.00, the running total never reaches the cap, and **the cap never fires.**
>
> This is deliberate elsewhere in the code: an unmeasured cost and a zero cost are different facts, and the run script prints "the cost is unknown rather than zero" instead of a confident $0.00. **But it means a cap set without rates is decoration.** Set the rates, or treat `--zone` and `--limit` as your only real bound.

**Optional, and leave it alone on the first run:** `HOUSESTEADY_FAST_MAX_IMAGE_EDGE` defaults to 1568. Raising it makes nameplates more legible and costs more tokens. Over twenty images per call the code caps the edge at 2000 regardless, so raising it can no longer break a call — but the first run should measure the default before changing it.

**`HOUSESTEADY_DATA`** defaults to `<repo>/data`, which is gitignored. Leave it unless you need the database on a different disk — and if you do move it, keep it on the **same filesystem** as the export (see §3).

---

## 2b. Getting the bytes onto the machine — the step that failed first time

**A runner session attempted this on 2026-08-08 and got no further than here.** Two independent blockers, and they need separating because only one of them is fixable by a setting.

**Blocker 1 — egress.** Every Drive download redirects to `drive.usercontent.google.com`, and the environment's network policy answered `403`. `drive.google.com` is permitted but only issues the redirect. **This is the one an admin can fix**, by adding that host to the environment's allowlist at creation.

**Blocker 2 — the connector is a context channel, not a disk channel.** `download_file_content` returns base64 **into the model's context window**. Its schema has no destination-path parameter, so there is no version of it that lands bytes on disk. The smallest zone zip is ~2 MB, which is ~2.6 MB of base64 — already several times a context window. **No setting fixes this.**

> **Which is why the allowlist is the right fix: it makes the connector unnecessary.** With the host reachable, download over plain HTTPS to disk and never involve the connector at all.

**The form to use** — untested from here, so verify the result before trusting it:

```bash
curl -L -o mechanical.zip \
  "https://drive.usercontent.google.com/download?id=<FILE_ID>&export=download&confirm=t"
file mechanical.zip     # must say "Zip archive data", not "HTML document"
```

**The `confirm=t` matters.** Without it, Drive returns a virus-scan interstitial for anything large, and `curl` will happily save that HTML *as* your zip. `file` catches it in one line.

**⚠ This needs the file link-shared, and that is a real privacy decision.** The session has no Drive OAuth token, so an unauthenticated `curl` only works on "anyone with the link". **That is broader than the connector-scoped access the route was designed around** — it is a folder of a real house's interior, reachable by URL. If you go this way: share, transfer, and **revoke immediately afterwards**. The narrower alternative is running on your own machine, where no transfer happens at all.

**You do not need all 529 MB.** The export is seven per-zone zips plus a manifest. Take only the zones the step needs — **the mechanical room alone is ~178 MB**, and the bedroom is ~2 MB. Extract each into one shared `media/` directory; the tree reassembles because paths are declared per file.

**Partial transfers are a supported state, not a broken one.** Files you did not bring are recorded `absent`, the plan still lists every zone, and `--zone` runs the one you have. **Expect a `media.file-missing` warning naming the count you left behind** — that is the importer being honest, not a failure.

**And a corrupt transfer cannot pass silently.** Every file is checksummed against the manifest's declared `sha256` on import. A truncated download reports as a checksum failure and the file is quarantined rather than used.

---

## 3. Step one — import the export

Put the export somewhere local. **`--export` is the directory holding the manifest and the `media/` folder** — the export root as the field app wrote it, because `media[].file` paths are relative to it.

**The layout inside, confirmed against a real extraction 2026-08-08:**

```
<export root>/
  housesteady-<sessionId>-manifest.json
  media/
    <zoneId>/                 ← one folder per zone, named by uuid
      _canvas/                ← the room's canvas frames
      _zone/                  ← loose room photographs (and any video)
      pin-1/ pin-2/ …         ← per-pin media, only where the zone has pins
```

**Zip per zone extracts straight into this** — so extracting every zone archive into one `media/` directory reproduces the tree the manifest declares. **Do not rename or flatten anything.** Matching is by the manifest's own declared path, so a folder renamed for tidiness is a file reported absent.

**The pin folders are not optional and not uniform.** The kitchen has nine (`pin-1`…`pin-9`); the mechanical room has none at all — its media are all zone- or canvas-owned. **A zone with no `pin-*` folders is normal, not a partial extraction.**

> **`_canvas` is a convention of the export, not how the code finds a canvas.** Routing is by the manifest's `owner_canvas_id`, never by the path — so the folder name is for humans. **The canvas frames still go into every call first** (Amendment 10 §B1, *the finest read is the authoritative one*), and that ordering is under test. But it comes from the manifest, so **a canvas frame the manifest does not declare as canvas-owned will be treated as a detail photograph no matter which folder it sits in.**

```bash
npx tsx server/scripts/import-export.ts \
  --export ~/walk-export \
  --property "Owner's own house" \
  --operator "Runner session"
```

> ### The operator does NOT need registering by hand — but the order matters
>
> **`import-export.ts` finds or creates it.** Pass `--operator`, or set `HOUSESTEADY_OPERATOR`; if no operator of that name exists the import registers one and prints `Created operator <name> (<code>)`. **Verified on a fresh database 2026-08-09** — no `npm run operator -- add` step is needed.
>
> **`identify.ts` does not create one.** It resolves through `currentOperator`, which refuses rather than inventing — *"No operators are registered"* — because an invented actor in an evidence trail is a value somebody has to chase later.
>
> **So the import must run before identify.** That is the natural order anyway and it is now the required one. The 2026-08-09 runner registered by hand first; that was harmless and unnecessary.
>
> **Keep one name across both commands.** `currentOperator` resolves `HOUSESTEADY_OPERATOR` by short code or display name, and refuses if it matches nothing.

> ### ⚠ The media files are MOVED out of `--export`, not copied
>
> This is long-standing import behaviour — with zips the source is a staging tree that gets deleted anyway — but pointed at a real folder it **empties that folder.** Import from a working copy and keep Drive's original untouched.
>
> **And `renameSync` cannot cross filesystems.** If the export and `HOUSESTEADY_DATA` are on different mounts, the first photograph fails with `EXDEV`. Keep them on one filesystem.

**What a good result looks like.** Measured on the walk manifest:

- **163 media rows** — 157 photo, 4 video, 2 voice
- **529 MB** total: 508 photo, 19 video, 1 voice *(decimal MB — bytes ÷ 1,000,000, the repo's convention throughout)*
- Status **`ok_with_warnings`**, and the warnings below are expected rather than wrong

**Two warnings you should expect and must not treat as failure:**

- **`property.label-mismatch`** — the export names the property from the field app's own label, which will not match whatever you typed for `--property`. Harmless here. **It exists to stop a visit being filed under the wrong house, so read it rather than skipping it.**
- **Unrecognized vocabulary — expect THREE words** on the real export: `pin.flag: fine`, `event.type: VoiceNoteAdded`, `resolution.via: choice`. **Fail open on vocabulary is doctrine.** Reported, counted, never fatal.

> ### ⚠ The repo fixture is a redacted derivative, not a copy — do not size the real export against it
>
> An earlier cut of this line predicted **four** words, adding `event.type: ExportProduced`. **That word exists only in the fixture.** The real export has **271 events and zero occurrences of it**; the fixture has **273 and one**.
>
> **Nearly everything else matches**, which is worse than if nothing did — a fixture that agrees on 163 media rows, every byte figure and every row of the plan table teaches the next reader to trust it, and then differs somewhere unannounced. **Every §4 number below was derived from the fixture. They were all confirmed correct against the real export on 2026-08-09** — but that is a measurement, not a guarantee, and the next figure taken from the fixture needs the same treatment.

**What would be a real failure:** any `error` severity, a `REFUSED` exit, or a media summary showing files `absent` when you supplied them. Absent means the manifest's declared path did not match what is on disk — report the first few paths rather than trying to fix the layout.

---

## 4. Step two — the plan, which is free

```bash
npm run identify -- --visit <visitId>
```

The import prints the visit id; this command needs no key and sends nothing.

**Measured expectation for the full walk — if your numbers differ, say so before running anything:**

| zone | calls | detail photographs | canvas sends |
|---|---:|---:|---:|
| kitchen | 2 | 37 | 2 |
| full bath | 2 | 26 | 4 |
| mudroom w/ washer | 1 | 14 | 2 |
| bedroom | 1 | **0** | 1 |
| entry | 1 | 2 | 1 |
| **mechanical room** | **3** | **54** | **12** |
| front | 1 | 12 | 1 |
| **total** | **11** | **145** | **23** |

Plus **6 excluded by kind** — 2 voice, 4 video. The API takes no video natively, so clips are excluded with a reason rather than silently skipped.

**Two more lines to check, both verified by the 2026-08-08 runner against the fixture:**

- The plan prints **`Class frame v1.0.0: 176 classes, ≈1,527 tokens as a projection`**. That is the whole class list as ids and labels — **the frame itself is 35× larger**, and sending it would put rulings written for a human in front of a model.
- The mechanical room's three calls split **24 / 24 / 6** detail photographs. **`MAX_MEDIA_PER_CALL` is 24 and this is it biting exactly as intended.** It is still a guess; whether that split *costs* anything is unanswerable until a real run.

**The bedroom's zero is correct, not a bug.** A zone with a canvas frame and no detail photographs still gets one call — that is Amendment 10 §B2, and a room that had lost its only frame to a batching rule is exactly what the amendment fixed.

**Canvas sends are sends, not pictures.** The mechanical room holds **four** canvas frames, and they ride **each of its three calls** — 4 × 3 = the twelve in the table. The totals line counts distinct photographs; the table counts what each call carries.

**A cross-check you can do at the folder before spending anything.** The mechanical room's `_zone` holds **55 files — 54 photographs and one video**, and the plan says **54 detail**. The video is excluded by kind, not by folder, so a `.mov` sitting in `_zone` beside the photographs is expected. If `_zone` and the plan differ by more than the videos in it, stop and report.

---

## 4a. Step two and a half — the bedroom, as a test of the pipe

**Added after the first attempt failed entirely in transfer.** Proving a 178 MB move works by moving 178 MB is the expensive way to find out it does not.

**The bedroom is one call carrying one canvas frame, and its zip is ~2 MB.** Bring only that zone, import it, and run:

```bash
npm run identify -- --visit <visitId> --zone bedroom --run --owner-property
```

**One call. It exercises the entire chain** — transfer, checksum, import, queue, the API key, the model, the image encoding, the object write — **for the price of a single request.**

**A canvas-only call runs deliberately.** The code skips a call only when it has *neither* context nor detail, so a room with one canvas frame and no detail photographs is a real call. **Expect a coarse answer and do not judge the pass on it** — §B is explicit that a canvas frame can establish that a thing is there and cannot name a model or read a plate. **This step tests the plumbing, not the model.**

**If this works, everything after it is a question of volume rather than of whether anything works at all.**

---

## 5. Step three — the mechanical room alone

**This is the step that matters most and it should happen before the full walk.** The mechanical room is the one room whose right answer is already known — David has walked it, corrected an earlier read on it, and can grade the output line by line. **Every other room can only be read, not graded.**

```bash
npm run identify -- --visit <visitId> --zone mechanical --run --owner-property
```

**Three calls, 54 detail photographs, 12 canvas sends.**

`--owner-property` is required and the script refuses without it. It is not ceremony: identification sends **the room**, not a data plate, and the AI Processing Decision's identification addendum authorizes that on the owner's own property (§B) while gating a client's property behind a disclosure that does not yet exist (§C). **Nothing in the database records whose house this is, so the acknowledgement is the only thing standing in for §C.** This visit is David's own house, so §B applies.

**`--zone` and `--limit` are different tools.** `--zone` picks *which* room by label or id. `--limit N` bounds *how many* calls drain, in queue order, and cannot say which room. For this step use `--zone`.

**Stop here and report.** Do not proceed to the full walk on your own judgement — the whole point of three steps is that each is cheap to abandon.

---

## 5a. The second run — the mechanical room again, on the strong tier

**This is the run the 2026-08-09 result asked for.** Same room, stronger model, **graded on three specific questions** rather than read.

```bash
npm run identify -- --visit <visitId> --zone mechanical --run --owner-property --tier strong
```

Needs `HOUSESTEADY_MODEL_STRONG` set. It refuses clearly if not, and prints the model before spending. **Three calls, 54 detail photographs, 12 canvas sends** — the same shape as the first run, so the two are comparable.

**Report these three answers first, before anything else:**

| | what to look for |
|---|---|
| **1 · Does the reverse osmosis persist?** | There is **no RO in that room** — the first run invented one. The frame carries `iron-filter`, `sulphur-treatment` and `water-treatment-other`, all closer, all on the menu |
| **2 · Does the Vanée persist?** | First run proposed the same ventilator twice, in one batch, as `hrv-erv` labelled *"Water treatment system"* and as `dehumidifier-whole-home`. A Vanée 100H is an HRV; both labels are wrong |
| **3 · Do the four pressure tanks persist?** | `well-pressure-tank` was proposed **four times** for one tank. If a stronger model still does it, **the ceiling question closes** — raising 24 was never the fix |

**Also worth reporting:** the no-class count (23 last time, 38% of proposals) and the total (60). **A lower total is not automatically better** — it could be better deduplication or it could be a shyer model. Say which, if you can tell.

---

## 6. Step four — the full walk, only after step three is graded

```bash
npm run identify -- --visit <visitId> --run --owner-property
```

Eleven calls. The three mechanical-room calls already ran and will not run twice — queueing is idempotent.

---

## 7. What to capture and send back

**Prose, in the session. No files, no commits.** What the main session needs, in this order:

1. **The plan output, verbatim** — the per-zone table and the totals line. This is the cheapest thing to get exactly right and the easiest to paraphrase into uselessness.
2. **The proposed objects, as printed** — zone, class id, label, evidence count. **Redacted per §0.** The run script prints these grouped by zone at the end.
3. **The count that matched no class.** The script prints it separately. **This is a gap in the frame, not a failure of the object** — it is the single most valuable number in the whole run, because it is what the review queue and the next content pass are built from.
4. **Spend and token counts.** The script prints `visitSpend`. If it says the cost is unknown because no rates are configured, **say that rather than reporting zero.**
5. **Anything that failed.** `Ran N, failed M` — and for any failure, the error text. An `invalid_request_error` mentioning image dimensions is the ceiling case and is worth quoting exactly.
6. **Your own read on `MAX_MEDIA_PER_CALL`.** It is 24 and it is still a guess. The mechanical room splitting into three calls is the first real evidence anyone has about whether that number is right. **Did the split cost anything a reader can see** — did the same object get proposed twice from different batches, did a nameplate land in one batch and its equipment in another?

**On labels specifically:** report the *shape* of what came back, not the contents, wherever the contents are personal. *"Read a pressure-test tag and returned an installer's registration number correctly"* is the finding. The number is not.

---

## 8. What you must not touch

- **No commits, no pushes, no PRs, no branches.** Not even to `/docs`.
- **No edits to tracked files.** If something needs changing to make it run, **stop and report what and why.** The main session makes the change; you re-clone.
- **Nothing under `/data/`** leaves the machine.
- **Do not re-run identification after changing a prompt** and compare the two as though the difference were a finding — prompts are versioned and content-hashed, and a run against an unversioned edit is not comparable to anything. If a prompt looks wrong, report it.
- **Do not ratify anything.** The golden set follows this run and is a human's act. `--run` proposes objects; **none is confirmed and confirming is not yours.**

---

## 9. Notes for whoever reads the result

**Nothing has ever been through this path with real bytes.** The repo's fixture is manifest-only — 163 rows, every file `absent` — so every number in §4 is derived from the manifest's declarations rather than from a completed run. **The import and the plan have been exercised end to end against that fixture; the model call has not been exercised against a photograph at all.**

That is the honest state, and it is why the steps run smallest-first.

**What the 2026-08-08 attempt established, since it is not nothing.** The repo is sound on a fresh clone — typecheck clean, 984 tests passing. The export in Drive is the right one: session `019fb92d`, seven zone zips plus manifest, **528.7 MB against the manifest's declared 529**. And the whole §4 plan table reproduced exactly from the manifest-only fixture, warnings and unrecognized vocabulary included. **Everything up to the moment bytes have to move is verified. Only the moving failed.**

**That session also declined to solve it the wrong way**, and the reasoning is worth keeping: it would not propose relocating the photographs somewhere more reachable. They hold real personal data and this repo is public. **An access restriction is inconvenient; routing around it by moving the images is a different and worse thing.** That judgement stands and binds any future runner.
