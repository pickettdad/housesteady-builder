/**
 * The Home Binder, as a draft to be critiqued — stage 12.
 *
 * **The gaps are the point.** This exists to be shown to an outside reviewer and
 * to be wrong in ways nobody here can predict, so its job is to present all
 * twenty-three sections with **every heading in place** and every empty one
 * saying *which kind of empty it is.*
 *
 * ---
 *
 * ## ⚑ Three kinds of empty, and not all of them are gaps
 *
 * `schema/profiles/baseline-v1.json` partitions the 41 slots — **28 `required`,
 * 7 `presentWhenPopulated`, 6 `outOfScope`** — disjoint, and their union is
 * exactly the schema's slot set. **So an empty section can say which kind of
 * empty it is without anything being authored.**
 *
 * | | empty means |
 * |---|---|
 * | `required` | **a gap.** This is owed and it is not here |
 * | `presentWhenPopulated` | **correct**, when the house has none |
 * | `outOfScope` | **by design.** Rendering it as a gap would manufacture six |
 *
 * **That distinction is the whole reason the draft is critiquable.** *A binder
 * showing thirteen legitimately-empty sections as thirteen holes gets reviewed
 * on the wrong thirteen things* — and the reviewer's attention is what this
 * document is spending.
 *
 * ## And a gap says why it is empty, which is a second distinction
 *
 * *Nothing here because no lab result has returned* is a different fact from
 * *nothing here because nobody has built the producer*, and **an outside
 * reviewer can only critique the second.** So a `required` gap carries its
 * reason: **no producer**, **no data yet**, or **not captured**.
 *
 * ⚑ **Nothing here invents content.** Every heading, every slot title and every
 * emptiness verdict is derived from the schema and the profile. *This module has
 * no opinions about what a binder should contain — that is the Master Spec's,
 * and it is already data.*
 */

/** One slot as the schema declares it. Only the fields a draft needs. */
export interface SchemaSlot {
  id: string
  kind?: string
  title?: string
  sources?: string[]
}
export interface SchemaSection {
  id: string
  number: number
  title: string
  tab?: string
  slots?: SchemaSlot[]
}
export interface BinderSchema {
  version?: string
  sections: SchemaSection[]
}
export interface BinderProfile {
  required: string[]
  presentWhenPopulated: string[]
  outOfScope: string[]
}

/** What the profile says about a slot that has nothing in it. */
export type Expectation = 'required' | 'presentWhenPopulated' | 'outOfScope' | 'undeclared'

/**
 * Why a required slot is empty. **Ordered by what a reviewer can act on.**
 *
 * `no-producer` is the one worth their time: nothing in the system can ever fill
 * this slot today. The other two are ordinary states of a real house.
 */
export type EmptyReason = 'no-producer' | 'no-data-yet' | 'not-captured'

export interface DraftSlot {
  id: string
  title: string
  kind: string
  expectation: Expectation
  /** How many records or values exist. Zero is the interesting case. */
  count: number
  filled: boolean
  /** Only set when `expectation === 'required'` and the slot is empty. */
  emptyReason?: EmptyReason
  /** One sentence a reviewer reads instead of a blank space. */
  says: string
}

export interface DraftSection {
  id: string
  number: number
  title: string
  tab: string
  slots: DraftSlot[]
  /** True when every slot that ought to carry something does. */
  complete: boolean
}

export interface BinderDraft {
  sections: DraftSection[]
  counts: {
    sections: number
    slots: number
    filled: number
    gaps: number
    correctlyEmpty: number
    outOfScope: number
  }
  /** Slots the profile does not classify. Should be zero; reported if not. */
  undeclared: string[]
}

/** What the builder can actually put in a slot right now. */
export interface DraftData {
  /** Slot id → how many records exist for it. Absent means zero. */
  counts: ReadonlyMap<string, number>
  /**
   * Slot ids whose producer does not exist in this build at all.
   *
   * **Supplied by the caller rather than guessed here**, because *is there code
   * that could fill this* is a fact about the repo and this module only knows
   * about the schema. §15 of `CLAUDE.md` is the list it comes from.
   */
  noProducer: ReadonlySet<string>
  /** Slot ids whose producer exists but whose input has not arrived. */
  awaiting?: ReadonlySet<string>
}

const expectationOf = (profile: BinderProfile, slotId: string): Expectation =>
  profile.required.includes(slotId) ? 'required'
    : profile.presentWhenPopulated.includes(slotId) ? 'presentWhenPopulated'
      : profile.outOfScope.includes(slotId) ? 'outOfScope'
        : 'undeclared'

/**
 * Build the draft. **Pure**, so what a reviewer sees is testable without a
 * database and reproducible from the same inputs months later.
 */
