import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { POST_COLUMNS } from '@/lib/queries/select-columns'
import { fetchCanvasDocPositions, fetchImagesByPost } from '@/features/publishing/lib/fetch-post-images'
import {
  fallbackValidationData,
  needsSlopFallback,
  toValidationData,
} from '@/features/review/lib/adapt-validation'
import { fetchWeekSchedule, type WeekScheduledPost } from '@/features/review/lib/week-schedule'
import { getMondayISO } from '@/utils/date-helpers'
import { ReviewQueue } from '@/features/review/components/review-queue'
import type { QueueApproval, QueuePost } from '@/features/review/lib/queue-post'
import type { BestTimePlatform } from '@/types/api'
import type { PostRow } from '@/types'

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
    brand_profiles: { is_health_niche: boolean; best_time_json: unknown } | null
  }

  // Oldest first: the queue drains, it doesn't silt up. The week schedule only
  // needs client ids, so it rides in this first round instead of a second one.
  const [{ data: clientRows }, { data: postRows }, weekSchedule] = await Promise.all([
    supabase
      .from('clients')
      .select('id, brand_profiles(is_health_niche, best_time_json)')
      .eq('agency_id', agencyId),
    clientIds.length > 0
      ? supabase
          .from('posts')
          // topic_summary rides separately until migration 20260806 reaches the
          // generated types — fold it into POST_COLUMNS after the regen.
          .select(`${POST_COLUMNS}, topic_summary`)
          .in('client_id', clientIds)
          .eq('status', 'pending_review')
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    // Week context powers the slot picker — worth degrading, never failing for.
    fetchWeekSchedule(supabase, clientIds, getMondayISO()).catch((err: unknown) => {
      console.error('[review] week schedule failed:', err)
      return [] as WeekScheduledPost[]
    }),
  ])

  const clientList = (clientRows as ClientRow[] | null) ?? []
  const clients = cachedClients.map((c) => ({ id: c.id, name: c.name }))
  const healthByClient = new Map(
    clientList.map((c) => [c.id, c.brand_profiles?.is_health_niche ?? false])
  )
  const nameByClient = new Map(clients.map((c) => [c.id, c.name]))

  const bestTimeMap: Record<string, BestTimePlatform[] | null> = {}
  for (const c of clientList) {
    const btj = c.brand_profiles?.best_time_json
    bestTimeMap[c.id] = Array.isArray(btj) ? (btj as BestTimePlatform[]) : null
  }

  type PostQueryRow = Pick<
    PostRow,
    | 'id'
    | 'client_id'
    | 'caption'
    | 'platform'
    | 'post_type'
    | 'status'
    | 'priority'
    | 'quality_score_avg'
    | 'was_rewritten'
    | 'rewrite_count'
    | 'pillar'
    | 'source_url'
    | 'source_title'
    | 'source_type'
    | 'source_excerpt'
    | 'topic_summary'
    | 'scheduled_at'
    | 'created_at'
  > & {
    slides_json: unknown
    validation_json: unknown
  }

  const typedPostRows = (postRows as PostQueryRow[] | null) ?? []
  const postIds = typedPostRows.map((p) => p.id)

  type TokenRow = { post_id: string; status: string; expires_at: string }
  const [imagesByPost, composedByPost, { data: tokenRows }] = await Promise.all([
    fetchImagesByPost(postIds),
    fetchCanvasDocPositions(postIds),
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

  // Validation is adapted here, server-side: the client gets ValidationData,
  // never the raw blob — that keeps zod (and legacy-shape parsing) out of the
  // queue's bundle and per-render work.
  const posts: QueuePost[] = typedPostRows.map((p) => ({
    ...p,
    validation_json: null,
    validation:
      toValidationData(p.validation_json) ?? fallbackValidationData(p.quality_score_avg),
    needsSlopCheck: needsSlopFallback(p.validation_json),
    client_name: nameByClient.get(p.client_id) ?? 'Unknown',
    is_health_niche: healthByClient.get(p.client_id) ?? false,
    images: imagesByPost.get(p.id) ?? [],
    composedPositions: composedByPost.get(p.id) ?? [],
    approval: approvalByPost.get(p.id) ?? null,
  }))

  const postsPerWeekByClient = Object.fromEntries(
    cachedClients.map((c) => [c.id, c.posts_per_week ?? 0])
  )

  return (
    <ReviewQueue
      initialPosts={posts}
      clients={clients}
      bestTimeMap={bestTimeMap}
      weekSchedule={weekSchedule}
      postsPerWeekByClient={postsPerWeekByClient}
      loadedAt={new Date().toISOString()}
    />
  )
}
