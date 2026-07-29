/**
 * Loose-photo routing — does this room photograph belong to a pin?
 *
 * Spec §1: zone-owned photos in, ranked candidate pins out, high confidence
 * only. In the reference export 28 of 37 photos are owned by a zone with nothing
 * pointing at them; on a full baseline it is a couple of hundred. Most of them
 * are photographs of the room and belong exactly where they are.
 *
 * WHY THE CANDIDATES ARE TEXT AND NOT PICTURES. The obvious design sends the
 * pin's own photographs alongside and asks the model to match one image to
 * another. It was rejected on cost — every loose photo would carry N pin photos
 * with it, and images are the whole bill on the fast tier — but the better
 * reason is what it does to the failure mode. Matching against a *description*
 * fails loudly when two pins are alike: the reference visit has six pins in one
 * room all labelled "Receptacle", and no list of words can separate them. That
 * comes back as five `possible` candidates and stays silent, which is correct.
 * Image-to-image matching would produce a confident answer to the same question
 * and be wrong one time in six, and a photograph of one outlet filed against
 * another is somewhere nobody will ever look for it again.
 *
 * SILENCE IS AN OUTPUT, AND IT IS THE COMMON ONE. §1: "Routing suggests
 * sparingly. Annotating 200 tiles with a guess is noise that trains the
 * concierge to ignore the feature." So there is a confidence bar, and below it
 * nothing is shown at all.
 *
 * THIS TASK CARRIES A CONDITION NO OTHER 2b TASK DOES, and it is not technical.
 * `/docs/HouseSteady_Binder-Builder_AI-Processing-Decision_2026-07-27.md` §2.3:
 * routing sends **interior photographs of a client's home**, which is a
 * different claim than a furnace label, and it is authorized only once §3's
 * client disclosure is in place. Nameplate reading and pin-type suggestion are
 * authorized outright because their inputs are equipment plates.
 *
 * Nothing here enforces that, deliberately — it is a business gate on real
 * client work, and today this runs on the owner's own house. It is written here
 * so the condition is visible to whoever wires this to a real visit, rather
 * than living only in a document nobody reads at that moment. That decision
 * record is still awaiting ratification, and its §2.5 — establishing the API
 * account's retention and training terms in writing — cannot be deferred past
 * the first real client import.
 *
 * THE BAR IS APPLIED WHEN THE SUGGESTION IS READ, NOT WHEN IT IS MADE. Every
 * candidate the model offers is stored, including the weak ones. Re-running a
 * visit costs real money and a bar chosen before anyone has seen a real
 * baseline is a guess; storing everything means the bar can be moved later
 * against evidence, for nothing. It also keeps the two rules from §1 and §9
 * from colliding — the bar decides whether to *summon* a person, and §9 governs
 * what they are handed once summoned, which is never a blank space.
 */

import type { Db } from '../../db/index.js'
import { clears, CONFIDENCE, type Confidence } from '../confidence.js'
import { imageNote, prepareImage } from '../image.js'
import { requireModel, type ModelConfig } from '../models.js'
import { currentPrompt, type Prompt } from '../prompts.js'
import { runVisionTask, type RunArgs } from '../client.js'
import { completeJob, enqueue, recordGeneration, skipJob, type AiJob } from '../queue.js'
import { onlyIfUncertain, saidSomething } from '../uncertainty.js'

export const ROUTING_TASK = 'photo_routing'

/**
 * How sure the leading candidate must be before anyone is shown anything.
 *
 * Config, with a deliberate default of the strictest level. Nobody has run this
 * against a real baseline yet, and the cost of the two mistakes is not
 * symmetrical: too strict and the feature is quiet, which is exactly how it
 * behaves today with no feature at all; too loose and 200 tiles carry a guess
 * and the concierge learns to ignore all of them, which is worse than quiet and
 * much harder to undo.
 *
 * Fails closed on an unrecognized value. This word is ours, not the field app's.
 */
