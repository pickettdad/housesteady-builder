import { TEST_OPERATOR, freshDb } from './helpers.js'
/**
 * The queue and the prompt library.
 *
 * The behaviours the spec calls out by name (§10): the queue survives a restart
 * mid-run, a failed job doesn't lose the rest, the spend cap stops the worker,
 * and the pass is fully usable with no API key configured.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, describe, it } from 'node:test'
import { newId, now, openDb, type Db } from '../src/db/index.js'
import { prepareImage } from '../src/ai/image.js'
import {
  aiAvailable, apiKey, apiKeySource, estimateCost, modelFor, requireModel, ModelNotConfigured,
} from '../src/ai/models.js'
import { currentPrompt, loadPrompts, PromptRefused, promptAt } from '../src/ai/prompts.js'
import {
  claimNext, completeJob, enqueue, failJob, MAX_ATTEMPTS, queueProgress, recordGeneration, requeueBatch,
  requeueFailed, skipJob, spendGate, visitSpend, wouldExceedCap,
} from '../src/ai/queue.js'
import { drainVisit } from '../src/ai/worker.js'

const scratch: string[] = []
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'housesteady-ai-'))
  scratch.push(d)
  return d
}
after(() => scratch.forEach((d) => rmSync(d, { recursive: true, force: true })))

let db: Db
const PROPERTY = 'prop-1'
const VISIT = 'visit-1'

function seed(): void {
  db = freshDb()
  db.prepare(`INSERT INTO properties (id, label, created_at, actor_id) VALUES (?, 'A house', ?, ?)`)
    .run(PROPERTY, now(), TEST_OPERATOR)
  db.prepare(
    `INSERT INTO visits (id, property_id, kind, created_at, actor_id) VALUES (?, ?, 'baseline', ?, ?)`,
  ).run(VISIT, PROPERTY, now(), TEST_OPERATOR)
}

const job = (task: string, targetId: string) =>
  enqueue({ actorId: TEST_OPERATOR, db, propertyId: PROPERTY, visitId: VISIT, task, targetKind: 'media', targetId })

describe('the job queue', () => {
  beforeEach(seed)

  it('is idempotent — re-triggering does not duplicate work', () => {
    const a = job('nameplate_classify', 'media-1')
    const b = job('nameplate_classify', 'media-1')
    assert.equal(a.id, b.id, 'the same task on the same target is one job, not two')
    assert.equal(queueProgress(db, VISIT).queued, 1)
  })

  it('hands each job to exactly one worker', () => {
    job('nameplate_classify', 'media-1')
    job('nameplate_classify', 'media-2')

    const first = claimNext(db, VISIT)
    const second = claimNext(db, VISIT)
    assert.ok(first && second)
    assert.notEqual(first.id, second.id, 'two claims must not return the same row')
    assert.equal(claimNext(db, VISIT), undefined, 'nothing left to claim')
  })

  // §10: "the queue survives a restart mid-run".
  it('reclaims a job orphaned by a crash, and only after its lease expires', () => {
    job('nameplate_classify', 'media-1')
    const claimed = claimNext(db, VISIT)
    assert.ok(claimed)
    assert.equal(claimed.status, 'running')

    // Still leased: a second worker must not steal live work.
    assert.equal(claimNext(db, VISIT), undefined)

    // The worker died here. With a zero lease the row is immediately stale.
    const reclaimed = claimNext(db, VISIT, 0)
    assert.ok(reclaimed, 'an expired lease must be reclaimable — otherwise a crash strands the job forever')
    assert.equal(reclaimed.id, claimed.id)
    assert.equal(reclaimed.attempts, 2, 'the reclaim counts as an attempt so a poison job cannot loop forever')
  })

  // §10: "a failed job doesn't lose the rest".
  it('a failure marks its own row and leaves the others alone', () => {
    job('nameplate_extract', 'media-1')
    job('nameplate_extract', 'media-2')

    const bad = claimNext(db, VISIT)!
    assert.equal(failJob(db, bad.id, 'file is not an image'), 'retrying')

    const progress = queueProgress(db, VISIT)
    assert.equal(progress.queued, 2, 'the failure went back to the queue; the sibling never moved')
    assert.equal(progress.failed, 0)
  })

  it('backs a retry off rather than hammering the same broken call', () => {
    job('nameplate_extract', 'media-1')
    const claimed = claimNext(db, VISIT)!
    assert.equal(failJob(db, claimed.id, 'model timed out'), 'retrying')

    assert.equal(claimNext(db, VISIT, 0), undefined, 'still inside the backoff window')
    assert.ok(claimNext(db, VISIT, 0, Date.now() + 31_000), 'claimable once the backoff has passed')
  })

  it('gives up after three attempts and names the file it gave up on', () => {
    job('nameplate_extract', 'media-1')

    let outcome = ''
    // Walk the clock forward past each backoff rather than sleeping through it.
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const claimed = claimNext(db, VISIT, 0, Date.now() + i * 3_600_000)
      assert.ok(claimed, `attempt ${i + 1} should be claimable`)
      outcome = failJob(db, claimed.id, 'model timed out')
    }
    assert.equal(outcome, 'failed')

    const progress = queueProgress(db, VISIT)
    assert.equal(progress.failed, 1)
    assert.deepEqual(progress.failures, [
      { task: 'nameplate_extract', targetKind: 'media', targetId: 'media-1', error: 'model timed out' },
    ], 'a failure that does not say which file it was about is not chaseable')
  })

  it('re-queues failures by hand without touching what already succeeded', () => {
    job('nameplate_extract', 'media-1')
    job('nameplate_extract', 'media-2')

    const done = claimNext(db, VISIT)!
    completeJob(db, done.id, null)
    let broken = claimNext(db, VISIT)!
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      failJob(db, broken.id, 'boom')
      broken = claimNext(db, VISIT, 0, Date.now() + (i + 1) * 3_600_000) ?? broken
    }

    assert.equal(requeueFailed(db, VISIT), 1)
    const progress = queueProgress(db, VISIT)
    assert.equal(progress.done, 1, 'finished work is not redone — that would be paying twice')
    assert.equal(progress.queued, 1)
  })

  // §11: the non-nameplate must be "not extracted at all" — and provably so.
  it('records a correctly-skipped job rather than leaving a hole', () => {
    const j = job('nameplate_extract', 'media-9')
    skipJob(db, j.id, 'classified as not a nameplate')

    const progress = queueProgress(db, VISIT)
    assert.equal(progress.skipped, 1)
    assert.equal(progress.failed, 0, 'a correct decision not to run is not a failure')
    assert.equal(progress.done, 0, 'nor is it work that was done')
  })
})

describe('the spend cap', () => {
  beforeEach(seed)

  const generation = (inputTokens: number, outputTokens: number) =>
    recordGeneration({ actorId: TEST_OPERATOR,
      db, propertyId: PROPERTY, visitId: VISIT, task: 'nameplate_extract',
      targetKind: 'media', targetId: newId(), model: 'a-model',
      promptId: 'nameplate_extract', promptVersion: 'v001', promptHash: 'abc',
      inputRefs: [], output: {}, abstained: false, inputTokens, outputTokens,
    })

  it('sums what a visit has spent from the generations themselves', () => {
    process.env.HOUSESTEADY_MODEL_FAST = 'a-model'
    process.env.HOUSESTEADY_FAST_INPUT_PER_MTOK = '1'
    process.env.HOUSESTEADY_FAST_OUTPUT_PER_MTOK = '5'
    process.env.HOUSESTEADY_VISIT_SPEND_CAP = '5'
    try {
      generation(1_000_000, 200_000)
      const spend = visitSpend(db, VISIT)
      assert.equal(spend.generations, 1)
      assert.equal(spend.inputTokens, 1_000_000)
      // 1M in at $1 + 200k out at $5 = $1 + $1 = $2
      assert.equal(Math.round(spend.dollars * 100) / 100, 2)
      assert.equal(spend.capReached, false)
      assert.equal(spend.ratesKnown, true)
    } finally {
      delete process.env.HOUSESTEADY_MODEL_FAST
      delete process.env.HOUSESTEADY_FAST_INPUT_PER_MTOK
      delete process.env.HOUSESTEADY_FAST_OUTPUT_PER_MTOK
      delete process.env.HOUSESTEADY_VISIT_SPEND_CAP
    }
  })

  // §4: "capped: a per-visit spend ceiling that stops the worker and says so
  // rather than quietly burning credits".
  it('stops the worker once the ceiling is reached', () => {
    process.env.HOUSESTEADY_MODEL_FAST = 'a-model'
    process.env.HOUSESTEADY_FAST_INPUT_PER_MTOK = '1'
    process.env.HOUSESTEADY_VISIT_SPEND_CAP = '1'
    try {
      assert.equal(wouldExceedCap(db, VISIT), false)
      generation(2_000_000, 0) // $2 against a $1 cap
      assert.equal(wouldExceedCap(db, VISIT), true)
    } finally {
      delete process.env.HOUSESTEADY_MODEL_FAST
      delete process.env.HOUSESTEADY_FAST_INPUT_PER_MTOK
      delete process.env.HOUSESTEADY_VISIT_SPEND_CAP
    }
  })

  it('prices a generation at the tier that ran, not at the default', () => {
    /**
     * **`--tier strong` made a dormant field load-bearing.**
     *
     * `recordGeneration` falls back to `'fast'`, and no task passed `tier` — so
     * a strong-tier run was costed at the cheap tier's rates. The ledger would
     * have under-reported and **the spend cap would have let through the ratio
     * between them**, which is the whole spread the tiering doctrine turns on.
     *
     * *Twelfth instance of the declared-and-unconsumed class: the field existed
     * from the day the queue was built and nothing set it.*
     */
    process.env.HOUSESTEADY_MODEL_FAST = 'a-fast-model'
    process.env.HOUSESTEADY_FAST_INPUT_PER_MTOK = '1'
    process.env.HOUSESTEADY_MODEL_STRONG = 'a-strong-model'
    process.env.HOUSESTEADY_STRONG_INPUT_PER_MTOK = '15'
    try {
      recordGeneration({ actorId: TEST_OPERATOR,
        db, propertyId: PROPERTY, visitId: VISIT, task: 'identify_objects', tier: 'strong',
        targetKind: 'zone-batch', targetId: newId(), model: 'a-strong-model',
        promptId: 'identify_objects', promptVersion: 'v001', promptHash: 'abc',
        inputRefs: [], output: {}, abstained: false, inputTokens: 1_000_000, outputTokens: 0,
      })
      // $15, not $1. The number IS the test.
      assert.equal(visitSpend(db, VISIT, 'strong').dollars, 15)

      // And the cap has to be read at the same tier, or it lets through 15x.
      process.env.HOUSESTEADY_VISIT_SPEND_CAP = '5'
      assert.equal(wouldExceedCap(db, VISIT, 'strong'), true, 'the strong run is over its ceiling')
    } finally {
      delete process.env.HOUSESTEADY_MODEL_STRONG
      delete process.env.HOUSESTEADY_STRONG_INPUT_PER_MTOK
      delete process.env.HOUSESTEADY_FAST_INPUT_PER_MTOK
      delete process.env.HOUSESTEADY_VISIT_SPEND_CAP
    }
  })

  it('separates an unmeasured cost from a zero one', () => {
    delete process.env.HOUSESTEADY_MODEL_FAST
    generation(1_000_000, 0)
    const spend = visitSpend(db, VISIT)
    assert.equal(spend.ratesKnown, false, 'with no rates configured the screen must not print a confident $0.00')
  })

  /**
   * ⛑ **A cap denominated in dollars is not a wall when the dollars are zero.**
   *
   * ⚑ **The state this covers is the one every other test in this block avoids
   * by setting the rates first**, and it is the only state a fresh runner
   * container is actually in: a model configured, a key configured, and no
   * prices — because the runner brief names the model and the key and says
   * nothing about `_INPUT_PER_MTOK`.
   *
   * `dollars` is `SUM(cost_estimate)`, `cost_estimate` is tokens × rate, and the
   * rate defaults to 0. So every call costs $0.00, the sum stays 0, and
   * `0 >= 5` is false however long the run goes on.
   *
   * ⚑ **The test above this one had the fact and not the consequence.** It
   * asserts `ratesKnown === false` — the display fact — and deletes the model to
   * get there, which is the one configuration in which no run can happen at all.
   * **So `ratesKnown` was covered as something a screen prints and never as
   * something a gate reads**, and the gate ignored it for as long as it existed.
   *
   * *Measured 2026-08-28 before the fix: 8,000,000 input tokens through a $5
   * ceiling with `capReached` false at the end of it.*
   */
  it('refuses to run at all when no price is configured, rather than running unbounded', () => {
    process.env.HOUSESTEADY_MODEL_FAST = 'a-model'
    process.env.HOUSESTEADY_VISIT_SPEND_CAP = '5'
    delete process.env.HOUSESTEADY_FAST_INPUT_PER_MTOK
    delete process.env.HOUSESTEADY_FAST_OUTPUT_PER_MTOK
    try {
      // The blind state, before anything has run.
      assert.equal(spendGate(db, VISIT), 'rates-unknown')
      assert.equal(wouldExceedCap(db, VISIT), true, 'an unpriced run is refused, not permitted')

      // And it stays refused however much goes through it — the number is the test.
      for (let i = 0; i < 200; i++) generation(40_000, 2_000)
      const spend = visitSpend(db, VISIT)
      assert.equal(spend.inputTokens, 8_000_000)
      assert.equal(spend.dollars, 0, 'every call priced at $0.00 — which is why the dollar ceiling cannot fire')
      assert.equal(spend.capReached, false, 'the ceiling itself is genuinely unreached; that is the defect')
      assert.equal(spendGate(db, VISIT), 'rates-unknown', 'and the gate stops it anyway')
    } finally {
      delete process.env.HOUSESTEADY_MODEL_FAST
      delete process.env.HOUSESTEADY_VISIT_SPEND_CAP
    }
  })

  it('and tells a person which two variables to set, rather than saying the ceiling was reached', async () => {
    // ⚑ Two different facts: *reached the ceiling* and *the ceiling cannot be
    // reached*. Merging them would send somebody to raise a limit that was never
    // the thing stopping them.
    process.env.HOUSESTEADY_MODEL_FAST = 'a-model'
    delete process.env.HOUSESTEADY_FAST_INPUT_PER_MTOK
    try {
      const r = await drainVisit(db, VISIT, {
        deps: {
          prompts: loadPrompts(),
          model: { tier: 'fast', id: 'a-model', inputPerMTok: 0, outputPerMTok: 0, maxImageEdge: 1568, maxOutputTokens: 4096 },
          resolvePath: () => { throw new Error('no call should be reached') },
        },
      })
      assert.equal(r.stopped, 'rates-unknown')
      assert.equal(r.ran, 0)
      assert.match(r.reason, /HOUSESTEADY_MODEL_FAST_INPUT_PER_MTOK/)
      assert.match(r.reason, /nothing has been thrown away/i)
    } finally {
      delete process.env.HOUSESTEADY_MODEL_FAST
    }
  })
})

