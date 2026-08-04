import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { draftVisualPrefix, movePostImageObject } from '@/features/publishing/lib/storage'
import { safeParseCanvasDoc } from '@/lib/canvas/doc-schema'
import { POST_COLUMNS } from '@/lib/queries/select-columns'
import type { CanvasDoc } from '@/types/canvas'
import type { Database, Json } from '@/types/database'

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
  client_source_id?: string | null
  pillar?: string | null
  /** Draft visuals generated in the wizard, attached as post_images rows on approve.
   *  `canvasDoc` (when present) becomes the slide's post_canvas_docs row so edits stay editable. */
  images?: Array<{ position: number; publicUrl: string; storagePath: string; canvasDoc?: unknown }>
}

/** Attach wizard-draft visuals to a freshly created post. Only paths under the client's drafts prefix
 *  are accepted so a caller can't claim foreign storage objects. Failure logs but never fails the post. */
async function attachDraftImages(
  postId: string,
  clientId: string,
  images: CreatePostBody['images']
): Promise<void> {
  const prefix = draftVisualPrefix(clientId)
  const rows = (images ?? [])
    .filter(
      (img) =>
        Number.isInteger(img?.position) && img.position >= 0 &&
        typeof img.publicUrl === 'string' &&
        typeof img.storagePath === 'string' && img.storagePath.startsWith(prefix)
    )
    .map((img) => ({
      post_id: postId,
      position: img.position,
      public_url: img.publicUrl,
      storage_path: img.storagePath,
      content_type: 'image/jpeg',
    }))
  if (rows.length === 0) return

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('post_images').insert(rows)
  if (error) console.error('[posts] failed to attach draft visuals:', error.message)
}

/** Move a draft doc's stored files (clean background + element assets) into the post's folder.
 *  Only the client's own drafts-prefixed element files may attach — others are dropped; a failed
 *  move keeps the drafts path, which still serves. */
async function relocateDraftDoc(
  doc: CanvasDoc,
  prefix: string,
  clientId: string,
  postId: string
): Promise<CanvasDoc> {
  const background = (await movePostImageObject(doc.background.storagePath, clientId, postId)) ?? doc.background
  if (!doc.elements) return { ...doc, background }
  const elements = (
    await Promise.all(
      doc.elements.map(async (element) => {
        if (!element.src.storagePath.startsWith(prefix)) return null
        const moved = await movePostImageObject(element.src.storagePath, clientId, postId)
        return moved ? { ...element, src: moved } : element
      })
    )
  ).filter((element) => element !== null)
  return { ...doc, background, elements }
}

/** Attach the drafts' canvas docs to a freshly created post. The clean background files move out of
 *  `drafts/` into the post's folder (a future drafts cleanup must not orphan re-edit state); a failed
 *  move keeps the drafts path, which still serves. Failure logs but never fails the post. */
async function attachDraftCanvasDocs(
  postId: string,
  clientId: string,
  images: CreatePostBody['images']
): Promise<void> {
  const prefix = draftVisualPrefix(clientId)
  const candidates = (images ?? []).filter(
    (img) => img?.canvasDoc !== undefined && Number.isInteger(img?.position) && img.position >= 0
  )
  if (candidates.length === 0) return

  const rows = await Promise.all(
    candidates.map(async (img) => {
      const parsed = safeParseCanvasDoc(img.canvasDoc)
      if (!parsed.success || !parsed.doc.background.storagePath.startsWith(prefix)) return null
      const doc = await relocateDraftDoc(parsed.doc, prefix, clientId, postId)
      return { post_id: postId, position: img.position, doc: doc as unknown as Json }
    })
  )

  const inserts = rows.filter((row) => row !== null)
  if (inserts.length === 0) return
  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('post_canvas_docs').insert(inserts)
  if (error) console.error('[posts] failed to attach draft canvas docs:', error.message)
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

  // Attribution guard: never persist a source id that belongs to another client
  let clientSourceId = body.client_source_id ?? null
  if (clientSourceId) {
    const { data: ownedSource } = await supabase
      .from('client_sources')
      .select('id')
      .eq('id', clientSourceId)
      .eq('client_id', body.client_id)
      .maybeSingle()
    if (!ownedSource) {
      console.warn('[posts] client_source_id does not belong to client — dropping attribution')
      clientSourceId = null
    }
  }

  const insertRow = {
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
    client_source_id: clientSourceId,
    pillar: body.pillar ?? null,
    topic_summary: body.topic_summary ?? null,
  }

  const { data: post, error } = await supabase
    .from('posts')
    // WHY as: topic_summary lands with migration 20260806 and is not yet in the
    // generated types — regenerate database.ts after applying, then drop this.
    .insert(insertRow as Database['public']['Tables']['posts']['Insert'])
    .select(POST_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await attachDraftImages(post.id, body.client_id, body.images)
  await attachDraftCanvasDocs(post.id, body.client_id, body.images)

  // Record in post history to avoid duplicate themes in future generations
  if (body.topic_summary) {
    await supabase.from('post_history').insert({
      client_id: body.client_id,
      topic_summary: body.topic_summary,
    })
  }

  return NextResponse.json({ post })
}