export function routingBar(): Confidence {
  const raw = process.env.HOUSESTEADY_ROUTING_BAR
  if (raw === undefined || raw === '') return 'certain'
  if (!(CONFIDENCE as readonly string[]).includes(raw)) {
    throw new Error(`HOUSESTEADY_ROUTING_BAR must be one of ${CONFIDENCE.join(', ')}, got ${JSON.stringify(raw)}.`)
  }
  return raw as Confidence
}

/** A pin the photograph might be of, as the model is shown it. */
export interface CandidatePin {
  pinId: string
  /** Display only. The session-scoped counter, never a join key. */
  number: number | null
  typeKind: string | null
  componentType: string | null
  freeformLabel: string | null
  notes: string[]
}

export interface RouteCandidate {
  /** 1-based index into the list the model was shown. */
  pin: number
  confidence: Confidence
  why: string
}

export interface Routing {
  /** Ranked, best first. Empty is a complete and common answer. */
  candidates: RouteCandidate[]
  /** What the photograph shows, in plain words. Evidence, never a value. */
  shows: string
  /** Only where nothing is certain: what would settle it. */
  unsure?: string
}

/**
 * What is stored on the generation.
 *
 * `candidates` carry the pin's real identity — the field-minted uuid this repo
 * adopts as canonical — resolved from the index the model answered with. The
 * index never leaves this file: it exists so the model refers to a candidate by
 * position rather than transcribing a uuid, and so a candidate outside the list
 * is structurally impossible rather than merely rejected.
 */
export interface StoredRouting {
  candidates: { pinId: string; number: number | null; label: string; confidence: Confidence; why: string }[]
  shows: string
  unsure?: string
  /** Whether the room was a fact or a guess. Decides what answers the desk gets. */
  origin: PhotoOrigin
  /**
   * The lead candidate in the shape an `assign` overlay records.
   *
   * Read by `overlay/store.ts` when an assignment cites this generation, so the
   * act's prior value is what the model proposed and its new value is what the
   * human chose — §2's accuracy record. Bar-independent on purpose: the bar is a
   * read-time decision and the record of what the model led with is not.
   */
  proposed: { toKind: 'pin'; toId: string } | null
  /** Anything the model returned that the candidate list did not contain. */
  outOfRange?: number[]
}

export interface RoutingDeps {
  prompts: Map<string, Prompt[]>
  model?: ModelConfig
  run?: <T>(args: RunArgs) => Promise<{ output: T; inputTokens: number; outputTokens: number }>
  resolvePath: (db: Db, visitId: string, mediaId: string) => string
}

const MAX_CANDIDATES = 3

export const ROUTE_SCHEMA = (candidateCount: number): Record<string, unknown> => ({
  type: 'object',
  additionalProperties: false,
  required: ['candidates', 'shows', 'unsure'],
  properties: {
    candidates: {
      type: 'array',
      maxItems: MAX_CANDIDATES,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pin', 'confidence', 'why'],
        properties: {
          // Bounded to the list actually shown. A pin that is not in this room
          // cannot be named, rather than being named and then filtered out.
          pin: { type: 'integer', minimum: 1, maximum: Math.max(candidateCount, 1) },
          confidence: { type: 'string', enum: [...CONFIDENCE] },
          why: { type: 'string' },
        },
      },
    },
    shows: { type: 'string' },
    unsure: { type: 'string' },
  },
})

/** How a pin reads in the candidate list and in the suggestion beside the photo. */
export function pinLabel(p: CandidatePin): string {
  if (p.componentType) return p.componentType
  if (p.freeformLabel) return p.freeformLabel
  return 'never typed'
}

/**
 * Where a loose photograph's room came from.
 *
 * `room` — the export says it belongs to this zone. A fact.
 * `inbox` — it belongs to nothing at all, and the room below is inferred from
 *   its grouping key. A hypothesis, and one that can be wrong.
 *
 * The distinction is carried, never flattened, because the two are different
 * acts at the desk and because the second needs an answer the first does not:
 * *this is not even the right room*.
 */
