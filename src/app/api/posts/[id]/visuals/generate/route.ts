import { after, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyPostOwnership } from '@/lib/auth/helpers'
import { getBrandKitForClient, getClientFeedSystem } from '@/lib/brand-kit/queries'
import { composeSlides } from '@/lib/renderer/compose'
import { DEFAULT_RATIO } from '@/lib/renderer/layout/anchor'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { CarouselSlide } from '@/types/api'

// maxDuration headroom for Phase 4, when fal imagery runs inside the same after() job.
export const runtime = 'nodejs'
export const maxDuration = 300

// brand_kits / feed_systems / post_visuals have no RLS — app-level access via the service-role client.
function adminClient(): SupabaseClient {
  return createAdminSupabaseClient() as unknown as SupabaseClient
}

/**
 * On-demand: compose a post's carousel copy into per-slide scene graphs and persist them to
 * `post_visuals`. Runs in `after()` and marks the post `generating → ready/failed` so the review polls
 * `GET /api/posts/[id]/visuals`. Compose alone is instant; the async shape is deliberate so the Phase 4
 * imagery step slots into this same job with no change to the endpoint or the review UI.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const owned = await verifyPostOwnership(auth.supabase, id, auth.agencyId)
  if (!owned) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const db = adminClient()
  const { data: postRow } = await db.from('posts').select('slides_json').eq('id', id).single()
  const slides = ((postRow as { slides_json?: unknown } | null)?.slides_json as CarouselSlide[] | null) ?? []
  if (slides.length === 0) return NextResponse.json({ error: 'Post has no carousel slides to render' }, { status: 400 })

  const [{ data: clientRow }, kit] = await Promise.all([
    db.from('clients').select('name').eq('id', owned.client_id).single(),
    getBrandKitForClient(owned.client_id, auth.agencyId),
  ])
  const kicker = (clientRow as { name?: string } | null)?.name ?? ''
  const brandKitVersion = kit?.version ?? 1

  const { slug: feedSystemSlug, id: feedSystemId } = await getClientFeedSystem(owned.client_id)

  await db.from('posts').update({ visuals_status: 'generating', visuals_error: null }).eq('id', id)

  after(async () => {
    try {
      const compositions = composeSlides(slides, { feedSystemSlug, ratio: DEFAULT_RATIO, postId: id, kicker })
      // Phase 4: generate + assign each composition's plate image here, before the upsert.
      const rows = compositions.map((composition, slideIndex) => ({
        post_id: id,
        slide_index: slideIndex,
        composition_json: composition as unknown,
        brand_kit_version: brandKitVersion,
        feed_system_id: feedSystemId,
        updated_at: new Date().toISOString(),
      }))
      // Replace wholesale — the slide count (and copy) can change between runs.
      await db.from('post_visuals').delete().eq('post_id', id)
      const { error } = await db.from('post_visuals').insert(rows)
      if (error) throw new Error(error.message)
      await db.from('posts').update({ visuals_status: 'ready' }).eq('id', id)
    } catch (err) {
      await db
        .from('posts')
        .update({ visuals_status: 'failed', visuals_error: err instanceof Error ? err.message : 'generation failed' })
        .eq('id', id)
    }
  })

  return NextResponse.json({ ok: true })
}
