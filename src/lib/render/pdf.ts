import 'server-only'

import { getBrowser } from './browser'

/**
 * One HTML document printed to an A4 PDF on the warm Chromium the brand extraction already keeps
 * (`getBrowser`). The page is closed whatever happens. Every function that calls this runs in a
 * route listed under `outputFileTracingIncludes` in next.config.ts, or the binary is missing on
 * Vercel.
 */
export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load' })
    const bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
    })
    return Buffer.from(bytes)
  } finally {
    await page.close()
  }
}
