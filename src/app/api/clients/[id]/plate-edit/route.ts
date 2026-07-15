import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { getBrandKitForClient } from '@/lib/brand-kit/queries'
import { generatePlate, imageToImage, inpaintImage } from '@/lib/images/fal'
import { buildOperatorPrompt } from '@/lib/images/prompt'
import { uploadPlate } from '@/lib/images/storage'
import { uploadToBucket } from '@/features/publishing/lib/storage'
import { DEFAULT_RATIO } from '@/lib/renderer/layout/anchor'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { createUntypedAdminClient } from '@/lib/supabase/admin'

// Calls fal in-request; give it headroom (matches the other imagery routes).
export const runtime = 'nodejs'
export const maxDuration = 300

type Body = {
  mode?: 'regenerate' | 'reference' | 'inpaint'
  prompt?: string
  referenceDataUrl?: string
  imageUrl?: string
  maskUrl?: string
}

/** Parse a `data:<type>;base64,<data>` URL into bytes (Node fetch doesn't take data: URLs). */
function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl)
  if (!match) return null
  return { contentType: match[1]!, buffer: Buffer.from(match[2]!.replace(/\s/g, ''), 'base64') }
}

/**
 * Editor plate AI (Phase 6): (re)generate a plate image for the selected layer and return a durable URL.
 *   - `regenerate` — a fresh on-brand image from the operator's prompt (random seed, so it varies).
 *   - `reference`  — condition on an uploaded reference image (img2img seeding).
 *   - `inpaint`    — repaint a masked region of the current image from the prompt.
 * Session-authed, agency-scoped. Fail-soft: returns `{ url: null }` so the editor just keeps the image.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const db = createUntypedAdminClient()
  const { data: clientRow } = await db.from('clients').select('agency_id').eq('id', id).maybeSingle()
  const client = clientRow as { agency_id?: string } | null
  if (!client || client.agency_id !== auth.agencyId) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const kit = await getBrandKitForClient(id, auth.agencyId)
  const colors = (kit?.tokens ?? DEFAULT_TOKENS).color
  const prompt = buildOperatorPrompt(body.prompt ?? '', colors)
  const mode = body.mode ?? 'regenerate'

  let generated: { url: string } | null = null
  try {
    if (mode === 'reference') {
      let refUrl = body.imageUrl
      if (!refUrl && body.referenceDataUrl) {
        const parsed = parseDataUrl(body.referenceDataUrl)
        if (parsed) {
          const ext = parsed.contentType.includes('png') ? 'png' : 'jpg'
          const stored = await uploadToBucket('plates', `${id}/ref-${Date.now()}.${ext}`, parsed.buffer, parsed.contentType)
          refUrl = stored.publicUrl
        }
      }
      if (!refUrl) return NextResponse.json({ error: 'No reference image provided' }, { status: 400 })
      generated = await imageToImage({ imageUrl: refUrl, prompt, ratio: DEFAULT_RATIO })
    } else if (mode === 'inpaint') {
      if (!body.imageUrl || !body.maskUrl) {
        return NextResponse.json({ error: 'imageUrl and maskUrl are required for inpaint' }, { status: 400 })
      }
      generated = await inpaintImage({ imageUrl: body.imageUrl, maskUrl: body.maskUrl, prompt })
    } else {
      generated = await generatePlate({ prompt, ratio: DEFAULT_RATIO, seed: Math.floor(Math.random() * 1e9) })
    }
  } catch (err) {
    console.error('[plate-edit] generation failed:', err)
  }

  if (!generated) return NextResponse.json({ url: null })
  const stored = await uploadPlate(id, generated.url) // durable copy (fal URLs are ephemeral)
  return NextResponse.json({ url: stored?.publicUrl ?? null })
}