export type PhotoOrigin = 'room' | 'inbox'

export interface LoosePhoto {
  mediaId: string
  zoneId: string
  origin: PhotoOrigin
}

/**
 * Photographs with a room but no pin — the input set.
 *
 * Two sources. Zone-owned photographs are the bulk: 28 of 37 in the reference
 * export, correctly filed to a room and merely not to anything in it.
 *
 * Inbox photographs are the smaller and needier case, and the owner's call to
 * include them was right: a room photo is already filed somewhere true, while an
 * inbox photo is filed nowhere at all. Where its grouping key names a real zone,
 * that zone's pins are the candidate list. Where it does not — the reference
 * export's single inbox photo carries no key — there is no candidate set and the
 * job skips saying so, because a room guessed from nothing is a fabrication with
 * a plausible face on it.
 */
export function loosePhotos(db: Db, visitId: string): LoosePhoto[] {
  return db
    .prepare(
      `SELECT m.media_id AS mediaId,
              CASE WHEN m.owner_kind = 'zone' THEN m.owner_zone_id ELSE m.group_key END AS zoneId,
              CASE WHEN m.owner_kind = 'zone' THEN 'room' ELSE 'inbox' END AS origin
         FROM media m
        WHERE m.import_id = (SELECT id FROM imports WHERE visit_id = ? ORDER BY imported_at DESC LIMIT 1)
          AND m.kind = 'photo'
          AND (
            (m.owner_kind = 'zone'  AND m.owner_zone_id IS NOT NULL)
            -- The grouping key must name a zone this import actually has. A key
            -- that names nothing is not a weaker room, it is no room.
            OR (m.owner_kind = 'inbox' AND m.group_key IS NOT NULL AND EXISTS (
                  SELECT 1 FROM zones z WHERE z.import_id = m.import_id AND z.zone_id = m.group_key))
          )
        ORDER BY m.media_id`,
    )
    .all(visitId) as LoosePhoto[]
}

/**
 * The pins a photograph in this room could be of.
 *
 * Retired pins are excluded — attaching a new photograph to something the
 * concierge deliberately retired is work created, not saved. Typeless pins are
 * INCLUDED, described honestly as never typed: leaving one out would remove the
 * right answer from the list, and a right answer missing turns a harmless
 * silence into a confident wrong attachment somewhere else.
 */
export function candidatePins(db: Db, visitId: string, zoneId: string): CandidatePin[] {
  const rows = db
    .prepare(
      `SELECT p.pin_id, p.number, p.type_kind, p.component_type, p.freeform_label
         FROM pins p JOIN imports i ON i.id = p.import_id
        WHERE p.visit_id = ? AND p.zone_id = ? AND p.retired_at IS NULL
          AND i.id = (SELECT id FROM imports WHERE visit_id = ? ORDER BY imported_at DESC LIMIT 1)
        ORDER BY p.number`,
    )
    .all(visitId, zoneId, visitId) as {
    pin_id: string; number: number | null; type_kind: string | null
    component_type: string | null; freeform_label: string | null
  }[]

  const notes = db
    .prepare(
      `SELECT n.target_id, n.text FROM notes n JOIN imports i ON i.id = n.import_id
        WHERE i.visit_id = ? AND n.text IS NOT NULL`,
    )
    .all(visitId) as { target_id: string | null; text: string }[]

  return rows.map((r) => ({
    pinId: r.pin_id,
    number: r.number,
    typeKind: r.type_kind,
    componentType: r.component_type,
    freeformLabel: r.freeform_label,
    notes: notes.filter((n) => n.target_id === r.pin_id).map((n) => n.text),
  }))
}

