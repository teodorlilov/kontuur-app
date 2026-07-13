import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyPostOwnership } from '@/lib/auth/helpers'
import { getBrandKitForClient, getClientFeedSystem } from '@/lib/brand-kit/queries'
import { feedSystemTokens } from '@/lib/renderer/feed-system-compositions'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

function adminClient(): SupabaseClient {
  return createAdminSupabaseClient() as unknown as SupabaseClient
}

/**
 * The post's generated slide compositions + the job status + the client's kit tokens — polled by the
 * review after kicking `POST …/visuals/generate`. The compositions are token-bound bindings (no baked
 * colours), so the review needs the tokens to render them client-side via Konva.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const owned = await verifyPostOwnership(auth.supabase, id, auth.agencyId)
  if (!owned) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const db = adminClient()
  const [{ data: statusRow }, { data: rows }, kit, feedSystem] = await Promise.all([
    db.from('posts').select('visuals_status, visuals_error').eq('id', id).single(),
    db.from('post_visuals').select('slide_index, composition_json').eq('post_id', id).order('slide_index'),
    getBrandKitForClient(owned.client_id, auth.agencyId),
    getClientFeedSystem(owned.client_id),
  ])

  const status = statusRow as { visuals_status?: string | null; visuals_error?: string | null } | null
  const slides = ((rows as Array<{ slide_index: number; composition_json: unknown }> | null) ?? []).map((r) => ({
    slideIndex: r.slide_index,
    composition: r.composition_json,
  }))

  return NextResponse.json({
    status: status?.visuals_status ?? null,
    error: status?.visuals_error ?? null,
    slides,
    // Augment the weight arrays for the post's feed system so canvas loads the exact weights the
    // compositions use (bold 800/900, quiet 300/500) — otherwise those render in a fallback.
    tokens: feedSystemTokens(feedSystem.slug, kit?.tokens ?? DEFAULT_TOKENS),
  })
}
