import { getAppBaseUrl } from './app-url'
import type { RenderResult } from './render'

/**
 * The seam the rest of the app renders through. It POSTs to the isolated `/api/render` function
 * rather than importing the renderer directly, which keeps the heavy Chromium dependency out of
 * every other function's bundle. Moving Chromium to a dedicated container later (Fly.io / Railway)
 * is a one-line change here — swap the base URL — with no caller touched.
 */
export const renderService = {
  async render(postVisualId: string): Promise<RenderResult> {
    const secret = process.env.CRON_SECRET
    if (!secret) throw new Error('CRON_SECRET is not set')

    const response = await fetch(new URL('/api/render', getAppBaseUrl()), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ postVisualId }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`render failed (${response.status}): ${detail}`)
    }
    return (await response.json()) as RenderResult
  },
}
