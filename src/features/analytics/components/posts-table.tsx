import { cn } from '@/utils/cn'
import type { ReportPostRow } from '../lib/build-report'
import { formatCount, formatDayMonth } from '../lib/format'
import { firstLine, TYPE_META } from '../lib/post-display'

/** ≥1.5× median earns the ratio tag; ≤0.6× is named below median. */
const TOP_RATIO = 1.5
const LOW_RATIO = 0.6

/**
 * Every post published this period, ranked by reach. `follows` is the column
 * that answers the client's real question — who followed because of this post.
 * Metrics re-sync nightly for 30 days after publish, so recent rows move.
 */
export function PostsTable({
  posts,
  medianReach,
}: {
  posts: ReportPostRow[]
  medianReach: number | null
}) {
  if (posts.length === 0) {
    return (
      <p className="mt-4 text-caption text-text3">
        No posts published in this period — published posts join this table as their first metrics
        arrive.
      </p>
    )
  }
  return (
    <>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-2xl border-collapse">
          <thead>
            <tr>
              <th scope="col" className={cn(HEAD_CELL, 'pl-0 text-left')}>
                Post
              </th>
              <th scope="col" className={HEAD_CELL}>
                Reach
              </th>
              <th scope="col" className={cn(HEAD_CELL, 'hidden md:table-cell')}>
                Views
              </th>
              <th scope="col" className={HEAD_CELL}>
                Interactions
              </th>
              <th scope="col" className={cn(HEAD_CELL, 'hidden md:table-cell')}>
                Saves
              </th>
              <th scope="col" className={HEAD_CELL}>
                Follows
              </th>
              <th scope="col" className={cn(HEAD_CELL, 'hidden md:table-cell')}>
                Profile visits
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post, index) => {
              const type = TYPE_META[post.mediaType ?? ''] ?? TYPE_META.IMAGE!
              const top = index === 0 && posts.length > 1
              return (
                <tr key={post.igMediaId}>
                  <td
                    className={cn(
                      BODY_CELL,
                      'whitespace-normal pl-0 text-left',
                      top && 'rounded-l-panel bg-wash pl-2.5'
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid size-8 flex-none place-items-center rounded-panel text-label tracking-normal text-forest',
                          type.tone === 'marker' ? 'bg-marker' : 'bg-sage'
                        )}
                      >
                        {type.letter}
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[30ch] truncate text-caption text-ink">
                          {firstLine(post.caption)}
                        </span>
                        <span className="block text-micro text-text3">
                          {post.postedAt ? `${formatDayMonth(post.postedAt.slice(0, 10))} · ` : ''}
                          {type.label}
                          {post.missing === 'removed' && ' · no longer on Instagram'}
                          {post.missing === 'pending' && ' · metrics after the next sync'}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className={cn(BODY_CELL, top && 'bg-wash')}>
                    {post.reach === null ? '—' : formatCount(post.reach)}
                    {post.medianRatio !== null && post.medianRatio >= TOP_RATIO && (
                      <span className="mt-px block text-micro font-medium text-forest">
                        {post.medianRatio.toFixed(1)}× median
                      </span>
                    )}
                    {post.medianRatio !== null && post.medianRatio <= LOW_RATIO && (
                      <span className="mt-px block text-micro font-medium text-danger">
                        below median
                      </span>
                    )}
                  </td>
                  <td className={cn(BODY_CELL, 'hidden md:table-cell', top && 'bg-wash')}>
                    {post.views === null ? '—' : formatCount(post.views)}
                  </td>
                  <td className={cn(BODY_CELL, top && 'bg-wash')}>
                    {post.interactions === null ? '—' : formatCount(post.interactions)}
                  </td>
                  <td className={cn(BODY_CELL, 'hidden md:table-cell', top && 'bg-wash')}>
                    {post.saved === null ? '—' : formatCount(post.saved)}
                  </td>
                  <td className={cn(BODY_CELL, top && 'bg-wash')}>
                    {post.follows === null ? '—' : `+${formatCount(post.follows)}`}
                  </td>
                  <td
                    className={cn(
                      BODY_CELL,
                      'hidden md:table-cell',
                      top && 'rounded-r-panel bg-wash'
                    )}
                  >
                    {post.profileVisits === null ? '—' : formatCount(post.profileVisits)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-caption text-text2">
        {posts.length} post{posts.length === 1 ? '' : 's'} this period
        {medianReach !== null && (
          <>
            {' '}
            · median reach{' '}
            <span className="tabular-nums">{formatCount(Math.round(medianReach))}</span>
          </>
        )}{' '}
        · every column re-syncs nightly for 30 days after publish.
      </p>
    </>
  )
}

const HEAD_CELL = 'border-b border-line px-2.5 py-2 text-right text-label text-text3'
const BODY_CELL =
  'border-b border-ink/[0.05] px-2.5 py-2.5 text-right text-caption tabular-nums text-ink whitespace-nowrap'
