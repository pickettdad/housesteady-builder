-- Closing the actor gaps, and fixing the guard that let them open.
--
-- WHAT WENT WRONG. Increment 2c's rule is that every attributed table records
-- which operator acted, enforced by a `trg_<table>_actor` trigger. `objects`
-- shipped in Increment 5 §2 with neither the column nor the trigger, and nothing
-- objected — because the guard iterates a HAND-KEPT list of table names in the
-- test file, and a table nobody adds to that list is a table the rule does not
-- reach.
--
-- **That is the fourth time in this repo a hand-maintained restatement of
-- something the data already knows has drifted from it**, after the status
-- block, the `_replaceWholesale` count and the worked-class merge. The list is
-- being derived rather than kept, in the same change as this migration — a
-- migration alone would fix the instance and leave the class untouched, which is
-- rule 5.
--
-- THE DERIVED GUARD FOUND TWO MORE ON ITS FIRST RUN. `report_row_edits` and
-- `client_names` both carry `actor_id` and neither had a trigger, so the column
-- was documentation rather than enforcement and an unattributed insert would
-- have succeeded. Neither was in the hand-kept list either. They are closed
-- below — **found by the check rather than by a person, which is the whole
-- argument for deriving it.**
--
-- ZERO ROWS EXIST in `objects`, so its change is a plain rebuild rather than a backfill. Recorded
-- because it will not be true next time: once a real house is identified, adding
-- a required column here needs a decision about what the existing rows say, and
-- `unknown` is not available for an actor.

PRAGMA foreign_keys = OFF;

CREATE TABLE objects_rebuild (
  id            TEXT PRIMARY KEY,
  property_id   TEXT NOT NULL REFERENCES properties(id),
  zone_id       TEXT NOT NULL,
  import_id     TEXT REFERENCES imports(id),
  class_id      TEXT,
  label         TEXT NOT NULL,
  confirmed_by  TEXT REFERENCES operators(id),
  confirmed_at  TEXT,

  -- Who created the row, which is a different question from who confirmed it.
  -- **The desk pass proposes and a concierge confirms**, and on a proposal the
  -- second is still null while the first never is.
  actor_id      TEXT NOT NULL REFERENCES operators(id),

  created_at    TEXT NOT NULL,
  CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL))
);

INSERT INTO objects_rebuild (id, property_id, zone_id, import_id, class_id, label, confirmed_by, confirmed_at, actor_id, created_at)
  SELECT id, property_id, zone_id, import_id, class_id, label, confirmed_by, confirmed_at, 'unknown-operator', created_at FROM objects;

DROP TABLE objects;
ALTER TABLE objects_rebuild RENAME TO objects;

CREATE INDEX idx_objects_property ON objects(property_id);
CREATE INDEX idx_objects_zone ON objects(property_id, zone_id);
CREATE INDEX idx_objects_class ON objects(class_id);

CREATE TRIGGER trg_objects_actor BEFORE INSERT ON objects
WHEN NEW.actor_id IS NULL OR NEW.actor_id = ''
BEGIN SELECT RAISE(ABORT, 'objects: every row records which operator acted'); END;

-- The two the derived guard surfaced. Column already present on both; only the
-- enforcement was missing.
CREATE TRIGGER trg_report_row_edits_actor BEFORE INSERT ON report_row_edits
WHEN NEW.actor_id IS NULL OR NEW.actor_id = ''
BEGIN SELECT RAISE(ABORT, 'report_row_edits: every row records which operator acted'); END;

CREATE TRIGGER trg_client_names_actor BEFORE INSERT ON client_names
WHEN NEW.actor_id IS NULL OR NEW.actor_id = ''
BEGIN SELECT RAISE(ABORT, 'client_names: every row records which operator acted'); END;

PRAGMA foreign_keys = ON;
