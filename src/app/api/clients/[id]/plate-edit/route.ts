import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { getBrandKitForClient } from '@/lib/brand-kit/queries'
import { generateDesign, editDesign, removeBackground } from '@/lib/images/fal'
import { getBrandReferenceImages } from '@/lib/images/bank'
import { buildOperatorPrompt } from '@/lib/images/prompt'
import { uploadPlate } from '@/lib/images/storage'
import { uploadToBucket } from '@/features/publishing/lib/storage'
import { DEFAULT_RATIO } from '@/lib/renderer/layout/anchor'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'

// Calls the design model in-request; give it headroom (matches the other imagery routes).
export const runtime = 'nodejs'
export const maxDuration = 300

type Body = {
  mode?: 'regenerate' | 'reference' | 'cutout'
  prompt?: string
  referenceDataUrl?: string
  imageUrl?: string
}

/** Parse a `data:<type>;base64,<data>` URL into bytes (Node fetch doesn't take data: URLs). */
function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl)
  if (!match) return null
  return { contentType: match[1]!, buffer: Buffer.from(match[2]!.replace(/\s/g, ''), 'base64') }
}

/** Upload a data-URL image to the plates bucket, returning its durable public URL (or null). */
async function uploadDataUrl(clientId: string, tag: string, dataUrl: string): Promise<string | null> {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return null
  const ext = parsed.contentType.includes('png') ? 'png' : 'jpg'
  const stored = await uploadToBucket('plates', `${clientId}/${tag}-${Date.now()}.${ext}`, parsed.buffer, parsed.contentType)
  return stored.publicUrl
}

/**
 * Editor design AI: (re)generate or edit the selected slide's design via the design model, returning a
 * durable URL. All modes condition on the brand's reference images so an edit stays on-brand.
 *   - `regenerate` — a fresh on-brand design from the operator's prompt.
 *   - `reference`  — condition on an uploaded reference image the operator likes.
 *   - `cutout`     — background-remove the current image into a transparent subject cutout.
 * Session-authed, agency-scoped. Fail-soft: returns `{ url: null }` so the editor just keeps the image.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  if (!(await verifyClientOwnership(auth.supabase, id, auth.agencyId))) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const mode = body.mode ?? 'regenerate'

  // A cutout is a pure background removal of the current image — no prompt/brand needed.
  if (mode === 'cutout') {
    if (!body.imageUrl) return NextResponse.json({ error: 'imageUrl is required for cutout' }, { status: 400 })
    const cut = await removeBackground(body.imageUrl)
    if (!cut) return NextResponse.json({ url: null })
    const stored = await uploadPlate(id, cut.url)
    return NextResponse.json({ url: stored?.publicUrl ?? null })
  }

  const kit = await getBrandKitForClient(id, auth.agencyId)
  const colors = (kit?.tokens ?? DEFAULT_TOKENS).color
  const prompt = buildOperatorPrompt(body.prompt ?? '', colors)
  const references = await getBrandReferenceImages(id)

  let generated: { url: string } | null = null
  try {
    if (mode === 'reference') {
      const refUrl = body.imageUrl ?? (body.referenceDataUrl ? await uploadDataUrl(id, 'ref', body.referenceDataUrl) : null)
      if (!refUrl) return NextResponse.json({ error: 'No reference image provided' }, { status: 400 })
      generated = await editDesign({ imageUrl: refUrl, prompt, ratio: DEFAULT_RATIO, referenceImageUrls: references })
    } else {
      generated = await generateDesign({ prompt, ratio: DEFAULT_RATIO, referenceImageUrls: references })
    }
  } catch (err) {
    console.error('[plate-edit] generation failed:', err)
  }

  if (!generated) return NextResponse.json({ url: null })
  const stored = await uploadPlate(id, generated.url) // durable copy (fal URLs are ephemeral)
  return NextResponse.json({ url: stored?.publicUrl ?? null })
}
