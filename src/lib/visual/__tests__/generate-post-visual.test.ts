import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What the generation does with the file when the row it was made for is gone.
 *
 * The picture is uploaded before the row that points at it is written, and the ~52s in between is
 * long enough for a person to discard the draft — `deletePost` then sweeps a folder the picture has
 * not landed in yet. Nothing referenced it, so it is deleted here rather than left behind.
 */

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  putPostImage: vi.fn(),
  deletePostImage: vi.fn(),
  uploadPostImage: vi.fn(),
  claimVisualJob: vi.fn(),
  releaseVisualJob: vi.fn(),
}))

/** The post read and the existing-image read, both of which chain `.eq` before resolving. */
vi.mock('@/lib/supabase/admin', () => {
  const POST_ROW = {
    post_type: 'single',
    slides_json: null,
    caption: 'A caption the slide can be made from',
    visual_ground: '#111111',
    visual_accent: '#eeeeee',
  }
  const chain: Record<string, unknown> = {}
  chain.eq = () => chain
  chain.single = () => Promise.resolve({ data: POST_ROW })
  chain.maybeSingle = () => Promise.resolve({ data: null })
  return { createAdminSupabaseClient: () => ({ from: () => ({ select: () => chain }) }) }
})
vi.mock('@/features/assets/lib/storage', () => ({
  uploadPostImage: (...args: unknown[]) => mocks.uploadPostImage(...args),
  putPostImage: (...args: unknown[]) => mocks.putPostImage(...args),
  deletePostImage: (...args: unknown[]) => mocks.deletePostImage(...args),
}))
vi.mock('@/lib/visual/visual-jobs', () => ({
  claimVisualJob: (...args: unknown[]) => mocks.claimVisualJob(...args),
  releaseVisualJob: (...args: unknown[]) => mocks.releaseVisualJob(...args),
}))
vi.mock('@/lib/visual/generate-visual', () => ({
  fetchIdentityForGeneration: () => Promise.resolve({ palette: {}, style: 'editorial' }),
  generateVisual: () => Promise.resolve({ buffer: Buffer.from('jpeg'), contentType: 'image/jpeg' }),
}))
vi.mock('@/lib/visual/post-color', () => ({
  resolveScheme: () => Promise.resolve({ ground: '#111111', accent: '#eeeeee' }),
}))

import { generatePostVisual } from '../generate-post-visual'

const INPUT = { postId: 'p1', clientId: 'c1', position: 0 }

beforeEach(() => {
  mocks.claimVisualJob.mockReset().mockResolvedValue(true)
  mocks.releaseVisualJob.mockReset().mockResolvedValue(undefined)
  mocks.deletePostImage.mockReset().mockResolvedValue(undefined)
  mocks.uploadPostImage
    .mockReset()
    .mockResolvedValue({ publicUrl: 'https://cdn/x.jpg', storagePath: 'c1/p1/0-visual-0.jpg' })
  mocks.putPostImage.mockReset().mockResolvedValue({ id: 'img-1', position: 0 })
})

describe('generatePostVisual', () => {
  it('stores the picture and gives the position back', async () => {
    const result = await generatePostVisual(INPUT)

    expect(result).toEqual({ ok: true, image: { id: 'img-1', position: 0 } })
    expect(mocks.deletePostImage).not.toHaveBeenCalled()
    expect(mocks.releaseVisualJob).toHaveBeenCalledWith(expect.anything(), 'p1', 0)
  })

  it('deletes the file it just uploaded when the row cannot be written, and still reports', async () => {
    mocks.putPostImage.mockRejectedValue(new Error('post_images upsert failed: FK violation'))

    await expect(generatePostVisual(INPUT)).rejects.toThrow('post_images upsert failed')
    expect(mocks.deletePostImage).toHaveBeenCalledWith('c1/p1/0-visual-0.jpg')
    // The claim is released whichever way the generation ended.
    expect(mocks.releaseVisualJob).toHaveBeenCalledWith(expect.anything(), 'p1', 0)
  })

  it('refuses a position something else is already making, before anything is spent', async () => {
    mocks.claimVisualJob.mockResolvedValue(false)

    expect(await generatePostVisual(INPUT)).toEqual({ ok: false, reason: 'in_flight' })
    expect(mocks.uploadPostImage).not.toHaveBeenCalled()
    expect(mocks.releaseVisualJob).not.toHaveBeenCalled()
  })
})
