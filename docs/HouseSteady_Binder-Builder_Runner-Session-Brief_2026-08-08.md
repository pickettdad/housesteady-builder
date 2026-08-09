# Brief for the runner session — identification against the walk photographs

**Date:** 2026-08-08 · **Record of an event. This date never moves.**
**Written by:** Builder Code (the main session), for a second, bounded Builder session with Google Drive enabled.
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

**Two variables are mandatory.** Neither has a default and nothing runs without both.

| Variable | Value | Why |
|---|---|---|
| `ANTHROPIC_API_KEY` | David supplies it | No key, no calls |
| `HOUSESTEADY_MODEL_FAST` | a current fast model id | **Identification runs on the fast tier.** There is no default — an unset model is a refusal, not a fallback |

**Three more are strongly recommended, and the reason is not tidiness.**

| Variable | Suggested | Why |
|---|---|---|
| `HOUSESTEADY_FAST_INPUT_PER_MTOK` | the model's real input rate | ⚠ **The spend cap is inert without this.** See below |
| `HOUSESTEADY_FAST_OUTPUT_PER_MTOK` | the model's real output rate | Same |
| `HOUSESTEADY_OPERATOR` | `"Runner session"` or similar | Recorded against the import and every generation |

> ### ⚠ The spend cap does not work unless rates are set
>
> `HOUSESTEADY_VISIT_SPEND_CAP` defaults to **$5 per visit** and is checked before every call. **But the check is on dollars, and dollars are computed from the rates above — which default to zero.** With no rates configured, every call costs $0.00, the running total never reaches the cap, and **the cap never fires.**
>
> This is deliberate elsewhere in the code: an unmeasured cost and a zero cost are different facts, and the run script prints "the cost is unknown rather than zero" instead of a confident $0.00. **But it means a cap set without rates is decoration.** Set the rates, or treat `--zone` and `--limit` as your only real bound.

**Optional, and leave it alone on the first run:** `HOUSESTEADY_FAST_MAX_IMAGE_EDGE` defaults to 1568. Raising it makes nameplates more legible and costs more tokens. Over twenty images per call the code caps the edge at 2000 regardless, so raising it can no longer break a call — but the first run should measure the default before changing it.

**`HOUSESTEADY_DATA`** defaults to `<repo>/data`, which is gitignored. Leave it unless you need the database on a different disk — and if you do move it, keep it on the **same filesystem** as the export (see §3).

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
- **Unrecognized vocabulary** — the walk manifest uses four words this builder has not met (`pin.flag: fine`, `event.type: VoiceNoteAdded`, `event.type: ExportProduced`, `resolution.via: choice`). **Fail open on vocabulary is doctrine.** Reported, counted, never fatal.

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

**The bedroom's zero is correct, not a bug.** A zone with a canvas frame and no detail photographs still gets one call — that is Amendment 10 §B2, and a room that had lost its only frame to a batching rule is exactly what the amendment fixed.

**Canvas sends are sends, not pictures.** The mechanical room holds **four** canvas frames, and they ride **each of its three calls** — 4 × 3 = the twelve in the table. The totals line counts distinct photographs; the table counts what each call carries.

**A cross-check you can do at the folder before spending anything.** The mechanical room's `_zone` holds **55 files — 54 photographs and one video**, and the plan says **54 detail**. The video is excluded by kind, not by folder, so a `.mov` sitting in `_zone` beside the photographs is expected. If `_zone` and the plan differ by more than the videos in it, stop and report.

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

That is the honest state, and it is why step three exists.
