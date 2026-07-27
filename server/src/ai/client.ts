/**
 * The model call itself.
 *
 * Deliberately thin. It takes a prompt object and some images and returns
 * structured output plus token counts. It does not decide what to ask, does not
 * write to the database, and does not know what a nameplate is — those belong
 * to the tasks, and keeping them out means this file can be reasoned about
 * without holding the rest of the increment in your head.
 *
 * It takes a `Prompt` rather than a string. That is the type system enforcing
 * §3 at the one place it matters: there is no signature here that accepts
 * wording, so no caller can pass an inline one however much of a hurry they are
 * in.
 *
 * THE REQUEST IS DELIBERATELY MINIMAL. No thinking config, no effort, no
 * sampling parameters. The model ID is operator configuration, so this code
 * cannot know which model generation it is talking to — and several of those
 * parameters are rejected outright by some models and required by others.
 * Sending only what every vision model accepts is what lets the pinned ID be
 * changed without editing code, which is the whole point of pinning it.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { ModelConfig } from './models.js'
import type { Prompt } from './prompts.js'

export class ModelCallFailed extends Error {
  constructor(message: string, readonly code: string, readonly retryable: boolean) {
    super(message)
    this.name = 'ModelCallFailed'
  }
}

export interface VisionInput {
  data: Buffer
  mediaType: 'image/jpeg'
}

export interface TaskResult<T> {
  output: T
  inputTokens: number
  outputTokens: number
}

export interface RunArgs {
  model: ModelConfig
  prompt: Prompt
  images: VisionInput[]
  /** JSON Schema the answer must satisfy. */
  schema: Record<string, unknown>
  /** Injected in tests so nothing here needs a network to be exercised. */
  client?: Pick<Anthropic, 'messages'>
  maxTokens?: number
}

let shared: Anthropic | undefined

/**
 * The SDK client, made once.
 *
 * Absent rather than throwing when there is no key: §0.4 says the pass is fully
 * usable with no API key configured, so "no client" has to be an ordinary state
 * the queue can look at and leave work alone, not an exception someone catches.
 */
export function anthropic(): Anthropic | undefined {
  if (!process.env.ANTHROPIC_API_KEY) return undefined
  shared ??= new Anthropic()
  return shared
}

/**
 * Ask the model one question about one or more images.
 *
 * The answer is schema-constrained, so a malformed reply is the API's problem
 * rather than a parser's. That matters more here than usual: the failure this
 * increment is most afraid of is a plausible wrong value, and free-text parsing
 * is a reliable way to manufacture one out of a hedge like "probably Q13734509".
 */
export async function runVisionTask<T>(args: RunArgs): Promise<TaskResult<T>> {
  const client = args.client ?? anthropic()
  if (!client) {
    throw new ModelCallFailed('No API key is configured.', 'ai.no-key', false)
  }

  // Images first, then the instruction. The stable part of the request is the
  // prompt text, but the images are what dominate the token count, so ordering
  // them first is what a cache would key on if one engages — see the note in
  // tasks/nameplate.ts about why it usually will not on the fast tier.
  const content: Anthropic.ContentBlockParam[] = [
    ...args.images.map(
      (img): Anthropic.ContentBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.data.toString('base64') },
      }),
    ),
    { type: 'text', text: args.prompt.text },
  ]

  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: args.model.id,
      max_tokens: args.maxTokens ?? 1024,
      messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema: args.schema } },
    })
  } catch (e) {
    const err = e as { status?: number; message?: string }
    const status = err.status ?? 0
    // 429 and 5xx are worth another go; a 400 means the request is wrong and
    // will be wrong again in thirty seconds. Retrying that only burns the cap.
    const retryable = status === 429 || status >= 500 || status === 0
    throw new ModelCallFailed(err.message ?? 'The model call failed.', `ai.http-${status}`, retryable)
  }

  if (response.stop_reason === 'refusal') {
    throw new ModelCallFailed('The model declined this request.', 'ai.refused', false)
  }
  if (response.stop_reason === 'max_tokens') {
    // A truncated JSON object is not a partial answer, it is a broken one.
    throw new ModelCallFailed('The answer was cut off before it finished.', 'ai.truncated', true)
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  let output: T
  try {
    output = JSON.parse(text) as T
  } catch {
    throw new ModelCallFailed('The model did not return the shape that was asked for.', 'ai.bad-shape', true)
  }

  return {
    output,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}
