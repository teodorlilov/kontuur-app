import { cn } from '@/utils/cn'
import { hasCyrillic } from '@/lib/canvas/font-library'
import { splitLeadSentence } from '../../lib/compute/format'

/**
 * The report speaks from a Pine Deep capsule (DESIGN.md:204 — the system's dark ground). The
 * lead sentence takes headline scale and whatever follows sits beside it, so the block
 * composes as a full-width plate rather than a narrow column of italic book type.
 *
 * `hasCyrillic` gates every serif run: DESIGN.md:313, the Latin-Only Serif Rule — Instrument
 * Serif ships no Cyrillic glyphs, and this text is AI-written from a client's own words.
 *
 * The `ink-inv/85` on the supporting half is the one alpha ink here: the Legible Tint Rule
 * (DESIGN.md:271) bans those on LIGHT tints; over Pine Deep this pair measures about 10:1.
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
