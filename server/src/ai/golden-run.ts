/**
 * Run the golden set against the currently configured model and prompts.
 *
 * A deliberate, paid operation — `npm run golden` — and never part of `npm test`.
 * The unit suite has to run with no API key and no network (§0.4, §10), so it
 * exercises the comparison logic with a stub and this file is what spends money.
 *
 * It talks to the model directly rather than through the queue. The queue's job
 * is surviving restarts and pacing a real visit; none of that is what is being
 * measured here, and routing through it would make a prompt comparison depend on
 * job bookkeeping being correct.
 *
 *   npm run golden                  compare every image
 *   npm run golden -- --version v002   pin a prompt version, to diff two of them
 */

import { prepareImage } from './image.js'
import { requireModel } from './models.js'
import { currentPrompt, loadPrompts, promptAt } from './prompts.js'
import { runVisionTask } from './client.js'
import {
  compareImage, formatReport, imagePath, loadExpected, summarise,
  type ImageResult,
} from './golden.js'
import {
  CLASSIFY_SCHEMA, CLASSIFY_TASK, EXTRACT_SCHEMA, EXTRACT_TASK,
  isAbstention, NAMEPLATE_FIELDS,
  type Classification, type Extraction,
} from './tasks/nameplate.js'

async function main(): Promise<void> {
  const versionArg = process.argv.indexOf('--version')
  const pinned = versionArg > -1 ? process.argv[versionArg + 1] : undefined

  const library = loadPrompts()
  const model = requireModel('fast')
  const classifyPrompt = pinned ? promptAt(library, CLASSIFY_TASK, pinned) : currentPrompt(library, CLASSIFY_TASK)
  const extractPrompt = pinned ? promptAt(library, EXTRACT_TASK, pinned) : currentPrompt(library, EXTRACT_TASK)
  const expected = loadExpected()

  console.log(`model    ${model.id}`)
  console.log(`prompts  ${CLASSIFY_TASK}/${classifyPrompt.version} (${classifyPrompt.hash.slice(0, 12)})`)
  console.log(`         ${EXTRACT_TASK}/${extractPrompt.version} (${extractPrompt.hash.slice(0, 12)})`)
  console.log('')

  const results: ImageResult[] = []
  for (const entry of expected.images) {
    process.stdout.write(`  ${entry.file.padEnd(30)} `)
    try {
      const image = await prepareImage(imagePath(entry), model.maxImageEdge)
      const images = [{ data: image.data, mediaType: image.mediaType as 'image/jpeg' }]

      const classification = await runVisionTask<Classification>({
        model, prompt: classifyPrompt, schema: CLASSIFY_SCHEMA, images,
      })

      // The gate, exactly as the task applies it: `no` means not extracted at
      // all. Running extraction here anyway "just to see" would measure a code
      // path that never happens in production.
      if (classification.output.isNameplate === 'no') {
        results.push(compareImage(entry, { classification: 'no', extracted: false }))
        console.log('classified no, not extracted')
        continue
      }

      const extraction = await runVisionTask<Extraction>({
        model, prompt: extractPrompt, schema: EXTRACT_SCHEMA, images,
      })
      const fields = Object.fromEntries(
        NAMEPLATE_FIELDS.map((f) => [f, extraction.output.fields?.[f] ?? 'unknown']),
      )
      results.push(
        compareImage(entry, {
          classification: classification.output.isNameplate,
          extracted: true,
          abstained: isAbstention(extraction.output),
          fields,
        }),
      )
      console.log(isAbstention(extraction.output) ? 'abstained' : 'read')
    } catch (e) {
      results.push(compareImage(entry, { classification: null, extracted: false, error: (e as Error).message }))
      console.log(`errored — ${(e as Error).message}`)
    }
  }

  console.log('')
  const report = summarise(expected.approved, results)
  console.log(formatReport(report))

  // An unratified set never fails the run: the readings are proposed, and
  // exiting non-zero would teach everyone to ignore the result.
  process.exit(report.approved && !report.clean ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
