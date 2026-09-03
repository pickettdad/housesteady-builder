# Which captures actually solve a room — the first real export, measured

**2026-09-01 · Builder Code · session `01a0534d`, mechanical room.** Report, not a build.

⛑ **Two of the four runs completed. The other two hit a session limit and did not run.** Runs A
(everything) and B (no mesh) finished; C (no traverse) and D (one room shot) died, as did all three
water-line agents. **Everything below is either from those two runs or measured directly from the
manifest, and each claim says which.** Nothing here is inferred from a run that did not happen.

The photographs and the export live in `/data/walk-01a0534d/` and stay there — CLAUDE.md §14.

---

## 0 · The room is not the size the brief said, and the difference is the finding

*Measured from the manifest.*

| | brief | measured |
|---|---|---|
| media in the mechanical room | 327 | **441** |
| owner | "`owner.kind` is zone on all 327" | 327 zone-owned **and 114 pin-owned** |
| container photographs | "21 bundles of 1–7" | ✓ 21 pins, **62 evidence frames** among 114 rows |

⚑ **The container → photograph join is GIVEN, not inferred.** Baseline Service Design §4.1a-ii
promised *"`mediaIds` becomes given rather than worked out"* and this export delivers it. The brief's
"you get 21 bundles and have to work out what each one is" is right about the *naming* and wrong
about the *join* — nothing had to be matched.

⚑ **`frame.role` ships, and it is the evidence/insurance marking §4.1a-i demanded.** House-wide:
**140 primary · 323 evidence · 78 insurance.** In this room, 80 real captures produced 140 non-pan
rows — **60 of them insurance siblings**, identical `capturedAt` to the millisecond.

**So the room's photograph count is 80 captures, not 426 files.** Everything below counts captures.

---

## 1 · What each instrument did — two runs, and they agree

*From runs A and B. Both were told that "I looked at it and it changed nothing" was the most valuable
sentence they could write, and both wrote it about the same instruments.*

| instrument | run A · everything | run B · no mesh |
|---|---|---|
| **container photographs** (62 evidence frames) | **carried the entire job** | **carried the entire job** |
| **room shots** (3 captures) | changed 2 answers | changed 2 answers |
| **loose zone photographs** (5, see §4) | changed 2 answers | changed 2 answers |
| **floorplan** | ⛑ **changed nothing** | ⛑ **changed nothing** |
| **mesh** | ⛑ **changed nothing** | withheld — named what it would have cost |
| **traverse** (48 of 301 frames sampled) | "barely" — 1 placement | ⛑ **changed no identification** |
| **voice notes** | unreadable | unreadable |

**Both runs named all 21 containers.** Across the two: **36 `read` · 5 `recognised` · 1 `guessed`.**
Both placed 21 of 21.

### The two that carried the room

**Container photographs.** Run B: *"Every manufacturer, model and serial in this report was read off
a plate in these frames and nowhere else."* ClimateMaster `TTV049BGC01ARKS` / `Q13734509`,
vänEE 100H, GSW `G9-50SDE-30 250`, John Wood `JW80SDE145`, WellMate `UT-450 CE`, Burcam `600545B`,
Stenner `45MHP2`, Liberty `P382LE41`, AXIOM `DMF150`, and all three Waterite plates.

**Room shots and loose photographs — and this is the result that surprised me.** Both runs
independently cited **`room-shot-3`** as what let them *count* the water-treatment vessels as exactly
three, and both cited **`loose-05`** — a Water Depot *DELUXE SERIES OWNER'S MANUAL FOR ALL DELUXE
WATER SOFTENERS*, photographed hanging in the room — as the only evidence anywhere that a softener
rather than three filters is present. ⚑ **Neither of those facts is in any container frame.**

I looked at room shots 1 and 3 myself: **they show different halves of the room.** So "extra room
shots" is a misnomer for this walk — they are not redundant, they are different content. ⛑ **And run
D, which would have tested that, did not run.** *Also worth stating plainly: there are 6 room-shot
rows but only 3 captures — the other 3 are insurance siblings — so run D would have removed 2
captures, not 5.*

### The two that did nothing

**The floorplan.** Both runs read it in full; both report it changed no answer. Its three
`roomPlanObjects` are a **table**, a **storage** unit and a medium-confidence **washerDryer** — in a
mechanical room with 21 containers, and none of them matches anything any container frame shows.

