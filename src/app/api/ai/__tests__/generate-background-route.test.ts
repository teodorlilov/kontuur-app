import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateVisual: vi.fn(),
  upload: vi.fn(),
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
    Promise.resolve({
      ok: true,
      clientId: 'c1',
      postId: 'p1',
      storedScheme: { ground: null, accent: null },
      upload: mocks.upload,
    }),
}))
vi.mock('@/lib/visual/generate-visual', () => ({
  fetchIdentityForGeneration: () => Promise.resolve({ palette: { primary: '#164430' } }),
  generateVisual: (...args: unknown[]) => mocks.generateVisual(...args),
}))
vi.mock('@/lib/visual/post-color', () => ({
  resolveScheme: () => Promise.resolve({ ground: '#164430', accent: '#F4F1EA' }),
}))
vi.mock('@/lib/billing/usage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/usage')>()),
  runMetered: (await import('./metered-stand-in')).metered,
}))

import { POST } from '../generate-background/route'
import { outcomes } from './metered-stand-in'

function request(body: unknown): Request {
  return new Request('https://kontuur.app/api/ai/generate-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const IMAGE = Buffer.from('jpeg')

describe('POST /api/ai/generate-background — the picture is counted only once it is in storage', () => {
  beforeEach(() => {
    outcomes.length = 0
    mocks.generateVisual.mockReset().mockResolvedValue({ buffer: IMAGE, contentType: 'image/jpeg' })
    mocks.upload
      .mockReset()
      .mockResolvedValue({ publicUrl: 'https://cdn/bg.jpg', storagePath: 'p' })
  })

  it('runs generation and the upload as one landing', async () => {
    const response = await POST(request({ postId: 'p1' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ publicUrl: 'https://cdn/bg.jpg', storagePath: 'p' })
    expect(outcomes).toEqual(['landed'])
    expect(mocks.upload).toHaveBeenCalledWith(IMAGE, 'image/jpeg', 'background.jpg')
  })

  it('a failed upload is thrown inside the landing — the image given back — and answered as a 502 in the storage’s words', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.upload.mockRejectedValue(new Error('Storage upload failed: The resource already exists'))

    const response = await POST(request({ postId: 'p1' }))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Storage upload failed: The resource already exists',
    })
    expect(outcomes).toEqual(['thrown'])
    error.mockRestore()
  })

  it('a failed generation never reaches storage', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.generateVisual.mockRejectedValue(new Error('fal-ai/gpt-image-2 returned no image'))

    const response = await POST(request({ postId: 'p1' }))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'fal-ai/gpt-image-2 returned no image' })
    expect(outcomes).toEqual(['thrown'])
    expect(mocks.upload).not.toHaveBeenCalled()
    error.mockRestore()
  })
})