/** The candidate list as the model is shown it — data, never wording. */
export function candidateFacts(pins: CandidatePin[], origin: PhotoOrigin = 'room'): string {
  // Provenance of the room itself, which is a fact about this call rather than
  // an instruction, so it belongs here and not in the prompt file. For an inbox
  // photograph the room is a guess, and the model has to be able to say so.
  const provenance =
    origin === 'inbox'
      ? 'This photograph was not filed against a room at all. It sat in the inbox carrying a ' +
        'grouping key, and that key names the room below — which may be wrong.\n\n'
      : ''
  const lines = pins.map((p, i) => {
    const bits = [`${i + 1}. ${pinLabel(p)}`]
    if (p.number !== null) bits.push(`(the concierge calls this pin ${p.number})`)
    if (p.typeKind === null) {
      bits.push('— marked during the visit and never typed, so nothing is known about it beyond its position')
    } else if (p.typeKind === 'freeform') {
      bits.push('— typed by hand rather than picked from the component list')
    }
    for (const n of p.notes) bits.push(`\n     note: ${n}`)
    return bits.join(' ')
  })
  return `${provenance}The pins in this room, in the order you must refer to them:\n\n${lines.join('\n')}`
}

/** Queue one routing job per loose photo. */
export function queuePhotoRouting(db: Db, propertyId: string, visitId: string, actorId: string): number {
  const photos = loosePhotos(db, visitId)
  for (const p of photos) {
    enqueue({ db, propertyId, visitId, task: ROUTING_TASK, targetKind: 'media', targetId: p.mediaId, actorId })
  }
  return photos.length
}

/**
 * Decide where one loose photograph might belong.
 *
 * Returns null when the job was correctly skipped rather than run. Skipping
 * writes a reason on the row — doctrine 6 — because an absent job and a job that
 * decided not to run look identical from outside and only one of them is the
 * feature working.
 */
export async function runRoute(db: Db, job: AiJob, deps: RoutingDeps): Promise<StoredRouting | null> {
  const photo = photoRow(db, job.visit_id, job.target_id)
  if (!photo) {
    skipJob(db, job.id, 'this photo is attached to a pin or a canvas, so it is not loose')
    return null
  }
  if (!photo.zoneId) {
    // An inbox photo whose grouping key names nothing, or names a room this
    // import does not have. There is no candidate set, and inventing one from
    // the photograph would be the builder deciding which room somebody stood in.
    skipJob(
      db,
      job.id,
      photo.origin === 'inbox'
        ? 'this photo is in the inbox with no grouping key naming a room in this visit, so there are no pins to rank'
        : 'this photo is not owned by a room, so there are no pins to rank',
    )
    return null
  }
  if (photo.fileStatus !== 'present') {
    // The commonest case on a manifest-only import, which is what the reference
    // export is: the row is there and the bytes are not. Queued and skipped
    // rather than filtered out at queue time, so the count of photographs the
    // assists could not look at is a row somebody can find rather than a
    // difference between two numbers nobody compares.
    skipJob(db, job.id, `the photograph is not on this machine (${photo.fileStatus})`)
    return null
  }
  const pins = candidatePins(db, job.visit_id, photo.zoneId)
  if (pins.length === 0) {
    // Nothing to route to. Cheap, common in rooms that were only photographed,
    // and worth a row of its own so the count of "looked at and left alone"
    // stays honest.
    skipJob(db, job.id, 'no pins in this room to attach it to')
    return null
  }

  const model = deps.model ?? requireModel('fast')
  const prompt = currentPrompt(deps.prompts, ROUTING_TASK)
  const image = await prepareImage(deps.resolvePath(db, job.visit_id, job.target_id), model.maxImageEdge)
  const facts = candidateFacts(pins, photo.origin)
  const run = deps.run ?? runVisionTask

  const { output, inputTokens, outputTokens } = await run<Routing>({
    model, prompt, facts, schema: ROUTE_SCHEMA(pins.length),
    images: [{ data: image.data, mediaType: image.mediaType }],
  })

  const stored = normalise(output, pins, photo.origin)

  const generationId = recordGeneration({
    db, propertyId: job.property_id, visitId: job.visit_id,
    // Whoever triggered the run owns the generation. The model is recorded
    // separately; conflating them would make a proposal read as a human act.
    actorId: job.actor_id, task: ROUTING_TASK,
    targetKind: job.target_kind, targetId: job.target_id, model: model.id,
    promptId: prompt.id, promptVersion: prompt.version, promptHash: prompt.hash,
    // The candidate list is part of what produced the answer, so it is part of
    // the provenance. Without it "why did it say pin 4" is unanswerable once the
    // next visit renumbers everything.
    inputRefs: {
      mediaId: job.target_id, zoneId: photo.zoneId, origin: photo.origin,
      image: imageNote(image), candidates: facts,
    },
    output: stored,
    // Nothing was offered at all: the model looked at the room's pins and none
    // of them is what this photograph is of. A complete answer, and there is
    // nothing for a human to accept — which is what `abstained` guards.
    abstained: stored.candidates.length === 0,
    inputTokens, outputTokens,
  })
  completeJob(db, job.id, generationId)
  return stored
}

