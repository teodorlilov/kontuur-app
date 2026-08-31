import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { visualsRateLimitResponse } from '@/lib/auth/rate-limit'
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
 * The route used to hardcode `(1, 3)` with a comment calling it "the richly detailed middle slide"
 * default. It is not: `slideRole(1, 3)` returns QUIET, so every picture generated from the editor
 * was briefed as "a restrained, minimal take on the style — ONE small supporting subject only", and
 * `artDirectionFor` stays silent on that role, so it got no framing or treatment either. Editing a
 * cover asked the model for the opposite of a cover.
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
    const { position, total } = slidePlace(body)
    // The same colour pair the slide's siblings wear. Without it this route was the one generation
    // path that produced art with no ground and no accent instruction — a picture that could not
    // belong to the post it was being made for. A post's pair is read from its row; a draft's rides
    // in on the request, because there is no row to read until approve.
    //
    // Passing `postId` is what makes a post-target generation WRITE the pair it derives. It used to
    // only read: a post with no stored pair got one picked, spent a generation on it and threw it
    // away, so the next press could land somewhere else as the client's recent posts moved
    // underneath it. The comment here claimed this path healed a half-written row; it did not.
    // ONE read of the client's kit for the whole generation — the scheme and the prompt both need it.
    // Resolved against the VERIFIED owner, never the caller-supplied clientId: this decides whose
    // palette and brand style the paid generation runs against.
    const identity = await fetchIdentityForGeneration(destination.clientId)
    const scheme = await resolveScheme({
      clientId: destination.clientId,
      identity,
      ...(destination.postId ? { postId: destination.postId } : {}),
      base: body.postId ?? body.draftId ?? destination.clientId,
      // A post's pair came back on the ownership check; a draft's rides in on the request.
      ...(destination.storedScheme
        ? { stored: destination.storedScheme }
        : body.scheme
          ? { stored: body.scheme }
          : {}),
    })

    const visual = await generateVisual({
      spender: { agencyId: auth.agencyId },
      identity,
      textBlock: editorTextBlock(body),
      scheme,
      // Rerolled per press: the editor's whole point is "give me another one", and an empty nonce
      // would hand back the same framing every time while only the model's own noise differed.
      variation: {
        subject: body.postId ?? body.draftId ?? '',
        position,
        total,
        nonce: body.nonce ?? '',
      },
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