describe('the API key comes from our own variable first', () => {
  /**
   * **`ANTHROPIC_API_KEY` is the SDK's name, not ours, and the surrounding
   * tooling has opinions about it.** A Claude Code cloud environment
   * authenticates its own session through the user's account and warns that
   * setting this variable will not change that — true of the session, not of
   * this program, and a reader cannot tell those apart from the warning.
   *
   * So a name nothing else claims is preferred, and the conventional one still
   * works because every local shell and SDK example already uses it.
   */
  const clear = (): void => {
    delete process.env.HOUSESTEADY_ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
  }

  it('prefers HOUSESTEADY_ANTHROPIC_API_KEY when both are set', () => {
    clear()
    process.env.ANTHROPIC_API_KEY = 'sdk-convention'
    process.env.HOUSESTEADY_ANTHROPIC_API_KEY = 'ours'
    try {
      assert.equal(apiKey(), 'ours')
      assert.equal(apiKeySource(), 'HOUSESTEADY_ANTHROPIC_API_KEY')
    } finally {
      clear()
    }
  })

  it('still accepts ANTHROPIC_API_KEY alone, so a normal shell is unbroken', () => {
    clear()
    process.env.ANTHROPIC_API_KEY = 'sdk-convention'
    try {
      assert.equal(apiKey(), 'sdk-convention')
      assert.equal(apiKeySource(), 'ANTHROPIC_API_KEY')
    } finally {
      clear()
    }
  })

  it('reads an empty string as absent, because a blank field is not a key', () => {
    // An environment UI that writes an empty value for a variable somebody
    // cleared must not produce a client that authenticates with "".
    clear()
    process.env.HOUSESTEADY_ANTHROPIC_API_KEY = ''
    process.env.ANTHROPIC_API_KEY = ''
    try {
      assert.equal(apiKey(), undefined)
      assert.equal(apiKeySource(), null)
    } finally {
      clear()
    }
  })

  it('is absent, not throwing, when neither is set — the pass runs without a key', () => {
    clear()
    assert.equal(apiKey(), undefined)
    assert.equal(apiKeySource(), null)
    assert.equal(aiAvailable(), false)
  })
})