⛑ **And it does not register with the container coordinates**, which both runs found independently.
Wall polygon x −1.94..3.62, z −3.42..0.79; container cluster x −2.79..1.27, z −5.43..−1.90. Run B:
*"the mismatch is larger than the ~1 m of drift the brief warns about, so I treated the floorplan as
unusable for anchoring rather than quietly stretching one frame onto the other."*

**The mesh.** 262,642 faces, 23 pieces, 7.8 KB of summary — and run A, which had it, says
*"I looked at it and it changed nothing... It earned no part of this answer."* Its `walkedExtent`
(x −1.23..3.60) excludes seven containers. Run B, which did not have it, named exactly one thing its
absence cost: **whether containers 36 and 37 are one vessel or two.** That is a real cost and it is
one question.

---

## 2 · The traverse — and the reason is geometric, not a matter of taste

*Measured from the manifest, independent of any run.*

⚑ **The 12 legs were not walked. They were panned from two standing positions.**

Every leg carries exactly two positioned frames, and in **all twelve** they are ≤ 0.20 m apart.
Across the whole traverse there are two camera points: **(−4.06, −1.45)** for legs 1–10 and
**(−3.77, +0.05)** for legs 11–12.

⛑ **So the leg endpoints do not span anything, and `continuesFrom` chains a sequence of pivots
rather than a route.** The brief's hope — *"leg endpoints carry world anchors... whether that
recovers the real route is the single most interesting thing this export can tell us"* — is
answered, and the answer is no. **Not because the mechanism failed, but because the capture was a
pan.** The chains are also four, not one: `02:10:22→02:11:00`, `02:11:29` alone,
`02:12:19→…→02:15:13` (seven legs), `02:15:49→02:16:40`.

**What the traverse cost:**

| | files | MB | image tokens |
|---|---:|---:|---:|
| container evidence frames | 62 | 151 | 98,642 |
| loose zone photographs | 17 | 17 | 27,047 |
| room shots (captures) | 3 | 5 | 4,773 |
| **the evidence set** | **82** | **173** | **130,462** |
| **traverse** | **301** | **857** | **478,891** |
| insurance siblings | 55 | 111 | 87,505 |

⚑ **The traverse is 3.7× the entire evidence set of this room, in tokens, and 5× it in bytes.** For
one placement fact in run A and none in run B.

⛑ **What I cannot judge, and it is the half most likely to matter.** Twelve voice notes, one bound
per leg by `captureId`. **No transcription is available in this container**, so neither run could
hear them. §4.1b says the narration *is* the topology — *"it says what connects to what, which is
precisely the thing no photograph can produce."* **Both runs listed the vessel identities and the
poly tank's purpose as unresolved, and both said the voice notes are where a concierge would have
said it.** So the honest verdict is: **the traverse's frames and geometry did not earn 857 MB; its
narration has never been read by anybody and cannot be judged from this exercise.**

---

## 3 · The three water-treatment vessels

*Both runs, independently, reached the same answer.*

**Containers 35, 36 and 39 are the three vessels. Container 37 is not a fourth** — its single frame
is the *same physical plate* as 36's, same handwriting, same serial. **Container 38 is a wide
overview** of all three.

Each chrome mineral tank carries a top-mounted **Water Depot PLATINUM** digital valve, and each
valve body carries a small white label with `MODEL` and `S/N` printed and the values written in
marker, with **WATERITE INC** printed at the bottom:

| container | MODEL (handwritten) | S/N |
|---|---|---|
| 35 | *not confidently legible* — best characters `…0S0 35` over `BF5C7`/`BFSC7` | 1557758 |
| 36 (= 37) | `FZ110` over `1054PB` | 155543 |
| 39 | `WDBT` over `PC1`/`PCI` | 153713 |

**Three distinct serials, so three distinct vessels.**

⚑ **On the two-company question — Waterite on the plate, Water Depot on the head — both runs read it
as one object with two names, manufacturer and dealer, and both drew the line in the right place.**
Run B: *"the READING (both names sit on the same valve body, on the same vessel, and there is one
vessel under them) is evidence. The INTERPRETATION of which company is which... is my inference from
where each name sits, and I have not verified any corporate relationship from any source in this
run."*

⛑ **Where they are guessing, and both refused to.** **Which of the three is the softener is not
determined.** Salt, a brine tank and a softener manual establish that at least one softener is
present; nothing establishes which vessel. Container 35 is the pin at which the brine tank appears —
run B called that *"an adjacency argument from a photograph"* and declined to write it down.

