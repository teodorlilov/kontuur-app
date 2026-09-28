import type { Browser } from 'puppeteer-core'
import { getBrowser } from '@/lib/render/browser'
import { measurePage, type PageMeasurement } from '@/lib/visual/extract/measure'
import { validateSourceUrl } from '@/lib/sources/validate-url'
import { toWebsiteUrl } from '@/utils/url'
import { egressProxyUrl } from './egress-proxy'
import { guardRequests } from './guard-requests'
import { dismissConsent } from './consent'
import { waitForSettle } from './settle'
import { isBotWall, hasEnoughSignal } from './bot-wall'
import { createSemaphore } from '@/lib/concurrency'

/** The result of a single site capture. `ok:false` means the caller should fall back, not error. */
type CaptureResult = {
  ok: boolean
  reason?: string
  measured: PageMeasurement | null
}

const REALISTIC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const VIEWPORT = { width: 1440, height: 2400 }
const NAV_TIMEOUT_MS = 20_000
const SETTLE_BUDGET_MS = 6_000
const MAX_CONCURRENT = 2

const limiter = createSemaphore(MAX_CONCURRENT)

const fail = (reason: string): CaptureResult => ({ ok: false, reason, measured: null })

/**
 * One navigation and colour measurement, to the URL `captureSite` checked, in a browser context of
 * its own whose every request goes through the egress proxy at `proxyServer`. `<-loopback>` drops
 * Chromium's implicit proxy bypass for localhost and link-local addresses (net/docs/proxy.md,
 * "Implicit bypass rules"), which would otherwise reach them directly. A failure after the context
 * opens returns `ok:false`; `captureSite` catches the rest.
 */
async function captureOnce(
  browser: Browser,
  proxyServer: string,
  url: string,
  navTimeout: number
): Promise<CaptureResult> {
  const context = await browser.createBrowserContext({
    proxyServer,
    proxyBypassList: ['<-loopback>'],
  })
  try {
    const page = await context.newPage()
    await page.setUserAgent(REALISTIC_UA)
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 })
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
    await page.evaluateOnNewDocument(() =>
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    )
    await guardRequests(page)

    const response = await page
      .goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout })
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

    return { ok: true, measured }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'capture error')
  } finally {
    await context.close().catch(() => undefined)
  }
}

/**
 * Measure a website's colours in-house: hardened Chromium navigation (consent dismissal, tracker
 * blocking, settle waits, bot-wall detection), then a resolved-style measurement (`measurePage`) —
 * no screenshot is taken and no model sees the page. The typed address is normalised once
 * (`toWebsiteUrl`) and refused before any browser opens when it is not public (`validateSourceUrl`),
 * which gives a clear reason; the guarantee is the egress proxy (`egressProxyUrl`, egress-proxy.ts),
 * and a capture whose proxy cannot start fails rather than run without it. Each attempt's context
 * is closed after it, so no cookie, cache or service worker outlives a capture on the shared
 * browser. Concurrency-capped and retried once on a navigation failure — a page the proxy refused
 * included, which fails again; never throws.
 */
export async function captureSite(url: string): Promise<CaptureResult> {
  const target = toWebsiteUrl(url)
  if (!(await validateSourceUrl(target))) return fail('not a public address')
  const release = await limiter.acquire()
  try {
    const proxyServer = await egressProxyUrl().catch(() => null)
    if (!proxyServer) return fail('egress proxy unavailable')
    const browser = await getBrowser()
    const first = await captureOnce(browser, proxyServer, target, NAV_TIMEOUT_MS)
    if (first.ok || first.reason !== 'navigation failed') return first
    return await captureOnce(browser, proxyServer, target, NAV_TIMEOUT_MS * 1.5)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'capture error')
  } finally {
    release()
  }
}
