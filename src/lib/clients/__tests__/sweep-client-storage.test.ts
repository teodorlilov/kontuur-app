import { beforeEach, describe, expect, it, vi } from 'vitest'

const removeStoragePrefix = vi.fn()
vi.mock('@/lib/storage/remove-prefix', () => ({
  removeStoragePrefix: (...args: unknown[]) => removeStoragePrefix(...(args as [])),
}))

import { sweepClientStorage } from '../sweep-client-storage'

describe('sweepClientStorage', () => {
  beforeEach(() => removeStoragePrefix.mockReset())

  it('sweeps the client’s prefix in both buckets and reports each count', async () => {
    removeStoragePrefix.mockImplementation(async (bucket: string) =>
      bucket === 'post-images' ? 12 : 3
    )
    expect(await sweepClientStorage('client-1')).toEqual({ images: 12, files: 3 })
    expect(removeStoragePrefix).toHaveBeenCalledWith('post-images', 'client-1')
    expect(removeStoragePrefix).toHaveBeenCalledWith('client-files', 'client-1')
    expect(removeStoragePrefix).toHaveBeenCalledTimes(2)
  })
})
