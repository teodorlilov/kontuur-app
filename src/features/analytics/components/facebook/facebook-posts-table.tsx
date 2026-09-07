import { cn } from '@/utils/cn'
import { PLATFORM_NAMES } from '@/lib/validation'
import type { ReportPostRow } from '../../lib/instagram/build-report'
import { formatCount } from '../../lib/compute/format'
import { ratioToMedian } from '../../lib/compute/report-sections'
import {
  BODY_CELL,
  HEAD_CELL,
  MedianTag,
  PostCell,
  PostsTableEmpty,
  PostsTableFooter,
  PostsTableShell,
} from '../table/posts-table-shared'

/**
 * The columns Meta still serves for a Page post: reactions, comments, shares, and their sum.
 * Per-post reach died in the 2025-11-15 purge, so ranking and the median tag both stand on
 * interactions — the column `build-facebook-report` sorts the rows by. The "× median" tag
 * divides through the shared `ratioToMedian`, the same guarded division the builder applies to
 * Instagram's reach, so the two networks cannot disagree about what the tag means.
 */
export function FacebookPostsTable({
  posts,
  medianInteractions,
}: {
  posts: ReportPostRow[]
  medianInteractions: number | null
}) {
  if (posts.length === 0) return <PostsTableEmpty />
  return (
    <>
      <PostsTableShell
        columns={
          <>
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
          </>
        }
      >
        {posts.map((post, index) => {
          const top = index === 0 && posts.length > 1
          const ratio = ratioToMedian(post.interactions, medianInteractions)
          return (
            <tr key={post.externalPostId}>
              <PostCell post={post} top={top} networkLabel={PLATFORM_NAMES.facebook} />
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
                <MedianTag ratio={ratio} />
              </td>
            </tr>
          )
        })}
      </PostsTableShell>
      <PostsTableFooter
        count={posts.length}
        medianLabel="median interactions"
        medianValue={medianInteractions}
      />
    </>
  )
}
