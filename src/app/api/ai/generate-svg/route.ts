import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { visualsRateLimitResponse } from '@/lib/auth/rate-limit'
import { requireEntitledRoute } from '@/lib/billing/require-entitled'
import type { Spender } from '@/lib/billing/spend-context'
import { runMetered, spendFailureResponse } from '@/lib/billing/usage'
import { parseHex, type Rgb } from '@/lib/visual/extract/color'
import { downloadFalFile, generateVectorAsset } from '@/lib/visual/fal'
import { fetchVisualIdentityOrDefault } from '@/lib/visual/queries'
import {
  removeSvgBackgroundRect,
  svgNaturalSize,
  svgRejectionReason,
} from '@/lib/visual/sanitize-svg'
import { resolveAssetDestination } from '@/features/assets/lib/asset-destination'
import { generateSvgSchema, MAX_SVG_PROMPT_CHARS } from '@/features/canvas-editor/schemas'

export const maxDuration = 60

/** Recraft occasionally omits dimensions; a square default keeps element sizing sane. */
const FALLBACK_SVG_SIZE = { width: 512, height: 512 }

/** A generated vector the safety gate refused — thrown inside the metered callback so the image it reserved is given back, answered as a 502 rather than a failure of ours. */
class RejectedVector extends Error {}

/**
 * Generate a brand-palette SVG element asset (Recraft V4 vector): the client's measured palette
 * goes straight into generation, the result is safety-gated (rejection, not stripping), stripped
 * of the full-canvas background rect generators paint (an element wants transparency) and
 * stored next to the target's other canvas assets. The vector is counted only once it is in
 * storage — generation, download, the gate and the upload all run inside `runMetered`, so a
 * rejected or undeliverable vector gives its image back.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const limited = visualsRateLimitResponse(auth.userId)
  if (limited) return limited
  const refused = await requireEntitledRoute(auth.agencyId, 'spend')
  if (refused) return refused

  const parsed = generateSvgSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: `prompt is required and must be under ${MAX_SVG_PROMPT_CHARS} characters` },
      { status: 400 }
    )
  }
  const body = parsed.data
  const { prompt } = body

  const destination = await resolveAssetDestination(auth.supabase, auth.agencyId, body)
  if (!destination.ok)
    return NextResponse.json({ error: destination.error }, { status: destination.status })

  const spender: Spender = {
    agencyId: auth.agencyId,
    clientId: destination.clientId,
    flow: 'editor',
  }
  try {
    const identity = await fetchVisualIdentityOrDefault(destination.clientId)
    const colors = Object.values(identity.palette)
      .map(parseHex)
      .filter((rgb): rgb is Rgb => rgb !== null)

    const { publicUrl, storagePath, svg } = await runMetered(spender, async () => {
      const svgUrl = await generateVectorAsset(prompt, colors)
      const raw = (await downloadFalFile(svgUrl)).toString('utf8')
      const rejection = svgRejectionReason(raw)
      if (rejection) throw new RejectedVector(rejection)
      const cleaned = removeSvgBackgroundRect(raw)
      const stored = await destination.upload(
        Buffer.from(cleaned, 'utf8'),
        'image/svg+xml',
        'asset.svg'
      )
      return { ...stored, svg: cleaned }
    })
    const size = svgNaturalSize(svg) ?? FALLBACK_SVG_SIZE
    return NextResponse.json({ publicUrl, storagePath, width: size.width, height: size.height })
  } catch (err) {
    if (err instanceof RejectedVector) {
      console.error(`[generate-svg] rejected generated SVG: ${err.message}`)
      return NextResponse.json(
        { error: 'The generated vector was rejected — try a different prompt' },
        { status: 502 }
      )
    }
    return spendFailureResponse(err, 'generate-svg', 'Vector generation failed', 500)
  }
}
