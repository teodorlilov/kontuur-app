import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ launch: vi.fn() }))
vi.mock('puppeteer-core', () => ({
  default: { launch: (...args: unknown[]) => mocks.launch(...args) },
}))
/** @sparticuz's real argument list; only the binary's extraction is stubbed. */
vi.mock('@sparticuz/chromium', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sparticuz/chromium')>()
  return { default: { args: actual.default.args, executablePath: async () => '/tmp/chromium' } }
})

import { getBrowser } from '../browser'

type LaunchOptions = { executablePath: string; args: string[] }

/**
 * The switches Chromium starts with, built from the options `getBrowser` launched with by
 * puppeteer's own `defaultArgs`, as `computeLaunchArguments` does (ChromeLauncher.js). WHY as:
 * the mocked `launch` records its argument untyped.
 */
async function launchedArgs(): Promise<string[]> {
  const options = mocks.launch.mock.calls[0]?.[0] as LaunchOptions
  const { default: puppeteer } =
    await vi.importActual<typeof import('puppeteer-core')>('puppeteer-core')
  return puppeteer.defaultArgs({ browser: 'chrome', headless: true, args: [...options.args] })
}

beforeEach(() => {
  mocks.launch.mockReset().mockResolvedValue({ connected: false })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getBrowser — both runtimes keep WebRTC on the proxy', () => {
  it('starts the serverless Chromium with @sparticuz’s switches and proxy-only WebRTC', async () => {
    vi.stubEnv('CHROME_EXECUTABLE_PATH', '')
    await getBrowser()
    expect(mocks.launch.mock.calls[0]?.[0]).toMatchObject({ executablePath: '/tmp/chromium' })
    expect(await launchedArgs()).toEqual(
      expect.arrayContaining([
        '--disable-web-security',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      ])
    )
  })

  it('starts a local desktop Chrome with proxy-only WebRTC', async () => {
    vi.stubEnv('CHROME_EXECUTABLE_PATH', '/Applications/Google Chrome')
    await getBrowser()
    expect(mocks.launch.mock.calls[0]?.[0]).toMatchObject({
      executablePath: '/Applications/Google Chrome',
    })
    expect(await launchedArgs()).toContain(
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'
    )
  })
})
