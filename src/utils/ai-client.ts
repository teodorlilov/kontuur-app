import Anthropic from '@anthropic-ai/sdk'
import type { Message, MessageParam } from '@anthropic-ai/sdk/resources'
import { currentSpender } from '@/lib/billing/spend-context'
import { anthropicUsageOf, recordAiUsage } from '@/lib/billing/telemetry'

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set')
}

/** Private: every call reaches it through `attributedClaudeCall`, which attributes and records it. */
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const DEFAULT_MODEL = 'claude-sonnet-5'
/**
 * Lighter model for everything that judges, ranks or extracts rather than writes —
 * validation, source ranking, style-memo distillation, suggestions, best-time,
 * URL analysis. It is also the only model these calls may set `temperature` on.
 */
export const LIGHT_MODEL = 'claude-haiku-4-5'
const DEFAULT_MAX_TOKENS = 4096

interface CallAnthropicOptions {
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
   * Sampling temperature. Judging/validation calls run at 0 for consistent verdicts.
   * 5-series models (Sonnet 5, Opus 5) reject non-default values with a 400 —
   * only set this on LIGHT_MODEL calls.
   */
  temperature?: number
  /**
   * Extended-thinking override. Omitted → thinking is explicitly DISABLED:
   * 5-series models turn adaptive thinking ON when the field is absent, and
   * thinking tokens count against max_tokens — which silently truncates
   * forced-tool output sized to tight budgets (a truncated tool call kills the
   * whole theme). Callers that want thinking must opt in deliberately.
   */
  thinking?: { type: 'enabled'; budget_tokens: number } | { type: 'disabled' }
  /**
   * When provided, forces tool use with this JSON Schema as the output schema,
   * so the response arrives as structured JSON rather than free text.
   *
   * The shape is NOT enforced: the tool is declared without `strict: true`, so
   * the schema steers the model without constraining decoding. Callers must
   * still guard against missing fields. Turning strict on is not a one-line
   * change — it requires `additionalProperties: false` on every object and the
   * removal of every minItems/maxItems, which strict mode does not support.
   *
   * Incompatible with assistantPrefill.
   */
  outputSchema?: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
    [key: string]: unknown
  }
}

const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 1000

/** Transient failures worth retrying: rate limits, server errors, overload, network drops. */
function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true
  if (err instanceof Anthropic.APIError) {
    return err.status === 429 || (typeof err.status === 'number' && err.status >= 500)
  }
  if (err && typeof err === 'object' && 'error' in err) {
    const inner = (err as { error?: { error?: { type?: string } } }).error
    return inner?.error?.type === 'overloaded_error'
  }
  return false
}

/**
 * The one door to Claude. Two billing rules live here: the call is refused, before `call` runs,
 * when no spender is in scope — the boundary (a gated route, an action, a cron's per-client loop)
 * declares one with `runAsSpender`, so a new caller cannot burn money unattributed — and the
 * returned message's `usage` is recorded to `ai_usage_daily` for that spender, which never blocks
 * or throws. `callAnthropic` is the common case; a request it cannot express, such as the weekly
 * brief's server-side web search, passes its own `call`.
 */
export async function attributedClaudeCall(
  model: string,
  call: (client: Anthropic) => Promise<Message>
): Promise<Message> {
  if (!currentSpender()) {
    throw new Error(
      `Claude call to ${model}: no spender in scope — wrap the boundary in runAsSpender`
    )
  }
  const message = await call(anthropic)
  void recordAiUsage({ provider: 'anthropic', model, usage: anthropicUsageOf(message) })
  return message
}

/**
 * Stream one request, retrying transient failures with exponential back-off — but never once a
 * token has reached `onToken`, since a retry would replay the text from the start (duplicated
 * output in a streaming UI).
 */
async function streamWithRetries(
  client: Anthropic,
  requestParams: Parameters<Anthropic['messages']['stream']>[0],
  onToken: ((text: string) => void) | undefined
): Promise<Message> {
  for (let attempt = 0; ; attempt++) {
    let emittedTokens = false
    try {
      const stream = client.messages.stream(requestParams)
      if (onToken) {
        stream.on('text', (text) => {
          emittedTokens = true
          onToken(text)
        })
      }
      return await stream.finalMessage()
    } catch (err) {
      if (!isRetryable(err) || emittedTokens || attempt >= MAX_RETRIES) throw err
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt
      console.warn(
        `[ai-client] transient API error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
        err
      )
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

/**
 * Every ordinary Claude call the app makes, with retries and the forced-tool output shape,
 * through `attributedClaudeCall`.
 */
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
    temperature,
    thinking = { type: 'disabled' as const },
  } = opts

  const messages: MessageParam[] = [...conversationHistory, { role: 'user', content: userMessage }]
  if (assistantPrefill) {
    messages.push({ role: 'assistant', content: assistantPrefill })
  }

  const requestParams = {
    model,
    max_tokens: maxTokens,
    thinking,
    ...(temperature !== undefined && { temperature }),
    ...(systemPrompt && {
      system: cacheSystemPrompt
        ? [
            {
              type: 'text' as const,
              text: systemPrompt,
              cache_control: { type: 'ephemeral' as const },
            },
          ]
        : systemPrompt,
    }),
    messages,
    ...(outputSchema && {
      tools: [
        { name: 'output', description: 'Return the structured output', input_schema: outputSchema },
      ],
      tool_choice: { type: 'tool' as const, name: 'output' },
    }),
  }

  return attributedClaudeCall(model, (client) => streamWithRetries(client, requestParams, onToken))
}
