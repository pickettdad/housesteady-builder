-- Increment 4 §1d and §5 — the gap report's editor surface.
--
-- Design v1 §4: AN EDITOR OVER PRE-POPULATED ROWS, NOT A STATIC RENDER. Rows
-- toggle in and out, wording is editable, manual rows are addable. All three of
-- those are changes a person makes to a document, and none of them may touch
-- the evidence underneath.

-- ------------------------------------------------- where a carried row points
--
-- Two registers, stored, because the editor was re-deriving them and that is
-- rule 4: never re-derive a boundary the producer already has. The audit knows
-- both when it builds the row; a consumer looking them up again from the zone
-- table is a second implementation that can disagree.
--
-- AND THEY ARE TWO COLUMNS, NOT ONE. `where_desk` falls back to a zone's TYPE
-- (`living-space`, `utility`) so the desk always has something to show.
-- `where_label` carries only what a person actually wrote, and is NULL when
-- nobody wrote anything — because "the living-space" in a homeowner's document
-- is config vocabulary reaching a client, which is exactly what §2b forbids. A
-- NULL composes the sentence without a location rather than with a bad one.
ALTER TABLE audit_carried_items ADD COLUMN where_desk TEXT;
ALTER TABLE audit_carried_items ADD COLUMN where_label TEXT;

-- What the field checklist asked, in the config's own words. DESK-FACING ONLY.
--
-- Stored here rather than looked up because the editor may not read the field
-- config's item lists — a doctrine scan forbids it, after a version that read
-- this exact string as a CLIENT-FACING NAME and rendered concierge instructions
-- into a homeowner's document. It is carried so the person writing a name has
-- something to write FROM: a naming box beside an item id asks somebody to
-- invent; a naming box beside what the checklist asked asks them to translate.
ALTER TABLE audit_carried_items ADD COLUMN item_text TEXT;

-- --------------------------------------------------------------- row edits
--
-- APPEND-ONLY, LATEST WINS. The same discipline as `overlays`, and for the same
-- reason: a correction adds a layer, it never overwrites. `overlays` itself is
-- the wrong table for this — it points at CAPTURED entities (a pin, a
-- resolution, a media file) and its four decision kinds are about whether the
-- record matches the evidence. A report row is not a captured entity and
-- excluding one claims nothing about evidence at all.
--
-- EDITING WORDING DOES NOT EDIT EVIDENCE — §5, and this table is the mechanism.
-- A reworded row stores the new sentence HERE; `audit_carried_items.parts` is
-- untouched. §2's composer boundary therefore holds through the editor as well
-- as through the render: the parts stay as the producer wrote them, and a
-- rewording is a layer over the composed sentence rather than a change to what
-- it was composed from.
CREATE TABLE report_row_edits (
  id             TEXT PRIMARY KEY,
  property_id    TEXT NOT NULL REFERENCES properties(id),

  -- Which row. Derived rows key on the carried item's own scope+item key so the
  -- decision survives a re-run of the audit: a concierge who excluded a row on
  -- Monday must not find it back on Tuesday because the audit ran again.
  --
  --   derived  ->  carried:<scopeKey>/<itemId>
  --   manual   ->  manual:<uuid>
  --
  -- NOT the audit_run_id. Keying on the run would tie an editorial decision to
  -- one computation of the gap list, and the decision is about the house.
  row_key        TEXT NOT NULL,

  -- `include` | `exclude` | `reword` | `add` | `retire` | `column`
  --
  -- Open vocabulary in the same sense as everywhere else: an unrecognised kind
  -- is preserved and shown, never dropped. The projection only understands the
  -- six, and says so when it meets a seventh.
  kind           TEXT NOT NULL,

  -- The edit's payload. For `reword`, the new sentence. For `add`, the manual
  -- row's text and column. For `column`, the column moved to.
  payload        TEXT NOT NULL,

  -- Increment 2c — every record carries who acted.
  actor_id       TEXT NOT NULL REFERENCES operators(id),

  -- Decision order, 1-based per property. `created_at` has millisecond
  -- resolution and the editor is keyboard-driven, so timestamps tie routinely —
  -- the same reason `overlays.seq` exists. Without it "latest wins" is undefined.
  seq            INTEGER NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE INDEX report_row_edits_property ON report_row_edits (property_id, row_key, seq);
CREATE UNIQUE INDEX report_row_edits_seq ON report_row_edits (property_id, seq);


-- ------------------------------------------------------ client-facing names
--
-- Increment 4 Amendment 1 §C, and the ratification gate the owner added.
--
-- A NAME WRITTEN HERE IS COMPANY-WIDE. It is keyed on the item id, not on the
-- property, because the name of a thing does not change between houses — which
-- is exactly why it needs a gate. One concierge's wording silently becoming
-- every client's is the same failure the house style exists to prevent, arriving
-- through a text box instead of through a draft.
--
-- SO: written, usable, and marked unratified until the design session confirms
-- it. The same pattern as the golden set — an unratified expectation gates
-- nothing and summons somebody to look at it. The concierge who wrote it signs
-- the sentence it appears in, which is what makes it shippable for THAT report;
-- ratification is what makes it house style for everyone else's.
--
-- APPEND-ONLY. A rewrite is a new row; the old one stays. `ratified_at` is set
-- once and never cleared: un-ratifying is a new row that supersedes, so the
-- record of what was house style in March survives into September.
CREATE TABLE client_names (
  id             TEXT PRIMARY KEY,
  item_id        TEXT NOT NULL,
  name           TEXT NOT NULL,

  -- Who wrote it, and where. The property is provenance, not scope: it says
  -- which house this wording was written while looking at, which is the context
  -- the design session needs to judge it.
  actor_id       TEXT NOT NULL REFERENCES operators(id),
  property_id    TEXT REFERENCES properties(id),

  -- NULL until the design session confirms it. Never cleared — see above.
  ratified_at    TEXT,
  ratified_by    TEXT REFERENCES operators(id),

  seq            INTEGER NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE INDEX client_names_item ON client_names (item_id, seq);
CREATE UNIQUE INDEX client_names_seq ON client_names (seq);