**That is the adjacency trap the brief planted, met and refused.** Not by an instrument — by the
discipline of separating read from recognised from guessed.

---

## 4 · Three defects found on the way, one of them mine

⛑ **Mine.** My run scaffolding filed the 12 leg voice notes as `loose-06.jpg` … `loose-17.jpg`. They
are m4a audio under a `.jpg` extension, and **both runs caught it and said so.** So "17 loose
photographs" was 5 photographs and 12 mislabelled audio files. The instrument table above says 5.

⚑ **`totals.photos` is not a photograph count and the builder's warning is misleading.** The import
reports *"totals.photos says 140 but the file actually contains 529"*. 140 matches neither the
photo-kind rows (529), nor those minus the traverse (228), nor the distinct non-pan capture instants
(128). **The check is technically true and substantively wrong, and it is the loudest thing on the
report.**

⚑ **`totals.geometry: 6` and `totals.videos: 0` are declared and never compared** — audit finding 7
from the twelve, arriving live on the first export that has a `geometry` total.

---

## 5 · What the importer does with this export today

*Measured by running `runImport` against the real manifest.*

**It accepts it: `ok_with_warnings`, 0 errors, 548 media stored.** The v3 adapter takes the v3.1-shaped
export without complaint. Two guards fire correctly:

- ⚑ **`media.kind = "geometry"` ×6** — the word the Capture-Kind Contract Note proposed, surfaced by
  the vocabulary check. PR #123/#124 are live and correct on their first contact with a real export.
- **`media.intent = "pan"` ×301** — correct, and **56% of the file flagged as unmet vocabulary**.
  The binder knows `traverse`; the field ships `pan`. A one-word addition; the manifest string is the
  field's to name and the binder should simply know both.

⛑ **And it drops `frame` and `position` entirely.** The `media` table has no column for either.
**77 world positions and the whole evidence/insurance marking are discarded at import** — which
means every placement answer in §1, and the 60 insurance frames the planner would pay to send twice,
rest on data that does not survive the front door.

**What the built pipeline would do with this room right now:** 18 identification calls, **420
photographs**, 108 room-shot context frames — **301 of them traverse frames treated as ordinary
detail photographs**, because `pan` is not one of the intents the planner acts on.
**~697,000 image tokens where the evidence set is ~130,000.**

---

## 6 · Which instruments earned their place

**On the evidence of two runs and the manifest:**

| | verdict |
|---|---|
| **Container photographs** | ⚑ **Earned it outright.** Every plate, every serial, and the join for free. |
| **Room shots** | ⚑ **Earned it, and more than expected.** Two facts no container frame carries — the vessel count and the softener manual. Three captures, 5 MB. |
| **Positions** | ⚑ **Earned it, and nobody put it on the list.** All 21 containers positioned; both runs placed 21 of 21 and neither could have without it. |
| **Floorplan** | ⛑ **Did not.** Identified nothing, placed nothing, and does not register. |
| **Mesh** | ⛑ **Did not — on this room.** One question it would have settled; 262,642 faces for it. |
| **Traverse** | ⛑ **Its frames and geometry did not.** 857 MB, 3.7× the evidence set, one placement fact. **Its narration is unjudged and may be the whole of its value.** |

**What I would not spend the capture time on again, on this evidence:** the mesh, and the traverse
*as 301 frames*. **What I would not cut:** the room shots, which the brief offered as the cuttable
one.

⛑ **Two cautions on that, stated because the brief asked for the comparison and I have half of it.**
Run C would have tested the traverse by removing it, and run D would have tested the room shots.
Neither ran. The traverse verdict rests on two runs that *had* it and reported it changed nothing,
plus a geometric measurement that stands alone; the room-shot verdict rests on both runs citing them
and on my own read of two frames showing different halves of the room. **Those are the strongest
forms available without the missing runs, and they are not the same as the missing runs.**

---

## 7 · What would change the answer

1. **Transcribe the 13 voice notes.** Cheap, and it is the one instrument nobody has read. It would
   settle which vessel is the softener, what the unlabelled poly tank is for, and what the Stenner
   injects — all three of which both runs left open.
2. **Run C and D.** Two agents, and they close the comparison the brief asked for.
3. **Ask Mac Field whether the traverse was meant to be walked.** If the legs are supposed to move
   and did not, the instrument has not been tested. If a pan is what a traverse is, the geometry
   question is settled and 857 MB buys corroboration.
