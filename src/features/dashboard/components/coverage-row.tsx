import Link from 'next/link'
import { cn } from '@/utils/cn'
import { extractInitials } from '@/utils/format'
import type { DayState } from '@/lib/queries/cache'

/**
 * Capsule tiers, lightest first — driven by position in the list, not by client
 * identity. Rows past the second share the dark tier (its background is applied
 * as an inline gradient, so only the text colour is a class here).
 */
const TIER_CLASSES = ['bg-lime', 'bg-sage', 'surface-dark-capsule text-white'] as const
const DARK_TIER_INDEX = 2

interface CoverageRowProps {
  clientId: string
  name: string
  week: DayState[]
  pendingCount: number
  /** Index in the list — picks the capsule tier. */
  tier: number
}

export function CoverageRow({ clientId, name, week, pendingCount, tier }: CoverageRowProps) {
  const scheduledCount = week.filter((day) => day !== 'open').length
  const isDark = tier >= DARK_TIER_INDEX
  const isEmpty = scheduledCount === 0

  const summary = isEmpty
    ? 'Nothing scheduled yet'
    : [
        `${scheduledCount} ${scheduledCount === 1 ? 'post' : 'posts'} this week`,
        pendingCount > 0 ? `${pendingCount} in review` : null,
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <div
      className={cn(
        'flex items-center gap-3.5 rounded-[18px] px-4 py-3.5',
        'transition-[transform,box-shadow] duration-150 ease-contour hover:-translate-y-0.5 hover:shadow-pop',
        TIER_CLASSES[Math.min(tier, DARK_TIER_INDEX)]
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-panel bg-surface text-[11.5px] font-bold text-forest shadow-pop">
        {extractInitials(name)}
      </span>

      <div className="min-w-0 flex-1">
        <Link
          href={`/clients/${clientId}/edit`}
          className="block truncate text-[14px] font-semibold no-underline"
        >
          {name}
        </Link>
        {/* truncate, not wrap: a second line would push the row past the height
            the paginated list reserves for it. */}
        <div className={cn('mt-px truncate text-[11.5px]', isDark ? 'text-white/55' : 'text-ink/55')}>
          {summary}
        </div>
      </div>

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
          className="ml-1 shrink-0 rounded-sm bg-surface px-3.5 py-2 text-[13px] font-medium text-forest no-underline transition-colors hover:bg-wash"
        >
          Generate →
        </Link>
      )}
    </div>
  )
}
