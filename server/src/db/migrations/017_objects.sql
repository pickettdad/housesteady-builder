-- Increment 5 §2 — objects. A new entity, and it is not a pin.
--
-- THE NAMED FAILURE, quoted because it is the whole reason for a separate table:
-- *the builder reuses pins to represent captured things, and a desk-side
-- confirmed identification becomes indistinguishable from a field-side pin the
-- concierge placed.*
--
-- Under capture-first NOTHING IS CLASSIFIED IN THE ROOM. A Discovery Visit
-- produces zone-owned media and no pins at all. The desk pass is where a thing
-- in a room acquires an identity. So the two entities exist at different stages,
-- are authored by different people, and answer different questions:
--
--   an OBJECT is the desk's confirmed answer about a thing in a room
--   a PIN    is the field's marker on a canvas
--
-- They may come to reference each other. **They are never the same row**, and
-- there is deliberately no foreign key between them here — a pin does not exist
-- yet when the object that seeds it is created, and inventing one would put the
-- two stages in the wrong order.
--
-- AND THIS INVERTS THE OLD ORDER. The class is now UPSTREAM of the component
-- type: an object's class seeds the pin's type on the next visit, where the type
-- used to come first and the class be read off it. §2's stage table is the
-- authority and this schema follows it rather than the other way round.

CREATE TABLE objects (
  id            TEXT PRIMARY KEY,

  -- Property-scoped like everything since 010. An object outlives the visit that
  -- proposed it — that is the point of it — so the property is the owner and the
  -- import is provenance rather than ownership.
  property_id   TEXT NOT NULL REFERENCES properties(id),

  -- The zone it lives in. Open vocabulary by the same rule as everywhere else:
  -- a zone id this database has not met is still a room somebody stood in.
  zone_id       TEXT NOT NULL,

  -- WHICH IMPORT PROPOSED IT. Provenance, never ownership — an object proposed
  -- from the Discovery export is still the property's object after that import
  -- is superseded. Nullable because a later slice will let a human create one
  -- at the desk from a document rather than from a visit.
  import_id     TEXT REFERENCES imports(id),

  -- The class from the frame, or NULL.
  --
  -- **NULL means no class in the frame fits**, which §3 requires to be a
  -- first-class outcome: such an object is proposed anyway, researched openly,
  -- generates work, and goes to the review queue. It is a gap in the FRAME, not
  -- a failure of the object.
  --
  -- No foreign key and no CHECK, deliberately. The frame is a JSON file that
  -- ships ahead of this database and fails open on vocabulary per doctrine 7 —
  -- a constraint here would refuse a real object over a class the database has
  -- not been taught.
  --
  -- **If `the model could not tell what this is` ever needs recording, it gets
  -- its own value rather than reusing NULL.** Those are different facts wanting
  -- different follow-ups: one is a frame gap, the other is a re-look. Collapsing
  -- them is the mistake this repo has caught nine times.
  class_id      TEXT,

  -- Always present, class or no class. For a classed object it is what a person
  -- reads — *the water heater in the mechanical room*; for an unclassed one it
  -- carries the concierge's or the model's freeform description and is the only
  -- thing the object has. Never NULL, because an object nobody can name is not
  -- an identification.
  label         TEXT NOT NULL,

  -- WHO CONFIRMED IT AND WHEN — §2 names this as part of what an object IS.
  --
  -- Both NULL is the ordinary state of a fresh proposal: identification is an AI
  -- pass and doctrine 5 says AI drafts and a human writes. **A proposal and a
  -- confirmed identification are different facts and must never read alike**,
  -- which is exactly why the columns are here rather than a boolean.
  --
  -- `confirmed_by` is an operator, so a confirmation can be attributed. A row
  -- with a time and no actor would be a signature nobody signed.
  confirmed_by  TEXT REFERENCES operators(id),
  confirmed_at  TEXT,

  created_at    TEXT NOT NULL,

  -- The pair, not either alone. A time with no actor is an unsigned signature; an
  -- actor with no time cannot be ordered against anything else in the record.
  CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL))
);

CREATE INDEX idx_objects_property ON objects(property_id);
CREATE INDEX idx_objects_zone ON objects(property_id, zone_id);
CREATE INDEX idx_objects_class ON objects(class_id);

-- The media that evidence an object.
--
-- MANY-TO-MANY, AND NEITHER DIRECTION IS AN EDGE CASE. §3 is explicit: one
-- photograph may evidence several objects and one object several photographs.
-- The kitchen shot holds the fridge, the range and the dishwasher, and a water
-- heater wants its nameplate, its vent and its drip pan.
--
-- MEDIA IS REFERENCED BY ITS FIELD-MINTED ID, not by the `media` table's
-- autoincrement row id. The uuid is the identity that carries across visits and
-- this repo adopts it as canonical; the row id is per-import and would break the
-- moment the same photograph arrived in a second export.
CREATE TABLE object_media (
  object_id   TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  media_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (object_id, media_id)
);

CREATE INDEX idx_object_media_media ON object_media(media_id);
