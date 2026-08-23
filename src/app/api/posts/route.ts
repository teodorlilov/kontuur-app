import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { draftVisualPrefix, movePostImageObject } from '@/features/publishing/lib/storage'
import { isImageNode } from '@/lib/canvas/doc-nodes'
import { safeParseCanvasDoc } from '@/lib/canvas/doc-schema'
import { insertCanvasDocs } from '@/lib/canvas/doc-store'
import { POST_COLUMNS } from '@/lib/queries/select-columns'
import { draftColumns } from '@/lib/generation/draft-columns'
import { isValidPostPlatform } from '@/lib/validation'
import type { CanvasDoc } from '@/types/canvas'

/** List the agency's posts, filterable by status, client and scheduled window. */
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

  const { data: clientRows, error: clientsError } = await supabase
    .from('clients')
    .select('id, name')
    .eq('agency_id', agencyId)
  // An empty client list short-circuits to `{ posts: [] }` below, so a failed
  // query would render as an agency with no posts at all.
  if (clientsError) {
    console.error('[posts] client query failed:', clientsError.message)
    return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 })
  }

  // as: explicit column projection — Supabase types from the table, not the select
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

  const { data: posts, error: postsError } = await query
  if (postsError) {
    console.error('[posts] post query failed:', postsError.message)
    return NextResponse.json({ error: 'Failed to load posts' }, { status: 500 })
  }

  if (includeClient) {
    const nameMap = new Map(clients.map((c) => [c.id, c.name]))
    const enriched = (posts ?? []).map((p: Record<string, unknown>) => ({
      ...p,
      // as: POST_COLUMNS projects client_id; the row itself is a generic record
      client_name: nameMap.get(p.client_id as string) ?? 'Unknown',
    }))
    return NextResponse.json({ posts: enriched })
  }

  return NextResponse.json({ posts: posts ?? [] })
}

/**
 * The wizard's approve payload. `status` is an enum rather than a free string
 * because it is written straight to posts.status, and the previous hand-rolled
 * interface let anything through — only client_id was ever checked at runtime.
 */
const createPostSchema = z.object({
  client_id: z.string().min(1),
  caption: z.string().nullable().optional(),
  platform: z.string().optional(),
  post_type: z.string().optional(),
  slides_json: z.unknown().optional(),
  validation_json: z.unknown().optional(),
  status: z.enum(['pending_review', 'scheduled', 'approved']).optional(),
  /** nullable: approving without a slot sends an explicit null, not an omitted key. */
  scheduled_at: z.string().nullable().optional(),
  priority: z.boolean().optional(),
  quality_score_avg: z.number().nullable().optional(),
  topic_summary: z.string().nullable().optional(),
  was_rewritten: z.boolean().optional(),
  rewrite_count: z.number().optional(),
  source_url: z.string().nullable().optional(),
  source_title: z.string().nullable().optional(),
  source_type: z.string().nullable().optional(),
  source_excerpt: z.string().nullable().optional(),
  client_source_id: z.string().nullable().optional(),
  pillar: z.string().nullable().optional(),
  /** The AI's own text as generated, sent by the wizard so the pre-insert human
   *  edit stays diffable — draftColumns coalesces these ahead of the (already
   *  edited) caption/slides. */
  generated_caption: z.string().nullable().optional(),
  generated_slides_json: z.unknown().optional(),
  /** Draft visuals generated in the wizard, attached as post_images rows on approve.
   *  `canvasDoc` (when present) becomes the slide's post_canvas_docs row so edits stay editable. */
  images: z
    .array(
      z.object({
        // Constrained here rather than re-checked below. `z.number()` admits -1.5, which is
        // why both attach helpers had grown their own `Number.isInteger(...) && ... >= 0`
        // pair — a hand-rolled check standing in for validation, the exact shape TECH-DEBT
        // §7.4 documents at the route layer. The schema is the boundary; say it once here.
        position: z.number().int().nonnegative(),
        publicUrl: z.string().min(1),
        storagePath: z.string().min(1),
        canvasDoc: z.unknown().optional(),
      })
    )
    .optional(),
})

type CreatePostBody = z.infer<typeof createPostSchema>

