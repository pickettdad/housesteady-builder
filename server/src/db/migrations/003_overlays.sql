-- HouseSteady binder builder — migration 003
--
-- The overlay layer: every change the desk makes to what the field captured.
--
-- ONE TABLE, NOT SEVERAL. Increment 2a's build spec §4 replaces the two tables
-- Increment 1 sketched (`verifications`, `field_fixes`) with a single `overlays`,
-- because current state is "latest wins across all overlay kinds for an entity"
-- and that query is awkward to write across tables. Four acts that all answer
-- "what does the desk now say about this thing" belong in one place.
--
-- Note for the record: those two tables were specced in Increment 1 but never
-- actually created — 001 and 002 contain neither. The DROPs below are therefore
-- no-ops here and exist so that any database which DID get them (a branch, a
-- machine that ran an intermediate build) converges on the same shape. Nothing
-- is lost either way: both were empty by definition, since no code ever wrote to
-- them.
DROP TABLE IF EXISTS verifications;
DROP TABLE IF EXISTS field_fixes;

-- ------------------------------------------------------------------ overlays
--
-- Doctrine this table exists to make structural rather than remembered:
--
--   CLAUDE.md §4.1 — the manifest is immutable evidence. Every captured table
--   in 001 is insert-only. A desk correction does not UPDATE a pin; it writes a
--   row here that points at the pin. Provenance is a property of storage.
--
--   §4.2 — honesty labels survive. Nothing here can promote an inference to an
--   observation, because a `correct` overlay records BOTH values and the origin
--   of the original is untouched in its own table.
--
--   Spec §3 — the four acts are never collapsed into one "verified" flag.
--   confirm, correct, assign and flag are distinct kinds and stay distinct.
--
-- WHAT A CONFIRM CLAIMS (spec §2): "the record matches the evidence". Narrowly:
-- the characters read what the field says they read. NEVER condition, adequacy,
-- age, safety or completeness. That is why there is no result, grade, severity
-- or score column, and why the write path refuses a `field` naming one.
CREATE TABLE overlays (
  id             TEXT PRIMARY KEY,
  property_id    TEXT NOT NULL REFERENCES properties(id),
  visit_id       TEXT NOT NULL REFERENCES visits(id),

  -- Decision order within the visit, 1-based, assigned at insert.
  --
  -- Not in the spec's column list, and needed anyway: "latest wins" is
  -- undefined without it. created_at has millisecond resolution and the pass is
  -- explicitly keyboard-driven — `c` then `f` on two different entities lands
  -- inside one millisecond routinely — so timestamps tie, and a uuid tiebreak
  -- would order decisions at random. This column is the only thing that makes
  -- "the latest act is the standing decision" a fact rather than a coin flip.
  --
  -- Per-visit rather than global: a pass is a self-contained sitting, and the
  -- number is then also readable as "the 14th decision of this pass".
  seq            INTEGER NOT NULL,

  -- Open vocabulary, exactly like every captured vocabulary column in 001, and
  -- for the same reason: 2b adds transcription, v4 adds concerns, and neither
  -- should need a migration to record a decision. Today's kinds are
  --   confirm | correct | assign | flag | memory | undo
  -- and an unrecognized one is preserved and displayed, never refused.
  kind           TEXT NOT NULL,

  -- pin | media | zone | resolution | note | inbox_ref — also open.
  -- target_id is the FIELD-MINTED UUID, never a rowid and never the session
  -- -scoped pin number. That uuid is the identity that carries across visits
  -- (CLAUDE.md §7), so an overlay written today still points at the right thing
  -- after five more visits have been imported.
  target_kind    TEXT NOT NULL,
  target_id      TEXT NOT NULL,

  -- Which attribute a `correct` changed. Null for the other kinds.
  field          TEXT,

  -- The prior value is stored, not merely replaced. "was freeform *receptacle*,
  -- corrected to component *junction-box* at the desk" is the sentence this
  -- column makes possible, and without it a correction is indistinguishable
  -- from the field having got it right the first time.
  prior_value    TEXT,           -- JSON
  new_value      TEXT,           -- JSON
  reason         TEXT,

  -- Set by undo AND by re-decisions. An overlay with nothing pointing at it is
  -- live; one that is superseded is history. Undo is therefore a new row, never
  -- a DELETE, and the trail reads honestly: assigned, unassigned, reassigned.
  supersedes_id  TEXT REFERENCES overlays(id),

  actor          TEXT NOT NULL,
  actor_context  TEXT NOT NULL,  -- 'desk' in 2a. 'field' never writes here.
  created_at     TEXT NOT NULL
);

CREATE INDEX idx_overlays_visit ON overlays(visit_id);
CREATE UNIQUE INDEX idx_overlays_seq ON overlays(visit_id, seq);
CREATE INDEX idx_overlays_target ON overlays(visit_id, target_kind, target_id);
CREATE INDEX idx_overlays_kind ON overlays(visit_id, kind);

-- An overlay may be superseded at most once. This is what makes "live" a
-- well-defined property rather than a guess: the supersession chain is a chain,
-- not a tree, so there is never a question of which of two undos won. A second
-- undo of the same row is refused with a message saying it is already undone.
CREATE UNIQUE INDEX idx_overlays_supersedes ON overlays(supersedes_id)
  WHERE supersedes_id IS NOT NULL;
