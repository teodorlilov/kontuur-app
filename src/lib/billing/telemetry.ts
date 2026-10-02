import 'server-only'

import type { Message } from '@anthropic-ai/sdk/resources'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { anthropicCostCents, falCostCents, tavilyCostCents, type AnthropicUsage } from './ai-prices'
import type { Spender } from './spend-context'

/**
 * What every provider call actually cost, added to `ai_usage_daily` (migration 20260852) for the
 * spender the provider wrapper passes — agency, day, provider, model, feature. Aggregate rows, so a
 * day of heavy use is a handful of upserts per agency and the table never needs sweeping.
 *
 * Telemetry, not a gate: it never throws and never blocks the call it records. The wrappers have
 * already refused a call with no spender (`requireSpender`, src/lib/billing/spend-context.ts).
 */

type Recorded =
  | { provider: 'anthropic'; model: string; usage: AnthropicUsage }
  | { provider: 'fal'; model: string }
  | { provider: 'tavily' }

/** The billable counts of one Anthropic response, cache and server-side searches included. */
export function anthropicUsageOf(message: Message): AnthropicUsage {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
    webSearches: message.usage.server_tool_use?.web_search_requests ?? 0,
  }
}

/**
 * Adds one call to today's row for `spender`. WHY as: the generated type of `p_agency_id` is
 * `string`, but `add_ai_usage` takes NULL for a call that belongs to no agency (the global brief)
 * and its unique index coalesces it (migration 20260852); a sentinel uuid would fail the foreign
 * key instead.
 */
export async function recordAiUsage(spender: Spender, call: Recorded): Promise<void> {
  const usage: AnthropicUsage =
    call.provider === 'anthropic'
      ? call.usage
      : {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          webSearches: 0,
        }
  const cost =
    call.provider === 'anthropic'
      ? anthropicCostCents(call.model, call.usage)
      : call.provider === 'fal'
        ? falCostCents(call.model)
        : tavilyCostCents()
  try {
    const agencyId = spender.agencyId as unknown as string
    const { error } = await createAdminSupabaseClient().rpc('add_ai_usage', {
      p_agency_id: agencyId,
      p_day: new Date().toISOString().slice(0, 10),
      p_provider: call.provider,
      p_model: call.provider === 'tavily' ? 'search' : call.model,
      p_flow: spender.flow,
      p_calls: 1,
      p_input_tokens: usage.inputTokens,
      p_output_tokens: usage.outputTokens,
      p_cache_read_tokens: usage.cacheReadTokens,
      p_cache_creation_tokens: usage.cacheCreationTokens,
      p_cost_eur_cents: cost,
    })
    if (error) console.warn('[billing] could not record AI usage:', error.message)
  } catch (err) {
    console.warn('[billing] could not record AI usage:', err)
  }
}
