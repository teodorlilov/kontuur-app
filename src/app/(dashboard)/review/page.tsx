import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { POST_COLUMNS } from '@/lib/queries/select-columns'
import { fetchImagesByPost } from '@/features/publishing/lib/fetch-post-images'
import { ReviewQueue } from '@/features/review/components/review-queue'
import type { QueueApproval, QueuePost } from '@/features/review/lib/queue-post'
import type { BestTimePlatform } from '@/types/api'

export default async function ReviewPage() {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  // Use cached clients from layout (cache hit — no extra round-trip)
  const cachedClients = await getCachedAgencyClients(agencyId)
  const clientIds = cachedClients.map((c) => c.id)

  type ClientRow = {
    id: string
    name: string
    brand_profiles: { is_health_niche: boolean; best_time_json: unknown } | null
  }

  // Oldest first: the queue drains, it doesn't silt up.
  const [{ data: clientRows }, { data: postRows }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, brand_profiles(is_health_niche, best_time_json)')
      .eq('agency_id', agencyId),
    clientIds.length > 0
      ? supabase
          .from('posts')
          .select(POST_COLUMNS)
          .in('client_id', clientIds)
          .eq('status', 'pending_review')
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const clientList = (clientRows as ClientRow[] | null) ?? []
  const clients = clientList.map((c) => ({ id: c.id, name: c.name }))
  const healthByClient = new Map(
    clientList.map((c) => [c.id, c.brand_profiles?.is_health_niche ?? false])
  )
  const nameByClient = new Map(clients.map((c) => [c.id, c.name]))

  const bestTimeMap: Record<string, BestTimePlatform[] | null> = {}
  for (const c of clientList) {
    const btj = c.brand_profiles?.best_time_json
    bestTimeMap[c.id] = Array.isArray(btj) ? (btj as BestTimePlatform[]) : null
  }

  type PostRow = {
    id: string
    client_id: string
    caption: string | null
    platform: string | null
    post_type: string
    slides_json: unknown
    validation_json: unknown
    status: string
    priority: boolean
    quality_score_avg: number | null
    was_rewritten: boolean
    rewrite_count: number
    pillar: string | null
    source_url: string | null
    source_title: string | null
    source_type: string | null
    source_excerpt: string | null
    scheduled_at: string | null
    created_at: string
  }

  const typedPostRows = (postRows as PostRow[] | null) ?? []
  const postIds = typedPostRows.map((p) => p.id)

  type TokenRow = { post_id: string; status: string; expires_at: string }
  const [imagesByPost, { data: tokenRows }] = await Promise.all([
    fetchImagesByPost(postIds),
    postIds.length > 0
      ? supabase
          .from('post_approval_tokens')
          .select('post_id, status, expires_at')
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .in('post_id', postIds)
      : Promise.resolve({ data: [] as TokenRow[] }),
  ])

  const approvalByPost = new Map<string, QueueApproval>()
  for (const token of (tokenRows as TokenRow[] | null) ?? []) {
    approvalByPost.set(token.post_id, { status: 'pending', expiresAt: token.expires_at })
  }

  const posts: QueuePost[] = typedPostRows.map((p) => ({
    ...p,
    client_name: nameByClient.get(p.client_id) ?? 'Unknown',
    is_health_niche: healthByClient.get(p.client_id) ?? false,
    images: imagesByPost.get(p.id) ?? [],
    approval: approvalByPost.get(p.id) ?? null,
  }))

  return <ReviewQueue initialPosts={posts} clients={clients} bestTimeMap={bestTimeMap} />
}
