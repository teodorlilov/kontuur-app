import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { SLIDE_H, SLIDE_W } from '@/lib/renderer/layer-style'
import { getBrowser } from './browser'

const BUCKET = 'renders'
const STAGE_READY_TIMEOUT_MS = 15_000

/** One text layer's fit outcome, read back from `data-fit` after render (see §2.4 autoFit). */
export type FitReport = { fit: string }

export type RenderResult = { url: string; hash: string; fit: FitReport[] }

export type RenderParams = {
  postVisualId: string
  token: string
  hash: string
  baseUrl: string
  lang?: string
}

/**
 * Screenshot one slide's token-gated `/render` page and upload the PNG. Reuses the warm browser
 * singleton; each call gets its own isolated context so concurrent renders never share cookies.
 * A dead plate/image URL does not hang — `<Stage>` resolves ready regardless (its `decode()` catches),
 * so the slide still screenshots with the missing layer falling back to its token gradient.
 */
export async function renderComposition(params: RenderParams): Promise<RenderResult> {
  const { postVisualId, token, hash, baseUrl, lang } = params
  const browser = await getBrowser()
  const context = await browser.newContext({
    viewport: { width: SLIDE_W, height: SLIDE_H },
    deviceScaleFactor: 1,
  })
  try {
    const page = await context.newPage()
    const target = new URL(`/render/${postVisualId}`, baseUrl)
    target.searchParams.set('token', token)
    if (lang) target.searchParams.set('lang', lang)

    await page.goto(target.toString(), { waitUntil: 'load' })
    await page.waitForFunction(() => window.__stageReady === true, { timeout: STAGE_READY_TIMEOUT_MS })

    const png = await page.locator('#stage').screenshot({ type: 'png' })
    const fit = await page
      .locator('#stage [data-fit]')
      .evaluateAll((nodes) => nodes.map((node) => ({ fit: node.getAttribute('data-fit') ?? 'ok' })))

    const url = await uploadRender(postVisualId, hash, png)
    return { url, hash, fit }
  } finally {
    await context.close()
  }
}

/** Upload a rendered slide to `renders/{postVisualId}/{hash}.png`; upsert so an identical hash is idempotent. */
async function uploadRender(postVisualId: string, hash: string, png: Buffer): Promise<string> {
  const admin = createAdminSupabaseClient()
  const path = `${postVisualId}/${hash}.png`
  const { error } = await admin.storage.from(BUCKET).upload(path, png, {
    contentType: 'image/png',
    upsert: true,
  })
  if (error) throw new Error(`Render upload failed: ${error.message}`)
  const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
