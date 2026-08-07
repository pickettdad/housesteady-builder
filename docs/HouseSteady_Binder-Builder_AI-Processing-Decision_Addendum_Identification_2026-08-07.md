# AI Processing & Data Handling Decision — Addendum: the identification pass

**Date:** 2026-08-07
**Amends:** `AI Processing & Data Handling Decision` (2026-07-27, ratified 2026-07-30). Everything in it stands.
**Cause:** Builder Code asked whether an identification run is covered before sending photographs, rather than after. **It is not covered — §2 authorizes five tasks and identification is not among them.** Asking first is the whole of `CLAUDE.md` §14 and it is the right instinct.
**Status:** decision record. **Ratified by the owner 2026-08-06 in the form below except §D2, which is new on 2026-08-07 and needs its own ratification.**
**This replaces the 2026-08-06 cut, authored whole per rule 14.** One clause changed — §D previously read *nothing is authorized for video or audio*, and Amendment 10 §C sequences video into the pass. **The superseded sentence is quoted in §D2 rather than deleted.**
**Ratification is not authorization to run** — §C carries a condition that falls due before any client property.

---

## A. What is actually sent, and it is the most sensitive thing this system does

**Increment 5 §3 batches by room.** One call per zone carries **every still image resolving to that zone**, plus the zone's label and type and the property flags.

| | |
|---|---|
| What leaves the machine | **The photographic interior of a house, room by room** — 157 images across 8 zones on the reference walk |
| Metadata | **Stripped before transmission**, as §2.1 requires and a scan enforces |
| What does not leave | Video, audio, notes, the manifest, the binder |
| Sensitivity | **Moderate — the same class as §2.3's loose-photo routing.** *This is the inside of someone's house* |

**It is a larger send than anything §2 contemplated.** Nameplate extraction sends a data plate. Routing sends loose room photographs. **Identification sends the room.** The difference is volume and completeness rather than kind, and it is enough that it needs naming rather than inheriting.

---

## B. Authorized now, on the owner's own property

**The walk export is photographs of the owner's own house.** The original decision names this state exactly: *today those are photographs of the owner's own equipment; the first time it runs in anger it will send photographs of a client's home, and by our own rules that needs a written decision first.*

**§2.3's condition is a client disclosure, and there is no client here.** The interest the condition protects does not exist on the owner's own property, so the run proceeds.

**Two obligations that do not wait:**

1. **Metadata stripped, per §2.1**, verified by the existing scan rather than assumed.
2. **§2.6 stands unchanged.** No assembled binder, no concern history, no client record, no cross-client data. **Raw inputs only, and only the still images.**

---

## C. Client property requires the same condition as §2.3, and this is that condition

**Identification on a client's property proceeds only once §3's client disclosure is in place** — the same gate, for the same reason, because it is the same photographs of the same kind of room.

**The disclosure sentence needs one addition.** §3's substance is *photographs taken during the visit may be processed by an AI service to read equipment labels and help file them.* **Identification is neither reading a label nor filing** — it is asking a model what the things in a room are. **The sentence must say so**, and the wording is a Scope matter through the lawyer pass.

**And the opt-out must stay real.** §3 requires confirming an opt-out is honourable before offering it. **Identification is the engine's front door**, so a client who declines it gets a manually identified inventory rather than none — slower, not absent. **Confirm that is true before the sentence is written.**

---

## D. Three things this does not authorize

**The research pass is separate and it is a different act.** It sends **text** — a model name, a serial, a class — and returns intervals, lifespans and part identities. **No photograph leaves the machine for it.** Covered by §2's *5+ Binder* row and unchanged here.

**Transcription's separate authorization under §5 is untouched**, and its §5.4 obligations still fall due before the first real client recording. **A video's audio track is a voice note in a different wrapper and is covered by §5 as it stands.**

### D2 · Video frames — authorized on the same terms as photographs, and new on 2026-08-07

**The superseded clause, quoted because the change should be legible from inside the document:** *Nothing is authorized for video or audio. §3's identification consumes still images only.*

**Amendment 10 §C sequences video into the pass**, and the reason is structural rather than about quality: *a still is a member of a set, a frame is a member of a sequence, and following a pipe needs the sequence.*

**Extracted frames of a room are the same act and the same sensitivity as photographs of that room.** Same interior, same house, same third party. **So they carry §B's authorization on the owner's own property and §C's condition on a client's, without exception and without a separate gate.**

**Three limits, and the third is the one that could go wrong quietly:**

1. **Frames from the walk's own video only** — nothing is authorized that a concierge did not record.
2. **Metadata stripped, per §2.1**, exactly as for photographs.
3. **Extraction rate is a cost decision with a privacy consequence.** Amendment 10 §C1 measures a two-minute pan at one frame per second as **more image tokens than the entire mechanical room.** **Dense extraction sends far more of a house than anyone intends**, so §C's step 3 is triggered rather than routine — and that sequencing is a disclosure matter as much as a budget one.

**§E's review triggers apply unchanged: any change to what the identification call carries returns here.**

**And §2.5 remains the only item here that cannot be deferred.** The retention and training terms of the API account **established in writing before the first real client import.** Nine days open. **A run on the owner's own house does not start that clock and does not stop it.**

---

## E. Review triggers, extended

The original five stand — a second operator · document extraction · a client portal · a change to §2.5's terms · the lawyer pass. **Add: any change to what the identification call carries.** Sending video, sending notes, sending more than one zone in a call, or sending anything the concierge did not photograph, is a different act and returns here.

---

**Status:** addendum. **§B authorizes the owner's own property. §C gates client property behind the disclosure that does not yet exist.**