/**
 * Resolve indexes to pins, and keep the uncertainty note only where it belongs.
 *
 * Exported for the tests, which is worth it: this is where a model's answer
 * stops being a list of numbers and becomes claims about somebody's house.
 */
export function normalise(output: Routing, pins: CandidatePin[], origin: PhotoOrigin = 'room'): StoredRouting {
  const candidates: StoredRouting['candidates'] = []
  const outOfRange: number[] = []

  for (const c of output.candidates ?? []) {
    const pin = pins[c.pin - 1]
    if (!pin) {
      // The schema bounds this, so it should be unreachable. Kept and reported
      // rather than dropped anyway: doctrine 6, and a suggestion pointing at
      // nothing is exactly the kind of thing that would otherwise vanish.
      outOfRange.push(c.pin)
      continue
    }
    candidates.push({
      pinId: pin.pinId,
      number: pin.number,
      label: pinLabel(pin),
      confidence: c.confidence,
      why: (c.why ?? '').trim(),
    })
  }

  const lead = candidates[0]
  return {
    candidates,
    origin,
    shows: (output.shows ?? '').trim(),
    // Only where uncertainty exists. A hedge printed beside a candidate the
    // model called `certain` teaches people to weigh the hedge against the
    // reading, which erodes trust in every confident value on the screen.
    unsure: onlyIfUncertain(output.unsure, !lead || lead.confidence !== 'certain', saidSomething)?.trim(),
    proposed: lead ? { toKind: 'pin', toId: lead.pinId } : null,
    ...(outOfRange.length > 0 ? { outOfRange } : {}),
  }
}

/** Does this routing clear the bar — should anyone be shown it at all? */
export const speaks = (stored: StoredRouting, bar: Confidence = routingBar()): boolean =>
  stored.candidates.length > 0 && clears(stored.candidates[0]!.confidence, bar)

/**
 * An answer that is not a pin.
 *
 * CLAUDE.md §9's second guard: *"none of these" is always present and exactly as
 * easy as the top option*, or acquiescence sets in and the model's framing
 * quietly becomes the answer.
 *
 * Extending routing to the inbox splits that option in two, because the question
 * splits in two. For a room photograph the room is a fact and the only
 * non-answer is *not one of these pins*. For an inbox photograph the room is a
 * guess made from a grouping key, so *not this room at all* is a separate and
 * equally real answer — and if it were missing, the only way to express it would
 * be the one that says the pins are wrong, which files a true statement about
 * the wrong thing.
 *
 * Carried as data rather than left to the screen to infer from `origin`. The
 * guard has to survive the extension, and a guard that depends on a renderer
 * remembering a rule is a guard that will be forgotten the first time somebody
 * builds a second view.
 */
export type Dismissal = 'none-of-these' | 'belongs-elsewhere'

export const dismissalsFor = (origin: PhotoOrigin): Dismissal[] =>
  origin === 'inbox' ? ['none-of-these', 'belongs-elsewhere'] : ['none-of-these']

