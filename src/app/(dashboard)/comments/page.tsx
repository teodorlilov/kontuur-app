import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { getCachedCommentQueue } from '@/features/comments/queries/comment-queue'
import { CommentsView } from '@/features/comments/components/comments-view'

/**
 * The comments queue.
 *
 * No `searchParams`: the tab and the client scope are component state, because the
 * whole queue arrives in one read and filtering it in the browser beats a round trip
 * per click. See the note in `comments-view.tsx`.
 *
 * Reads Postgres only. Instagram is reached by the cron every thirty minutes, never
 * on the request path — the same rule the analytics report holds to, and the reason
 * this page renders in milliseconds rather than seconds.
 */
export default async function CommentsPage() {
  const { agencyId } = await requireSessionUser()

  // Both are cached and the queue calls the roster itself, so this is one round of
  // work rather than two — React's cache() collapses the second call.
  const [queue, cachedClients] = await Promise.all([
    getCachedCommentQueue(agencyId),
    getCachedAgencyClients(agencyId),
  ])

  return (
    <CommentsView
      initialGroups={queue.groups}
      clients={cachedClients.map((client) => ({ id: client.id, name: client.name }))}
      accountNames={queue.accountNames}
      withheldPostCount={queue.withheldPostCount}
      loadedAt={new Date().toISOString()}
    />
  )
}