describe('models are configuration, never source', () => {
  it('is unconfigured rather than broken when no model is set', () => {
    const saved = process.env.HOUSESTEADY_MODEL_FAST
    delete process.env.HOUSESTEADY_MODEL_FAST
    try {
      assert.equal(modelFor('fast'), undefined)
      assert.equal(aiAvailable(), false)
      assert.throws(() => requireModel('fast'), ModelNotConfigured)
    } finally {
      if (saved !== undefined) process.env.HOUSESTEADY_MODEL_FAST = saved
    }
  })

  it('costs what the configured rates say it costs', () => {
    process.env.HOUSESTEADY_MODEL_FAST = 'some-fast-model'
    process.env.HOUSESTEADY_FAST_INPUT_PER_MTOK = '1'
    process.env.HOUSESTEADY_FAST_OUTPUT_PER_MTOK = '5'
    try {
      const m = requireModel('fast')
      assert.equal(m.id, 'some-fast-model')
      assert.equal(estimateCost(m, 1_000_000, 1_000_000), 6)
    } finally {
      delete process.env.HOUSESTEADY_MODEL_FAST
      delete process.env.HOUSESTEADY_FAST_INPUT_PER_MTOK
      delete process.env.HOUSESTEADY_FAST_OUTPUT_PER_MTOK
    }
  })
})

