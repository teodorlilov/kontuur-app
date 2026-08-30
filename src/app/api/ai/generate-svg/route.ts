import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { visualsRateLimitResponse } from '@/lib/auth/rate-limit'
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

/**
 * Generate a brand-palette SVG element asset (Recraft V4 vector): the client's measured palette
 * goes straight into generation, the result is safety-gated (rejection, not stripping) and
 * stored next to the target's other canvas assets.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const limited = visualsRateLimitResponse(auth.userId)
  if (limited) return limited

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

  try {
    const identity = await fetchVisualIdentityOrDefault(destination.clientId)
    const colors = Object.values(identity.palette)
      .map(parseHex)
      .filter((rgb): rgb is Rgb => rgb !== null)

    const svgUrl = await generateVectorAsset(prompt, colors)
    const raw = (await downloadFalFile(svgUrl)).toString('utf8')
    const rejection = svgRejectionReason(raw)
    if (rejection) {
      console.error(`[generate-svg] rejected generated SVG: ${rejection}`)
      return NextResponse.json(
        { error: 'The generated vector was rejected — try a different prompt' },
        { status: 502 }
      )
    }
    // Generators paint a full-canvas background rect; elements want transparency.
    const svg = removeSvgBackgroundRect(raw)

    const { publicUrl, storagePath } = await destination.upload(
      Buffer.from(svg, 'utf8'),
      'image/svg+xml',
      'asset.svg'
    )
    const size = svgNaturalSize(svg) ?? FALLBACK_SVG_SIZE
    return NextResponse.json({ publicUrl, storagePath, width: size.width, height: size.height })
  } catch (err) {
    console.error('[generate-svg] failed:', err)
    const message = err instanceof Error ? err.message : 'Vector generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
