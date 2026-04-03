import { vi } from 'vitest'

export const anthropic = {
  messages: {
    create: vi.fn(),
  },
}

export const callAnthropic = vi.fn()

export const DEFAULT_MODEL = 'claude-sonnet-4-5'
export const LIGHT_MODEL = 'claude-haiku-4-5'
export const DEFAULT_MAX_TOKENS = 4096

/**
 * Helper to mock a Claude response that returns the given text.
 * Use in tests: mockClaudeResponse(JSON.stringify({ ... }))
 */
export function mockClaudeResponse(text: string) {
  callAnthropic.mockResolvedValue({
    content: [{ type: 'text', text }],
  })
}