describe('the prompt library', () => {
  const library = (files: Record<string, string>): string => {
    const root = tmp()
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(join(root, path.split('/')[0]!), { recursive: true })
      writeFileSync(join(root, path), body)
    }
    return root
  }

  it('takes id and version from the path so they cannot disagree with the file', () => {
    const root = library({ 'nameplate_extract/v001.md': 'Read the plate.' })
    const p = currentPrompt(loadPrompts(root), 'nameplate_extract')
    assert.equal(p.id, 'nameplate_extract')
    assert.equal(p.version, 'v001')
    assert.equal(p.text, 'Read the plate.')
    assert.match(p.hash, /^[0-9a-f]{64}$/)
  })

  it('runs the newest version and keeps the old ones loadable for the golden set', () => {
    const root = library({
      'nameplate_extract/v001.md': 'First wording.',
      'nameplate_extract/v002.md': 'Second wording.',
    })
    const lib = loadPrompts(root)
    assert.equal(currentPrompt(lib, 'nameplate_extract').version, 'v002')
    assert.equal(promptAt(lib, 'nameplate_extract', 'v001').text, 'First wording.',
      'the old version must stay readable — a golden-set diff needs both sides')
  })

  it('gives a different hash to a whitespace-only edit', () => {
    const a = currentPrompt(loadPrompts(library({ 'x/v001.md': 'Read the plate.' })), 'x')
    const b = currentPrompt(loadPrompts(library({ 'x/v001.md': 'Read the plate. ' })), 'x')
    assert.notEqual(a.hash, b.hash,
      'a file that differs at all is not the file the golden set was approved against')
    assert.equal(a.text, b.text, 'but the text sent to the model is unchanged')
  })

  // Doctrine 7: fail closed on structure. A prompt file is structure.
  it('refuses loudly on a malformed library rather than running something unversioned', () => {
    assert.throws(() => loadPrompts(library({ 'x/latest.md': 'body' })), (e: PromptRefused) => {
      assert.equal(e.code, 'prompt.bad-version')
      return true
    })
    assert.throws(() => loadPrompts(library({ 'x/v001.md': '   ' })), (e: PromptRefused) => {
      assert.equal(e.code, 'prompt.empty')
      return true
    })
    assert.throws(() => loadPrompts(join(tmp(), 'nope')), (e: PromptRefused) => {
      assert.equal(e.code, 'prompt.no-library')
      return true
    })
    assert.throws(() => currentPrompt(new Map(), 'missing'), (e: PromptRefused) => {
      assert.equal(e.code, 'prompt.no-task')
      return true
    })
  })
})

