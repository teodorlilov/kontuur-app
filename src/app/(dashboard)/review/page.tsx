import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { Topbar } from '@/components/layout/topbar'
import { ReviewQueue } from '@/features/review/components/review-queue'
import type { ReviewPost } from '@/lib/review/filter-review-posts'

export default async function ReviewPage() {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  // Fetch clients with brand profile health niche flag
  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name, brand_profiles(is_health_niche)')
    .eq('agency_id', agencyId)

  type ClientRow = {
    id: string
    name: string
    brand_profiles: { is_health_niche: boolean } | null
  }

  const clientList = (clientRows as ClientRow[] | null) ?? []
  const clientIds = clientList.map((c) => c.id)

  const clients = clientList.map((c) => ({
    id: c.id,
    name: c.name,
    is_health_niche: c.brand_profiles?.is_health_niche ?? false,
  }))

  // Build client lookup
  const clientMap = new Map(clients.map((c) => [c.id, c]))

  // Fetch pending_review posts
  let posts: ReviewPost[] = []

  if (clientIds.length > 0) {
    const { data: postRows } = await supabase
      .from('posts')
      .select('*')
      .in('client_id', clientIds)
      .eq('status', 'pending_review')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })

    type PostRow = {
      id: string
      client_id: string
      caption: string | null
      platform: string | null
      post_type: string
      slides_json: unknown
      carousel_quality_json: unknown
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
      created_at: string
    }

    posts = ((postRows as PostRow[] | null) ?? []).map((p) => {
      const client = clientMap.get(p.client_id)
      return {
        id: p.id,
        client_id: p.client_id,
        caption: p.caption,
        platform: p.platform,
        post_type: p.post_type,
        slides_json: p.slides_json,
        carousel_quality_json: p.carousel_quality_json,
        status: p.status,
        priority: p.priority,
        quality_score_avg: p.quality_score_avg,
        was_rewritten: p.was_rewritten,
        rewrite_count: p.rewrite_count,
        pillar: p.pillar,
        source_url: p.source_url,
        source_title: p.source_title,
        source_type: p.source_type,
        source_excerpt: p.source_excerpt,
        created_at: p.created_at,
        client_name: client?.name ?? 'Unknown',
        is_health_niche: client?.is_health_niche ?? false,
      }
    })
  }

  return (
    <>
      <Topbar title="Review queue" />
      <div className="p-6">
        <ReviewQueue initialPosts={posts} clients={clients} />
      </div>
    </>
  )
}
