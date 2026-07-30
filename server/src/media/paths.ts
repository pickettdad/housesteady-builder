/**
 * Where media lives on disk — one place that knows the layout.
 *
 * §1j: **the path shape assumed a visit.** `properties/<id>/visits/<visitId>/…`
 * has no answer for a property-scoped artifact — a drone run covering six
 * properties three weeks after an inspection, a scaled site canvas captured in
 * April and still current in July. Neither belongs to a visit, and inventing one
 * to satisfy a directory name would put a lie in the record.
 *
 * So there are two roots, and this module is the only thing that knows which
 * applies. It existed implicitly in four places before — two writers and two
 * readers, each joining the same string — and the failure mode of that is a
 * reader looking in the visit folder for a file the writer put in the artifact
 * one, which reads exactly like a missing photograph.
 */

import { join } from 'node:path'
import { dataRoot, type Db } from '../db/index.js'

export interface MediaLocation {
  propertyId: string
  /** Null for a property-scoped artifact. */
  visitId: string | null
  importId: string
}

/**
 * The directory an import's media belongs under, relative to the data root.
 *
 * A visit-attached capture stays under its visit, because that is what it is
 * about and what somebody looking for it will expect. An artifact goes under its
 * own import id, which is the only identity it has that is guaranteed unique and
 * permanent.
 */
export const mediaDirFor = (loc: MediaLocation): string =>
  loc.visitId
    ? join('properties', loc.propertyId, 'visits', loc.visitId)
    : join('properties', loc.propertyId, 'artifacts', loc.importId)

/** Absolute directory for an import's media. */
export const absoluteMediaDir = (loc: MediaLocation, root = dataRoot): string =>
  join(root, mediaDirFor(loc))

/** Absolute path to one file, whose stored `file` is relative to its import's directory. */
export const absoluteFilePath = (loc: MediaLocation, file: string | null, root = dataRoot): string =>
  join(absoluteMediaDir(loc, root), file ?? '')

/**
 * Where a stored media row's file actually is.
 *
 * Reads the import to find out whether it has a visit, because the media row
 * itself cannot say — `media.visit_id` mirrors its import and would be null for
 * an artifact, which is indistinguishable from "not looked up yet" at a call
 * site. Asking the import is asking the thing that knows.
 */
export function locationOfImport(db: Db, importId: string): MediaLocation | undefined {
  const row = db.prepare('SELECT id, property_id, visit_id FROM imports WHERE id = ?').get(importId) as
    | { id: string; property_id: string; visit_id: string | null }
    | undefined
  return row ? { propertyId: row.property_id, visitId: row.visit_id, importId: row.id } : undefined
}
