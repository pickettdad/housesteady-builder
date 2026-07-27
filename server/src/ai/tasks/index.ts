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
 */
export function queueAssists(db: Db, propertyId: string, visitId: string): QueuedWork {
  const nameplates = queueNameplateReading(db, propertyId, visitId)
  const routing = queuePhotoRouting(db, propertyId, visitId)
  const pinTypes = queuePinTypes(db, propertyId, visitId)
  return { nameplates, routing, pinTypes, total: nameplates + routing + pinTypes }
}
