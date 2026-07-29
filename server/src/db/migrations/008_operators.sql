-- Increment 2c — operator identity.
--
-- WHY THIS IS A MIGRATION RATHER THAN A LATER FEATURE. The argument is about the
-- code, not the existing rows. Today's records are test data and losing their
-- attribution costs nothing — but a table without an actor column teaches every
-- write path built on top of it to omit one. Increment 3 adds an audit engine,
-- 4 a gap report and a session plan, 5 the concern register. Retrofitting then
-- means touching all of them.
--
-- WHAT THIS IS NOT. Attribution, never access control. This answers "who did
-- this" and says nothing about who is allowed to do it. Authentication arrives
-- with hosting and wants its own decision.

CREATE TABLE operators (
  id             TEXT PRIMARY KEY,

  -- As it appears to a client. This is the "visited by" line on every report,
  -- which is why it is a display name rather than a username: the homeowner
  -- reads it.
  display_name   TEXT NOT NULL,

  -- How configuration and the command line name this person. Unique, because
  -- two operators answering to `dp` would make the current-operator setting
  -- ambiguous in a way nothing downstream could detect.
  short_code     TEXT NOT NULL UNIQUE,

  -- NEVER DELETED. An operator who leaves is deactivated and their records keep
  -- pointing at them. Same reasoning as retirement lineage: the record of who
  -- did something outlives their employment, and a binder that loses the name
  -- of who walked the house has lost part of what it is for.
  active         INTEGER NOT NULL DEFAULT 1,

  created_at     TEXT NOT NULL,
  deactivated_at TEXT
);

-- Every row that predates attribution belongs to a real operator row that says
-- so honestly.
--
-- NOT THE OWNER. Backfilling to him would assert something untrue about who did
-- the work — a claim the record cannot support, made silently, on data nobody
-- will re-examine. A named legacy operator says exactly what is true: this
-- predates attribution. Deactivated, so it can never be selected for new work.
--
-- The timestamp is this migration's own date, which is the honest answer to
-- "when did attribution begin" and keeps the migration deterministic.
INSERT INTO operators (id, display_name, short_code, active, created_at, deactivated_at)
VALUES ('op-legacy', 'pre-attribution', 'legacy', 0, '2026-07-29T00:00:00.000Z', '2026-07-29T00:00:00.000Z');

-- ---------------------------------------------------------------- the columns
--
-- Nullable at the column level, deliberately. SQLite cannot ADD COLUMN NOT NULL
-- without a DEFAULT, and a default of 'op-legacy' would be worse than nothing:
-- it would silently attribute new work to "pre-attribution" whenever a write
-- path forgot, which is precisely the failure this increment exists to end.
-- Enforcement is a BEFORE INSERT trigger instead — see below — which no write
-- path can bypass.
--
-- `actor_at` is not added anywhere: the spec asks for it "where no timestamp
-- exists", and all ten tables already carry one.

ALTER TABLE properties  ADD COLUMN actor_id TEXT REFERENCES operators(id);
ALTER TABLE visits      ADD COLUMN actor_id TEXT REFERENCES operators(id);
ALTER TABLE imports     ADD COLUMN actor_id TEXT REFERENCES operators(id);
ALTER TABLE passes      ADD COLUMN actor_id TEXT REFERENCES operators(id);
ALTER TABLE desk_media  ADD COLUMN actor_id TEXT REFERENCES operators(id);
ALTER TABLE ai_jobs     ADD COLUMN actor_id TEXT REFERENCES operators(id);
ALTER TABLE overlays    ADD COLUMN actor_id TEXT REFERENCES operators(id);
ALTER TABLE pass_zone_opens ADD COLUMN actor_id TEXT REFERENCES operators(id);
ALTER TABLE pass_events     ADD COLUMN actor_id TEXT REFERENCES operators(id);

-- On a generation the actor is WHO TRIGGERED THE RUN, never the model. The model
-- is already recorded in its own column, and conflating the two would make a
-- generation read as a human act — which is the one thing the AI doctrine is
-- most concerned to prevent. The foreign key is what enforces it: no model id
-- is an operator id, so a model name here fails at the database.
ALTER TABLE ai_generations ADD COLUMN actor_id TEXT REFERENCES operators(id);

-- ------------------------------------------------------------- the three roles
--
-- Who was in the house, who worked the desk pass, and who performed any other
-- act are three different questions and get three different answers.

