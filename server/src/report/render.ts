/**
 * Signing and rendering the gap report — Increment 4 §5 and §6.
 *
 * **The signature is the render gate, not a step after it.**
 *
 * There is exactly one exported function here that produces client-facing HTML,
 * and it takes a signer. Not `render()` with a `signed` flag checked somewhere
 * inside, and not `render()` beside a separate `sign()` — a flag can be passed
 * wrong and two functions can be called in the wrong order. **`signEdition()` is
 * the only way client HTML comes into existence in this repo**, and a doctrine
 * scan asserts nothing else composes any.
 *
 * ---
 *
 * **Three things happen in one act, in this order, and the order is the design.**
 *
 *   **Compose** from structured parts and declared frames. §2's boundary.
 *   **Lint** the composed text against House Style. §6, gate two — *in the
 *   render path*, so it sees what a concierge typed and not only what a test
 *   built. A violation refuses; nothing is stored.
 *   **Store** the bytes. The document is the deliverable, and a re-render in
 *   September against September's names is not what was sent in July.
 *
 * ---
 *
 * **The brand mark is inlined from the delivered asset file and never drawn.**
 * Brand Guide §04: *"Redraw, retype, or approximate the mark — the vial and
 * geometry reproduce from asset files only."* Option C, the primary lockup, is
 * one pre-composed file: the mark and wordmark arrive already spaced to the
 * guide's rule, so **the space between them is not a decision this code makes
 * every render.** Composing them here would be the consumer re-composing what
 * the producer already composed — the rule that keeps catching all of us.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Db } from '../db/index.js'
import { newId, now } from '../db/index.js'
import type { CarriedItem, ColumnId } from '../audit/carriedItems.js'
import { clientGroups, type ClientGroup, type DescribeItem, type Frames, type NaLabels } from './clientVoice.js'
import { HouseStyleRefused, lint, type Violation } from './houseStyle.js'
import type { Draft, DraftRow } from './draft.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const brandRoot = join(repoRoot, 'brand')

export class RenderRefused extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'RenderRefused'
  }
}

/** The brand, read from the delivered files. Never a literal in this module. */
interface Brand {
  lockup: string
  palette: Record<string, string>
}

/**
 * Read once per render, from `/brand`.
 *
 * **Not hardcoded here, and the checksums are why.** A doctrine scan asserts
 * every file matches the sha256 recorded when it was delivered, so a palette
 * value or an asset edited in place fails the suite rather than shipping a mark
 * that is 3% wrong and looks right.
 */
function brand(): Brand {
  const manifest = JSON.parse(readFileSync(join(brandRoot, 'assets.json'), 'utf8')) as {
    palette: Record<string, string>
  }
  const lockup = readFileSync(join(brandRoot, 'assets', 'pngs', 'housesteady-lockup_primary.png'))
  const palette = Object.fromEntries(
    Object.entries(manifest.palette).filter(([k]) => k !== 'note'),
  )
  return { lockup: `data:image/png;base64,${lockup.toString('base64')}`, palette }
}

export interface EditionColumn {
  id: ColumnId
  title: string
  /** Derived rows, grouped by reason then room. Empty for a typed column. */
  groups: ClientGroup[]
  /** Typed rows, which have no grouping — a person wrote each one whole. */
  typed: string[]
  /** What the room holds, once per room rather than once per row. */
  media: { where: string; summary: string }[]
}

export interface Edition {
  id: string
  number: number
  propertyId: string
  auditRunId: string
  signedBy: string
  signedAt: string
  html: string
  contentHash: string
  columns: EditionColumn[]
  withheld: { itemId: string; because: string }[]
}

/**
 * Compose, lint, sign, store — one act.
 *
 * Refuses rather than degrades. A gap report that quietly dropped the rows it
 * could not word would be indistinguishable from one where everything was
 * covered, which is the failure §2b's withholding rule exists to prevent — so
 * withheld rows are recorded on the edition and reported to the signer, and the
 * signature covers a document whose omissions are written down.
 */
