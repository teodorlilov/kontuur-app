import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { PLATFORM_NAMES } from '@/lib/validation'
import type { ReportPostRow } from '../lib/build-report'
import { formatCount, formatDayMonth } from '../lib/format'
import { firstLine, TYPE_META } from '../lib/post-display'
import { PostThumb } from './post-thumb'

/**
 * What the two networks' posts tables share — the third module in this feature to make that
 * split, after `sync-shared.ts` and `narrative-shared.ts`.
 *
 * It exists because the Facebook table was reaching INTO `posts-table.tsx` for five symbols,
 * which made the Instagram-named module quietly the owner of both networks' table vocabulary.
 * What differs between the tables is only their columns: Instagram ranks on reach and has six
 * measures, Facebook lost per-post reach in Meta's 2025-11-15 purge and ranks on interactions.
 * The shell, the empty state, the ratio tag and the footer sentence are the same table.
 */

/** ≥1.5× median earns the ratio tag; ≤0.6× is named below median. */
const TOP_RATIO = 1.5
const LOW_RATIO = 0.6

export const HEAD_CELL = 'border-b border-line px-2.5 py-2 text-right text-label text-text3'
export const BODY_CELL =
  'border-b border-ink/[0.05] px-2.5 py-2.5 text-right text-caption tabular-nums text-ink whitespace-nowrap'

/** Both tables say this, word for word, when a period published nothing. */
export function PostsTableEmpty() {
  return (
    <p className="mt-4 text-caption text-text3">
      No posts published in this period — published posts join this table as their first metrics
      arrive.
    </p>
  )
}

/**
 * The scrollable table frame and its Post column, which both tables lead with.
 * `columns` is the rest of the header row; `children` the rows.
 */
export function PostsTableShell({
  columns,
  children,
}: {
  columns: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-2xl border-collapse">
        <thead>
          <tr>
            <th scope="col" className={cn(HEAD_CELL, 'pl-0 text-left')}>
              Post
            </th>
            {columns}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** The "2.3× median" / "below median" line under whichever measure a network ranks on. */
export function MedianTag({ ratio }: { ratio: number | null }) {
  if (ratio === null) return null
  if (ratio >= TOP_RATIO) {
    return (
      <span className="mt-px block text-micro font-medium text-forest">
        {ratio.toFixed(1)}× median
      </span>
    )
  }
  if (ratio <= LOW_RATIO) {
    return <span className="mt-px block text-micro font-medium text-danger">below median</span>
  }
  return null
}

/**
 * The count-and-median sentence under both tables. `medianLabel` names the measure, because
 * that is the only word that differs: "median reach" against "median interactions".
 */
export function PostsTableFooter({
  count,
  medianLabel,
  medianValue,
}: {
  count: number
  medianLabel: string
  medianValue: number | null
}) {
  return (
    <p className="mt-3 text-caption text-text2">
      {count} post{count === 1 ? '' : 's'} this period
      {medianValue !== null && (
        <>
          {' '}
          · {medianLabel}{' '}
          <span className="tabular-nums">{formatCount(Math.round(medianValue))}</span>
        </>
      )}{' '}
      · every column re-syncs nightly for 30 days after publish.
    </p>
  )
}

/**
 * The Post column both networks' tables share: thumb, caption (a link while the post is
 * live), and the meta line. `networkLabel` is who "removed" and "open on" refer to.
 */
export function PostCell({
  post,
  top,
  networkLabel = PLATFORM_NAMES.instagram,
}: {
  post: ReportPostRow
  top: boolean
  networkLabel?: string
}) {
  const type = TYPE_META[post.mediaType ?? ''] ?? TYPE_META.IMAGE!
  return (
    <td
      className={cn(
        BODY_CELL,
        'whitespace-normal pl-0 text-left',
        top && 'rounded-l-panel bg-wash pl-2.5'
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <PostThumb thumbnailUrl={post.thumbnailUrl} mediaType={post.mediaType} />
        <span className="min-w-0">
          {/* A post removed from the network keeps its caption but
              loses its destination — a link to a 404 helps nobody. */}
          {post.permalink && post.missing !== 'removed' ? (
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-[30ch] truncate text-caption text-ink underline decoration-line underline-offset-2 transition-colors hover:decoration-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
            >
              {firstLine(post.caption)}
              <span className="sr-only"> — open on {networkLabel}</span>
            </a>
          ) : (
            <span className="block max-w-[30ch] truncate text-caption text-ink">
              {firstLine(post.caption)}
            </span>
          )}
          <span className="block text-micro text-text3">
            {post.postedDayKey ? `${formatDayMonth(post.postedDayKey)} · ` : ''}
            {type.label}
            {post.missing === 'removed' && ` · no longer on ${networkLabel}`}
            {post.missing === 'pending' && ' · metrics after the next sync'}
          </span>
        </span>
      </div>
    </td>
  )
}