export interface RoutingSuggestion {
  generationId: string
  mediaId: string
  /** Ranked, best first, INCLUDING the weaker ones below the lead. */
  candidates: StoredRouting['candidates']
  shows: string
  unsure?: string
  /**
   * Where this photograph came from — and therefore which desk it belongs on.
   *
   * The owner's condition, and it is a real distinction rather than a label:
   * agreeing to a suggestion about a room photograph moves it from the room to a
   * pin, while agreeing about an inbox photograph files something that was
   * filed nowhere. Different acts, different flows.
   */
  origin: PhotoOrigin
  /** Every answer that is not a pin. Never empty. */
  dismissals: Dismissal[]
}

export interface RoutingBatch {
  /** Recorded on the batch, because the bar is part of what produced it. */
  bar: Confidence
  /** §1's "6 photos look like they belong to pins". */
  suggestions: RoutingSuggestion[]
  /** Looked at, something found, not confidently enough to interrupt anyone. */
  belowBar: number
  /** Looked at, and nothing in that room is what the photograph is of. */
  silent: number
}

/**
 * The batch a person is actually shown, and everything that stayed quiet.
 *
 * Takes proposals as data rather than a database handle — partly so it is
 * testable without one, and partly because `ai_generations` has exactly three
 * readers by doctrine and a task file is not one of them. A read path that
 * joined the table for convenience is how an unsigned value reaches a screen.
 *
 * THE COUNTS ARE NOT DECORATION. Doctrine 6: nothing drops silently. Without
 * them a quiet feature and a broken one look identical, and "it never suggests
 * anything" would be impossible to tell from "it never ran".
 *
 * ONCE SOMEBODY IS SUMMONED, THEY GET EVERYTHING. The weaker candidates below
 * the lead are included, not trimmed to the one that cleared the bar. The bar
 * decides whether to interrupt; CLAUDE.md §9 governs what is handed over once
 * the interruption is justified, and a single confident line with the
 * alternatives hidden is exactly the framing that makes acceptance the default.
 */
export function routingBatch(
  proposals: { generationId: string; task: string; targetId: string | null; output: unknown }[],
  bar: Confidence = routingBar(),
): RoutingBatch {
  const batch: RoutingBatch = { bar, suggestions: [], belowBar: 0, silent: 0 }

  for (const p of proposals) {
    if (p.task !== ROUTING_TASK) continue
    const stored = p.output as StoredRouting | null
    if (!stored || !Array.isArray(stored.candidates) || stored.candidates.length === 0) {
      batch.silent++
      continue
    }
    if (!clears(stored.candidates[0]!.confidence, bar)) {
      batch.belowBar++
      continue
    }
    const origin: PhotoOrigin = stored.origin === 'inbox' ? 'inbox' : 'room'
    batch.suggestions.push({
      generationId: p.generationId,
      mediaId: p.targetId ?? '',
      candidates: stored.candidates,
      shows: stored.shows,
      unsure: stored.unsure,
      origin,
      dismissals: dismissalsFor(origin),
    })
  }
  return batch
}

function photoRow(
  db: Db,
  visitId: string,
  mediaId: string,
): { zoneId: string | null; origin: PhotoOrigin; fileStatus: string } | undefined {
  return db
    .prepare(
      `SELECT CASE WHEN m.owner_kind = 'zone' THEN m.owner_zone_id
                   WHEN EXISTS (SELECT 1 FROM zones z
                                 WHERE z.import_id = m.import_id AND z.zone_id = m.group_key)
                   THEN m.group_key END                                    AS zoneId,
              CASE WHEN m.owner_kind = 'zone' THEN 'room' ELSE 'inbox' END AS origin,
              m.file_status                                                AS fileStatus
         FROM media m
        WHERE m.import_id = (SELECT id FROM imports WHERE visit_id = ? ORDER BY imported_at DESC LIMIT 1)
          AND m.media_id = ? AND m.owner_kind IN ('zone', 'inbox')`,
    )
    .get(visitId, mediaId) as { zoneId: string | null; origin: PhotoOrigin; fileStatus: string } | undefined
}
