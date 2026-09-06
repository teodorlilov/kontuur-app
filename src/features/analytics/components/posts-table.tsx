import { cn } from '@/utils/cn'
import type { ReportPostRow } from '../lib/instagram/build-report'
import { formatCount } from '../lib/compute/format'
import {
  BODY_CELL,
  HEAD_CELL,
  MedianTag,
  PostCell,
  PostsTableEmpty,
  PostsTableFooter,
  PostsTableShell,
} from './posts-table-shared'

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
  if (posts.length === 0) return <PostsTableEmpty />
  return (
    <>
      <PostsTableShell
        columns={
          <>
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
          </>
        }
      >
        {posts.map((post, index) => {
          const top = index === 0 && posts.length > 1
          return (
            <tr key={post.igMediaId}>
              <PostCell post={post} top={top} />
              <td className={cn(BODY_CELL, top && 'bg-wash')}>
                {post.reach === null ? '—' : formatCount(post.reach)}
                <MedianTag ratio={post.medianRatio} />
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
                className={cn(BODY_CELL, 'hidden md:table-cell', top && 'rounded-r-panel bg-wash')}
              >
                {post.profileVisits === null ? '—' : formatCount(post.profileVisits)}
              </td>
            </tr>
          )
        })}
      </PostsTableShell>
      <PostsTableFooter count={posts.length} medianLabel="median reach" medianValue={medianReach} />
    </>
  )
}
