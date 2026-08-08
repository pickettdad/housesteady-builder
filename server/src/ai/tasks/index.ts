/**
 * Which runner handles which task, and what a visit owes.
 *
 * One map rather than a switch in the worker, so adding a task is adding a file
 * and a line here. The unknown-task case fails loudly and deliberately: task
 * names are OURS, not the field app's, so doctrine 7's fail-open rule does not
 * cover them — a job whose task nothing recognises is a queue row that would sit
 * `queued` forever while the progress figures said work was still coming.
 */

import type { Db } from '../../db/index.js'
import type { AiJob } from '../queue.js'
import type { Prompt } from '../prompts.js'
import type { ModelConfig } from '../models.js'
import type { RunArgs } from '../client.js'
import { IDENTIFY_TASK, runIdentify } from './identify.js'
import {
  CLASSIFY_TASK, EXTRACT_TASK, queueNameplateReading, runClassify, runExtract,
} from './nameplate.js'
import { PIN_TYPE_TASK, queuePinTypes, runPinType } from './pinType.js'
import { queuePhotoRouting, ROUTING_TASK, runRoute } from './routing.js'

/** What every runner needs. Injected so a test can supply all of it. */
export interface AssistDeps {
  prompts: Map<string, Prompt[]>
  model?: ModelConfig
  run?: <T>(args: RunArgs) => Promise<{ output: T; inputTokens: number; outputTokens: number }>
  resolvePath: (db: Db, visitId: string, mediaId: string) => string
}

export type TaskRunner = (db: Db, job: AiJob, deps: AssistDeps) => Promise<unknown>

export const TASK_RUNNERS: Record<string, TaskRunner> = {
  [CLASSIFY_TASK]: runClassify,
  [EXTRACT_TASK]: runExtract,
  [ROUTING_TASK]: runRoute,
  [PIN_TYPE_TASK]: runPinType,
  // Runnable by the worker like any other task; **not queued by an import** —
  // see `queueAssists` below and the head of `identify.ts`.
  [IDENTIFY_TASK]: runIdentify,
}

export class UnknownTask extends Error {
  constructor(readonly task: string) {
    super(
      `No runner for task '${task}'. Task names are this repo's own, so an unrecognised one is a bug ` +
        `rather than the field app moving ahead of the builder.`,
    )
    this.name = 'UnknownTask'
  }
}

export const runnerFor = (task: string): TaskRunner => {
  const runner = TASK_RUNNERS[task]
  if (!runner) throw new UnknownTask(task)
  return runner
}

export interface QueuedWork {
  nameplates: number
  routing: number
  pinTypes: number
  total: number
}

/**
 * Everything an imported visit owes the assists.
 *
 * §4: kicked off after import completes, never during — import is the operation
 * that must not fail, and it already moves 1.5–2 GB. Enqueueing is idempotent,
 * so pressing this a second time costs nothing and does not re-pay for work
 * already done.
 *
 * ROUTING IS THE EXPENSIVE ONE, and the arithmetic is worth stating where it can
 * be seen. Nameplate classification runs on pin-attached photos — 5 of 37 in the
 * reference export. Routing runs on room photos, which are the 200+ that
 * classification exists to avoid. The per-visit spend cap is what stands between
 * that and a surprise, and it is checked before each call rather than after.
 *
 * **IDENTIFICATION IS NOT HERE, AND ITS ABSENCE IS THE FEATURE.** The AI
 * Processing Decision's identification addendum §A: *nameplate extraction sends a
 * data plate; routing sends loose room photographs; **identification sends the
 * room**.* §B authorizes that on the owner's own property and **§C gates a
 * client's property behind a disclosure that does not exist yet**. Nothing in
 * this database records whose house an import is of, so no code can enforce §C —
 * what it can do is decline to start on its own. `queueIdentification` is called
 * by the run script and by nothing in the import path. **Adding it to this
 * function would make the largest send this system performs a side effect of
 * dropping in a zip file.**
 */
export function queueAssists(db: Db, propertyId: string, visitId: string, actorId: string): QueuedWork {
  const nameplates = queueNameplateReading(db, propertyId, visitId, actorId)
  const routing = queuePhotoRouting(db, propertyId, visitId, actorId)
  const pinTypes = queuePinTypes(db, propertyId, visitId, actorId)
  return { nameplates, routing, pinTypes, total: nameplates + routing + pinTypes }
}
