import { type NextRequest, NextResponse } from 'next/server'
import { extractBrandKitFromImage } from '@/lib/brand-kit/extract/extract-image'
import { extractBrandKitFromWebsite } from '@/lib/brand-kit/extract/extract-website'
import type { ExtractionResult } from '@/lib/brand-kit/extract/report'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'

// Chromium-bearing function (the extractor runs a headless browser). Pro gives the memory + maxDuration.
export const runtime = 'nodejs'
export const maxDuration = 300

type ExtractBody = { url?: unknown; image?: unknown; mediaType?: unknown }

/** Soft fallback: a renderable default kit + the reason, so onboarding never hard-fails (§2.1/§2.3). */
function defaultResult(source: 'website' | 'image', reason: string): ExtractionResult {
  return {
    tokens: DEFAULT_TOKENS,
    report: { source, confidence: {}, fallback: { toDefaultKit: true, reason } },
    subjects: { photographic: [], motifs: [] },
  }
}

/**
 * Extract a brand kit from a website URL or a reference image. Internal, server-to-server (a
 * `CRON_SECRET` bearer); onboarding calls it via `waitUntil` (§2.3). Always returns a usable kit —
 * extraction failures degrade to the default kit rather than erroring.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: ExtractBody
  try {
    body = (await request.json()) as ExtractBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (typeof body.url === 'string') {
    try {
      return NextResponse.json(await extractBrandKitFromWebsite(body.url))
    } catch (err) {
      return NextResponse.json(defaultResult('website', err instanceof Error ? err.message : 'extraction failed'))
    }
  }

  if (typeof body.image === 'string' && (body.mediaType === 'image/png' || body.mediaType === 'image/jpeg')) {
    try {
      return NextResponse.json(await extractBrandKitFromImage(body.image, body.mediaType))
    } catch (err) {
      return NextResponse.json(defaultResult('image', err instanceof Error ? err.message : 'extraction failed'))
    }
  }

  return NextResponse.json({ error: 'provide `url`, or `image` + `mediaType`' }, { status: 400 })
}
