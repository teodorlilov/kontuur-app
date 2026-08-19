import { cn } from '@/utils/cn'
import { hasCyrillic } from '@/lib/canvas/font-library'
import { splitLeadSentence } from '../lib/format'

/**
 * The report speaks from the Pine Deep capsule — the system's dark ground for
 * moments of address (the dashboard stat card, the generate rail). The lead
 * sentence carries the serif voice at headline scale; whatever follows sits
 * beside it as quiet supporting prose, so the block composes as a full-width
 * plate instead of a narrow column of italic book type. Bulgarian text falls
 * back to the sans face (the Latin-Only Serif Rule). Print flattens the
 * capsule to a bordered white panel.
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
    <section
      aria-label="Summary"
      className="my-5 rounded-card bg-forest-deep px-7 py-7 md:px-10 md:py-9 print:border print:border-line print:bg-white print:px-0 print:py-4"
    >
      <div className={cn('grid gap-5', rest && 'md:grid-cols-2 md:items-start md:gap-12')}>
        <p
          className={cn(
            'text-headline text-ink-inv print:text-ink',
            hasCyrillic(lead) ? 'font-sans not-italic' : 'font-display font-normal italic',
            !rest && 'max-w-[46ch]'
          )}
        >
          “{lead}”
        </p>
        {rest && (
          // The serif voice carries the whole summary (user call — the split
          // to sans read as a different text). Scale drops to Display so the
          // lead still leads.
          // WHY alpha ink: the Legible Tint Rule bans alpha inks on light
          // tints; on Pine Deep, ink-inv at 85% still measures ~10:1.
          <p
            className={cn(
              'text-display text-ink-inv/85 print:text-text2',
              hasCyrillic(rest) ? 'font-sans not-italic' : 'font-display font-normal italic'
            )}
          >
            {rest}
          </p>
        )}
      </div>
      <div className="mt-6 text-micro text-sage print:text-text3">{sourceLine}</div>
    </section>
  )
}
