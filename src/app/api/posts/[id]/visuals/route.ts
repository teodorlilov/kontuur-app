import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { visualsRateLimitResponse } from '@/lib/auth/rate-limit'
import { fetchOwnedPost } from '@/lib/auth/helpers'
import { generatePostVisual } from '@/lib/visual/generate-post-visual'

// One gpt-image-2 generation (~52s) + download + storage upload per request.
export const maxDuration = 120

/** Position indexes a slide, so it must be a whole number; an absent one means the first slide. */
const visualsRequestSchema = z.object({
  position: z.number().int().min(0).default(0),
})

/** Generate the AI visual for one post position and store it as a regular post image. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const limited = visualsRateLimitResponse(auth.userId)
  if (limited) return limited

  const post = await fetchOwnedPost(auth.supabase, postId, auth.agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  let position: number
  try {
    position = visualsRequestSchema.parse(await request.json()).position
  } catch {
    return NextResponse.json({ error: 'position must be a non-negative integer' }, { status: 400 })
  }

  try {
    const result = await generatePostVisual({ postId, clientId: post.client_id, position })
    if (!result.ok) {
      return result.reason === 'not_found'
        ? NextResponse.json({ error: 'Post not found' }, { status: 404 })
        : NextResponse.json(
            { error: 'No slide copy at this position to generate from' },
            { status: 400 }
          )
    }
    return NextResponse.json({ image: result.image })
  } catch (err) {
    console.error('[visuals] generation failed:', err)
    const message = err instanceof Error ? err.message : 'Visual generation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
