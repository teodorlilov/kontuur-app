import Anthropic from '@anthropic-ai/sdk'
import type { Message, MessageParam } from '@anthropic-ai/sdk/resources'

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set')
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const DEFAULT_MODEL = 'claude-sonnet-4-5'
/** Lighter model for analytical/extraction tasks (pillars, sources, best-time, URL analysis) */
export const LIGHT_MODEL = 'claude-haiku-4-5'
export const DEFAULT_MAX_TOKENS = 4096

export interface CallAnthropicOptions {
  systemPrompt?: string
  userMessage: string
  model?: string
  maxTokens?: number
  /** Whether to cache the system prompt (default: true when systemPrompt is provided) */
  cacheSystemPrompt?: boolean
  /** Optional prefilled assistant turn (e.g. '{' to guide JSON output) */
  assistantPrefill?: string
}

export async function callAnthropic(opts: CallAnthropicOptions): Promise<Message> {
  const {
    systemPrompt,
    userMessage,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    cacheSystemPrompt = true,
    assistantPrefill,
  } = opts

  const messages: MessageParam[] = [{ role: 'user', content: userMessage }]
  if (assistantPrefill) {
    messages.push({ role: 'assistant', content: assistantPrefill })
  }

  return anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    ...(systemPrompt && {
      system: cacheSystemPrompt
        ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
        : systemPrompt,
    }),
    messages,
  })
}