-- CLIENT-FACING. This is the "visited by" line on every report.
--
-- Nullable and NOT enforced, unlike actor_id, because it is genuinely unknown
-- when a visit is booked before it happens. Doctrine 4: an explicit unknown is
-- information and a plausible fabrication is a liability, so a visit with nobody
-- recorded yet renders as not recorded rather than defaulting to whoever created
-- the row. `actor_id` on the same row still says who booked it.
ALTER TABLE visits ADD COLUMN performed_by TEXT REFERENCES operators(id);

-- Who did the desk pass, which MAY DIFFER from who was in the house — one
-- concierge visits, another assembles. That difference is worth being able to
-- see rather than assume away, which is the whole reason this is not the same
-- column as visits.performed_by.
ALTER TABLE passes ADD COLUMN worked_by TEXT REFERENCES operators(id);

-- --------------------------------------------------------------- the backfill

UPDATE properties      SET actor_id = 'op-legacy' WHERE actor_id IS NULL;
UPDATE visits          SET actor_id = 'op-legacy' WHERE actor_id IS NULL;
UPDATE imports         SET actor_id = 'op-legacy' WHERE actor_id IS NULL;
UPDATE passes          SET actor_id = 'op-legacy' WHERE actor_id IS NULL;
UPDATE pass_zone_opens SET actor_id = 'op-legacy' WHERE actor_id IS NULL;
UPDATE pass_events     SET actor_id = 'op-legacy' WHERE actor_id IS NULL;
UPDATE desk_media      SET actor_id = 'op-legacy' WHERE actor_id IS NULL;
UPDATE ai_jobs         SET actor_id = 'op-legacy' WHERE actor_id IS NULL;
UPDATE ai_generations  SET actor_id = 'op-legacy' WHERE actor_id IS NULL;
UPDATE overlays        SET actor_id = 'op-legacy' WHERE actor_id IS NULL;

-- `visits.performed_by` and `passes.worked_by` are deliberately left NULL on
-- existing rows. Backfilling them to the legacy operator would say "pre-attribution
-- was in the house", which reads as a claim about a person rather than an absence
-- of one. NULL says what is true: nobody recorded it.

-- ------------------------------------------------------------ the enforcement
--
-- A trigger per table rather than a rule in the write path.
--
-- The spec asks for enforcement at the write path, and the typed helpers do that
-- — but a write path only covers the paths that exist today, and this increment
-- exists precisely because the next three increments each add their own. A
-- BEFORE INSERT trigger cannot be forgotten by code that has not been written
-- yet: a migration, a repair script, a console session, and a feature nobody has
-- specified are all refused identically.
--
-- The message names the table, because the failure will be read by whoever is
-- adding a write path months from now and "NOT NULL constraint failed" would
-- send them to fix the symptom.

CREATE TRIGGER trg_properties_actor BEFORE INSERT ON properties
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'properties: every row records which operator acted');
END;

CREATE TRIGGER trg_visits_actor BEFORE INSERT ON visits
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'visits: every row records which operator acted');
END;

CREATE TRIGGER trg_imports_actor BEFORE INSERT ON imports
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'imports: every row records which operator acted');
END;

CREATE TRIGGER trg_passes_actor BEFORE INSERT ON passes
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'passes: every row records which operator acted');
END;

CREATE TRIGGER trg_pass_zone_opens_actor BEFORE INSERT ON pass_zone_opens
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'pass_zone_opens: every row records which operator acted');
END;

CREATE TRIGGER trg_pass_events_actor BEFORE INSERT ON pass_events
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'pass_events: every row records which operator acted');
END;

CREATE TRIGGER trg_desk_media_actor BEFORE INSERT ON desk_media
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'desk_media: every row records which operator acted');
END;

CREATE TRIGGER trg_ai_jobs_actor BEFORE INSERT ON ai_jobs
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'ai_jobs: every row records which operator acted');
END;

CREATE TRIGGER trg_ai_generations_actor BEFORE INSERT ON ai_generations
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'ai_generations: every row records which operator triggered the run');
END;

CREATE TRIGGER trg_overlays_actor BEFORE INSERT ON overlays
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'overlays: every row records which operator acted');
END;

CREATE INDEX idx_operators_active ON operators(active);
CREATE INDEX idx_visits_performed_by ON visits(performed_by);
