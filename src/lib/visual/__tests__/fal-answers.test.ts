import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ subscribe: vi.fn() }))

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: (...args: unknown[]) => mocks.subscribe(...args),
    storage: { upload: vi.fn() },
  },
  ApiError: class ApiError extends Error {
    readonly status: number
    readonly body: unknown
    constructor(args: { message: string; status: number; body?: unknown }) {
      super(args.message)
      this.status = args.status
      this.body = args.body
    }
  },
}))
vi.mock('@/lib/billing/usage', () => ({ reserveUsage: vi.fn() }))
vi.mock('@/lib/billing/telemetry', () => ({ recordAiUsage: vi.fn() }))

process.env.FAL_API_KEY = 'test-key'

import { ApiError } from '@fal-ai/client'
import { generateSlideImage, removeImageBackground } from '../fal'
import { runAsSpender, type Spender } from '@/lib/billing/spend-context'

function spender(): Spender {
  return { agencyId: 'a1', flow: 'editor', reserved: {} }
}

function refusal(message: string, body: unknown) {
  return new ApiError({ message, status: 403, body })
}

function paint(): Promise<string> {
  return runAsSpender(spender(), () => generateSlideImage('a hill at dusk'))
}

function cutOut(): Promise<string> {
  return runAsSpender(spender(), () => removeImageBackground('https://storage.example/in.png'))
}

describe('fal answers — parsed, never trusted', () => {
  beforeEach(() => {
    mocks.subscribe.mockReset()
  })

  it('an images answer yields its first file’s URL', async () => {
    mocks.subscribe.mockResolvedValue({
      data: { images: [{ url: 'https://fal.example/one.jpg' }, { url: 'https://fal.example/2' }] },
    })
    await expect(paint()).resolves.toBe('https://fal.example/one.jpg')
  })

  it.each([
    ['no images', { images: [] }],
    ['a first file with no URL', { images: [{ file_name: 'x.jpg' }] }],
    ['a first file that is null', { images: [null] }],
    ['no data at all', undefined],
  ])('an images answer with %s is no image', async (_, data) => {
    mocks.subscribe.mockResolvedValue({ data })
    await expect(paint()).rejects.toThrow('fal-ai/gpt-image-2 returned no image')
  })

  it('a cutout answer yields its single file’s URL', async () => {
    mocks.subscribe.mockResolvedValue({ data: { image: { url: 'https://fal.example/cut.png' } } })
    await expect(cutOut()).resolves.toBe('https://fal.example/cut.png')
  })

  it.each([
    ['an images array instead', { images: [{ url: 'https://fal.example/one.png' }] }],
    ['a URL that is not a string', { image: { url: 42 } }],
  ])('a cutout answer with %s is no image', async (_, data) => {
    mocks.subscribe.mockResolvedValue({ data })
    await expect(cutOut()).rejects.toThrow('fal-ai/birefnet/v2 returned no image')
  })
})

describe('callFal — fal’s reason for a failure is kept', () => {
  beforeEach(() => {
    mocks.subscribe.mockReset()
  })

  it('names the body’s string detail beside the status text', async () => {
    mocks.subscribe.mockRejectedValue(refusal('Forbidden', { detail: 'Exhausted balance' }))
    await expect(paint()).rejects.toThrow('fal-ai/gpt-image-2: Forbidden — Exhausted balance')
  })

  it('writes a structured detail out as JSON', async () => {
    mocks.subscribe.mockRejectedValue(
      refusal('Unprocessable Entity', { detail: [{ msg: 'prompt flagged' }] })
    )
    await expect(paint()).rejects.toThrow('Unprocessable Entity — [{"msg":"prompt flagged"}]')
  })

  it.each([
    ['no detail', { error: 'x' }],
    ['a body that is only text', 'Forbidden'],
  ])('rethrows the error as it came when the body has %s', async (_, body) => {
    const original = refusal('Forbidden', body)
    mocks.subscribe.mockRejectedValue(original)
    await expect(paint()).rejects.toBe(original)
  })
})
