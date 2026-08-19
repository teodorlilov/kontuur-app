import { cn } from '@/utils/cn'
import { hasCyrillic } from '@/lib/canvas/font-library'
import { splitLeadSentence } from '../lib/format'

/**
 * The report speaks first — but only its opening sentence wears the serif
 * voice (the Rationed Serif Rule: an editorial address, not body text).
 * Whatever follows reads as quiet supporting prose, so a long stored summary
 * renders as a deck plus a note instead of a page of italic book type.
 * Bulgarian text falls back to the sans face (the Latin-Only Serif Rule).
 */
export function NarrativeBlock({
  narrative,
  archived,
  hasHistory,
}: {
  narrative: string | null
  /** True when the wording came from an exported report rather than a fresh write. */
  archived: boolean
  hasHistory: boolean
}) {
  if (hasHistory && !narrative) return null

  const { lead, rest } = hasHistory
    ? splitLeadSentence(narrative!)
    : {
        lead: 'Your first report writes itself tonight. From tomorrow, every number on this page reads against the month before it.',
        rest: '',
      }

  let sourceLine: string
  if (!hasHistory) {
    sourceLine = 'First sync tonight at 03:30 · nothing to do'
  } else if (archived) {
    sourceLine = 'Kept as it was written when this period was exported'
  } else {
    sourceLine = 'Written from this period’s numbers · regenerates after each nightly sync'
  }

  return (
    <section aria-label="Summary" className="max-w-[74ch] border-t border-ink/[0.05] py-5">
      <p
        className={cn(
          'text-display text-ink',
          hasCyrillic(lead) ? 'font-sans not-italic' : 'font-display italic'
        )}
      >
        “{lead}”
      </p>
      {rest && <p className="mt-2.5 max-w-[68ch] text-body text-text2">{rest}</p>}
      <div className="mt-2 text-micro text-text3">{sourceLine}</div>
    </section>
  )
}
