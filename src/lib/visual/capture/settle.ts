import type { Page } from 'puppeteer-core'

/**
 * Wait for the page to visually settle: web fonts ready, then a short network-quiet window — both
 * capped by `budgetMs` so a never-idle site (ads, sockets) can't hang the capture.
 */
export async function waitForSettle(page: Page, budgetMs: number): Promise<void> {
  const start = Date.now()
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined)
  const remaining = Math.max(500, budgetMs - (Date.now() - start))
  await page.waitForNetworkIdle({ idleTime: 500, timeout: remaining }).catch(() => undefined)
}
