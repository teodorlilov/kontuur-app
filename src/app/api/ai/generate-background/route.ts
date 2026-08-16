import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { visualsRateLimitResponse } from '@/lib/auth/rate-limit'
import { generateVisual } from '@/lib/visual/generate-visual'
import { carouselSlideText, sanitizePromptText, singlePostText } from '@/lib/visual/prompt'
import { resolveAssetDestination } from '@/features/publishing/lib/asset-destination'
import { generateBackgroundSchema } from '@/features/canvas-editor/schemas'
import type { GenerateBackgroundBody } from '@/features/canvas-editor/schemas'

// One gpt-image-2 generation (~52s) + download + storage upload per request.
export const maxDuration = 120

/**
 * The TEXT block for the slide being edited. The editor sends the copy it is showing, so this maps
 * rather than re-derives — the slide role hint (which asks the model to leave the top quarter and
 * lower half calm) rides along from `carouselSlideText` either way.
 *
 * A slide with no copy still generates: the direction, palette and style carry it. That is the
 * difference from the wizard's route, which has nothing to say to the model without copy.
 */
function editorTextBlock(body: GenerateBackgroundBody): string {
  const copy = body.slideCopy
  if (copy?.kind === 'slide') {
    // Position/total only pick a role hint; the editor generates one slide at a time, and the
    // "richly detailed middle slide" hint is the right neutral default for a backdrop.
    return carouselSlideText({ headline: copy.headline, body: copy.body }, 1, 3) ?? ''
  }
  if (copy?.kind === 'caption') return singlePostText(copy.caption) ?? ''
  return ''
}

/**
 * Generate a fresh background for one slide, in the editor. The image is stored next to the
 * target's other canvas assets and returned as a bare ref — deliberately NOT written to
 * `post_images`, because the user has not picked it yet and may generate several.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const limited = visualsRateLimitResponse(auth.userId)
  if (limited) return limited

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

  try {
    const visual = await generateVisual({
      // The VERIFIED owner, never the caller-supplied clientId — this decides whose palette and
      // brand style the paid generation runs against.
      clientId: destination.clientId,
      textBlock: editorTextBlock(body),
      // Sanitized like every other user string that reaches the model (URLs, #tags, @mentions out).
      ...(body.direction ? { direction: sanitizePromptText(body.direction) } : {}),
    })
    const { publicUrl, storagePath } = await destination.upload(
      visual.buffer,
      visual.contentType,
      'background.jpg'
    )
    return NextResponse.json({ publicUrl, storagePath })
  } catch (err) {
    console.error('[generate-background] failed:', err)
    const message = err instanceof Error ? err.message : 'Background generation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
