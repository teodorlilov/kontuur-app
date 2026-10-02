import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { visualsRateLimitResponse } from '@/lib/auth/rate-limit'
import { requireEntitledRoute } from '@/lib/billing/require-entitled'
import type { Spender } from '@/lib/billing/spend-context'
import { runMetered, spendFailureResponse } from '@/lib/billing/usage'
import { fetchIdentityForGeneration, generateVisual } from '@/lib/visual/generate-visual'
import { resolveScheme } from '@/lib/visual/post-color'
import { carouselSlideText, sanitizePromptText, singlePostText } from '@/lib/visual/prompt'
import { resolveAssetDestination } from '@/features/assets/lib/asset-destination'
import { generateBackgroundSchema } from '@/features/canvas-editor/schemas'
import type { GenerateBackgroundBody } from '@/features/canvas-editor/schemas'

// One gpt-image-2 generation (~52s) + download + storage upload per request.
export const maxDuration = 120

/**
 * Where the edited slide sits, defaulting to a lone cover.
 *
 * The place picks the brief: `slideRole` (src/lib/visual/prompt.ts:38) makes an odd interior slide
 * QUIET — one small subject, mostly plain canvas — and `artDirectionFor`
 * (src/lib/visual/variation.ts:66) gives that role no framing. So a missing place defaults to the
 * cover, never to a guessed interior slot, which could brief a cover as its opposite.
 */
function slidePlace(body: GenerateBackgroundBody): { position: number; total: number } {
  const position = body.position ?? 0
  const total = Math.max(body.total ?? 1, position + 1)
  return { position, total }
}

/**
 * The TEXT block for the slide being edited. The editor sends the copy it is showing, so this maps
 * rather than re-derives — the slide role hint (which asks the model to leave the top quarter and
 * lower half calm) rides along from `carouselSlideText`.
 *
 * A slide with no copy still generates: the direction, palette and style carry it. That is the
 * difference from the wizard's route, which has nothing to say to the model without copy.
 */
function editorTextBlock(body: GenerateBackgroundBody): string {
  const copy = body.slideCopy
  if (copy?.kind === 'slide') {
    const { position, total } = slidePlace(body)
    return carouselSlideText({ headline: copy.headline, body: copy.body }, position, total) ?? ''
  }
  if (copy?.kind === 'caption') return singlePostText(copy.caption) ?? ''
  return ''
}

/**
 * Generate a fresh background for one slide, in the editor. The image is stored next to the
 * target's other canvas assets and returned as a bare ref — deliberately NOT written to
 * `post_images`, because the user has not picked it yet and may generate several.
 *
 * The kit and the colour pair come from the VERIFIED owner and post, never a caller-supplied id:
 * they decide whose palette the paid generation uses. Passing `postId` to `resolveScheme` makes a
 * post with no pair claim the one derived here, so the art wears its siblings' pair and the next
 * press lands on the same one. `nonce` is what makes each press a new framing; empty, every press
 * gets the same brief.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const limited = visualsRateLimitResponse(auth.userId)
  if (limited) return limited
  const refused = await requireEntitledRoute(auth.agencyId, 'spend')
  if (refused) return refused

  let body: GenerateBackgroundBody
  try {
    body = generateBackgroundSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const destination = await resolveAssetDestination(auth.supabase, auth.agencyId, body)
  if (!destination.ok) {
    return NextResponse.json({ error: destination.error }, { status: destination.status })
  }

  const spender: Spender = { agencyId: auth.agencyId, flow: 'editor' }
  try {
    return await runMetered(spender, async () => {
      const { position, total } = slidePlace(body)
      const identity = await fetchIdentityForGeneration(destination.clientId)
      const scheme = await resolveScheme({
        clientId: destination.clientId,
        identity,
        postId: destination.postId,
        base: destination.postId,
        stored: destination.storedScheme,
      })

      const visual = await generateVisual({
        identity,
        textBlock: editorTextBlock(body),
        scheme,
        variation: {
          subject: destination.postId,
          position,
          total,
          nonce: body.nonce ?? '',
        },
        ...(body.direction ? { direction: sanitizePromptText(body.direction) } : {}),
      })
      const { publicUrl, storagePath } = await destination.upload(
        visual.buffer,
        visual.contentType,
        'background.jpg'
      )
      return NextResponse.json({ publicUrl, storagePath })
    })
  } catch (err) {
    return spendFailureResponse(err, 'generate-background', 'Background generation failed')
  }
}
