import Link from 'next/link'
import { cn } from '@/utils/cn'
import { extractInitials } from '@/utils/format'
import type { DayState } from '@/lib/queries/cache'

/**
 * Capsule tiers, lightest first. Decorative rhythm from the design direction —
 * it carries no data, which is why the legend above the list describes the day
 * chips and never these surfaces.
 */
const TIER_CLASSES = ['bg-lime', 'bg-sage', 'surface-dark-capsule text-white'] as const
const DARK_TIER_INDEX = 2
export const TIER_COUNT = TIER_CLASSES.length

interface CoverageRowProps {
  clientId: string
  name: string
  week: DayState[]
  pendingCount: number
  /**
   * Which capsule tier to wear. Derived from the client's place in the whole
   * roster, never its row on the current page — otherwise the same client is
   * lime on page 1 and dark on page 2.
   */
  tier: number
}

/** One client's week: published, scheduled, or still open. */
export function CoverageRow({ clientId, name, week, pendingCount, tier }: CoverageRowProps) {
  const isDark = tier === DARK_TIER_INDEX
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
        'flex items-center gap-3.5 rounded-[18px] px-4 py-3.5',
        'transition-[transform,box-shadow] duration-150 ease-contour hover:-translate-y-0.5 hover:shadow-pop',
        TIER_CLASSES[Math.min(tier, DARK_TIER_INDEX)]
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-panel bg-surface text-caption font-semibold text-forest shadow-pop">
        {extractInitials(name)}
      </span>

      <div className="min-w-0 flex-1">
        <Link
          href={`/clients/${clientId}/edit`}
          className="block truncate text-[14px] font-semibold no-underline underline-offset-2 hover:underline"
        >
          {name}
        </Link>
        {/* truncate, not wrap: a second line would push the row past the height
            the paginated list reserves for it. Solid ink, not an alpha one:
            ink/55 measured 3.74:1 on sage, so legibility changed per tier. */}
        <div className={cn('mt-px truncate text-caption', isDark ? 'text-white/70' : 'text-text2')}>
          {summary}
        </div>
      </div>

      <span className="sr-only">{chipSummary}</span>

      <div className="flex shrink-0 gap-1.5" aria-hidden="true">
        {week.map((day, index) => (
          <span
            key={index}
            className={cn(
              'size-[13px] rounded-[4.5px] box-border',
              day === 'published' && (isDark ? 'bg-white' : 'bg-forest'),
              day === 'scheduled' &&
                (isDark
                  ? 'bg-transparent shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.65)]'
                  : 'bg-surface shadow-[inset_0_0_0_1.5px_rgba(22,68,48,0.45)]'),
              day === 'open' && (isDark ? 'slot-open-inv' : 'slot-open')
            )}
          />
        ))}
      </div>

      {isEmpty && (
        <Link
          href={`/generate?client=${clientId}`}
          className="ml-1 shrink-0 rounded-sm bg-surface px-3.5 py-2 text-body font-medium text-forest no-underline transition-colors hover:bg-wash"
        >
          Generate →
        </Link>
      )}
    </div>
  )
}
