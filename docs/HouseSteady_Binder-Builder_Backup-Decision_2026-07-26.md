# Binder Builder — Backup & Data Durability Decision

**Date:** 2026-07-26
**Status:** decision record. Satisfies `CLAUDE.md` §14 (nothing goes to a third-party service without an explicit decision recorded in `/docs`) and Design v1 §8 (local-first depends on disciplined backup).
**Scope:** the builder's runtime data on the owner's machine. Supersedes nothing.

---

## 1. What is actually at risk

`/data` holds two things with very different recoverability:

**Recoverable in principle** — the imported manifests and their media. If the original export files are archived elsewhere, a lost import can be re-imported.

**Not recoverable at all** — everything the builder itself creates: verifications, field fixes, slot bindings, drafts, signatures, gap-report edits, rendered editions, and (from Increment 5) the entire concern register with its lifecycle and resolution history. **None of this exists anywhere else.** The field app cannot reproduce it, the client does not hold it, and it accumulates value continuously — a three-year concern history is the single most valuable artifact the business will own.

The realistic failure is not dramatic. It is a disk failure, a spilled drink, a theft, or an accidental delete on a tired evening.

## 2. Decisions

**2.1 · Archive the raw exports separately from the builder.** Every field export (manifest plus media zips) is kept in its own archive location, independent of `/data`. This is the evidence layer; it makes the recoverable half genuinely recoverable and it is the cheapest insurance available.

**2.2 · Automated local backup.** The machine's own backup facility (Time Machine or equivalent) covers `/data` continuously. This handles the common case — accidental deletion, a corrupt file, a bad migration — and requires no discipline once configured.

**2.3 · One offsite copy, encrypted before it leaves the machine.** A local backup does not survive fire, flood, or theft. An offsite copy is required. **Because `/data` contains client addresses, interior photographs, and documents, it is encrypted locally before upload, with the key held outside the backup service.** The service therefore holds ciphertext it cannot read.

**This is the explicit third-party decision `CLAUDE.md` §14 requires.** It is narrowly scoped: encrypted-at-rest storage of backup archives only. It does **not** authorize hosting the application, sending client data to any processing service, or any transfer of readable client data to a third party. Those remain separate decisions requiring their own records.

**2.4 · Restore testing, quarterly.** A backup nobody has restored from is not a backup. Restore to a scratch location, open the database, confirm an import's media resolve. Record the date the test passed. **A restore that has never been attempted should be assumed not to work.**

**2.5 · Before real client data enters.** Sections 2.1–2.3 must be operating before the first real household's export is imported. Test-house data gets the same treatment — that rule is already in `CLAUDE.md` §14 and this record does not soften it.

## 3. Deliberately not decided here

- **Hosting.** Unchanged: Design v1 §8's triggers are a second operator, client-portal delivery, or backup risk becoming unacceptable. This record removes the third trigger; the other two stand.
- **Retention.** How long records are kept after a client leaves, and what a departing client is entitled to take, is a Scope and lawyer-pass matter, not a backup matter.
- **Client-facing durability claims.** Nothing here may be represented to a client as a guarantee. It is operating discipline, not a promise.

## 4. Review

Revisit when a second operator joins, when a client portal is built, or when `/data` exceeds what the chosen offsite arrangement handles comfortably. At roughly 1.5–2 GB per baseline visit and more once video capture is routine, that last one arrives sooner than it looks.

---

**Status:** decided. Implement 2.1–2.3 before the first real import; first restore test one quarter after.
