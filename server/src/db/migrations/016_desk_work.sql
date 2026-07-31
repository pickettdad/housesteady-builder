-- Increment 4 §7 — desk-work timing.
--
-- WHY IT EXISTS. `baseline-v1.json`'s effort map holds four work classes and
-- deliberately no hour figures, because they belong to the owner and were to
-- come from a mock run. **Field timestamps cannot supply them.** They measure
-- capture; most of the effort map is desk work — rules-generated content, AI
-- drafts a human signs, the irreducibly human ordering of the top items — and
-- none of that happens in the field app.
--
-- So: timestamp desk work per section. Ten houses in, the pricing basis exists
-- without anyone having sat and measured it, and it keeps calibrating as
-- concierges get faster.
--
-- WHAT IS NOT HERE, AND THE SPEC IS EXPLICIT: *"Recorded, not specced: what gets
-- reported from it. Collect first."* No aggregate, no view, no rate. A row per
-- span and nothing that reads it as a number yet.
--
-- ONE SPAN PER ROW, NOT A RUNNING TOTAL. A column that accumulates cannot be
-- corrected without losing what it was corrected from, and it cannot say a
-- session was interrupted. Append-only spans keep the same discipline as the
-- overlay layer: nothing overwrites, a correction is another row.
--
-- `section_id` IS OPEN VOCABULARY. It is a binder section id — `s7`, `s12` — and
-- there is deliberately no foreign key and no CHECK. Doctrine 7: the schema
-- declares which sections exist, and a section this database has not met is
-- still a section somebody worked on. A constraint here would refuse a real
-- span over a word.
--
-- `ended_at` NULL MEANS RUNNING, and that is the only reading. A span that was
-- started and never stopped is a fact about a day somebody was interrupted, not
-- a defect to clean up — nothing here closes one automatically, because a
-- guessed end time would enter the pricing basis as though it were measured.

CREATE TABLE desk_work (
  id           TEXT PRIMARY KEY,
  property_id  TEXT NOT NULL REFERENCES properties(id),

  -- Which visit's desk work this is, where it belongs to one. Nullable for the
  -- same reason `imports.visit_id` is: enrichment from a document that arrived
  -- three weeks later is desk work on the property, not on a visit.
  visit_id     TEXT REFERENCES visits(id),

  -- The binder section being worked. Open vocabulary — see above.
  section_id   TEXT NOT NULL,

  -- The effort map's work class, where the operator says which. Also open, and
  -- also nullable: forcing a classification at start time would make somebody
  -- guess before they know what the hour turned out to be.
  work_class   TEXT,

  started_at   TEXT NOT NULL,
  ended_at     TEXT,

  -- Why it stopped, where it stopped for a reason worth keeping. Free text and
  -- usually null.
  note         TEXT,

  -- Increment 2c: every table gains an actor. Who did the work, which is the
  -- whole point — an hour is only a pricing basis if you know whose.
  actor_id     TEXT NOT NULL REFERENCES operators(id),
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_desk_work_property ON desk_work(property_id, section_id);
CREATE INDEX idx_desk_work_visit ON desk_work(visit_id);
-- The running-span lookup, which is the only query the API makes today.
CREATE INDEX idx_desk_work_open ON desk_work(property_id, ended_at) WHERE ended_at IS NULL;

-- Increment 2c's discipline: the actor is enforced by a trigger rather than only
-- by a write path. `NOT NULL` alone lets an empty string through, and a write
-- path that forgets is exactly the thing the trigger exists to catch.
CREATE TRIGGER trg_desk_work_actor BEFORE INSERT ON desk_work
WHEN NEW.actor_id IS NULL BEGIN
  SELECT RAISE(ABORT, 'desk_work: every row records which operator acted');
END;
