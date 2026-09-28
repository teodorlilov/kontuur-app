import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  validateSourceUrl: vi.fn(),
  egressProxyUrl: vi.fn(),
  goto: vi.fn(),
  createBrowserContext: vi.fn(),
}))
vi.mock('@/lib/sources/validate-url', () => ({
  validateSourceUrl: (...args: unknown[]) => mocks.validateSourceUrl(...args),
}))
vi.mock('../egress-proxy', () => ({
  egressProxyUrl: () => mocks.egressProxyUrl(),
}))
vi.mock('@/lib/render/browser', () => ({
  getBrowser: async () => ({
    createBrowserContext: (...args: unknown[]) => mocks.createBrowserContext(...args),
  }),
}))
vi.mock('@/lib/visual/extract/measure', () => ({ measurePage: async () => null }))

import { captureSite } from '../capture-site'

/** A page that records where it was sent; every other member it is asked for resolves empty. */
function fakePage() {
  return {
    setUserAgent: async () => undefined,
    setViewport: async () => undefined,
    setExtraHTTPHeaders: async () => undefined,
    evaluateOnNewDocument: async () => undefined,
    setRequestInterception: async () => undefined,
    on: () => undefined,
    goto: (...args: unknown[]) => mocks.goto(...args),
  }
}

/** A browser context holding one fake page, recording whether it was closed. */
function fakeContext() {
  return {
    newPage: vi.fn(async () => fakePage()),
    close: vi.fn(async () => undefined),
  }
}

let opened: ReturnType<typeof fakeContext>[] = []

const PROXY = 'http://127.0.0.1:4100'

beforeEach(() => {
  opened = []
  mocks.validateSourceUrl.mockReset().mockResolvedValue(true)
  mocks.egressProxyUrl.mockReset().mockResolvedValue(PROXY)
  mocks.goto.mockReset().mockResolvedValue(null)
  mocks.createBrowserContext.mockReset().mockImplementation(async () => {
    const context = fakeContext()
    opened.push(context)
    return context
  })
})

describe('captureSite — the server’s browser never visits its own network', () => {
  it('refuses a private address before any browser opens, and does not retry', async () => {
    mocks.validateSourceUrl.mockResolvedValue(false)
    expect(await captureSite('http://169.254.169.254/latest')).toEqual({
      ok: false,
      reason: 'not a public address',
      measured: null,
    })
    expect(mocks.createBrowserContext).not.toHaveBeenCalled()
  })

  it('normalises a bare host once, and navigates to what it checked', async () => {
    await captureSite('example.com')
    expect(mocks.validateSourceUrl).toHaveBeenCalledWith('https://example.com')
    expect(mocks.goto.mock.calls[0]?.[0]).toBe('https://example.com')
  })

  it('sends every attempt’s context through the egress proxy, loopback included', async () => {
    await captureSite('https://example.com')
    expect(mocks.createBrowserContext.mock.calls).toEqual([
      [{ proxyServer: PROXY, proxyBypassList: ['<-loopback>'] }],
      [{ proxyServer: PROXY, proxyBypassList: ['<-loopback>'] }],
    ])
  })

  it('fails closed when the proxy cannot start: no browser context, no navigation', async () => {
    mocks.egressProxyUrl.mockRejectedValue(new Error('listen EMFILE'))
    expect(await captureSite('https://example.com')).toEqual({
      ok: false,
      reason: 'egress proxy unavailable',
      measured: null,
    })
    expect(mocks.createBrowserContext).not.toHaveBeenCalled()
    expect(mocks.goto).not.toHaveBeenCalled()
  })
})

describe('captureSite — no browser state outlives a capture', () => {
  it('runs each attempt in a fresh context and closes it, the retry included', async () => {
    expect((await captureSite('https://example.com')).reason).toBe('navigation failed')
    expect(opened).toHaveLength(2)
    for (const context of opened) {
      expect(context.newPage).toHaveBeenCalledTimes(1)
      expect(context.close).toHaveBeenCalledTimes(1)
    }
  })

  it('closes the context when its page cannot open', async () => {
    mocks.createBrowserContext.mockImplementationOnce(async () => {
      const context = fakeContext()
      context.newPage.mockRejectedValue(new Error('page crashed'))
      opened.push(context)
      return context
    })
    expect(await captureSite('https://example.com')).toEqual({
      ok: false,
      reason: 'page crashed',
      measured: null,
    })
    expect(opened).toHaveLength(1)
    expect(opened[0]?.close).toHaveBeenCalledTimes(1)
  })
})
