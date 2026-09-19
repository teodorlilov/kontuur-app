import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateVectorAsset: vi.fn(),
  downloadFalFile: vi.fn(),
  svgRejectionReason: vi.fn(),
  upload: vi.fn(),
  runMetered: vi.fn(),
}))
vi.mock('@/lib/auth/resolve-auth', () => ({
  resolveAuth: () => Promise.resolve({ ok: true, userId: 'u1', agencyId: 'a1', supabase: {} }),
}))
vi.mock('@/lib/auth/rate-limit', () => ({ visualsRateLimitResponse: () => null }))
vi.mock('@/lib/billing/require-entitled', () => ({
  requireEntitledRoute: () => Promise.resolve(null),
}))
vi.mock('@/features/assets/lib/asset-destination', () => ({
  resolveAssetDestination: () =>
    Promise.resolve({ ok: true, clientId: 'c1', upload: mocks.upload }),
}))
vi.mock('@/lib/visual/queries', () => ({
  fetchVisualIdentityOrDefault: () => Promise.resolve({ palette: { primary: '#164430' } }),
}))
vi.mock('@/lib/visual/fal', () => ({
  generateVectorAsset: (...args: unknown[]) => mocks.generateVectorAsset(...args),
  downloadFalFile: (...args: unknown[]) => mocks.downloadFalFile(...args),
}))
vi.mock('@/lib/visual/sanitize-svg', () => ({
  svgRejectionReason: (...args: unknown[]) => mocks.svgRejectionReason(...args),
  removeSvgBackgroundRect: (svg: string) => svg,
  svgNaturalSize: () => ({ width: 64, height: 64 }),
}))
vi.mock('@/lib/billing/usage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/usage')>()),
  runMetered: (...args: unknown[]) => mocks.runMetered(...args),
}))

import { POST } from '../generate-svg/route'

function request(body: unknown): Request {
  return new Request('https://kontuur.app/api/ai/generate-svg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** What `runMetered` does with the callback's outcome is its own test; here it only has to be the thing the whole landing runs under. */
const outcomes: Array<'landed' | 'thrown'> = []
async function metered(_spender: unknown, fn: () => Promise<unknown>) {
  try {
    const result = await fn()
    outcomes.push('landed')
    return result
  } catch (err) {
    outcomes.push('thrown')
    throw err
  }
}

describe('POST /api/ai/generate-svg — the vector is counted only once it is in storage', () => {
  beforeEach(() => {
    outcomes.length = 0
    mocks.runMetered.mockReset().mockImplementation(metered)
    mocks.generateVectorAsset.mockReset().mockResolvedValue('https://fal.example/v.svg')
    mocks.downloadFalFile.mockReset().mockResolvedValue(Buffer.from('<svg/>'))
    mocks.svgRejectionReason.mockReset().mockReturnValue(null)
    mocks.upload.mockReset().mockResolvedValue({ publicUrl: 'https://cdn/x.svg', storagePath: 'p' })
  })

  it('runs generation, download, the gate and the upload as one landing', async () => {
    const response = await POST(request({ prompt: 'a leaf', clientId: 'c1' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      publicUrl: 'https://cdn/x.svg',
      storagePath: 'p',
      width: 64,
      height: 64,
    })
    expect(outcomes).toEqual(['landed'])
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })

  it('a rejected vector is thrown inside the landing — nothing stored, the image given back — and answered as a 502', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.svgRejectionReason.mockReturnValue('script element')

    const response = await POST(request({ prompt: 'a leaf', clientId: 'c1' }))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'The generated vector was rejected — try a different prompt',
    })
    expect(outcomes).toEqual(['thrown'])
    expect(mocks.upload).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('a failed download is the same landing failure, in the provider’s words', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.downloadFalFile.mockRejectedValue(new Error('Failed to download generated file (503)'))

    const response = await POST(request({ prompt: 'a leaf', clientId: 'c1' }))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to download generated file (503)' })
    expect(outcomes).toEqual(['thrown'])
    error.mockRestore()
  })
})
