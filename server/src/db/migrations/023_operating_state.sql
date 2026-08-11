-- Operating state — Baseline Service Design v1.3 §4.1c-i, the fourth attested field.
--
-- WHY IT IS A TABLE AND NOT A COLUMN, AND THE RULING SAID "FIELD".
--
-- Three reasons, and the third is the one that decides it.
--
-- 1 · IT ATTACHES TO EDGES TOO. *Legacy coax distribution* and *legacy telephone
--     wiring* are `abandoned in place` and they are RUNS, not objects — and most
--     of what an older house has abandoned is connective: dead coax, a capped
--     chimney, an abandoned oil line, a disconnected pool feed. **A column on
--     `objects` can never hold those.** Edges do not exist yet (#99), so
--     `subject_kind` is here to keep the shape from needing a rebuild later.
--
-- 2 · IT HAS AN AUTHORITY AND A DATE. State is `Reported by homeowner`; it is an
--     attestation, and an attestation is a record with a who and a when.
--
-- 3 · **IT CHANGES, AND THE MOMENT IT CHANGES IS THE FACT.** A breaker
--     deliberately off this year is in service next year. **A column holds the
--     latest and silently discards the transition** — which is exactly the
--     objection this repo made to putting a servicer in a column (#121), and it
--     is the same objection: *a furnace present until 2027* requires somebody to
--     have recorded the moment, and no field carries a moment.
--
-- Append-only. The current state is the latest row; nothing is updated and
-- nothing is deleted.
--
-- ⚑ THERE IS NO `generation_id`, AND THAT ABSENCE IS THE POINT.
--
-- State is what the household says. **No model may propose one**, and the way to
-- enforce that is to give a model nowhere to write. Same move as Amendment 11
-- pass 1's schema, where the absence of a `label` field is what forbids naming:
-- an instruction is a request, a missing column is a wall.
--
-- `attested_by` records WHO knows, because the three answers are different
-- strengths and averaging them tells you nothing:
--   household  — the authority. *The breaker is off on purpose.*
--   observed   — the concierge saw it. A breaker in the off position is
--                observable; that it is DELIBERATE is not.
--   unknown    — recorded as unresolved rather than guessed.
--
-- The state VALUE is open vocabulary — fail open, like every other word — while
-- `subject_kind` is this repo's own structure. A state this build has not met is
-- stored, displayed and counted as unrecognised; it simply cannot suppress care
-- or reach a trades brief, because those switch on the values we declare.

CREATE TABLE object_states (
  id           TEXT PRIMARY KEY,
  property_id  TEXT NOT NULL REFERENCES properties(id),

  -- `object` today. `edge` and `zone` are declared because the ruling names them
  -- and a rebuild to add one is more expensive than a column that waits.
  subject_kind TEXT NOT NULL,
  subject_id   TEXT NOT NULL,

  -- in service · deliberately off · seasonal or standby · abandoned in place ·
  -- decommissioned but present · unknown. Open — see the header.
  state        TEXT NOT NULL,

  -- household | observed | unknown. Rule 4's weight, one level out.
  attested_by  TEXT NOT NULL,

  -- Why, in the household's words. *It is a geothermal preheat store and the
  -- panel is marked to keep it off.* Evidence for a person; never parsed.
  because      TEXT,

  actor_id     TEXT NOT NULL REFERENCES operators(id),
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_object_states_subject ON object_states(subject_kind, subject_id, created_at);
CREATE INDEX idx_object_states_property ON object_states(property_id);

CREATE TRIGGER trg_object_states_actor BEFORE INSERT ON object_states
WHEN NEW.actor_id IS NULL OR NEW.actor_id = ''
BEGIN SELECT RAISE(ABORT, 'object_states: every row records which operator acted'); END;

-- Append-only, enforced rather than documented. A state history that can be
-- edited is not a history, and the transition is the thing worth having.
CREATE TRIGGER trg_object_states_no_update BEFORE UPDATE ON object_states
BEGIN SELECT RAISE(ABORT, 'object_states is append-only: record a new state, never edit an old one'); END;

CREATE TRIGGER trg_object_states_no_delete BEFORE DELETE ON object_states
BEGIN SELECT RAISE(ABORT, 'object_states is append-only: nothing is deleted'); END;
