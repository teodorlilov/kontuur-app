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
  /** Optional prefilled assistant turn (e.g. '[' to guide JSON array output). Incompatible with outputSchema. */
  assistantPrefill?: string
  /** Optional prior conversation turns — used for retry calls to avoid re-sending source context */
  conversationHistory?: MessageParam[]
  /** Called for each text token as it streams from the API. */
  onToken?: (text: string) => void
  /**
   * When provided, forces tool use with this JSON Schema as the output schema.
   * The API guarantees the response is valid JSON matching the schema — no parsing required.
   * Incompatible with assistantPrefill.
   */
  outputSchema?: { type: 'object'; properties?: Record<string, unknown>; required?: string[]; [key: string]: unknown }
}

const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 1000

function isOverloaded(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) return err.status === 529
  if (err && typeof err === 'object' && 'error' in err) {
    const inner = (err as { error?: { error?: { type?: string } } }).error
    return inner?.error?.type === 'overloaded_error'
  }
  return false
}

export async function callAnthropic(opts: CallAnthropicOptions): Promise<Message> {
  const {
    systemPrompt,
    userMessage,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    cacheSystemPrompt = true,
    assistantPrefill,
    conversationHistory = [],
    onToken,
    outputSchema,
  } = opts

  const messages: MessageParam[] = [...conversationHistory, { role: 'user', content: userMessage }]
  if (assistantPrefill) {
    messages.push({ role: 'assistant', content: assistantPrefill })
  }

  const requestParams = {
    model,
    max_tokens: maxTokens,
    ...(systemPrompt && {
      system: cacheSystemPrompt
        ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
        : systemPrompt,
    }),
    messages,
    ...(outputSchema && {
      tools: [{ name: 'output', description: 'Return the structured output', input_schema: outputSchema }],
      tool_choice: { type: 'tool' as const, name: 'output' },
    }),
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stream = anthropic.messages.stream(requestParams)
      if (onToken) stream.on('text', onToken)
      return await stream.finalMessage()
    } catch (err) {
      if (isOverloaded(err) && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * 2 ** attempt
        console.warn(`[ai-client] overloaded, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }

  // Unreachable — loop always throws or returns
  throw new Error('callAnthropic: exhausted retries')
}
