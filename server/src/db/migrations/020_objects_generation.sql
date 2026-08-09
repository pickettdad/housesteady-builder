-- An AI-proposed object cites the generation that proposed it.
--
-- **Doctrine 3 — provenance travels.** *"Every value knows its origin: which
-- pin, which document, which lab report, which human edit."* An object proposed
-- by identification recorded `actor_id` — who pressed the button — and nothing
-- about the model call that produced it. **The row that holds the model, the
-- prompt version, the prompt hash, the token counts and the raw output was
-- already being written, and the object simply did not point at it.**
--
-- NULL is the ordinary state for anything a human creates at the desk from a
-- document, and for every object proposed before this migration. It means
-- *no generation produced this*, which is different from *unknown*.
--
-- ---
--
-- **What made it urgent: two runs in one database.**
--
-- Comparing a fast-tier pass against a strong-tier pass on the same room needs
-- both in one place — `ai_generations` was built for exactly that, and the
-- container the runs happen in is ephemeral, so "run them in two sessions and
-- compare" is not available. Without this column a second run writes a second
-- set of proposals into the same import with **no way to tell which pass
-- produced which**, and the objects table becomes the thing the ledger was
-- designed to prevent.
--
-- **No foreign key action on delete.** A generation is an evidence row and
-- nothing deletes one; if that ever changes, an object losing its origin must
-- surface rather than cascade quietly.

ALTER TABLE objects ADD COLUMN generation_id TEXT REFERENCES ai_generations(id);

CREATE INDEX idx_objects_generation ON objects(generation_id);
