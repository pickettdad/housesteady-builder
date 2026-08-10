# /prompts — versioned prompt config

Each task is a directory; each version is `vNNN.md` inside it. **Identity comes from the
path** — the directory names the task, the filename names the version, and nothing is
declared inside the file, so the two can never disagree. The hash is of the whole file's
bytes, so even a whitespace edit produces a version the golden set has not been approved
against.

| Task | What it does | Tier |
|---|---|---|
| `identify_objects` | **What things are in this room?** One call per room, Increment 5 §3. | fast |
| `nameplate_classify` | Is this photograph a data plate? Gates extraction. | fast |
| `nameplate_extract` | Make · model · serial · capacity · install date, each independently `unknown`. | fast |
| `photo_routing` | Does this room photograph belong to a pin in that room? Usually not. | fast |
| `pin_type` | Which of the config's component types is this untyped pin? | fast |
| `house-style` | **Not a task — an input to every drafting task.** The writing standard for everything a client reads. | — |

**`identify_objects` is the largest send this system makes**, and its per-call data
block is correspondingly the biggest: the class projection (176 ids and labels),
the room's label and type, the property flags, and one line per photograph naming
its id and any note the concierge wrote at capture. **All of that is per-call data
and none of it is in the prompt file** — see the rule below, which this task tests
harder than any other.

**`house-style/v001.md` is House Style v1.1**, and the two numbers are different things
on purpose. The directory's `vNNN` is a **sequence**, because this loader's rule is that
versions must sort and a document version like `1.10` would sort before `1.9`. The
document's own version is assigned by the design session and lives in its status line.
Recorded here so the correspondence is answerable without opening the file:

| Prompt version | Document version | Date |
|---|---|---|
| `house-style/v001.md` | House Style **v1.1** | 2026-07-27 |

**It is a prompt input rather than a prompt**, which is the reason it sits at the top of
its own directory with no task beside it. Its §11 requires exactly what this directory
provides: *"a change to it is a change to the voice of every binder produced afterwards —
so it runs against the golden set before it ships."* Nothing calls it alone; every
drafting prompt is written against it, and the lint in the render path enforces the part
of it that is checkable.

**Wording lives here; per-call data does not.** The candidate pins for a room and the
component types for an import are sent as their own block beside the prompt, never
templated into it — a hash that changed on every call would identify nothing.

## The rules, which are not negotiable

**A prompt is a config file, not a string in the code.** Every prompt lives here as a
file with an `id`, a `version`, and a content hash. **No model call may ever use an
inline prompt string.** If you find yourself typing prompt text into a `.ts` file, stop —
that is the failure this directory exists to prevent.

**Every artifact records which prompt version produced it.** The `ai_generations` table
carries `prompt_id`, `prompt_version`, and `prompt_hash` on every row. This is what makes
"why does this binder read differently from that one" an answerable question rather than a
shrug.

**Changing a prompt means changing its version.** Prompts are append-only in the same
sense the manifest is: you cut a new version, you do not silently edit the old one.
Artifacts produced by v1 must remain traceable to v1's exact text.

**A golden set gates prompt changes.** Before a prompt change ships, it runs against a
fixed collection of real inputs with approved outputs, and the differences are reviewed.
Without this, a prompt edit silently changes the voice of every binder produced afterwards
and nobody notices for months. Built in 2b, ahead of the plan, because it costs almost
nothing to maintain and everything to retrofit: `/fixtures/nameplates` and
`npm run golden`. Only ratified expectations gate; an unratified difference summons
somebody to look at it.

**Abstention is a success, not an error.** Every prompt here must say, in plain words,
that declining is a complete answer — `unknown` for a field, an empty candidate list for a
ranked one. `abstained = 1` is a valid outcome. A wrong serial number is worse than a
blank one, and a photograph filed against the wrong pin is worse than one left in the
room: the blank gets chased, and the wrong one gets believed.

**Declining is not the same as saying nothing.** CLAUDE.md §9 — never summon a human to a
blank space. The record abstains; the prompt does not. Every one of these asks for what
the model *could* see beside the value it would not commit to, and that evidence is shown
next to the photograph rather than stored as a reading. The twin rule matters as much:
uncertainty is reported only where uncertainty exists, or a hedge beside a confident value
teaches people to distrust the confident ones.

## Why this discipline

The field app renders its inspection process as versioned, content-hashed config. This is
the same discipline one level up. At one concierge the binder's voice is whatever the
concierge's voice is that day; at five, without this, clients receive documents that read
like different companies. The house style lives in these files, not in anyone's head.

See `/docs/HouseSteady_Binder-Builder_AI-Assist-Plan_v1-1_2026-07-31.md` for the full plan
and `CLAUDE.md` §7 for the governing doctrine.

## Drafting a new version

**`currentPrompt` returns the LAST version in a task directory.** So a file added
here is live on the next model call — no review, no ruling, no signal. That is a
defect in a system where everything else about a prompt is versioned and
content-hashed, and it is worked around rather than fixed.

**Draft into `<task>/drafts/`.** `loadPrompts` reads `*.md` only at the task
directory level and does not recurse, so a draft there is invisible to it.

```
prompts/identify_objects/v001.md          <- live
prompts/identify_objects/drafts/v002.md   <- invisible to the loader
```

⚠ **A top-level `prompts/drafts/` is NOT safe.** Every directory at this level is
read as a task, so it would be loaded and would refuse on the first file not
named `vNNN.md`.

**Going live is a deliberate act.** `doctrine.test.ts` pins the live version of
every task; moving a draft up fails that test until the pin is updated in the
same commit. **It cannot check that a version was ruled on — nothing can — but
it makes shipping one something a person did rather than something that
happened.**
