import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entitlement } from '@/lib/billing/entitlement'

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  consumeUsage: vi.fn(),
  refundUsage: vi.fn(),
  recordAiUsage: vi.fn(),
  order: [] as string[],
}))

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: (...args: unknown[]) => {
      mocks.order.push('subscribe')
      return mocks.subscribe(...args)
    },
    storage: { upload: vi.fn() },
  },
  ApiError: class ApiError extends Error {},
}))
vi.mock('@/lib/queries/cache', () => ({
  getCachedEntitlement: () => Promise.resolve(ENTITLEMENT),
}))
vi.mock('@/lib/billing/usage', () => ({
  consumeUsage: (...args: unknown[]) => {
    mocks.order.push('consume')
    return mocks.consumeUsage(...args)
  },
  refundUsage: (...args: unknown[]) => mocks.refundUsage(...args),
  AllowanceError: class AllowanceError extends Error {
    constructor(readonly kind: string) {
      super('allowance')
      this.name = 'AllowanceError'
    }
  },
}))
vi.mock('@/lib/billing/telemetry', () => ({
  recordAiUsage: (...args: unknown[]) => mocks.recordAiUsage(...args),
}))

process.env.FAL_API_KEY = 'test-key'

import { generateSlideImage, removeImageBackground } from '../fal'
import { runAsSpender, type Spender } from '@/lib/billing/spend-context'

const ENTITLEMENT = {
  limits: { draft: 40, image: 120, rewrite: 30 },
  periodKey: '2026-09-01',
  resetsOn: new Date('2026-10-01T00:00:00Z'),
  timezone: 'Europe/Sofia',
} as unknown as Entitlement

const IMAGE = { data: { images: [{ url: 'https://fal.example/one.jpg' }] } }
const CUTOUT = { data: { image: { url: 'https://fal.example/cutout.png' } } }

function spender(): Spender {
  return { agencyId: 'a1', clientId: 'c1', flow: 'editor' }
}

describe('subscribeFal — the one place images are metered', () => {
  beforeEach(() => {
    mocks.order.length = 0
    mocks.subscribe.mockReset().mockResolvedValue(IMAGE)
    mocks.consumeUsage.mockReset().mockResolvedValue({ allowed: true, used: 1, quota: 120 })
    mocks.refundUsage.mockReset().mockResolvedValue(undefined)
    mocks.recordAiUsage.mockReset()
  })

  it('reserves one image before the call, and counts it on the spender once fal answered', async () => {
    const who = spender()
    const url = await runAsSpender(who, () => generateSlideImage('a hill at dusk'))

    expect(url).toBe('https://fal.example/one.jpg')
    expect(mocks.order).toEqual(['consume', 'subscribe'])
    expect(mocks.consumeUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'image', 1)
    expect(who.charged).toBe(1)
    expect(mocks.refundUsage).not.toHaveBeenCalled()
    expect(mocks.recordAiUsage).toHaveBeenCalledWith({
      provider: 'fal',
      model: 'fal-ai/gpt-image-2',
    })
  })

  it('gives the image back when fal throws, and counts nothing', async () => {
    mocks.subscribe.mockRejectedValue(new Error('Forbidden'))
    const who = spender()

    await expect(runAsSpender(who, () => generateSlideImage('x'))).rejects.toThrow('Forbidden')
    expect(mocks.refundUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'image', 1)
    expect(who.charged).toBeUndefined()
  })

  it('refuses without calling fal when the pool is empty', async () => {
    mocks.consumeUsage.mockResolvedValue({ allowed: false, used: 120, quota: 120 })

    await expect(runAsSpender(spender(), () => generateSlideImage('x'))).rejects.toMatchObject({
      name: 'AllowanceError',
    })
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('the cutout model is free: no reservation, telemetry only', async () => {
    mocks.subscribe.mockResolvedValue(CUTOUT)

    const url = await runAsSpender(spender(), () =>
      removeImageBackground('https://storage.example/in.png')
    )
    expect(url).toBe('https://fal.example/cutout.png')
    expect(mocks.consumeUsage).not.toHaveBeenCalled()
    expect(mocks.recordAiUsage).toHaveBeenCalledWith({
      provider: 'fal',
      model: 'fal-ai/birefnet/v2',
    })
  })

  it('fails closed with no spender in scope', async () => {
    await expect(generateSlideImage('x')).rejects.toThrow(/no spender in scope/)
    expect(mocks.subscribe).not.toHaveBeenCalled()
    expect(mocks.consumeUsage).not.toHaveBeenCalled()
  })
})
