import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  reserveUsage: vi.fn(),
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
vi.mock('@/lib/billing/usage', () => ({
  reserveUsage: (...args: unknown[]) => {
    mocks.order.push('reserve')
    return mocks.reserveUsage(...args)
  },
}))
vi.mock('@/lib/billing/telemetry', () => ({
  recordAiUsage: (...args: unknown[]) => mocks.recordAiUsage(...args),
}))

process.env.FAL_API_KEY = 'test-key'

import { generateSlideImage, removeImageBackground } from '../fal'
import { runAsSpender, type Spender } from '@/lib/billing/spend-context'

const IMAGE = { data: { images: [{ url: 'https://fal.example/one.jpg' }] } }
const CUTOUT = { data: { image: { url: 'https://fal.example/cutout.png' } } }

function spender(): Spender {
  return { agencyId: 'a1', clientId: 'c1', flow: 'editor', reserved: {} }
}

describe('subscribeFal — the one place images are metered', () => {
  beforeEach(() => {
    mocks.order.length = 0
    mocks.subscribe.mockReset().mockResolvedValue(IMAGE)
    mocks.reserveUsage.mockReset().mockResolvedValue(undefined)
    mocks.recordAiUsage.mockReset()
  })

  it('reserves one image on the spender before the call — the boundary settles it', async () => {
    const who = spender()
    const url = await runAsSpender(who, () => generateSlideImage('a hill at dusk'))

    expect(url).toBe('https://fal.example/one.jpg')
    expect(mocks.order).toEqual(['reserve', 'subscribe'])
    expect(mocks.reserveUsage).toHaveBeenCalledWith(who, 'image', 1)
    expect(mocks.recordAiUsage).toHaveBeenCalledWith({
      provider: 'fal',
      model: 'fal-ai/gpt-image-2',
    })
  })

  it('touches the ledger only to reserve: a failed call is the boundary’s to give back', async () => {
    mocks.subscribe.mockRejectedValue(new Error('Forbidden'))

    await expect(runAsSpender(spender(), () => generateSlideImage('x'))).rejects.toThrow(
      'Forbidden'
    )
    expect(mocks.reserveUsage).toHaveBeenCalledTimes(1)
    expect(mocks.recordAiUsage).toHaveBeenCalledTimes(1)
  })

  it('refuses without calling fal when the reservation is refused', async () => {
    mocks.reserveUsage.mockRejectedValue(
      Object.assign(new Error('used up'), { name: 'AllowanceError' })
    )

    await expect(runAsSpender(spender(), () => generateSlideImage('x'))).rejects.toMatchObject({
      name: 'AllowanceError',
    })
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('the cutout model is free: no reservation, telemetry only', async () => {
    mocks.subscribe.mockResolvedValue(CUTOUT)

    const who: Spender = { agencyId: 'a1', clientId: 'c1', flow: 'editor' }
    const url = await runAsSpender(who, () =>
      removeImageBackground('https://storage.example/in.png')
    )
    expect(url).toBe('https://fal.example/cutout.png')
    expect(mocks.reserveUsage).not.toHaveBeenCalled()
    expect(mocks.recordAiUsage).toHaveBeenCalledWith({
      provider: 'fal',
      model: 'fal-ai/birefnet/v2',
    })
  })

  it('fails closed with no spender in scope', async () => {
    await expect(generateSlideImage('x')).rejects.toThrow(/no spender in scope/)
    expect(mocks.subscribe).not.toHaveBeenCalled()
    expect(mocks.reserveUsage).not.toHaveBeenCalled()
  })
})
