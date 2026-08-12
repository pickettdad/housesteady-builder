-- Amendment 11 pass 3 — match and complete. The two lanes, and the relation.
--
-- ⚑ TWO LANES, AND THEY MUST NOT MERGE.
--
-- §C pass 3: *a plate-derived object's class follows from its resolution and is
-- close to deterministic. An appearance-derived object's class is a guess and
-- carries that mark. The same field reporting both at one confidence is what
-- this amendment exists to end.*
--
-- Before this column every object in the table was appearance-derived and
-- nothing said so — which is not a labelling omission, it is the entire failure:
-- `reverse-osmosis`, `well-pump-submersible`, `fuel-tank-propane` and four
-- pressure tanks all sat beside real readings at one confidence.
--
-- NULL means the row predates the lanes. **Not `appearance`** — a default that
-- guesses is how a distinction gets lost one migration after it is drawn.
--
-- `resolution_id` IS WHAT MAKES `plate` CHECKABLE. A plate-derived object with
-- no resolution behind it is a claim about provenance with nothing supporting
-- it, so the lane and its evidence arrive together or not at all.
--
-- ⚑ `parent_object_id` — the relation §C says this pass populates rather than
-- hand-fills. *Systems render; parts surface when they have an age, a horizon, a
-- part number or a service call.* It is nullable and most rows will keep it
-- null, because most objects are not parts of anything.
--
-- **It is deliberately NOT a foreign key.** Parent and child are written in one
-- transaction and the parent may be written second — a constraint would force an
-- ordering the model's answer does not carry, and the honest failure is a
-- dangling id that gets reported rather than an insert that dies.

ALTER TABLE objects ADD COLUMN derived_from TEXT;
ALTER TABLE objects ADD COLUMN resolution_id TEXT REFERENCES product_resolutions(id);
ALTER TABLE objects ADD COLUMN parent_object_id TEXT;

CREATE INDEX idx_objects_derived ON objects(import_id, derived_from);
CREATE INDEX idx_objects_parent ON objects(parent_object_id);
