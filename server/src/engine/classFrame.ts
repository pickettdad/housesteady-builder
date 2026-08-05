/**
 * The class frame — Increment 5 §1, as corrected by Amendment 3 §B.
 *
 * **The consumer of a file that is deliberately empty**, the second one this
 * repo has shipped. `retirement-lineage-v1.json` was the first and the reasoning
 * is the same: the content is an owner-authored pass, a generated approximation
 * would make acceptance the default, and emptiness is the honest state.
 *
 * What is different here, and it is why Amendment 3 §C says ship the frame
 * before the content: **pass two written as prose and translated into this shape
 * later is a hand transformation over ~172 rows.** That is the shape of every
 * drift failure in this project. Written against the shipped file, it is
 * authored in its final form.
 *
 * ---
 *
 * ## Two cross-checks, and they are not equally strong
 *
 * **§1a — component types, against the import's own config snapshot.** The
 * strong one, because it reads something this file does not own. A class naming
 * a type the config does not declare is a visible error.
 *
 * **§B3 — vocabulary references, within this file**, across all four
 * vocabularies including Amendment 4's owner questions. The weaker one, and
 * Amendment 3 says so plainly: both sides live in one file and are authored by
 * one session, so it catches typos and drift and **cannot catch a judgement
 * error** — a category that is declared, referenced, and simply wrong.
 *
 * **Both are idle until there are classes.** With `classes` empty each iterates
 * nothing and reports green forever, which is rule 11 twice in one module. Their
 * tests construct the offending input rather than reading the shipped file,
 * because the shipped file can never exercise them.
 *
 * ## And the §B3 check has a second failure mode that is not about code
 *
 * If the vocabulary is harvested *from* the classes after they are written, no
 * class can name an undeclared term and the check can never fail. **The file
 * says the vocabularies are authored from the systems first**, and no code can
 * enforce that — it is an authoring discipline, recorded where the author will
 * be reading.
 *
 * ---
 *
 * ## An access-gated point is not a gap, and this module never lets it become one
 *
 * *We did not look inside the tank* is not a failure to inspect. It is a thing
 * that happens when the tank is next opened, and we will be there. §5a already
 * requires an absence to state its basis; Amendment 5 is that rule one step
 * earlier. A `requires-access-event` point is a **coordination** item rather
 * than a visit item — and the event is one the concierge coordinates anyway,
 * which is the role the service actually performs.
 *
 * ## And nothing here can direct a Discovery capture
 *
 * Amendment 5 §C, stated for the whole engine: **every engine output lands after
 * identification, and Discovery precedes identification.** An access condition
 * is exactly the kind of thing that reads like a capture instruction, which is
 * why the boundary is recorded in the frame file as well as here. What Discovery
 * must photograph comes from the Checklist Master, driven by a property flag.
 *
 * ---
 *
 * ## These inspection points are not field checklist items, and never become them
 *
 * **Amendment 6 §A, and it is written here because §D's finding was that the
 * design was right and unexplained** — the absence of a reason is what let the
 * question get asked as a dichotomy. Whoever is about to make the frame generate
 * the field checklist will be reading this file, so the reason lives in it.
 *
 * > The field checklist is what the concierge is asked to **do at the visit**.
 * > These points are what the binder expects to **know** about that kind of
 * > thing. Neither generates the other.
 *
 * **What actually crosses the wire:** a class seeds a pin's *component type*, and
 * the type brings whatever the field config declares for it. Nothing about a
 * class's own points travels. §2's stage table always said this.
 *
 * Two independent reasons, and the second is the load-bearing one:
 *
 * **1 — Eight of the 69 points are `requires-access-event`**, which Amendment 5
 * ruled are coordination items and never visit items. Generating checklist items
 * would put all eight on a visit list as work the concierge cannot do: a heat
 * exchanger behind a sealed cabinet, a flue liner wanting a camera, three points
 * inside a buried tank. Precisely the failure Amendment 5 exists to prevent.
 *
 * **2 — It would destroy `checkComponentTypes`, and would look like tidying.**
 * §1a is the strong cross-check *because* the class list and the field config are
 * maintained separately and can disagree. If this file generated that one they
 * could never disagree, and the check would be **idle from birth** — the §B3
 * weakness documented above, promoted onto the only cross-vocabulary check the
 * engine has. *A check whose two sides cannot disagree has not been passing.*
 * This reason holds even if every point were `direct`.
 *
 * **A stub type is therefore not a defect.** It means the field app asks nothing
 * at that pin; the binder still knows what it wanted. The difference lands in the
 * gap report's *missing from us* column, which is what that column is for — and
 * it tells the field team their config has catching up to do per property, with
 * evidence. Three of 68 classes today. Amendment 6 §C, whose caveats stand: that
 * join is unbuilt, and whether the field app grows items for `cistern` and
 * `iron-filter` is a field decision that goes through the owner.
 *
 * ---
 *
 * ## Fail open on a missing file, fail closed on a broken one
 *
 * The same split as `lineage.ts`. A missing file is the ordinary state before
 * this ships anywhere and yields an empty frame with a note saying so. A file
 * that is present and unparseable is structure, and refuses loudly — doctrine 7.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { componentGraph, type TypeState } from '../audit/components.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DEFAULT_PATH = join(repoRoot, 'schema', 'class-frame-v1.json')

export type InspectionKind = 'look' | 'measure'

/**
 * Whether the thing has to be opened before the point can be answered, and by
 * whom. Amendment 5 §B, raised by the owner from field experience.
 *
 * The failure it exists for: the desk pass generates *measure the sludge and
 * scum depth* and the concierge arrives to find the lids under eight inches of
 * sod, because between pump-outs that is where rural lids live. Either the visit
 * becomes an excavation nobody agreed to, or the item is silently skipped and
 * **the record shows an inspection that did not happen.**
 *
 * Not one system's quirk: the maintenance schedule's own cautions already say
 * *never remove panel covers — visual only, from outside the enclosure*, which
 * is the interior of a panel being access-gated on an electrician's visit. That
 * caution has been true all along with nothing downstream able to represent it.
 */
