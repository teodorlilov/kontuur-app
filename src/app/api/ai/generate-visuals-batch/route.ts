import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { fetchClientData } from '@/lib/clients/fetch-client-data'
import { fetchVisualIdentity } from '@/lib/visual/queries'
import { generateBackdrops } from '@/lib/images/generate-backdrops'
import { seedFromId } from '@/lib/images/hash'
import { unitsFromSlides, unitFromCaption } from '@/lib/images/units'
import { streamNdjson } from '@/lib/http/stream-ndjson'
import { createSemaphore } from '@/lib/concurrency'
import type { CarouselSlide } from '@/types/api'

// N posts × ~3 image gens — cap total duration; concurrency-capped inside.
export const maxDuration = 300
const MAX_CONCURRENT_POSTS = 4

interface BatchPost {
  id: string
  post_type: 'single' | 'carousel'
  slides?: CarouselSlide[]
  caption?: string
  topic?: string
}
interface BatchBody {
  clientId: string
  posts: BatchPost[]
}

type BatchEvent =
  | { type: 'unit'; postId: string; index: number; url: string | null }
  | { type: 'post_done'; postId: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** Generate backdrops for a whole manual run's in-memory drafts, concurrency-capped, streaming per unit so
 *  result cards fill progressively. Operates on drafts (no `post_id`); the client persists on approve. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const rl = checkRateLimit(`ai:visuals-batch:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 })

  let body: BatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.clientId || !Array.isArray(body.posts)) {
    return NextResponse.json({ error: 'clientId and posts are required' }, { status: 400 })
  }

  const clientRes = await fetchClientData(supabase, body.clientId, agencyId)
  if ('error' in clientRes) return NextResponse.json({ error: clientRes.error }, { status: 404 })
  const identity = await fetchVisualIdentity(supabase, body.clientId)
  if (!identity) return NextResponse.json({ error: 'This client has no visual identity yet.' }, { status: 400 })

  const limiter = createSemaphore(MAX_CONCURRENT_POSTS)

  return streamNdjson<BatchEvent>(async (send) => {
    await Promise.all(
      body.posts.map(async (post) => {
        const release = await limiter.acquire()
        try {
          const isCarousel = post.post_type === 'carousel' && Array.isArray(post.slides) && post.slides.length > 0
          const units = isCarousel ? unitsFromSlides(post.slides!) : unitFromCaption(post.caption ?? '')
          await generateBackdrops(units, identity, {
            clientId: body.clientId,
            clientName: clientRes.data.name,
            clientNiche: clientRes.data.niche,
            topic: post.topic ?? '',
            seed: seedFromId(post.id),
            onUnit: (r) => send({ type: 'unit', postId: post.id, index: r.index, url: r.url }),
          })
          send({ type: 'post_done', postId: post.id })
        } finally {
          release()
        }
      })
    )
    send({ type: 'done' })
  })
}
