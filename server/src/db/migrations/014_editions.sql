-- Increment 4 §5 and §6 — a signed edition of the gap report.
--
-- NOTHING CLIENT-FACING RENDERS UNSIGNED, and this table is how that is
-- structural rather than remembered. §0.1: "the signature is the render gate,
-- not a step after it." There is no path that produces client-facing HTML and
-- then asks whether somebody signed — signing IS the act that produces it, and
-- a doctrine scan holds that shape.
--
-- Design v1 §6: a delivered binder is a dated snapshot with a changelog. Late
-- results produce a NEW edition. So this table is append-only like everything
-- else here: edition 2 does not replace edition 1, and a client asking in
-- September what their July report said gets the July bytes rather than a
-- re-render against today's names, today's schema and today's audit.
CREATE TABLE report_editions (
  id             TEXT PRIMARY KEY,
  property_id    TEXT NOT NULL REFERENCES properties(id),

  -- Which audit run this was composed from. The report is a projection of that
  -- run plus the edit log, and without this the projection has no fixed input.
  audit_run_id   TEXT NOT NULL REFERENCES audit_runs(id),

  -- 1-based per property. The number a client sees, and the reason a second
  -- edition is a new row rather than an update.
  number         INTEGER NOT NULL,

  -- WHO SIGNED. Not `actor_id` — the two are different facts and conflating
  -- them is how a signature stops meaning anything. `actor_id` on every other
  -- table says who operated the software; this says who put their name to a
  -- document a client reads.
  --
  -- What signing claims, from CLAUDE.md §6: not "I certify this assessment" but
  -- "I observed this, and this description matches what I saw."
  signed_by      TEXT NOT NULL REFERENCES operators(id),
  signed_at      TEXT NOT NULL,

  -- The composed document, stored verbatim. THE BYTES ARE THE DELIVERABLE.
  -- Re-rendering later would produce a different document the moment a name is
  -- ratified or the audit re-runs, and "what did we actually send them" has to
  -- be answerable from the record.
  html           TEXT NOT NULL,
  content_hash   TEXT NOT NULL,

  -- What produced it, so a difference between two editions is explicable.
  client_names_version TEXT NOT NULL,
  client_names_hash    TEXT NOT NULL,
  house_style_version  TEXT NOT NULL,

  -- Every group and item that went in, structured. The html is what was sent;
  -- this is what it was made of, and a changelog between editions reads off it
  -- rather than off a diff of two blobs of markup.
  composition    TEXT NOT NULL,

  -- Rows held out of this edition, with the reason. NEVER DROPPED SILENTLY —
  -- doctrine 6. An edition that quietly omitted four items nobody could name
  -- looks identical to one where everything was covered.
  withheld       TEXT NOT NULL,

  created_at     TEXT NOT NULL
);

CREATE UNIQUE INDEX report_editions_number ON report_editions (property_id, number);
CREATE INDEX report_editions_property ON report_editions (property_id, signed_at);
