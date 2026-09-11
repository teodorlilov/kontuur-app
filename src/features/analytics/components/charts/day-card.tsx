import { cn } from '@/utils/cn'
import { PLATFORM_NAMES } from '@/lib/meta/platforms'
import type { TrendPost } from '../../lib/instagram/build-report'
import { formatCount } from '../../lib/compute/format'
import { firstLine, postTypeMeta } from '../../lib/compute/post-display'

/** The card names at most this many posts; the table below holds the rest. */
const DAY_CARD_POSTS = 3

/**
 * The hover card the reach and follower-flow timelines share: a panel beside
 * the crosshair, flipping to the other side past the chart's midpoint so it
 * never runs off the edge.
 *
 * aria-hidden on purpose: both charts already carry their own `role="img"`
 * aria-label sentence and the posts table below prints every number, so the
 * card must not narrate a third time.
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

export function DayCardPosts({
  posts,
  label = 'Published this day',
  divided = true,
  networkLabel = PLATFORM_NAMES.instagram,
}: {
  posts: TrendPost[]
  label?: string
  divided?: boolean
  /** Who "no longer on …" refers to. */
  networkLabel?: string
}) {
  if (posts.length === 0) return null
  const extra = posts.length - DAY_CARD_POSTS
  return (
    <div className={divided ? 'mt-2.5 border-t border-ink/[0.05] pt-2' : 'mt-2'}>
      <div className="text-micro font-medium text-text3">{label}</div>
      <ul className="mt-1.5 space-y-1.5">
        {posts.slice(0, DAY_CARD_POSTS).map((post) => (
          <DayCardPost key={post.externalPostId} post={post} networkLabel={networkLabel} />
        ))}
      </ul>
      {extra > 0 && (
        <p className="mt-1.5 text-micro text-text3">+{extra} more in the posts table below</p>
      )}
    </div>
  )
}

/**
 * Reach first where a network has it, then interactions — all a Facebook Page post carries,
 * since Meta's 2025-11-15 purge left Pages no per-post reach at all. Ordering matters: only a
 * genuinely absent measure may fall through to "metrics after the next sync", or every
 * Facebook reader is told to wait for a number that is never coming.
 */
function postMeasure(post: TrendPost, networkLabel: string): string {
  if (post.reach !== null) return `${formatCount(post.reach)} reached`
  if (post.interactions !== null) return `${formatCount(post.interactions)} interactions`
  if (post.missing === 'removed') return `no longer on ${networkLabel}`
  return 'metrics after the next sync'
}

function DayCardPost({ post, networkLabel }: { post: TrendPost; networkLabel: string }) {
  const type = postTypeMeta(post.mediaType)
  return (
    <li className="flex items-start gap-2">
      <span
        className={cn(
          'grid size-5 flex-none place-items-center rounded-sm text-micro font-medium text-forest',
          type?.tone === 'marker' ? 'bg-marker' : 'bg-sage'
        )}
      >
        {type?.letter ?? '·'}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-micro text-ink">{firstLine(post.caption)}</span>
        <span className="block text-micro tabular-nums text-text3">
          {postMeasure(post, networkLabel)}
          {post.follows !== null && post.follows > 0
            ? ` · +${formatCount(post.follows)} follows`
            : ''}
        </span>
      </span>
    </li>
  )
}
