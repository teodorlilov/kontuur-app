import { cn } from '@/utils/cn'
import type { ReportPostRow } from '../lib/build-report'
import { formatCount } from '../lib/format'
import { BODY_CELL, HEAD_CELL, LOW_RATIO, PostCell, TOP_RATIO } from './posts-table'

/**
 * The Facebook posts table — the lean sibling of `PostsTable`, sharing its Post cell, its
 * cell styles and its ratio thresholds, with the columns Meta actually serves for a Page
 * post: reactions, comments, shares, and their sum. Per-post reach died in the 2025-11-15
 * purge, so ranking and the median tag both stand on interactions instead — the column the
 * builder sorted by.
 */
export function FacebookPostsTable({
  posts,
  medianInteractions,
}: {
  posts: ReportPostRow[]
  medianInteractions: number | null
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
                Reactions
              </th>
              <th scope="col" className={HEAD_CELL}>
                Comments
              </th>
              <th scope="col" className={cn(HEAD_CELL, 'hidden md:table-cell')}>
                Shares
              </th>
              <th scope="col" className={HEAD_CELL}>
                Interactions
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post, index) => {
              const top = index === 0 && posts.length > 1
              const ratio =
                post.interactions !== null && medianInteractions !== null && medianInteractions > 0
                  ? post.interactions / medianInteractions
                  : null
              return (
                <tr key={post.igMediaId}>
                  <PostCell post={post} top={top} networkLabel="Facebook" />
                  <td className={cn(BODY_CELL, top && 'bg-wash')}>
                    {post.likeCount === null ? '—' : formatCount(post.likeCount)}
                  </td>
                  <td className={cn(BODY_CELL, top && 'bg-wash')}>
                    {post.commentsCount === null ? '—' : formatCount(post.commentsCount)}
                  </td>
                  <td className={cn(BODY_CELL, 'hidden md:table-cell', top && 'bg-wash')}>
                    {post.shares === null ? '—' : formatCount(post.shares)}
                  </td>
                  <td className={cn(BODY_CELL, top && 'rounded-r-panel bg-wash')}>
                    {post.interactions === null ? '—' : formatCount(post.interactions)}
                    {ratio !== null && ratio >= TOP_RATIO && (
                      <span className="mt-px block text-micro font-medium text-forest">
                        {ratio.toFixed(1)}× median
                      </span>
                    )}
                    {ratio !== null && ratio <= LOW_RATIO && (
                      <span className="mt-px block text-micro font-medium text-danger">
                        below median
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-caption text-text2">
        {posts.length} post{posts.length === 1 ? '' : 's'} this period
        {medianInteractions !== null && (
          <>
            {' '}
            · median interactions{' '}
            <span className="tabular-nums">{formatCount(Math.round(medianInteractions))}</span>
          </>
        )}{' '}
        · every column re-syncs nightly for 30 days after publish.
      </p>
    </>
  )
}
