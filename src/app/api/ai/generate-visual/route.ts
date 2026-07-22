import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { checkRateLimit, VISUALS_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { fetchClientById } from '@/lib/queries/db'
import { uploadDraftVisual, deleteDraftVisuals, draftVisualPrefix } from '@/features/publishing/lib/storage'
import { carouselSlideText, singlePostText } from '@/lib/visual/prompt'
import { generateVisual } from '@/lib/visual/generate-visual'

// One gpt-image-2 generation (~52s) + download + storage upload per request.
export const maxDuration = 120

interface GenerateDraftVisualBody {
  clientId?: string
  draftId?: string
  position?: number
  postType?: string
  headline?: string
  body?: string
  caption?: string
  slideCount?: number
}

function draftTextBlock(body: GenerateDraftVisualBody, position: number): string | null {
  if (body.postType === 'carousel') {
    const total = Number(body.slideCount ?? 0)
    if (!Number.isInteger(total) || total < 1) return null
    return carouselSlideText({ headline: body.headline ?? '', body: body.body ?? '' }, position, total)
  }
  return position === 0 ? singlePostText(body.caption ?? null) : null
}

/** Generate an AI visual for an in-memory wizard draft; the image is stored, the DB row waits for approve. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(`visuals:${auth.userId}`, VISUALS_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many visual generations. Please wait a few minutes.' }, { status: 429 })
  }

  let body: GenerateDraftVisualBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const position = Number(body.position ?? 0)
  if (!body.clientId || !body.draftId || !Number.isInteger(position) || position < 0) {
    return NextResponse.json({ error: 'clientId, draftId, and a valid position are required' }, { status: 400 })
  }

  const client = await fetchClientById(auth.supabase, body.clientId, auth.agencyId)
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const textBlock = draftTextBlock(body, position)
  if (!textBlock) {
    return NextResponse.json({ error: 'No slide copy to generate from' }, { status: 400 })
  }

  try {
    const visual = await generateVisual({ clientId: body.clientId, textBlock })
    const { publicUrl, storagePath } = await uploadDraftVisual(visual.buffer, body.clientId, body.draftId, position)
    return NextResponse.json({ position, publicUrl, storagePath })
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

  let body: { clientId?: string; storagePaths?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { clientId, storagePaths } = body
  if (!clientId || !Array.isArray(storagePaths) || storagePaths.length === 0) {
    return NextResponse.json({ error: 'clientId and storagePaths are required' }, { status: 400 })
  }

  const client = await fetchClientById(auth.supabase, clientId, auth.agencyId)
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const prefix = draftVisualPrefix(clientId)
  if (storagePaths.some((path) => typeof path !== 'string' || !path.startsWith(prefix))) {
    return NextResponse.json({ error: 'storagePaths must be draft visuals of this client' }, { status: 400 })
  }

  await deleteDraftVisuals(storagePaths)
  return NextResponse.json({ success: true })
}
