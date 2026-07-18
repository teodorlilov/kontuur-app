import type { Page } from 'puppeteer-core'

const TRACKER_HOSTS = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'connect.facebook.net',
  'facebook.net', 'hotjar.com', 'mixpanel.com', 'fullstory.com', 'intercom.io', 'intercomcdn.com',
  'clarity.ms', 'sentry.io', 'amplitude.com', 'quantserve.com', 'scorecardresearch.com',
  'criteo.com', 'taboola.com', 'outbrain.com', 'adservice.google.com', 'segment.com', 'segment.io',
]
const BLOCKED_TYPES = new Set(['media', 'websocket', 'eventsource'])

/**
 * Intercept requests and abort analytics/ads/trackers + heavy media, so the page settles fast and
 * clean. First-party HTML/CSS/images/fonts pass through — vision needs the real design.
 */
export async function blockTrackers(page: Page): Promise<void> {
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const blocked = BLOCKED_TYPES.has(req.resourceType()) || TRACKER_HOSTS.some((h) => req.url().includes(h))
    if (blocked) req.abort().catch(() => undefined)
    else req.continue().catch(() => undefined)
  })
}
