import { type NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getAppBaseUrl } from '@/lib/render/app-url'
import { isCacheHit, loadPostVisual, storeRenderResult } from '@/lib/render/cache'
import { renderHash } from '@/lib/render/hash'
import { renderComposition } from '@/lib/render/render'
import { signRenderToken } from '@/lib/render/token'

// The one function that carries the Chromium dependency — isolated here so `@sparticuz/chromium`
// never bloats any other bundle. Pro raises maxDuration to 300s and keeps the browser warm.
export const runtime = 'nodejs'
export const maxDuration = 300

type RenderRequestBody = { postVisualId?: unknown; lang?: unknown }

/**
 * Server-to-server render endpoint: mints a short-lived render token, screenshots the slide's
 * `/render` page, and returns `{ url, hash, fit }`. Authorised with the app's internal `CRON_SECRET`
 * bearer (the existing trusted server-caller secret) — never called from the browser.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let postVisualId: string
  let lang: string | undefined
  try {
    const body = (await request.json()) as RenderRequestBody
    if (typeof body.postVisualId !== 'string') {
      return NextResponse.json({ error: 'postVisualId required' }, { status: 400 })
    }
    postVisualId = body.postVisualId
    lang = typeof body.lang === 'string' ? body.lang : undefined
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // post_visuals is not in the generated Database types yet (new migration); cast until
  // `supabase gen types` regenerates them. Mirrors src/app/render/[postVisualId]/page.tsx.
  const supabase = createAdminSupabaseClient() as unknown as SupabaseClient
  const row = await loadPostVisual(supabase, postVisualId)
  if (!row) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const hash = renderHash(row.composition_json, row.brand_kit_version)

  // Cache hit: an unchanged slide (same composition, kit version, and renderer) serves the stored PNG
  // without launching Chromium. `fit` is empty here — it is only measured on a fresh render.
  if (isCacheHit(row, hash) && row.rendered_url) {
    return NextResponse.json({ url: row.rendered_url, hash, fit: [] }, { status: 200 })
  }

  const token = signRenderToken(postVisualId)

  try {
    const result = await renderComposition({ postVisualId, token, hash, baseUrl: getAppBaseUrl(), lang })
    await storeRenderResult(supabase, postVisualId, hash, result.url)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'render failed'
    const isTimeout = (err instanceof Error && err.name === 'TimeoutError') || /timeout/i.test(message)
    if (isTimeout) {
      return NextResponse.json({ error: 'render-timeout' }, { status: 504 })
    }
    return NextResponse.json({ error: message, retryable: true }, { status: 502 })
  }
}