describe('preparing a photograph for a model', () => {
  const fixture = (name: string): string => join(import.meta.dirname, '..', '..', 'fixtures', 'nameplates', 'images', name)

  // The finding that made this module exist: twelve of the fifteen reference
  // nameplates carry EXIF orientation 6. Reading the bytes without applying it
  // hands the model a sideways plate and calls the result illegibility.
  it('turns an EXIF-rotated plate upright, swapping the axes', async () => {
    const p = await prepareImage(fixture('IMG_0004.jpeg'), 1568)
    assert.equal(p.sourceWidth, 4032)
    assert.equal(p.sourceHeight, 3024)
    assert.equal(p.appliedOrientation, 6)
    assert.ok(p.height > p.width, 'orientation 6 swaps the axes — a landscape file is a portrait image')
    assert.equal(Math.max(p.width, p.height), 1568)
  })

  it('applies a 180° tag without swapping the axes', async () => {
    const p = await prepareImage(fixture('IMG_0033.jpeg'), 1568)
    assert.equal(p.appliedOrientation, 3)
    assert.ok(p.width > p.height, '180° is a flip, not a transpose')
  })

  it('leaves an untagged image alone', async () => {
    const p = await prepareImage(fixture('IMG_0017.jpeg'), 1568)
    assert.equal(p.appliedOrientation, null)
  })

  it('does not enlarge a small image to meet the limit', async () => {
    const p = await prepareImage(fixture('Untitled.jpg'), 1568)
    assert.equal(p.downscaled, false)
    assert.equal(p.width, 1320, 'upscaling invents detail that was never photographed')
  })

  /**
   * CLAUDE.md §14. These are photographs taken inside somebody's house, and a
   * phone writes far more into a JPEG than the picture: camera body, timestamps,
   * exposure, an embedded thumbnail that is a second copy of the scene, and — on
   * a phone with location services on — the coordinates of the house itself.
   *
   * None of that is needed to read a nameplate, and a home address is not a
   * thing to send anywhere by accident. sharp drops all of it unless explicitly
   * told to keep it, which makes this a test about a default that must never be
   * changed rather than about code that exists — exactly the kind that stops a
   * later refactor adding .withMetadata() and nobody noticing.
   */
  it('sends the pixels and nothing else — no EXIF, no GPS, no embedded thumbnail', async () => {
    const sharp = (await import('sharp')).default
    const source = await sharp(fixture('IMG_0004.jpeg')).metadata()
    assert.ok((source.exif?.length ?? 0) > 1000, 'the fixture must actually carry metadata, or this proves nothing')

    const prepared = await prepareImage(fixture('IMG_0004.jpeg'), 1568)
    const sent = await sharp(prepared.data).metadata()

    assert.equal(sent.exif, undefined, 'EXIF must not survive')
    assert.equal(sent.xmp, undefined, 'XMP must not survive')
    assert.equal(sent.iptc, undefined, 'IPTC must not survive')

    // Belt and braces: the parsed view could miss a block sharp does not model,
    // so scan the actual outgoing bytes for the markers that introduce one.
    for (const marker of ['Exif\0\0', 'http://ns.adobe.com/xap', 'Photoshop 3.0']) {
      assert.ok(!prepared.data.includes(Buffer.from(marker)),
        `outgoing JPEG still contains a ${marker.trim()} block`)
    }
  })

  it('records the shrink in words, because it is a real reason a read can be poor', async () => {
    const { imageNote } = await import('../src/ai/image.js')
    const p = await prepareImage(fixture('IMG_0004.jpeg'), 1568)
    const note = imageNote(p)
    assert.match(note, /upright/)
    assert.match(note, /4032px to 1568px/)
  })
})

