import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { visualsRateLimitResponse } from '@/lib/auth/rate-limit'
import { requireEntitledRoute } from '@/lib/billing/require-entitled'
import type { Spender } from '@/lib/billing/spend-context'
import { runMetered, spendFailureResponse } from '@/lib/billing/usage'
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
  const refused = await requireEntitledRoute(auth.agencyId, 'spend')
  if (refused) return refused

  const post = await fetchOwnedPost(auth.supabase, postId, auth.agencyId)
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  let position: number
  try {
    position = visualsRequestSchema.parse(await request.json()).position
  } catch {
    return NextResponse.json({ error: 'position must be a non-negative integer' }, { status: 400 })
  }

  const spender: Spender = { agencyId: auth.agencyId, clientId: post.client_id, flow: 'editor' }
  try {
    const result = await runMetered(spender, () =>
      generatePostVisual({ postId, clientId: post.client_id, position })
    )
    if (!result.ok) {
      if (result.reason === 'not_found') {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 })
      }
      // 409, not an error: something else is already making this picture (a run resumed in
      // another tab, the visuals cron). The surface shows the slide as generating and waits
      // rather than paying for a second one.
      if (result.reason === 'in_flight') {
        return NextResponse.json(
          { error: 'This visual is already being generated' },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: 'No slide copy at this position to generate from' },
        { status: 400 }
      )
    }
    return NextResponse.json({ image: result.image })
  } catch (err) {
    return spendFailureResponse(err, 'visuals', 'Visual generation failed', 502)
  }
}
