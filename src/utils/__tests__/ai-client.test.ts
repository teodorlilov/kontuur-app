import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  return { stream: vi.fn(), recordAiUsage: vi.fn() }
})

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class APIError extends Error {
      status?: number
    }
    static APIConnectionError = class APIConnectionError extends Error {}
    messages = { stream: (...args: unknown[]) => mocks.stream(...args) }
  }
  return { default: Anthropic }
})
vi.mock('@/lib/billing/telemetry', () => ({
  recordAiUsage: (...args: unknown[]) => mocks.recordAiUsage(...args),
  anthropicUsageOf: (message: { usage: { input_tokens: number; output_tokens: number } }) => ({
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    webSearches: 0,
  }),
}))

import { callAnthropic, DEFAULT_MODEL } from '../ai-client'
import { runAsSpender } from '@/lib/billing/spend-context'

const MESSAGE = {
  content: [{ type: 'text', text: 'hello' }],
  usage: { input_tokens: 120, output_tokens: 30 },
}

describe('callAnthropic — the one door to Claude', () => {
  beforeEach(() => {
    mocks.stream.mockReset().mockReturnValue({
      on: vi.fn(),
      finalMessage: () => Promise.resolve(MESSAGE),
    })
    mocks.recordAiUsage.mockReset()
  })

  it('refuses with no spender in scope, before any request is made', async () => {
    await expect(callAnthropic({ userMessage: 'hi' })).rejects.toThrow(/no spender in scope/)
    expect(mocks.stream).not.toHaveBeenCalled()
  })

  it('records the final message usage for the spender in scope', async () => {
    const message = await runAsSpender({ agencyId: 'a1', flow: 'generation' }, () =>
      callAnthropic({ userMessage: 'hi' })
    )

    expect(message).toBe(MESSAGE)
    expect(mocks.stream).toHaveBeenCalledTimes(1)
    expect(mocks.recordAiUsage).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: DEFAULT_MODEL,
      usage: expect.objectContaining({ inputTokens: 120, outputTokens: 30 }),
    })
  })
})