export type AccessCondition = 'direct' | 'requires-access-found' | 'requires-access-event'

/** The default, and most points are it. Declared so it is not a literal. */
export const DEFAULT_ACCESS: AccessCondition = 'direct'

export interface VocabularyTerm {
  id: string
  label: string
  note?: string
}

export interface InspectionPoint extends VocabularyTerm {
  kind: InspectionKind
  /**
   * Required on a `measure` point. **`null` is a legitimate value** meaning
   * deliberately unitless — the field app already carries three such items,
   * because %WME, %MC and relative 0–100 are different scales.
   *
   * An ABSENT key is neither declared nor explicitly absent, and is an error.
   * Amendment 3 §B2; ninth instance of the distinction.
   */
  unit?: string | null
  /**
   * Defaults to `direct` when absent — unlike `unit`, whose absence is an error.
   * The asymmetry is deliberate: most points are direct and requiring every one
   * to say so would be noise, whereas a measure with no unit is a reading whose
   * scale nobody recorded.
   */
  access?: AccessCondition
  /**
   * The third-party event that opens the thing — `septic-pump-out`,
   * `annual-combustion-service`, `panel-service`. **Required when `access` is
   * `requires-access-event` and meaningless otherwise:** a gated point that
   * cannot name its event is a point nobody can schedule.
   */
  accessEvent?: string
}

export interface ClassEntry {
  id: string
  label: string
  /** A set. Two is ordinary — see the file's `classShape`. Amendment 3 §B1. */
  systems: string[]
  /** A config component type, or the literal `'none'`. Never absent. */
  componentType: string
  careCategories: string[]
  inspectionPoints: string[]
  opportunityConditions: string[]
  /** Amendment 4 §A — the fifth output. Wording lives in its own file. */
  ownerQuestions: string[]
  replacementHorizon: boolean
}

export interface ClassFrame {
  version: string
  careCategories: VocabularyTerm[]
  inspectionPoints: InspectionPoint[]
  opportunityConditions: VocabularyTerm[]
  ownerQuestions: VocabularyTerm[]
  classes: ClassEntry[]
  /** True when the file was not found. Distinct from a file declaring nothing. */
  absent: boolean
  /** Always populated, so a caller reporting state has words rather than a flag. */
  note: string
}

export class ClassFrameUnreadable extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'ClassFrameUnreadable'
  }
}

