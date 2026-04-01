import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import type { Json } from '@/types/database'

const POST_COLUMNS = 'id, client_id, caption, platform, post_type, slides_json, carousel_quality_json, status, priority, scheduled_at, published_at, quality_score_avg, was_rewritten, rewrite_count, source_url, source_title, source_type, pillar, source_excerpt, created_at'

export async function GET(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const clientId = searchParams.get('client_id')

  const includeClient = searchParams.get('include_client') === 'true'
  const scheduledFrom = searchParams.get('scheduled_from')
  const scheduledTo = searchParams.get('scheduled_to')

  // Fetch all client IDs (and names if needed) for this agency
  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name')
    .eq('agency_id', agencyId)

  const clients = (clientRows as Array<{ id: string; name: string }> | null) ?? []
  const clientIds = clients.map((c) => c.id)

  if (clientIds.length === 0) return NextResponse.json({ posts: [] })

  let query = supabase
    .from('posts')
    .select(POST_COLUMNS)
    .in('client_id', clientId ? [clientId] : clientIds)
    .order('created_at', { ascending: false })

  // Support comma-separated status values: ?status=approved,scheduled
  if (status) {
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean)
    if (statuses.length === 1 && statuses[0]) {
      query = query.eq('status', statuses[0])
    } else if (statuses.length > 1) {
      query = query.in('status', statuses)
    }
  }

  if (scheduledFrom) query = query.gte('scheduled_at', scheduledFrom)
  if (scheduledTo) query = query.lte('scheduled_at', scheduledTo)

  const { data: posts } = await query

  // Attach client_name if requested
  if (includeClient) {
    const nameMap = new Map(clients.map((c) => [c.id, c.name]))
    const enriched = (posts ?? []).map((p: Record<string, unknown>) => ({
      ...p,
      client_name: nameMap.get(p.client_id as string) ?? 'Unknown',
    }))
    return NextResponse.json({ posts: enriched })
  }

  return NextResponse.json({ posts: posts ?? [] })
}

interface CreatePostBody {
  client_id: string
  caption: string | null
  platform: string | null
  post_type: string
  slides_json?: unknown
  carousel_quality_json?: unknown
  status?: string
  scheduled_at?: string
  priority?: boolean
  quality_score_avg?: number | null
  topic_summary?: string | null
  was_rewritten?: boolean
  rewrite_count?: number
  source_url?: string | null
  source_title?: string | null
  source_type?: string | null
  source_excerpt?: string | null
  pillar?: string | null
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  let body: CreatePostBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.client_id || typeof body.client_id !== 'string') {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  }

  // Verify client belongs to agency
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', body.client_id)
    .eq('agency_id', agencyId)
    .single()

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      client_id: body.client_id,
      caption: body.caption ?? null,
      platform: body.platform ?? null,
      post_type: body.post_type ?? 'single',
      slides_json: (body.slides_json as Json) ?? null,
      carousel_quality_json: (body.carousel_quality_json as Json) ?? null,
      status: body.status === 'pending_review' ? 'pending_review' : body.status === 'scheduled' ? 'scheduled' : 'approved',
      scheduled_at: body.scheduled_at ?? null,
      priority: body.priority ?? false,
      quality_score_avg: body.quality_score_avg ?? null,
      was_rewritten: body.was_rewritten ?? false,
      rewrite_count: body.rewrite_count ?? 0,
      source_url: body.source_url ?? null,
      source_title: body.source_title ?? null,
      source_type: body.source_type ?? null,
      source_excerpt: body.source_excerpt ?? null,
      pillar: body.pillar ?? null,
    })
    .select(POST_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Record in post history to avoid duplicate themes in future generations
  if (body.topic_summary) {
    await supabase.from('post_history').insert({
      client_id: body.client_id,
      topic_summary: body.topic_summary,
    })
  }

  return NextResponse.json({ post })
}