/**
 * What the caller is told when the post saved but something hung off it did not.
 *
 * Both attachments below are deliberately best-effort — the post is already committed and
 * losing it to a failed side-write would be worse. But "approved" with the visuals silently
 * missing is a lie the user only discovers in the calendar, so each returns whether it
 * delivered and the route reports the shortfall.
 */
const ATTACH_WARNINGS = {
  images: 'Post approved, but its visuals could not be attached — regenerate them in the calendar.',
  canvasDocs:
    'Post approved, but its editable canvas could not be saved — the editor will reseed on first open.',
} as const

/** Attach wizard-draft visuals to a freshly created post. Only paths under the client's drafts prefix
 *  are accepted so a caller can't claim foreign storage objects. Returns false when the post kept none
 *  of the visuals it was sent — logged, never fatal. */
async function attachDraftImages(
  postId: string,
  clientId: string,
  images: CreatePostBody['images']
): Promise<boolean> {
  const prefix = draftVisualPrefix(clientId)
  // Shape and range are the schema's job; the only thing left to decide here is ownership.
  const rows = (images ?? [])
    .filter((img) => img.storagePath.startsWith(prefix))
    .map((img) => ({
      post_id: postId,
      position: img.position,
      public_url: img.publicUrl,
      storage_path: img.storagePath,
      content_type: 'image/jpeg',
    }))
  if (rows.length === 0) return true

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('post_images').insert(rows)
  if (error) {
    console.error('[posts] failed to attach draft visuals:', error.message)
    return false
  }
  return true
}

/** Move a draft doc's stored files (clean background + placed assets) into the post's folder.
 *  Only the client's own drafts-prefixed files are moved; anything else keeps the path it has, as
 *  does a failed move — both still serve. */
async function relocateDraftDoc(
  doc: CanvasDoc,
  prefix: string,
  clientId: string,
  postId: string
): Promise<CanvasDoc> {
  const background =
    (await movePostImageObject(doc.background.storagePath, clientId, postId)) ?? doc.background
  const nodes = await Promise.all(
    doc.nodes.map(async (node) => {
      // Only a placed asset has a file; text and drawn shapes have nothing to move. An asset
      // already outside `drafts/` is not ours to move either — all pass through untouched rather
      // than being dropped from the doc.
      if (!isImageNode(node) || !node.src.storagePath.startsWith(prefix)) return node
      const moved = await movePostImageObject(node.src.storagePath, clientId, postId)
      return moved ? { ...node, src: moved } : node
    })
  )
  return { ...doc, background, nodes }
}

/** Attach the drafts' canvas docs to a freshly created post. The clean background files move out of
 *  `drafts/` into the post's folder (a future drafts cleanup must not orphan re-edit state); a failed
 *  move keeps the drafts path, which still serves. Returns false when the insert dropped docs the
 *  caller sent — logged, never fatal. */
async function attachDraftCanvasDocs(
  postId: string,
  clientId: string,
  images: CreatePostBody['images']
): Promise<boolean> {
  const prefix = draftVisualPrefix(clientId)
  const candidates = (images ?? []).filter((img) => img.canvasDoc !== undefined)
  if (candidates.length === 0) return true

  const rows = await Promise.all(
    candidates.map(async (img) => {
      const parsed = safeParseCanvasDoc(img.canvasDoc)
      if (!parsed.success || !parsed.doc.background.storagePath.startsWith(prefix)) return null
      const doc = await relocateDraftDoc(parsed.doc, prefix, clientId, postId)
      return { postId, position: img.position, doc }
    })
  )

  const inserts = rows.filter((row) => row !== null)
  // A doc dropped by the parse/prefix guard above is a rejected doc, not a failed write —
  // it is reported the same way, because from the user's side the canvas is missing either way.
  const rejected = candidates.length - inserts.length
  if (rejected > 0) {
    console.warn(`[posts] ${rejected} draft canvas doc(s) rejected for post ${postId}`)
  }
  // `candidates` is non-empty by the guard above, so every candidate was rejected.
  if (inserts.length === 0) return false

  const { error } = await insertCanvasDocs(createAdminSupabaseClient(), inserts)
  if (error) {
    console.error('[posts] failed to attach draft canvas docs:', error)
    return false
  }
  return rejected === 0
}

