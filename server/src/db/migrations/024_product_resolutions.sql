-- Amendment 11 pass 2 — what product is that model number.
--
-- NAMED `product_resolutions` AND NOT `resolutions`, DELIBERATELY. The manifest
-- already has `resolutions[]` — a checklist item's resolved state — and it is a
-- different thing entirely. Two tables one word apart is how a query comes to
-- answer a question nobody asked.
--
-- ONE ROW PER LABEL, NOT PER OBJECT. A label is what carries the text, and pass
-- 1 already established that one photograph can hold two labels. Resolving per
-- object would need the object join that pass 3 has not made yet.
--
-- ⚑ `honesty` CAN ONLY EVER BE `Inferred` TODAY, AND THE COLUMN SAYS SO.
--
-- Amendment 11 §C declares three sources: manufacturer documentation is
-- `Documented`, a retailer listing is `Inferred`, nothing found is unresolved.
-- **This build has no search.** A model recognising a product from training is
-- recall — better than guessing from a photograph, checkable by a person, and
-- honestly `Inferred`. It is not a lookup, and it cannot name a source it read.
--
-- So there is no `source_url` column and `Documented` is not a value this pass
-- can produce. **A resolution that cannot state its source does not ship** —
-- and the way to keep that true is to give the pass nowhere to claim one.
-- `source_url` and `Documented` arrive together, in the change that adds search,
-- or not at all.
--
-- `resolved = 0` IS AN EXPECTED OUTCOME AND ITS ROW IS KEPT. A query that
-- resolved to nothing is a fact about the plate and about the model, and the
-- next run against a better model wants to know which ones were unresolved
-- before. Deleting them would make the pass look like it always succeeds.

CREATE TABLE product_resolutions (
  id            TEXT PRIMARY KEY,
  property_id   TEXT NOT NULL REFERENCES properties(id),
  import_id     TEXT REFERENCES imports(id),

  -- The label whose text was resolved. Pass 1's `readings.id`.
  reading_id    TEXT NOT NULL REFERENCES readings(id),

  -- What was actually asked, verbatim, so a resolution can be re-read against
  -- the question rather than against a summary of it.
  query         TEXT NOT NULL,

  -- unit | line | family. How precisely the text could identify anything.
  -- A gradient, never a gate — see engine/lookup.ts.
  specificity   TEXT NOT NULL,

  -- 1 when the model recognised the product. 0 is expected and is kept.
  resolved      INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),

  -- What it is, in the manufacturer's terms. Empty when unresolved.
  product       TEXT NOT NULL DEFAULT '',

  -- equipment | consumable | part | material | unknown. Open vocabulary.
  --
  -- **This is where a whole error class dies.** PP20B-20 resolves to a cartridge
  -- and a cartridge is a consumable, so it never reaches the object channel with
  -- a maintenance rhythm attached.
  kind          TEXT NOT NULL DEFAULT 'unknown',

  -- How the model recognises it, in its own words. Evidence a person reads
  -- before believing the row. **Required on a resolved row** — if it cannot say
  -- how it knows, it does not know.
  recognised_from TEXT NOT NULL DEFAULT '',

  -- Only ever `Inferred` in this build. The column exists so the value travels
  -- with the row rather than being reconstructed by whoever renders it.
  honesty       TEXT NOT NULL DEFAULT 'Inferred',

  generation_id TEXT REFERENCES ai_generations(id),
  actor_id      TEXT NOT NULL REFERENCES operators(id),
  created_at    TEXT NOT NULL,

  -- A resolved row with no product and no recognition note is an abstention
  -- wearing a success flag, which is the one shape that would let this pass
  -- overclaim. Enforced here rather than trusted to a caller.
  CHECK (resolved = 0 OR (product <> '' AND recognised_from <> ''))
);

CREATE INDEX idx_product_resolutions_import ON product_resolutions(import_id);
CREATE INDEX idx_product_resolutions_reading ON product_resolutions(reading_id);

CREATE TRIGGER trg_product_resolutions_actor BEFORE INSERT ON product_resolutions
WHEN NEW.actor_id IS NULL OR NEW.actor_id = ''
BEGIN SELECT RAISE(ABORT, 'product_resolutions: every row records which operator acted'); END;
