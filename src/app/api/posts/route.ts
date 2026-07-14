import { after, NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { composePostVisuals } from '@/lib/renderer/generate-post-visuals'
import { POST_COLUMNS } from '@/lib/queries/select-columns'
import { createUntypedAdminClient } from '@/lib/supabase/admin'
import type { CarouselSlide } from '@/types/api'
import type { Json } from '@/types/database'

// The POST handler generates fal imagery in `after()` (background); give it headroom so the paid work
// isn't cut off at the platform default (~10s). Matches `posts/[id]/visuals/generate/route.ts`.
export const runtime = 'nodejs'
export const maxDuration = 300

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
    const statuses = status
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
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
  validation_json?: unknown
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
  /** Operator-edited slide compositions from the wizard visual editor. When present, they're persisted
   *  as-is (imagery already baked in) and the background compose is skipped so edits aren't clobbered. */
  visuals?: Array<{ slideIndex?: number; composition?: unknown }>
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
      platform: body.platform ?? 'instagram',
      post_type: body.post_type ?? 'single',
      slides_json: (body.slides_json as Json) ?? null,
      validation_json: (body.validation_json as Json) ?? null,
      status:
        body.status === 'pending_review'
          ? 'pending_review'
          : body.status === 'scheduled'
            ? 'scheduled'
            : 'approved',
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

  // Compose designed slides so a carousel post arrives already visual, WITH fal imagery — this is the
  // manual (wizard) generation flow, which is operator-initiated so the spend is intended. (The cron
  // inserts posts directly, not through this route, so it stays copy-only.) Best-effort in the
  // background — a failure must never fail the post save; imagery is fail-soft to the token gradient.
  const created = post as { id: string; client_id: string; post_type: string; slides_json: unknown } | null
  if (created && created.post_type === 'carousel') {
    const editedVisuals = (Array.isArray(body.visuals) ? body.visuals : []).filter(
      (s) => typeof s.slideIndex === 'number' && s.composition !== null && typeof s.composition === 'object'
    )
    if (editedVisuals.length > 0) {
      // The operator edited the visuals in the wizard editor — persist them as-is and skip the compose,
      // which would re-derive from copy and clobber the edits. Imagery is already baked into the rows.
      const db = createUntypedAdminClient()
      const rows = editedVisuals.map((s) => ({
        post_id: created.id,
        slide_index: s.slideIndex as number,
        composition_json: s.composition as unknown,
        updated_at: new Date().toISOString(),
      }))
      const { error: visualsError } = await db.from('post_visuals').insert(rows)
      if (visualsError) console.error('[posts] persisting edited visuals failed for', created.id, visualsError.message)
      else await db.from('posts').update({ visuals_status: 'ready' }).eq('id', created.id)
    } else {
      const slides = (created.slides_json as CarouselSlide[] | null) ?? []
      after(async () => {
        try {
          await composePostVisuals({ postId: created.id, clientId: created.client_id, agencyId, slides, withImagery: true })
        } catch (e) {
          console.error('[posts] visual compose failed for', created.id, e)
        }
      })
    }
  }

  // Record in post history to avoid duplicate themes in future generations
  if (body.topic_summary) {
    await supabase.from('post_history').insert({
      client_id: body.client_id,
      topic_summary: body.topic_summary,
    })
  }

  return NextResponse.json({ post })
}
