import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyPostOwnership } from '@/lib/auth/helpers'
import { getBrandKitForClient, getClientFeedSystem } from '@/lib/brand-kit/queries'
import { composePostSlides } from '@/lib/renderer/compose'
import { feedSystemTokens } from '@/lib/renderer/feed-system-compositions'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { CarouselSlide } from '@/types/api'

function adminClient(): SupabaseClient {
  return createAdminSupabaseClient() as unknown as SupabaseClient
}

/**
 * The post's designed slide compositions + the job status + the client's kit tokens — read by the review
 * and calendar (and polled after `POST …/visuals/generate`). Returns stored `post_visuals` when present,
 * else composes them on the fly from the copy so the slides always show. The compositions are token-bound
 * bindings (no baked colours), so the caller needs the tokens to render them client-side via Konva.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const owned = await verifyPostOwnership(auth.supabase, id, auth.agencyId)
  if (!owned) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const db = adminClient()
  const [{ data: postRow }, { data: rows }, kit, feedSystem, { data: clientRow }] = await Promise.all([
    db.from('posts').select('visuals_status, visuals_error, post_type, slides_json').eq('id', id).single(),
    db.from('post_visuals').select('slide_index, composition_json').eq('post_id', id).order('slide_index'),
    getBrandKitForClient(owned.client_id, auth.agencyId),
    getClientFeedSystem(owned.client_id),
    db.from('clients').select('name').eq('id', owned.client_id).single(),
  ])

  const post = postRow as {
    visuals_status?: string | null
    visuals_error?: string | null
    post_type?: string
    slides_json?: unknown
  } | null

  let slides: Array<{ slideIndex: number; composition: unknown }> =
    ((rows as Array<{ slide_index: number; composition_json: unknown }> | null) ?? []).map((r) => ({
      slideIndex: r.slide_index,
      composition: r.composition_json,
    }))

  // No stored visuals yet (the post predates composition, or a job is still pending) — compose the
  // designed slides on the fly from the copy so review/calendar always show them, matching the client
  // approval page. Stored rows take precedence (they carry the Phase 4 imagery once generated).
  if (slides.length === 0 && post?.post_type === 'carousel' && Array.isArray(post.slides_json)) {
    const clientName = (clientRow as { name?: string } | null)?.name ?? ''
    slides = composePostSlides(post.slides_json as CarouselSlide[], {
      feedSystemSlug: feedSystem.slug,
      postId: id,
      clientName,
    }).map((composition, slideIndex) => ({ slideIndex, composition }))
  }

  return NextResponse.json({
    status: post?.visuals_status ?? null,
    error: post?.visuals_error ?? null,
    slides,
    // Augment the weight arrays for the post's feed system so canvas loads the exact weights the
    // compositions use (bold 800/900, quiet 300/500) — otherwise those render in a fallback.
    tokens: feedSystemTokens(feedSystem.slug, kit?.tokens ?? DEFAULT_TOKENS),
  })
}