describe('⚑ claiming one job means one job of WHICH task', () => {
  beforeEach(seed)

  it('claims the oldest of the named task, not the oldest overall', () => {
    // The smoke defect of 2026-08-13, as a test. Queue phase A, leave some of it
    // runnable, queue phase B, then ask for one of B — and get one of B.
    job('phase_a', 'a1')
    job('phase_a', 'a2')
    job('phase_b', 'b1')

    // ⚑ No unfiltered claim here, and the reason is the bug this test is about.
    // Three rows written in one millisecond share `created_at`, so
    // `ORDER BY created_at, id` breaks the tie on a uuid — arbitrary. An earlier
    // version claimed once unfiltered before claiming `phase_b`, and about one
    // run in three that first claim TOOK the phase_b job, leaving the assertion
    // below nothing to find. *The test was demonstrating its own subject.*
    // Unfiltered claiming is covered above; this test is only about the filter.
    assert.equal(claimNext(db, VISIT, undefined, undefined, 'phase_b')!.task, 'phase_b')
    assert.equal(claimNext(db, VISIT, undefined, undefined, 'phase_b'), undefined, 'and there was only one')
  })

  it('returns nothing rather than another task\'s job when its own has none', () => {
    // The half that makes the check able to fail: without it, a filter that was
    // silently ignored would still pass the test above.
    job('phase_a', 'a1')
    assert.equal(claimNext(db, VISIT, undefined, undefined, 'phase_b'), undefined)
    assert.ok(claimNext(db, VISIT, undefined, undefined, 'phase_a'), 'and phase_a was claimable all along')
  })
})

