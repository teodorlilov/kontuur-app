import type { Browser, Page } from 'puppeteer-core'
import { getBrowser } from '@/lib/render/browser'
import { measurePage, type PageMeasurement } from '@/lib/visual/extract/measure'
import { blockTrackers } from './block-trackers'
import { dismissConsent } from './consent'
import { waitForSettle } from './settle'
import { isBotWall, hasEnoughSignal } from './bot-wall'
import { createSemaphore } from './semaphore'

/** The result of a single site capture. `ok:false` means the caller should fall back, not error. */
export type CaptureResult = {
  ok: boolean
  reason?: string
  screenshot: Buffer | null
  measured: PageMeasurement | null
}

const REALISTIC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const VIEWPORT = { width: 1440, height: 2400 }
// Longest screenshot edge fed to Claude vision (its hard limit is 8000px; leave headroom).
const MAX_SCREENSHOT_EDGE = 7800
const NAV_TIMEOUT_MS = 20_000
const SETTLE_BUDGET_MS = 6_000
const MAX_CONCURRENT = 2

const limiter = createSemaphore(MAX_CONCURRENT)

const fail = (reason: string): CaptureResult => ({ ok: false, reason, screenshot: null, measured: null })

/** Full-page screenshot, downscaled via deviceScaleFactor so even a long page stays under the vision limit. */
async function screenshotPage(page: Page): Promise<Buffer> {
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight)
  const scale = Math.min(1, MAX_SCREENSHOT_EDGE / Math.max(scrollHeight, VIEWPORT.height))
  if (scale < 1) await page.setViewport({ ...VIEWPORT, deviceScaleFactor: scale })
  return Buffer.from(await page.screenshot({ type: 'png', fullPage: true }))
}

/** One hardened navigation + measurement + screenshot. Never throws — returns `ok:false` on any failure. */
async function captureOnce(browser: Browser, url: string, navTimeout: number): Promise<CaptureResult> {
  const page = await browser.newPage()
  try {
    await page.setUserAgent(REALISTIC_UA)
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 })
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
    await page.evaluateOnNewDocument(() =>
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    )
    await blockTrackers(page)

    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`
    const response = await page
      .goto(target, { waitUntil: 'domcontentloaded', timeout: navTimeout })
      .catch(() => null)
    if (!response) return fail('navigation failed')

    await waitForSettle(page, SETTLE_BUDGET_MS)
    await dismissConsent(page)
    await waitForSettle(page, 2000)

    const probe = await page.evaluate(() => ({
      title: document.title,
      body: document.body?.innerText?.slice(0, 300) ?? '',
    }))
    if (isBotWall(probe.title, probe.body)) return fail('bot wall / challenge page')

    const measured = await measurePage(page)
    if (!hasEnoughSignal(measured)) return fail('not enough measurable content')

    return { ok: true, screenshot: await screenshotPage(page), measured }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'capture error')
  } finally {
    await page.close().catch(() => undefined)
  }
}

/**
 * Capture a website's visual identity in-house: hardened Chromium navigation (consent dismissal,
 * tracker blocking, settle waits, bot-wall detection), a resolved-style measurement, and a full-page
 * screenshot for vision. Concurrency-capped and retried once on nav failure; never throws.
 */
export async function captureSite(url: string): Promise<CaptureResult> {
  const release = await limiter.acquire()
  try {
    const browser = await getBrowser()
    const first = await captureOnce(browser, url, NAV_TIMEOUT_MS)
    if (first.ok || first.reason !== 'navigation failed') return first
    return await captureOnce(browser, url, NAV_TIMEOUT_MS * 1.5)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'capture error')
  } finally {
    release()
  }
}
