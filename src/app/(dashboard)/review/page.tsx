import { capableDestinations } from '@/features/publishing/lib/destinations'
import type { PostType } from '@/types/api'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { fetchEditorialPosts } from '@/lib/posts/fetch-editorial-posts'
import { fetchWeekSchedule, type WeekScheduledPost } from '@/features/review/lib/week-schedule'
import { getMondayISO } from '@/utils/date-helpers'
import { ReviewQueue } from '@/features/review/components/review-queue'
import type { QueueApproval, QueuePost } from '@/features/review/lib/queue-post'

/**
 * The review queue's data, in ONE round: the editorial read (which fans out to images and docs
 * itself), the clients' flags and connections, the week strip, and the pending sign-off tokens —
 * reached through their post's client rather than by post id, so they need not wait for the posts
 * to come back first; every token of the agency's posts comes back and only the queue's rows read
 * theirs. The queue's own fields ride on the shared editorial read; the raw validation blob stays
 * server-side (`validation_json: null` keeps the shape assignable to PostData).
 */
export default async function ReviewPage() {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  // Use cached clients from layout (cache hit — no extra round-trip)
  const cachedClients = await getCachedAgencyClients(agencyId)
  const clientIds = cachedClients.map((c) => c.id)

  // Names already live in the cached client list — this join only adds the
  // brand-profile fields the queue needs.
  type ClientRow = {
    id: string
    brand_profiles: { is_health_niche: boolean } | null
    social_connections: Array<{ platform: string }> | null
  }

  type TokenRow = { post_id: string; status: string; expires_at: string }
  const [{ data: clientRows }, editorial, weekSchedule, { data: tokenRows }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, brand_profiles(is_health_niche), social_connections(platform)')
      // Same embed-shaping filter as the calendar: a token-less connection is not a
      // destination, and the rule must match `resolveDestinations` without selecting the token.
      .not('social_connections.access_token', 'is', null)
      .eq('agency_id', agencyId),
    fetchEditorialPosts(supabase, clientIds, 'pending_review'),
    // Week context fills the dialog's week strip — worth degrading, never failing for.
    fetchWeekSchedule(supabase, clientIds, getMondayISO()).catch((err: unknown) => {
      console.error('[review] week schedule failed:', err)
      return [] as WeekScheduledPost[]
    }),
    clientIds.length > 0
      ? supabase
          .from('post_approval_tokens')
          .select('post_id, status, expires_at, posts!inner(client_id)')
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .in('posts.client_id', clientIds)
      : Promise.resolve({ data: [] as TokenRow[] }),
  ])

  const clientList = (clientRows as ClientRow[] | null) ?? []
  const clients = cachedClients.map((c) => ({ id: c.id, name: c.name }))
  const healthByClient = new Map(
    clientList.map((c) => [c.id, c.brand_profiles?.is_health_niche ?? false])
  )
  const nameByClient = new Map(clients.map((c) => [c.id, c.name]))
  // The same rule the calendar and the publish path apply — one `capableDestinations`, so no
  // surface can disagree with another about where a post can go.
  const connectedByClient = new Map(
    clientList.map((c) => [c.id, (c.social_connections ?? []).map((conn) => conn.platform)])
  )

  const approvalByPost = new Map<string, QueueApproval>()
  for (const token of (tokenRows as TokenRow[] | null) ?? []) {
    approvalByPost.set(token.post_id, { status: 'pending', expiresAt: token.expires_at })
  }

  const posts: QueuePost[] = editorial.map(({ post, ...evidence }) => ({
    ...post,
    ...evidence,
    validation_json: null,
    client_name: nameByClient.get(post.client_id) ?? 'Unknown',
    destinations: capableDestinations(
      connectedByClient.get(post.client_id) ?? [],
      (post.post_type ?? 'single') as PostType
    ),
    is_health_niche: healthByClient.get(post.client_id) ?? false,
    approval: approvalByPost.get(post.id) ?? null,
  }))

  const postsPerWeekByClient = Object.fromEntries(
    cachedClients.map((c) => [c.id, c.posts_per_week ?? 0])
  )

  return (
    <ReviewQueue
      initialPosts={posts}
      clients={clients}
      weekSchedule={weekSchedule}
      postsPerWeekByClient={postsPerWeekByClient}
      loadedAt={new Date().toISOString()}
    />
  )
}
