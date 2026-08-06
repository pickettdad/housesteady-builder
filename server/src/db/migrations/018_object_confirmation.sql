-- Increment 5 §6 — the confirmation surface, and Amendment 1 §B's two records.
--
-- BINDS TO INCREMENT 2b RATHER THAN RESPECIFYING IT. The assist machinery
-- already carries proposals quarantined until signed, accept / edit-first /
-- reject, a suggestion shown and never pre-filled, unanimity, and abstention
-- ending in an explicit act. **What is new here is the breadth, not the
-- mechanism.**
--
-- CONFIRMATION IS PER OBJECT, NEVER PER OUTPUT. A concierge confirms *this is an
-- American Standard gas water heater, serial ending 4471* once, and the four
-- streams follow from it. **Confirming a class four times gets a weaker
-- signature each time** — the same reasoning as one signature per nameplate, and
-- the reason `object_provenance` rows are only ever written as a set belonging to
-- one decision. There is no way to express a per-output confirmation here.
--
-- ONE CLICK, TWO PROVENANCE RECORDS — Amendment 1 §B, and the CHECK below is the
-- whole of it. CLAUDE.md §6 defines a signature as *"I observed this, and this
-- description matches what I saw."*
--
--   *American Standard gas water heater, serial ending 4471*  — the photograph
--   is right there, so it is checkable. Act `confirmed`, label `Observed`.
--
--   *Descale every 12 months, cartridge Y* — nothing in the room says so.
--   Act `adopted`, label `Inferred`.
--
-- **One signature covering both would record that a human verified the descaling
-- interval, and nobody did.** That is doctrine 2's laundered inference arriving
-- through a BUTTON LABEL rather than a data path, which is exactly why no
-- existing scan would have caught it. So it is a constraint instead.

CREATE TABLE object_decisions (
  id           TEXT PRIMARY KEY,
  object_id    TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,

  -- Who. Never nullable: doctrine 5 says a human signs everything a client sees,
  -- and a decision with no actor is the thing that rule exists to prevent.
  --
  -- **Named `actor_id`, not `operator_id`.** Increment 2c's convention is one
  -- column name across every attributed table, and it is a convention precisely
  -- so a check can find it without being told. A synonym here would be invisible
  -- to any scan that looks for the actor and would have to be hand-listed —
  -- which is the failure that let `objects` ship with no actor at all.
  actor_id     TEXT NOT NULL REFERENCES operators(id),

  -- `confirmed` or `rejected`. **Abstention ends in an explicit act** — 2b's rule,
  -- and the reason there is no third value meaning *left alone*. An object nobody
  -- has decided on simply has no row here, which is a different fact from one
  -- somebody looked at and rejected.
  decision     TEXT NOT NULL CHECK (decision IN ('confirmed', 'rejected')),

  -- UNANIMITY, carried from 2b: one corrected character marks the whole reading
  -- edited. A concierge who fixed the class or the label before confirming did
  -- not accept what was proposed, and the record has to say so — otherwise the
  -- proposal's accuracy looks better than it was and the prompt never improves.
  edited       INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0, 1)),

  -- Free text, and the reason a rejection is worth reading later.
  note         TEXT,

  created_at   TEXT NOT NULL
);

CREATE INDEX idx_object_decisions_object ON object_decisions(object_id);

CREATE TRIGGER trg_object_decisions_actor BEFORE INSERT ON object_decisions
WHEN NEW.actor_id IS NULL OR NEW.actor_id = ''
BEGIN SELECT RAISE(ABORT, 'object_decisions: every row records which operator acted'); END;

-- What one decision put into the record.
--
-- Rows are written as a SET belonging to a decision and never individually —
-- that is what makes *per object, not per output* structural rather than a
-- convention somebody has to remember.
CREATE TABLE object_provenance (
  id             TEXT PRIMARY KEY,
  decision_id    TEXT NOT NULL REFERENCES object_decisions(id) ON DELETE CASCADE,
  object_id      TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,

  -- Which stream this record covers — `identification`, `care`, `opportunity`,
  -- `horizon`, `question`. **Open vocabulary**, no CHECK: doctrine 7, and a
  -- stream this database has not met is still a stream somebody produced.
  stream         TEXT NOT NULL,

  -- What the human's act amounts to for THIS stream.
  act            TEXT NOT NULL,
  honesty_label  TEXT NOT NULL,

  -- What it points at — a class id, a care category id, a generation id. Open,
  -- and nullable because identification points at the object itself.
  ref            TEXT,

  created_at     TEXT NOT NULL,

  -- Carried from the decision rather than supplied, so a provenance row can
  -- never claim a different author from the act that produced it.
  actor_id       TEXT NOT NULL REFERENCES operators(id),

  -- **THE CONSTRAINT THAT IS THE POINT.** Confirming is vouching for something
  -- the signer can see; adopting is taking something into the record. The two
  -- legal pairings are the only two, and a research interval can therefore never
  -- be stored as `confirmed`/`Observed` however a button is labelled.
  --
  -- A third act is a deliberate schema change rather than a new string, and that
  -- is the intent: adding one quietly is exactly how this distinction erodes.
  CHECK (
    (act = 'confirmed' AND honesty_label = 'Observed') OR
    (act = 'adopted'   AND honesty_label = 'Inferred')
  ),

  -- One record per stream per decision. A second would be the per-output
  -- confirmation this design exists to make impossible.
  UNIQUE (decision_id, stream, ref)
);

CREATE INDEX idx_object_provenance_object ON object_provenance(object_id);
CREATE INDEX idx_object_provenance_act ON object_provenance(act);

CREATE TRIGGER trg_object_provenance_actor BEFORE INSERT ON object_provenance
WHEN NEW.actor_id IS NULL OR NEW.actor_id = ''
BEGIN SELECT RAISE(ABORT, 'object_provenance: every row records which operator acted'); END;