export function signEdition(args: {
  db: Db
  propertyId: string
  draft: Draft
  describe: DescribeItem
  labels: NaLabels
  frames: Frames
  /** Who is putting their name to this. Not the operator running the software. */
  signedBy: string
  /**
   * How that person's name reads in the document.
   *
   * **An operator id is internal vocabulary and cannot appear in a client's
   * document** — §2b, and the first render put `op-dp` in the footer. The id is
   * what the foreign key stores; the display name is what a homeowner reads, and
   * the two are different facts about the same person.
   */
  signedByName: string
  clientNames: { version: string; hash: string }
  houseStyleVersion: string
  /** Property label and address for the header. From the property row. */
  property: { label: string; address: string | null }
  /**
   * When the house was walked, from the manifest's session start.
   *
   * **Named `walkedDate` and not `visitDate`, and the name is load-bearing.**
   * A parameter called `visitDate` invites a caller to pass `visits.planned_date`
   * — which is exactly what put *"visited 2026-07-24"* into the first signed
   * edition against a session that began on the 25th. The caller resolves this
   * through `walkedAt()`; nothing else may reach the render.
   */
  walkedDate: string | null
}): Edition {
  const { db, propertyId, draft, describe, labels, frames, signedBy } = args

  if (!draft.auditRunId) {
    throw new RenderRefused(
      'This property has not been audited, so there is nothing to report.',
      'render.no-audit',
    )
  }

  const included = draft.rows.filter((r) => r.included)
  if (included.length === 0) {
    // Not an error and not a silent empty page. A report with nothing in it is
    // a real outcome — it just is not one anybody should sign by accident.
    throw new RenderRefused(
      'Every row is held back, so this edition would be empty. Put something in it, or say so another way.',
      'render.nothing-included',
    )
  }

  // --------------------------------------------------------------- compose
  const columns: EditionColumn[] = draft.columns.map((column) => {
    const rows = included.filter((r) => r.column === column.id)
    const derived = rows.filter((r) => r.provenance === 'evidence-bound')
    const typed = rows.filter((r) => r.provenance === 'human-entered')

    return {
      id: column.id,
      title: column.title,
      // A row a person reworded carries their sentence, not the group's frame:
      // they wrote a whole statement and folding it into a list would break it.
      // So a reworded derived row leaves the grouping and joins the typed list.
      groups: clientGroups(
        derived.filter((r) => !r.reworded).map(carriedOf),
        describe, labels, frames,
      ),
      typed: [...typed, ...derived.filter((r) => r.reworded)].map((r) => r.text),
      media: mediaLines(rows),
    }
  })

  // ------------------------------------------------------------------ lint
  //
  // Everything a client will read, including what a concierge typed. This is
  // the whole reason the lint lives here: a test lints the sentences a test
  // built, and the sentence that reaches a client is the one somebody typed
  // into a box on a Friday afternoon.
  const violations: Violation[] = []
  for (const column of columns) {
    for (const group of column.groups) {
      violations.push(...lint(group.frame, `the "${column.title}" heading for ${group.where ?? 'this visit'}`))
      if (group.next) violations.push(...lint(group.next, `what happens next in "${column.title}"`))
      for (const item of group.items) violations.push(...lint(item.name, `the name "${item.name}"`))
    }
    for (const text of column.typed) violations.push(...lint(text, `a typed row in "${column.title}"`))
  }
  // The footer is client-facing too, and the first render proved it needs the
  // same check: it carried an operator id.
  violations.push(...lint(args.signedByName, 'the signature line'))
  /**
   * ⚑ **Both, never `address ?? label`.**
   *
   * This read `args.property.address ?? args.property.label`, so a property with
   * an address had its **label linted by nothing** — and the label is what the
   * document is titled with: `<title>Gap report — ${label}</title>` below. An
   * edition signed as *"The Smith place — recurring damp issue"* passed with no
   * refusal and the stored HTML carried it.
   *
   * *`??` is a fallback between two ways of naming one thing. These are two
   * separate fields and both render, so the coalesce silently dropped whichever
   * one was not null.* **A lint that skips a rendered field is worse than no
   * lint, because the pass is read as a check.**
   */
  violations.push(...lint(args.property.label, 'the property label, which titles the document'))
  if (args.property.address) violations.push(...lint(args.property.address, 'the address in the header'))
  if (violations.length > 0) throw new HouseStyleRefused(violations)

  // ----------------------------------------------------------------- store
  const number = ((db
    .prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM report_editions WHERE property_id = ?')
    .get(propertyId) as { n: number }).n)

  const html = document({
    columns,
    property: args.property,
    walkedDate: args.walkedDate,
    signedBy: args.signedByName,
    signedAt: now(),
    number,
    brand: brand(),
  })

  const id = newId()
  const at = now()
  const contentHash = createHash('sha256').update(html).digest('hex')
  const withheld = draft.withheld.map((r) => ({
    itemId: r.source?.itemId ?? r.rowKey,
    because: r.withheldBecause ?? 'held out of this edition',
  }))

  db.prepare(
    `INSERT INTO report_editions (id, property_id, audit_run_id, number, signed_by, signed_at,
       html, content_hash, client_names_version, client_names_hash, house_style_version,
       composition, withheld, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, propertyId, draft.auditRunId, number, signedBy, at, html, contentHash,
    args.clientNames.version, args.clientNames.hash, args.houseStyleVersion,
    JSON.stringify(columns), JSON.stringify(withheld), at,
  )

  return {
    id, number, propertyId, auditRunId: draft.auditRunId, signedBy, signedAt: at,
    html, contentHash, columns, withheld,
  }
}

/** One line per room, because that is the level the fact is true at. */
function mediaLines(rows: DraftRow[]): { where: string; summary: string }[] {
  const byWhere = new Map<string, DraftRow>()
  for (const row of rows) {
    if (!row.media || row.media.total === 0 || !row.source) continue
    if (!byWhere.has(row.source.where)) byWhere.set(row.source.where, row)
  }
  return [...byWhere].map(([where, row]) => ({
    where,
    summary: row.media!.ofKind.map((k) => `${k.count} ${k.kind}${k.count === 1 ? '' : 's'}`).join(' · '),
  }))
}

/** A draft row back to the carried shape the composer reads. */
function carriedOf(row: DraftRow): CarriedItem {
  return {
    scope: {
      kind: row.source!.scopeKind,
      zoneId: row.source!.zoneId,
      pinId: row.source!.pinId,
    },
    itemId: row.source!.itemId,
    tier: 'standard',
    reason: row.source!.reason,
    // The reason is the na reason id verbatim, or `not-reached` — the one word
    // this repo owns. So the na id is recoverable without re-deriving anything.
    naReasonId: row.source!.reason === 'not-reached' ? null : row.source!.reason,
    column: row.column,
    parts: row.source!.parts,
    status: null,
    origin: 'computed',
    dueSince: { importId: '', visitId: null, at: '' },
    where: row.source!.where,
    whereLabel: row.source!.whereLabel,
    itemText: row.source!.itemText,
    certain: true,
    unrecognised: [],
  }
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The document.
 *
 * **Option C, the primary lockup** — ratified 2026-07-31. Three reasons, and
 * the second is the one that binds this file: the guide already calls it the
 * primary lockup; **it cannot drift**, because it is pre-composed to the
 * spacing rule in one file rather than assembled here every render; and *"Home
 * Concierge"* is load-bearing, because a home concierge is a category most
 * people have never met.
 *
 * Option A — the mark alone — stays right below roughly 120 px, where the lockup
 * will not fit. Option D carries the region and belongs on market-facing
 * material; on a report to an existing client, *"Bay of Quinte"* tells them
 * something they already know.
 */
function document(args: {
  columns: EditionColumn[]
  property: { label: string; address: string | null }
  walkedDate: string | null
  signedBy: string
  signedAt: string
  number: number
  brand: Brand
}): string {
  const { brand: b } = args
  const body = args.columns
    .filter((c) => c.groups.length > 0 || c.typed.length > 0)
    .map((column) => {
      const groups = column.groups.map((group) => `
        <div class="group">
          <p class="frame">${esc(group.frame)}</p>
          <ul class="items">${group.items.map((i) => `<li>${esc(i.name)}</li>`).join('')}</ul>
          ${group.next ? `<p class="next">${esc(group.next)}</p>` : ''}
        </div>`).join('')

      const typed = column.typed.length > 0
        ? `<ul class="typed">${column.typed.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
        : ''

      return `<section><h2>${esc(column.title)}</h2>${groups}${typed}</section>`
    })
    .join('')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Gap report — ${esc(args.property.label)}</title>
<style>
  :root {
    --navy: ${b.palette.navy}; --brass: ${b.palette.brass};
    --ivory: ${b.palette.ivory}; --ink: ${b.palette.ink}; --evergreen: ${b.palette.evergreen};
  }
  /* Brand Guide §03: body 16px minimum, always. Brass carries headlines and
     accents only — never body text. */
  body { font: 16px/1.6 "Public Sans", -apple-system, system-ui, sans-serif;
         color: var(--ink); background: #fff; margin: 0; padding: 40px 44px; max-width: 760px; }
  header { display: flex; align-items: flex-end; gap: 20px;
           border-bottom: 2px solid var(--navy); padding-bottom: 14px; margin-bottom: 28px; }
  /* The delivered lockup, at its own aspect ratio. Never stretched — §04. */
  header img { height: 46px; width: auto; }
  header .meta { margin-left: auto; text-align: right; font-size: 13px; color: #6E7686; line-height: 1.45; }
  header .meta b { display: block; color: var(--ink); font-size: 15px; }
  h2 { font-family: Fraunces, Georgia, serif; font-weight: 600; font-size: 19px;
       color: var(--navy); margin: 30px 0 10px; }
  .frame { margin: 0 0 6px; }
  .items { margin: 0 0 8px; padding-left: 22px; }
  .items li { margin: 2px 0; }
  .next { margin: 0 0 4px; color: #4A5262; font-size: 15px; }
  .typed { margin: 0; padding-left: 22px; }
  .typed li { margin: 5px 0; }
  .group + .group { margin-top: 16px; }
  footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #E7E1D4;
           font-size: 13px; color: #6E7686; }
  footer b { color: var(--ink); }
</style></head>
<body>
<header>
  <img src="${b.lockup}" alt="HouseSteady — Home Concierge">
  <div class="meta"><b>Gap report</b>${esc(args.property.address ?? args.property.label)}${
    args.walkedDate ? ` · visited ${esc(args.walkedDate)}` : ''
  }<br>Edition ${args.number}</div>
</header>
${body}
<footer>
  Prepared and signed by <b>${esc(args.signedBy)}</b> on ${esc(args.signedAt.slice(0, 10))}.
  Edition ${args.number}. We identify and document; licensed specialists assess.
</footer>
</body></html>`
}

/** Every edition of a property's gap report, newest first. Nothing is replaced. */
export function editions(db: Db, propertyId: string): Omit<Edition, 'html'>[] {
  return (db
    .prepare(
      `SELECT id, number, property_id, audit_run_id, signed_by, signed_at, content_hash,
              composition, withheld FROM report_editions
        WHERE property_id = ? ORDER BY number DESC`,
    )
    .all(propertyId) as Record<string, string | number>[])
    .map((r) => ({
      id: String(r.id), number: Number(r.number), propertyId: String(r.property_id),
      auditRunId: String(r.audit_run_id), signedBy: String(r.signed_by),
      signedAt: String(r.signed_at), contentHash: String(r.content_hash),
      columns: JSON.parse(String(r.composition)) as EditionColumn[],
      withheld: JSON.parse(String(r.withheld)) as { itemId: string; because: string }[],
    }))
}

/** One edition's stored bytes — what was actually sent, never a re-render. */
export function editionHtml(db: Db, id: string): string | undefined {
  return (db.prepare('SELECT html FROM report_editions WHERE id = ?').get(id) as { html: string } | undefined)?.html
}