/**
 * Read the frame.
 *
 * A file that is absent yields an empty frame that says so — `absent: true` is
 * *we have no frame* and an empty `classes` on a present file is *the frame
 * declares no classes yet*. Those are different facts and a caller must be able
 * to tell them apart, which is the same rule `lineage.ts` holds.
 */
export function readClassFrame(path: string = DEFAULT_PATH): ClassFrame {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return {
      version: 'absent',
      careCategories: [], inspectionPoints: [], opportunityConditions: [], ownerQuestions: [], classes: [],
      absent: true,
      note: `No class frame at ${path.replace(repoRoot, '')}. Nothing is wrong: the engine has no classes to work from and says so, rather than behaving as though the frame declared nothing.`,
    }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch (e) {
    throw new ClassFrameUnreadable(
      `The class frame at ${path.replace(repoRoot, '')} is present and will not parse: ${(e as Error).message}. ` +
        `A missing frame is a state; a broken one is structure, and structure refuses.`,
      'class-frame.unparseable',
    )
  }

  const arr = <T>(k: string): T[] => (Array.isArray(parsed[k]) ? (parsed[k] as T[]) : [])
  const classes = arr<ClassEntry>('classes')
  const frame: ClassFrame = {
    version: typeof parsed.version === 'string' ? parsed.version : 'unknown',
    careCategories: arr<VocabularyTerm>('careCategories'),
    inspectionPoints: arr<InspectionPoint>('inspectionPoints'),
    opportunityConditions: arr<VocabularyTerm>('opportunityConditions'),
    ownerQuestions: arr<VocabularyTerm>('ownerQuestions'),
    classes,
    absent: false,
    note:
      classes.length === 0
        ? 'The class frame declares no classes. That is its shipped state and the honest one — pass two is an owner-authored content pass. The engine will identify objects and place none of them until it is written.'
        : `${classes.length} classes declared.`,
  }
  return frame
}

// --------------------------------------------------------------- the checks

export interface FrameProblem {
  classId: string
  /** What is wrong, in words a person can act on. */
  problem: string
  /** Machine-readable, for counting: `undeclared-care-category`, and so on. */
  code: string
}

/**
 * §B3 — every term a class references is declared in this file.
 *
 * **Idle while `classes` is empty**, and weaker than §1a even when it is not:
 * both sides are here and one session wrote them. It catches `filter change`
 * against `filter-change`. It cannot catch a category that is declared,
 * referenced, and wrong.
 */
export function checkVocabulary(frame: ClassFrame): FrameProblem[] {
  const care = new Set(frame.careCategories.map((t) => t.id))
  const points = new Set(frame.inspectionPoints.map((t) => t.id))
  const opps = new Set(frame.opportunityConditions.map((t) => t.id))
  const questions = new Set(frame.ownerQuestions.map((t) => t.id))

  const out: FrameProblem[] = []
  for (const c of frame.classes) {
    const check = (ids: string[] | undefined, known: Set<string>, what: string, code: string): void => {
      for (const id of ids ?? []) {
        if (!known.has(id)) {
          out.push({
            classId: c.id,
            problem: `${c.id} names the ${what} \`${id}\`, which this file does not declare. Either the term is a typo for a declared one, or the vocabulary is missing an entry — and the second is the interesting case.`,
            code,
          })
        }
      }
    }
    check(c.careCategories, care, 'care category', 'undeclared-care-category')
    check(c.inspectionPoints, points, 'inspection point', 'undeclared-inspection-point')
    check(c.opportunityConditions, opps, 'opportunity condition', 'undeclared-opportunity-condition')
    check(c.ownerQuestions, questions, 'owner question', 'undeclared-owner-question')
  }
  return out
}

/**
 * §B2 — a `measure` point declares a unit, or declares its absence.
 *
 * Separate from `checkVocabulary` because it is about the vocabulary's own
 * entries rather than about a class referencing them, and because it can fire
 * on a file with no classes at all.
 */
