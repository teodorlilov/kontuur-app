import Link from 'next/link'
import { cn } from '@/utils/cn'
import { extractInitials } from '@/utils/format'
import type { DayState } from '@/lib/queries/cache'

interface CoverageRowProps {
  clientId: string
  name: string
  week: DayState[]
  pendingCount: number
}

/**
 * One client's week.
 *
 * Every row shares a surface. Colour here answers "does this client need me",
 * never "where is this row on the page" — a tier driven by list position made
 * the same client lime on one page and dark on the next, under a legend that
 * described a different scale entirely.
 */
export function CoverageRow({ clientId, name, week, pendingCount }: CoverageRowProps) {
  const publishedCount = week.filter((day) => day === 'published').length
  // Anything not open is on the books, published or merely scheduled.
  const filledCount = week.filter((day) => day !== 'open').length
  const isEmpty = filledCount === 0
  const needsReview = pendingCount > 0

  const summary = isEmpty
    ? 'Nothing scheduled yet'
    : [
        `${filledCount} ${filledCount === 1 ? 'post' : 'posts'} this week`,
        needsReview ? `${pendingCount} in review` : null,
      ]
        .filter(Boolean)
        .join(' · ')

  // The chips are a graphic, so they carry no text — this is the same week
  // stated once for anyone who cannot see them.
  const chipSummary =
    `${publishedCount} published, ${filledCount - publishedCount} scheduled, ` +
    `${week.length - filledCount} open`

  return (
    <div
      className={cn(
        'flex items-center gap-3.5 rounded-[18px] border-[0.5px] px-4 py-3.5',
        'transition-[transform,box-shadow] duration-150 ease-contour hover:-translate-y-0.5 hover:shadow-pop',
        needsReview ? 'border-pending/25 bg-pending-bg' : 'border-line bg-surface'
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-panel bg-wash text-[11.5px] font-semibold text-forest">
        {extractInitials(name)}
      </span>

      <div className="min-w-0 flex-1">
        <Link
          href={`/clients/${clientId}/edit`}
          className="block truncate text-[14px] font-semibold text-ink no-underline underline-offset-2 hover:underline"
        >
          {name}
        </Link>
        {/* truncate, not wrap: a second line would push the row past the height
            the paginated list reserves for it. */}
        <div className="mt-px truncate text-[11.5px] text-text2">{summary}</div>
      </div>

      <span className="sr-only">{chipSummary}</span>

      <div className="flex shrink-0 gap-1.5" aria-hidden="true">
        {week.map((day, index) => (
          <span
            key={index}
            className={cn(
              'size-[13px] rounded-[4.5px] box-border',
              day === 'published' && 'bg-forest',
              day === 'scheduled' &&
                'bg-surface shadow-[inset_0_0_0_1.5px_rgba(22,68,48,0.45)]',
              day === 'open' && 'slot-open'
            )}
          />
        ))}
      </div>

      {isEmpty && (
        <Link
          href={`/generate?client=${clientId}`}
          className="ml-1 shrink-0 rounded-sm bg-wash px-3.5 py-2 text-[13px] font-medium text-forest no-underline transition-colors hover:bg-marker"
        >
          Generate →
        </Link>
      )}
    </div>
  )
}
