import { cn } from '@/utils/cn'
import type { TrendPost } from '../lib/build-report'
import { formatCount } from '../lib/format'
import { firstLine, TYPE_META } from '../lib/post-display'

/** The card names at most this many posts; the table below holds the rest. */
const DAY_CARD_POSTS = 3

/**
 * The hover day card the reach and follower-flow timelines share: a positioned
 * panel beside the crosshair, flipping sides past the chart's midpoint.
 * Decorative for readers on purpose — each chart speaks its own sr-only
 * sentence and the posts table carries every number in text, so the card
 * never narrates twice.
 */
export function DayCard({ frac, children }: { frac: number; children: React.ReactNode }) {
  const side =
    frac <= 0.55
      ? { left: `calc(${(frac * 100).toFixed(2)}% + 10px)` }
      : { right: `calc(${((1 - frac) * 100).toFixed(2)}% + 10px)` }
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 w-64 print:hidden"
      style={side}
      aria-hidden="true"
    >
      <div className="rounded-panel border border-line bg-surface px-3.5 py-3 shadow-pop">
        {children}
      </div>
    </div>
  )
}

export function DayCardRow({
  swatch,
  label,
  value,
  format = formatCount,
}: {
  swatch?: string
  label: string
  value: number | null
  format?: (value: number) => string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-1.5 text-micro text-text2">
        <i className={cn('h-0.5 w-3.5 flex-none rounded-full', swatch ?? 'opacity-0')} />
        {label}
      </dt>
      <dd className="text-micro font-medium tabular-nums text-ink">
        {value === null ? 'no data' : format(value)}
      </dd>
    </div>
  )
}

/** The "Published this day" block — identical wording on every timeline. */
export function DayCardPosts({ posts }: { posts: TrendPost[] }) {
  if (posts.length === 0) return null
  const extra = posts.length - DAY_CARD_POSTS
  return (
    <div className="mt-2.5 border-t border-ink/[0.05] pt-2">
      <div className="text-micro font-medium text-text3">Published this day</div>
      <ul className="mt-1.5 space-y-1.5">
        {posts.slice(0, DAY_CARD_POSTS).map((post) => (
          <DayCardPost key={post.igMediaId} post={post} />
        ))}
      </ul>
      {extra > 0 && (
        <p className="mt-1.5 text-micro text-text3">+{extra} more in the posts table below</p>
      )}
    </div>
  )
}

function DayCardPost({ post }: { post: TrendPost }) {
  const type = TYPE_META[post.mediaType ?? ''] ?? TYPE_META.IMAGE!
  return (
    <li className="flex items-start gap-2">
      <span
        className={cn(
          'grid size-5 flex-none place-items-center rounded-sm text-micro font-medium text-forest',
          type.tone === 'marker' ? 'bg-marker' : 'bg-sage'
        )}
      >
        {type.letter}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-micro text-ink">{firstLine(post.caption)}</span>
        <span className="block text-micro tabular-nums text-text3">
          {post.reach === null
            ? post.missing === 'removed'
              ? 'no longer on Instagram'
              : 'metrics after the next sync'
            : `${formatCount(post.reach)} reached`}
          {post.follows !== null && post.follows > 0
            ? ` · +${formatCount(post.follows)} follows`
            : ''}
        </span>
      </span>
    </li>
  )
}