describe('⚑ re-queueing one task does not re-queue another that shares its target id', () => {
  beforeEach(seed)

  it('leaves the other task alone, and costs nothing', () => {
    // The 2026-08-13 money bug. `identify_objects`, `read_surfaces` and
    // `match_known` all build their target id as `${zoneId}#${index}` — three
    // tasks, identical ids — and `requeueBatch` filtered on visit and target
    // alone. So `match --again` re-ran three pass-1 read calls: ~$0.10 re-paid,
    // readings 54 -> 89, reading_fields 295 -> 524, and a second --again would
    // have doubled it again.
    job('read_surfaces', 'zone-mech#1')
    job('match_known', 'zone-mech#1')
    db.prepare(`UPDATE ai_jobs SET status = 'done'`).run()

    assert.equal(requeueBatch(db, VISIT, 'match_known', 'zone-mech#1'), true)

    const byTask = Object.fromEntries(
      (db.prepare('SELECT task, status FROM ai_jobs').all() as { task: string; status: string }[])
        .map((r) => [r.task, r.status]),
    )
    assert.equal(byTask.match_known, 'queued', 'the task asked for is back in the queue')
    assert.equal(byTask.read_surfaces, 'done', '⚑ and the one that merely shares an id is NOT')
  })

  it('returns false rather than re-queueing something when its own task has no such batch', () => {
    // The half that makes the check able to fail: a filter silently ignored
    // would still pass the assertion above.
    job('read_surfaces', 'zone-mech#1')
    db.prepare(`UPDATE ai_jobs SET status = 'done'`).run()
    assert.equal(requeueBatch(db, VISIT, 'match_known', 'zone-mech#1'), false)
    assert.equal(
      (db.prepare('SELECT status FROM ai_jobs').get() as { status: string }).status, 'done',
      'and nothing moved',
    )
  })
})