export function buildDraft(schema: BinderSchema, profile: BinderProfile, data: DraftData): BinderDraft {
  const sections: DraftSection[] = []
  const undeclared: string[] = []
  let filled = 0, gaps = 0, correctlyEmpty = 0, outOfScope = 0, slotCount = 0

  for (const sec of schema.sections) {
    const slots: DraftSlot[] = []
    for (const slot of sec.slots ?? []) {
      slotCount++
      const expectation = expectationOf(profile, slot.id)
      if (expectation === 'undeclared') undeclared.push(slot.id)

      const count = data.counts.get(slot.id) ?? 0
      const isFilled = count > 0
      const title = slot.title ?? slot.id
      const kind = slot.kind ?? 'unknown'

      let emptyReason: EmptyReason | undefined
      let says: string

      if (isFilled) {
        filled++
        says = `${count} ${count === 1 ? 'entry' : 'entries'}.`
      } else if (expectation === 'outOfScope') {
        outOfScope++
        says = 'Out of scope for a baseline binder. **This is not a gap** — it is a section this profile does not fill.'
      } else if (expectation === 'presentWhenPopulated') {
        correctlyEmpty++
        says = 'Empty, and correctly so — this section appears when the house has something to put in it, and this one does not.'
      } else {
        gaps++
        emptyReason = data.noProducer.has(slot.id)
          ? 'no-producer'
          : data.awaiting?.has(slot.id)
            ? 'no-data-yet'
            : 'not-captured'
        says =
          emptyReason === 'no-producer'
            ? '**GAP — nothing in the builder can fill this yet.** No pass, screen or import produces it. *This is the kind of gap worth a reviewer\'s attention.*'
            : emptyReason === 'no-data-yet'
              ? '**GAP — the producer exists and its input has not arrived.** Ordinary, and it resolves without any change to the software.'
              : '**GAP — this ought to be here and is not.** The producer exists and the visit did not supply it.'
      }

      slots.push({ id: slot.id, title, kind, expectation, count, filled: isFilled, ...(emptyReason ? { emptyReason } : {}), says })
    }

    sections.push({
      id: sec.id,
      number: sec.number,
      title: sec.title,
      tab: sec.tab ?? '',
      slots,
      complete: slots.every((s) => s.filled || s.expectation !== 'required'),
    })
  }

  return {
    sections,
    counts: { sections: sections.length, slots: slotCount, filled, gaps, correctlyEmpty, outOfScope },
    undeclared,
  }
}

// ------------------------------------------------------------------ rendering

/**
 * The draft as markdown, for an outside reviewer.
 *
 * **Every heading appears.** A section with nothing in it is a heading and a
 * sentence saying which kind of empty it is — never omitted, and never a blank
 * space a reviewer has to interpret.
 */
export function renderDraft(draft: BinderDraft, opts: { house: string; date: string }): string {
  const out: string[] = []
  const c = draft.counts

  out.push(`# The Home Binder — DRAFT for review`)
  out.push('')
  out.push(`**${opts.house}** · ${opts.date}`)
  out.push('')
  out.push(
    `**This is a draft and the gaps are the point.** All ${c.sections} sections appear below, ` +
      `including the empty ones. ${c.filled} of ${c.slots} slots carry something.`,
  )
  out.push('')
  out.push(`> ⚑ **Not every empty section is a gap, and the difference is what this document is asking you to read.**`)
  out.push('>')
  out.push(`> **${c.gaps} gaps** — owed and not here.`)
  out.push(`> **${c.correctlyEmpty} correctly empty** — these appear when the house has something to put in them, and this one does not.`)
  out.push(`> **${c.outOfScope} out of scope** — this profile does not fill them at all. *Reading these as holes would manufacture ${c.outOfScope} problems that do not exist.*`)
  out.push('')

  if (draft.undeclared.length > 0) {
    out.push(
      `⚠ **${draft.undeclared.length} slot(s) the profile does not classify**, so this document cannot say ` +
        `which kind of empty they are: ${draft.undeclared.join(', ')}. That is a defect in the profile, ` +
        `reported here rather than defaulted.`,
    )
    out.push('')
  }

  out.push('---')
  out.push('')

  let tab = ''
  for (const sec of draft.sections) {
    if (sec.tab !== tab) {
      tab = sec.tab
      out.push(`## Tab ${tab}`)
      out.push('')
    }
    out.push(`### ${sec.number}. ${sec.title}`)
    out.push('')
    for (const slot of sec.slots) {
      const mark = slot.filled ? '' : slot.expectation === 'required' ? ' ⚑' : ''
      out.push(`**${slot.title}**${mark}`)
      out.push('')
      out.push(slot.says)
      out.push('')
    }
  }

  out.push('---')
  out.push('')
  out.push(
    `**What to critique.** The ${c.gaps} gaps are where this record is incomplete. ` +
      `⚑ **The ones marked *nothing in the builder can fill this yet* are the ones worth your time** — ` +
      `they are missing producers rather than missing data, and no visit to this house would close them.`,
  )
  out.push('')
  return out.join('\n')
}
