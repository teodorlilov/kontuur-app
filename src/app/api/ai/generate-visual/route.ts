import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { visualsRateLimitResponse } from '@/lib/auth/rate-limit'
import { fetchClientById } from '@/lib/queries/db'
import {
  uploadDraftVisual,
  deleteDraftVisuals,
  draftVisualPrefix,
} from '@/features/publishing/lib/storage'
import { slideTextBlock } from '@/lib/visual/prompt'
import { fetchIdentityForGeneration, generateVisual } from '@/lib/visual/generate-visual'
import { resolveScheme } from '@/lib/visual/post-color'
import { totalVisualSlots } from '@/lib/visual/visual-backlog'
import { deleteDraftVisualsSchema, generateDraftVisualSchema } from '@/features/generate/schemas'

// One gpt-image-2 generation (~52s) + download + storage upload per request.
export const maxDuration = 120

/** Generate an AI visual for an in-memory wizard draft; the image is stored, the DB row waits for approve. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const limited = visualsRateLimitResponse(auth.userId)
  if (limited) return limited

  let body
  try {
    body = generateDraftVisualSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const client = await fetchClientById(auth.supabase, body.clientId, auth.agencyId)
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // The same derivation the persisted-post path uses (generate-post-visual.ts), so the
  // carousel-vs-single branch lives in exactly one place.
  const textBlock = slideTextBlock({
    postType: body.postType,
    slides: body.slides,
    caption: body.caption,
    position: body.position,
  })
  if (!textBlock) {
    return NextResponse.json({ error: 'No slide copy to generate from' }, { status: 400 })
  }

  try {
    // ONE read of the client's kit for the whole generation — the scheme and the prompt both need it.
    const identity = await fetchIdentityForGeneration(body.clientId)

    // How this draft gets its colours, in three cases:
    //
    //  - FIRST generation of a batch — `runBase` places the run, `runIndex` walks along it. The base
    //    must be shared by the whole batch: passing the per-draft id instead left the offset doing
    //    nothing measurable (34.1% of three-draft runs repeated a scheme, against 34.0% with no
    //    offset at all), because shifting one independent hash by a constant leaves it independent.
    //  - REGENERATE — the surface sends the pair back and it short-circuits the pick, the draft-side
    //    equivalent of reading `posts.visual_ground`. Re-deriving would land on offset 0 while the
    //    first generation used the run offset, recolouring one slide away from its own siblings.
    //  - A LONE retry after a failure — no batch to spread against, so the draft id places it.
    //
    // The answer rides back on the response so approve can carry it onto the post.
    const scheme = await resolveScheme({
      clientId: body.clientId,
      identity,
      base: body.runBase ?? body.draftId,
      ...(body.scheme ? { stored: body.scheme } : {}),
      offset: body.runIndex ?? 0,
    })

    const visual = await generateVisual({
      identity,
      textBlock,
      scheme,
      variation: {
        subject: body.draftId,
        position: body.position,
        // The same count the persisted path and the cron use. `parseSlides` filters an array as
        // happily as it parses a blob, so an already-parsed `slides` goes straight in.
        total: totalVisualSlots({ post_type: body.postType, slides_json: body.slides }),
        nonce: body.previousStoragePath ?? '',
      },
    })
    const { publicUrl, storagePath } = await uploadDraftVisual(
      visual.buffer,
      body.clientId,
      body.draftId,
      body.position
    )
    return NextResponse.json({ publicUrl, storagePath, scheme })
  } catch (err) {
    console.error('[generate-visual] draft generation failed:', err)
    const message = err instanceof Error ? err.message : 'Visual generation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/** Delete a discarded draft's visuals from storage. Paths must live under the client's drafts prefix. */
export async function DELETE(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  let clientId: string
  let storagePaths: string[]
  try {
    ;({ clientId, storagePaths } = deleteDraftVisualsSchema.parse(await request.json()))
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const client = await fetchClientById(auth.supabase, clientId, auth.agencyId)
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const prefix = draftVisualPrefix(clientId)
  if (storagePaths.some((path) => typeof path !== 'string' || !path.startsWith(prefix))) {
    return NextResponse.json(
      { error: 'storagePaths must be draft visuals of this client' },
      { status: 400 }
    )
  }

  await deleteDraftVisuals(storagePaths)
  return NextResponse.json({ success: true })
}