export function checkAccess(frame: ClassFrame): FrameProblem[] {
  const out: FrameProblem[] = []
  for (const p of frame.inspectionPoints) {
    const access = p.access ?? DEFAULT_ACCESS
    if (access === 'requires-access-event' && !p.accessEvent) {
      out.push({
        classId: p.id,
        problem: `The inspection point \`${p.id}\` rides an access event and does not name one. A gated point that cannot say which event opens the thing is a point nobody can schedule, and it would sit on the Inspection Visit list forever looking like work.`,
        code: 'access-event-unnamed',
      })
    }
    if (access !== 'requires-access-event' && p.accessEvent) {
      out.push({
        classId: p.id,
        problem: `The inspection point \`${p.id}\` names the access event \`${p.accessEvent}\` but is \`${access}\`, so nothing waits for it. Either the access condition is wrong or the event is left over from an edit.`,
        code: 'access-event-orphaned',
      })
    }
  }
  return out
}

export function checkUnits(frame: ClassFrame): FrameProblem[] {
  return frame.inspectionPoints
    .filter((p) => p.kind === 'measure' && !('unit' in p))
    .map((p) => ({
      classId: p.id,
      problem: `The measure point \`${p.id}\` declares no unit and does not declare that it has none. A unit is declared, or its absence is explicit — an absent key is neither, and a reading whose scale nobody recorded is worse than no reading.`,
      code: 'measure-point-no-unit',
    }))
}

export interface ComponentTypeCheck {
  problems: FrameProblem[]
  /** What each class's declared type resolved to. Reported, not only counted. */
  resolved: { classId: string; componentType: string; state: TypeState | 'none' }[]
  /** Classes mapping to a stub — declared, ids reserved, no items. */
  stubs: string[]
}

/**
 * §1a — every declared component type exists in **the import's own config
 * snapshot**, never in a list kept here.
 *
 * The named failure: the class list and the field config maintained separately,
 * disagreeing, and nobody noticing until a session plan seeds the wrong
 * checklist. Same discipline as the trigger vocabulary cross-check.
 *
 * **`none` is a legitimate answer and is not checked against anything** — it
 * says *this kind of thing is not inspected*, which is ordinary. An absent key
 * says nobody filled it in, and that is the error.
 */
export function checkComponentTypes(
  frame: ClassFrame,
  configSnapshot: Record<string, unknown>,
): ComponentTypeCheck {
  const graph = componentGraph(configSnapshot)
  const problems: FrameProblem[] = []
  const resolved: ComponentTypeCheck['resolved'] = []
  const stubs: string[] = []

  for (const c of frame.classes) {
    const declared = c.componentType
    if (declared === undefined || declared === null || declared === '') {
      problems.push({
        classId: c.id,
        problem: `${c.id} declares no component type. A class that maps to nothing must say \`none\` — an absent key says nobody filled it in, and the two are different facts.`,
        code: 'component-type-absent',
      })
      continue
    }
    if (declared === 'none') {
      resolved.push({ classId: c.id, componentType: 'none', state: 'none' })
      continue
    }
    const state = graph.state(declared)
    resolved.push({ classId: c.id, componentType: declared, state })
    if (state === 'undeclared') {
      problems.push({
        classId: c.id,
        problem: `${c.id} maps to the component type \`${declared}\`, which this import's config does not declare. Either the class list is ahead of the field config or one of them has a typo — and a session plan seeded from this would carry the wrong checklist.`,
        code: 'component-type-undeclared',
      })
    } else if (state === 'stub') {
      stubs.push(c.id)
    }
  }
  return { problems, resolved, stubs }
}

/**
 * Everything wrong with the frame, in one call.
 *
 * Takes the config snapshot rather than a database handle so it is testable
 * against a literal, and so the same function serves a stored import and a
 * manifest being examined — the shape `componentGraph` already uses.
 */
export function auditClassFrame(
  frame: ClassFrame,
  configSnapshot: Record<string, unknown>,
): { problems: FrameProblem[]; stubs: string[]; note: string } {
  const types = checkComponentTypes(frame, configSnapshot)
  const problems = [...types.problems, ...checkVocabulary(frame), ...checkUnits(frame), ...checkAccess(frame)]
  return {
    problems,
    stubs: types.stubs,
    note:
      frame.classes.length === 0
        ? 'No classes declared, so the component-type and vocabulary checks iterated nothing. That is not a pass — it is an empty run, and the distinction is rule 11.'
        : `${frame.classes.length} classes checked, ${problems.length} problems, ${types.stubs.length} mapping to a stub type.`,
  }
}
