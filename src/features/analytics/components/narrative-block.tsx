import { cn } from '@/utils/cn'
import { hasCyrillic } from '@/lib/canvas/font-library'

/**
 * The report speaks first, in the serif voice — the one editorial moment on
 * the page. Bulgarian summaries fall back to the sans face (the Latin-Only
 * Serif Rule: Instrument Serif ships no Cyrillic).
 */
export function NarrativeBlock({
  narrative,
  archived,
  hasHistory,
  regenerate,
}: {
  narrative: string | null
  /** True when the wording came from an exported report rather than a fresh write. */
  archived: boolean
  hasHistory: boolean
  /** The screen-only re-roll control; print never shows it. */
  regenerate?: React.ReactNode
}) {
  const text = hasHistory
    ? narrative
    : '“Your first report writes itself tonight. From tomorrow, every number on this page reads against the month before it.”'
  if (!text) return null
  const quoted = hasHistory ? `“${text}”` : text

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
          hasCyrillic(quoted) ? 'font-sans not-italic' : 'font-display italic'
        )}
      >
        {quoted}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-text3">
        <span>{sourceLine}</span>
        {hasHistory && regenerate}
      </div>
    </section>
  )
}
