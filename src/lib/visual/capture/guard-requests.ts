import type { Page } from 'puppeteer-core'

const TRACKER_HOSTS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'connect.facebook.net',
  'facebook.net',
  'hotjar.com',
  'mixpanel.com',
  'fullstory.com',
  'intercom.io',
  'intercomcdn.com',
  'clarity.ms',
  'sentry.io',
  'amplitude.com',
  'quantserve.com',
  'scorecardresearch.com',
  'criteo.com',
  'taboola.com',
  'outbrain.com',
  'adservice.google.com',
  'segment.com',
  'segment.io',
]
const BLOCKED_TYPES = new Set(['media', 'eventsource'])

/**
 * Aborts trackers, ads and heavy media on the capture's page so it settles fast, and continues
 * everything else: the measurement reads computed styles (`measurePage`,
 * src/lib/visual/extract/measure.ts), which need the site's real design loaded. Which addresses
 * the page may reach is not decided here but by the egress proxy its browser context uses
 * (`egressProxyUrl`, egress-proxy.ts).
 */
export async function guardRequests(page: Page): Promise<void> {
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const url = req.url()
    const blocked =
      BLOCKED_TYPES.has(req.resourceType()) || TRACKER_HOSTS.some((h) => url.includes(h))
    if (blocked) {
      req.abort().catch(() => undefined)
      return
    }
    req.continue().catch(() => undefined)
  })
}
