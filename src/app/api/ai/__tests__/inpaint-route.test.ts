import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  uploadFalTempFile: vi.fn(),
  editImageWithMask: vi.fn(),
  downloadFalFile: vi.fn(),
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
  assetTargetFromForm: () => ({ postId: 'p1' }),
  foreignStoragePathResponse: () => null,
  resolveAssetDestination: () =>
    Promise.resolve({ ok: true, clientId: 'c1', upload: mocks.upload }),
}))
vi.mock('@/features/assets/lib/storage', () => ({
  publicPostImageUrl: (storagePath: string) => `https://cdn/${storagePath}`,
}))
vi.mock('@/lib/visual/fal', () => ({
  uploadFalTempFile: (...args: unknown[]) => mocks.uploadFalTempFile(...args),
  editImageWithMask: (...args: unknown[]) => mocks.editImageWithMask(...args),
  downloadFalFile: (...args: unknown[]) => mocks.downloadFalFile(...args),
}))
vi.mock('@/lib/billing/usage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/usage')>()),
  runMetered: (await import('./metered-stand-in')).metered,
}))

import { POST } from '../inpaint/route'
import { outcomes } from './metered-stand-in'

const MASK = new File([new Uint8Array([137, 80, 78, 71])], 'mask.png', { type: 'image/png' })

function request(mask: File | string = MASK): Request {
  const form = new FormData()
  form.set('mask', mask)
  form.set('prompt', 'a calm sky')
  form.set('storagePath', 'c1/p1/background.jpg')
  form.set('width', '1088')
  form.set('height', '1360')
  form.set('postId', 'p1')
  return new Request('https://kontuur.app/api/ai/inpaint', { method: 'POST', body: form })
}

const IMAGE = Buffer.from('jpeg')

describe('POST /api/ai/inpaint — the edit is counted only once it is in storage', () => {
  beforeEach(() => {
    outcomes.length = 0
    mocks.uploadFalTempFile.mockReset().mockResolvedValue('https://fal.example/mask.png')
    mocks.editImageWithMask.mockReset().mockResolvedValue('https://fal.example/edited.jpg')
    mocks.downloadFalFile.mockReset().mockResolvedValue(IMAGE)
    mocks.upload
      .mockReset()
      .mockResolvedValue({ publicUrl: 'https://cdn/in.jpg', storagePath: 'p' })
  })

  it('runs the edit, the download and the upload as one landing', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ publicUrl: 'https://cdn/in.jpg', storagePath: 'p' })
    expect(outcomes).toEqual(['landed'])
    expect(mocks.editImageWithMask).toHaveBeenCalledWith({
      imageUrl: 'https://cdn/c1/p1/background.jpg',
      maskUrl: 'https://fal.example/mask.png',
      prompt: 'a calm sky',
      width: 1088,
      height: 1360,
    })
    expect(mocks.upload).toHaveBeenCalledWith(IMAGE, 'image/jpeg', 'inpainted.jpg')
  })

  it('a failed upload is thrown inside the landing — the image given back — and answered as a 502 in the storage’s words', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.upload.mockRejectedValue(new Error('Storage upload failed: The resource already exists'))

    const response = await POST(request())
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Storage upload failed: The resource already exists',
    })
    expect(outcomes).toEqual(['thrown'])
    error.mockRestore()
  })

  it('a mask sent as a text field is refused before anything is paid for', async () => {
    const response = await POST(request('iVBORw0KGgo='))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'A PNG mask is required' })
    expect(mocks.uploadFalTempFile).not.toHaveBeenCalled()
    expect(outcomes).toEqual([])
  })
})
