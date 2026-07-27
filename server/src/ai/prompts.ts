/**
 * The prompt library.
 *
 * Spec §3: prompts are versioned, content-hashed config files. No model call
 * ever uses an inline prompt string, and every generation records which prompt
 * version produced it.
 *
 * The reason is §9 of CLAUDE.md: at one concierge the binder sounds like one
 * person; at five it does not, and AI assist is the mechanism that keeps it
 * consistent. That only works if "why does this binder read differently" is
 * answerable — which means the prompt that produced any given artifact has to
 * be recoverable, exactly, months later.
 *
 * IDENTITY COMES FROM THE PATH. `/prompts/<task>/<version>.md` gives the id and
 * the version; the hash is of the whole file. Nothing is declared inside the
 * file, so the declared version and the file's location cannot disagree — a
 * failure mode that costs nothing to design out and is miserable to debug.
 *
 * FAIL CLOSED. A missing prompt directory, an empty prompt, a version that does
 * not parse — all refuse loudly at startup. This is structure, not vocabulary:
 * doctrine 7 says fail open on words the builder has not met and fail closed on
 * shape, and a prompt file is shape.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** Repo root /prompts — beside /server and /web, versioned in git like any config. */
export const promptsRoot = process.env.HOUSESTEADY_PROMPTS ?? join(here, '..', '..', '..', 'prompts')

export class PromptRefused extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'PromptRefused'
  }
}

export interface Prompt {
  /** The task this prompt serves — the directory name. */
  id: string
  /** The version — the filename without .md. Sorts lexically; use v001, v002. */
  version: string
  /** sha256 of the file's bytes. Recorded on every generation made with it. */
  hash: string
  /** The prompt text itself. */
  text: string
}

const VERSION = /^v\d{3}$/

/**
 * Read every prompt under /prompts.
 *
 * Called once at startup and held in memory. Editing a prompt therefore needs a
 * restart, which is the right friction: a prompt change is a behaviour change
 * and §3 says it does not ship without a golden-set run behind it.
 */
export function loadPrompts(root = promptsRoot): Map<string, Prompt[]> {
  let tasks: string[]
  try {
    tasks = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory())
  } catch {
    throw new PromptRefused(`No prompt library at ${root}.`, 'prompt.no-library')
  }

  const library = new Map<string, Prompt[]>()
  for (const task of tasks) {
    const files = readdirSync(join(root, task)).filter((f) => f.endsWith('.md'))
    const versions: Prompt[] = []

    for (const file of files) {
      const version = file.slice(0, -3)
      if (!VERSION.test(version)) {
        throw new PromptRefused(
          `Prompt ${task}/${file} is not named vNNN.md. Versions must sort, so they must be zero-padded.`,
          'prompt.bad-version',
        )
      }
      const raw = readFileSync(join(root, task, file))
      const text = raw.toString('utf8').trim()
      if (text.length === 0) {
        throw new PromptRefused(`Prompt ${task}/${file} is empty.`, 'prompt.empty')
      }
      versions.push({
        id: task,
        version,
        // Hash the bytes on disk, not the trimmed text. A whitespace-only edit
        // still changes the hash — which is correct, because it means the file
        // is not the one the golden set was approved against.
        hash: createHash('sha256').update(raw).digest('hex'),
        text,
      })
    }

    if (versions.length > 0) {
      versions.sort((a, b) => a.version.localeCompare(b.version))
      library.set(task, versions)
    }
  }

  return library
}

/**
 * The version a task runs at today — the highest present.
 *
 * Older versions stay on disk and stay loadable. That is what makes a golden
 * set diff possible: run v001 and v002 over the same fixtures and compare, which
 * §3 calls the highest-value piece of AI infrastructure in the build.
 */
export function currentPrompt(library: Map<string, Prompt[]>, task: string): Prompt {
  const versions = library.get(task)
  if (!versions || versions.length === 0) {
    throw new PromptRefused(`No prompt for task '${task}'.`, 'prompt.no-task')
  }
  return versions[versions.length - 1]!
}

export function promptAt(library: Map<string, Prompt[]>, task: string, version: string): Prompt {
  const found = library.get(task)?.find((p) => p.version === version)
  if (!found) {
    throw new PromptRefused(`No prompt ${task}/${version}.`, 'prompt.no-version')
  }
  return found
}
