import { after, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyPostOwnership } from '@/lib/auth/helpers'
import { composePostVisuals } from '@/lib/renderer/generate-post-visuals'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { CarouselSlide } from '@/types/api'

// maxDuration headroom for Phase 4, when fal imagery runs inside composePostVisuals.
export const runtime = 'nodejs'
export const maxDuration = 300

function adminClient(): SupabaseClient {
  return createAdminSupabaseClient() as unknown as SupabaseClient
}

/**
 * On-demand (re)generation of a post's designed slides — the review's "Generate visuals" button.
 * Marks the post `generating → ready/failed` and runs the shared `composePostVisuals` in `after()` so
 * the review polls `GET /api/posts/[id]/visuals`. The generation flows (cron + wizard) call the same
 * helper directly so posts arrive already designed; this endpoint is for regenerating after the fact.
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

  await db.from('posts').update({ visuals_status: 'generating', visuals_error: null }).eq('id', id)

  after(async () => {
    try {
      // On-demand → generate fal imagery (the only path that spends; cron/wizard stay copy-only).
      await composePostVisuals({ postId: id, clientId: owned.client_id, agencyId: auth.agencyId, slides, withImagery: true })
    } catch (err) {
      await db
        .from('posts')
        .update({ visuals_status: 'failed', visuals_error: err instanceof Error ? err.message : 'generation failed' })
        .eq('id', id)
    }
  })

  return NextResponse.json({ ok: true })
}
