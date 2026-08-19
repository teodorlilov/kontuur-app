import { cn } from '@/utils/cn'
import { hasCyrillic } from '@/lib/canvas/font-library'

/**
 * The report speaks first, in the serif voice — the one editorial moment on
 * the page. Bulgarian summaries fall back to the sans face (the Latin-Only
 * Serif Rule: Instrument Serif ships no Cyrillic).
 */
export function NarrativeBlock({
  narrative,
  hasHistory,
}: {
  narrative: string | null
  hasHistory: boolean
}) {
  const text = hasHistory
    ? narrative
    : '“Your first report writes itself tonight. From tomorrow, every number on this page reads against the month before it.”'
  if (!text) return null
  const quoted = hasHistory ? `“${text}”` : text
  return (
    <section aria-label="Summary" className="max-w-[74ch] border-t border-ink/[0.05] py-5">
      <p
        className={cn(
          'text-display text-ink',
          hasCyrillic(quoted) ? 'font-sans not-italic' : 'font-display italic'
        )}
      >
        {quoted}
      </p>
      <div className="mt-2 text-micro text-text3">
        {hasHistory
          ? 'Written from this period’s numbers · regenerates after each nightly sync'
          : 'First sync tonight at 03:30 · nothing to do'}
      </div>
    </section>
  )
}
