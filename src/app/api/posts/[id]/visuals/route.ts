import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyPostOwnership, type SupabaseServerClient } from '@/lib/auth/helpers'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { fetchClientData } from '@/lib/clients/fetch-client-data'
import { fetchVisualIdentity } from '@/lib/visual/queries'
import { generateBackdrops } from '@/lib/images/generate-backdrops'
import { seedFromId } from '@/lib/images/hash'
import { unitsFromSlides, unitFromCaption } from '@/lib/images/units'
import { streamNdjson } from '@/lib/http/stream-ndjson'
import type { CarouselSlide } from '@/types/api'
import type { BackdropResult } from '@/lib/images/types'
import type { Json } from '@/types/database'

// Hardened Chromium isn't used here, but N image gens + a Haiku call can run ~30-90s.
export const maxDuration = 120

type VisualEvent =
  | { type: 'unit'; index: number; url: string | null }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** Merge generated backdrops into the post: carousel → `slides_json[i].backdrop_url`; single → `image_url`.
 *  Only writes non-null URLs, so a failed/partial (regenerate-one) run never clobbers existing backdrops. */
async function persist(
  supabase: SupabaseServerClient,
  postId: string,
  slides: CarouselSlide[] | null,
  results: BackdropResult[]
): Promise<void> {
  const byIndex = new Map(results.map((r) => [r.index, r.url]))
  if (slides) {
    const updated = slides.map((s, i) => (byIndex.get(i) ? { ...s, backdrop_url: byIndex.get(i)! } : s))
    await supabase.from('posts').update({ slides_json: updated as unknown as Json }).eq('id', postId)
  } else {
    const url = byIndex.get(0)
    if (url) await supabase.from('posts').update({ image_url: url }).eq('id', postId)
  }
}

/** Generate on-brand backdrops for a persisted post (review/cron). Streams one line per unit; `?unit=<i>`
 *  regenerates a single unit with a fresh image. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const owned = await verifyPostOwnership(supabase, id, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rl = checkRateLimit(`ai:visuals:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 })

  const { data: post } = await supabase
    .from('posts')
    .select('id, client_id, post_type, caption, slides_json, pillar')
    .eq('id', id)
    .single()
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const clientRes = await fetchClientData(supabase, post.client_id, agencyId)
  if ('error' in clientRes) return NextResponse.json({ error: clientRes.error }, { status: 500 })
  const identity = await fetchVisualIdentity(post.client_id)
  if (!identity) return NextResponse.json({ error: 'This client has no visual identity yet.' }, { status: 400 })

  const regenParam = new URL(request.url).searchParams.get('unit')
  const regenIndex = regenParam != null ? Number(regenParam) : null
  const slides = (post.slides_json as CarouselSlide[] | null) ?? null
  const isCarousel = post.post_type === 'carousel' && Array.isArray(slides) && slides.length > 0
  let units = isCarousel ? unitsFromSlides(slides!) : unitFromCaption(post.caption ?? '')
  if (regenIndex != null) units = units.filter((u) => u.index === regenIndex)

  return streamNdjson<VisualEvent>(async (send) => {
    const results = await generateBackdrops(units, identity, {
      clientId: post.client_id,
      clientName: clientRes.data.name,
      clientNiche: clientRes.data.niche,
      topic: post.pillar ?? post.caption ?? '',
      seed: seedFromId(post.id),
      nonce: regenIndex != null ? Date.now() : undefined,
      onUnit: (r) => send({ type: 'unit', index: r.index, url: r.url }),
    })
    await persist(supabase, post.id, isCarousel ? slides : null, results)
    send({ type: 'done' })
  })
}
