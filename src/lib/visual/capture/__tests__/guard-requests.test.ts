import type { Page } from 'puppeteer-core'
import { describe, expect, it, vi } from 'vitest'
import { guardRequests } from '../guard-requests'

type Handler = (req: {
  url: () => string
  resourceType: () => string
  abort: () => Promise<void>
  continue: () => Promise<void>
}) => void

/**
 * The two members of a puppeteer page `guardRequests` calls, and the request handler it registers.
 * WHY as: `guardRequests` takes a whole `Page`; this fake implements only those members.
 */
function fakePage() {
  let handler: Handler | null = null
  const members = {
    setRequestInterception: vi.fn(async (_on: boolean) => undefined),
    on: (_event: string, fn: Handler) => {
      handler = fn
    },
  }
  return { page: members as unknown as Page, handler: () => handler! }
}

/** A request as the handler sees it, with its abort and continue recorded. */
function fakeRequest(url: string, resourceType = 'document') {
  return {
    url: () => url,
    resourceType: () => resourceType,
    abort: vi.fn(async () => undefined),
    continue: vi.fn(async () => undefined),
  }
}

describe('guardRequests', () => {
  it('aborts trackers and media, and continues every other request — a private host is the proxy’s to refuse', async () => {
    const { page, handler } = fakePage()
    await guardRequests(page)
    const send = (url: string, resourceType = 'document') => {
      const req = fakeRequest(url, resourceType)
      handler()(req)
      return req
    }
    const tracker = send('https://www.google-analytics.com/collect')
    const video = send('https://example.com/hero.mp4', 'media')
    const style = send('https://example.com/style.css', 'stylesheet')
    const privateHost = send('http://10.0.0.1/admin')
    await vi.waitFor(() => expect(privateHost.continue).toHaveBeenCalled())
    expect(tracker.abort).toHaveBeenCalled()
    expect(video.abort).toHaveBeenCalled()
    expect(style.continue).toHaveBeenCalled()
    expect(tracker.continue).not.toHaveBeenCalled()
    expect(style.abort).not.toHaveBeenCalled()
  })
})
