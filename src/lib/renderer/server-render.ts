import 'server-only'
import { getBrowser } from '@/lib/render/browser'
import { kitFontsHref } from '@/lib/render/google-fonts'
import type { BrandTokens, Composition } from '@/lib/scene-graph'

/**
 * Autonomous server-side raster (Phase 6). Drives the retained headless Chromium to the public
 * `/render-slide` surface and calls the app's own Konva renderer per slide — so the server render reuses
 * the exact one renderer, with no node-canvas native dependency. Entirely fail-soft: any failure returns
 * `[]` and the caller simply leaves the post without images (as before). Gated by the caller (env flag),
 * so it never runs unless deliberately enabled.
 */

export type RenderedSlide = { slideIndex: number; buffer: Buffer }

/** The origin the headless browser navigates to — its own deployment. Override with RENDER_BASE_URL. */
function renderBaseUrl(): string {
  if (process.env.RENDER_BASE_URL) return process.env.RENDER_BASE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function renderSlidesServerSide(
  slides: Array<{ slideIndex: number; composition: Composition }>,
  tokens: BrandTokens
): Promise<RenderedSlide[]> {
  if (slides.length === 0) return []
  let page: Awaited<ReturnType<Awaited<ReturnType<typeof getBrowser>>['newPage']>> | null = null
  try {
    const browser = await getBrowser()
    page = await browser.newPage()
    await page.goto(`${renderBaseUrl()}/render-slide`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForFunction('window.__renderReady === true', { timeout: 15000 })

    const fontsHref = kitFontsHref(tokens)
    const out: RenderedSlide[] = []
    for (const slide of slides) {
      try {
        const dataUrl = (await page.evaluate(
          (composition, tok, href) =>
            (window as unknown as { __render: (c: unknown, t: unknown, h?: string) => Promise<string> }).__render(
              composition,
              tok,
              href
            ),
          slide.composition as unknown,
          tokens as unknown,
          fontsHref
        )) as unknown
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
          out.push({ slideIndex: slide.slideIndex, buffer: Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64') })
        }
      } catch (e) {
        console.error('[server-render] slide failed', slide.slideIndex, e)
      }
    }
    return out
  } catch (e) {
    console.error('[server-render] render failed:', e)
    return []
  } finally {
    if (page) await page.close().catch(() => {})
  }
}