/** Create a post from an approved wizard draft, attaching its draft visuals and canvas docs. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  let body: CreatePostBody
  try {
    body = createPostSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('id', body.client_id)
    .eq('agency_id', agencyId)
    .maybeSingle()
  // A failed ownership read must not read as "not yours".
  if (clientError) {
    console.error('[posts] client ownership check failed:', clientError.message)
    return NextResponse.json({ error: 'Failed to verify client' }, { status: 500 })
  }

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // The only unguarded write to posts.platform, and its default was the lone source
  // of lowercase 'instagram' in a column the rest of the app spells 'Instagram'.
  // Same check as PUT and updatePost, so all three writers agree on one vocabulary.
  const platform = body.platform ?? 'Instagram'
  if (!isValidPostPlatform(platform)) {
    return NextResponse.json({ error: `Invalid platform: ${platform}` }, { status: 400 })
  }

  // Attribution guard: never persist a source id that belongs to another client
  let clientSourceId = body.client_source_id ?? null
  if (clientSourceId) {
    const { data: ownedSource, error: sourceError } = await supabase
      .from('client_sources')
      .select('id')
      .eq('id', clientSourceId)
      .eq('client_id', body.client_id)
      .maybeSingle()
    if (sourceError) {
      console.error('[posts] source ownership check failed:', sourceError.message)
      return NextResponse.json({ error: 'Failed to verify source' }, { status: 500 })
    }
    if (!ownedSource) {
      console.warn('[posts] client_source_id does not belong to client — dropping attribution')
      clientSourceId = null
    }
  }

  // Draft facts go through the shared builder so a column added there cannot be
  // silently dropped by this route. What stays inline is what this route owns:
  // workflow status, scheduling, rewrite bookkeeping, and the two guarded fields —
  // the canonicalized platform is passed in, and the ownership-checked source id
  // overrides the builder's pass-through.
  const insertRow = {
    ...draftColumns({
      client_id: body.client_id,
      caption: body.caption ?? null,
      platform,
      post_type: body.post_type ?? 'single',
      slides_json: body.slides_json,
      validation_json: body.validation_json,
      quality_score_avg: body.quality_score_avg ?? null,
      source_url: body.source_url,
      source_title: body.source_title,
      source_type: body.source_type,
      source_excerpt: body.source_excerpt,
      pillar: body.pillar,
      topic_summary: body.topic_summary,
      generated_caption: body.generated_caption,
      generated_slides_json: body.generated_slides_json,
    }),
    client_source_id: clientSourceId,
    status:
      body.status === 'pending_review'
        ? 'pending_review'
        : body.status === 'scheduled'
          ? 'scheduled'
          : 'approved',
    scheduled_at: body.scheduled_at ?? null,
    priority: body.priority ?? false,
    was_rewritten: body.was_rewritten ?? false,
    rewrite_count: body.rewrite_count ?? 0,
  }

  const { data: post, error } = await supabase
    .from('posts')
    .insert(insertRow)
    .select(POST_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Concurrent, not sequential: the two touch different tables and — verified — different
  // storage objects. `images[].storagePath` is the FLATTENED composite `saveDraftCanvas`
  // uploads to its own path, while the doc's `background` keeps the clean original, so the
  // relocation below cannot move a file the image rows point at.
  const [imagesAttached, docsAttached] = await Promise.all([
    attachDraftImages(post.id, body.client_id, body.images),
    attachDraftCanvasDocs(post.id, body.client_id, body.images),
  ])
  const warnings: string[] = []
  if (!imagesAttached) warnings.push(ATTACH_WARNINGS.images)
  if (!docsAttached) warnings.push(ATTACH_WARNINGS.canvasDocs)

  // Record in post history to avoid duplicate themes in future generations.
  // Logged rather than failed: the post itself is already saved, and history
  // only feeds topic de-duplication on later runs.
  if (body.topic_summary) {
    const { error: historyError } = await supabase.from('post_history').insert({
      client_id: body.client_id,
      topic_summary: body.topic_summary,
    })
    if (historyError) {
      console.error('[posts] post history insert failed:', historyError.message)
    }
  }

  // The post saved either way — `warnings` says what did not come with it, so approve can
  // stop reporting an unqualified success over a post whose visuals never landed.
  return NextResponse.json(warnings.length > 0 ? { post, warnings } : { post })
}
