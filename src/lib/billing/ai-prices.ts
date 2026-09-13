/**
 * What each provider call costs, in euro cents — the one constant `ai_usage_daily` is priced from.
 *
 * The providers bill in dollars, so the table carries their list prices as published and a single
 * USD→EUR rate turns them into cents; dollars never reach a row or a screen. Both drift: re-read
 * this file against each month's Anthropic, fal and Tavily invoices, and correct the rate from the
 * bank's conversion on the same statement. The value of the telemetry is relative — cost per
 * customer and per feature against what the plan assumed (docs/plans/BILLING.md) — so a stale
 * rate skews every row by the same factor and nothing else.
 *
 * Anthropic list prices per million tokens (Sonnet 5 $2/$10, Haiku 4.5 $1/$5; cache write 1.25×,
 * cache read 0.1× of input; web search $10 per 1,000 searches) as of the 2026-06 price table.
 * fal.ai and Tavily figures are the estimates the 2026-09-11 cost survey worked from and are the
 * part most worth checking against a real invoice.
 */

interface TokenPriceUsd {
  /** USD per million input tokens. */
  input: number
  /** USD per million output tokens. */
  output: number
}

const SONNET_USD: TokenPriceUsd = { input: 2, output: 10 }

const ANTHROPIC_USD_PER_MILLION: Record<string, TokenPriceUsd> = {
  'claude-sonnet-5': SONNET_USD,
  'claude-haiku-4-5': { input: 1, output: 5 },
}

const CACHE_WRITE_FACTOR = 1.25
const CACHE_READ_FACTOR = 0.1

/** USD per web search issued by the server-side web_search tool. */
const WEB_SEARCH_USD = 0.01

const IMAGE_USD = 0.06

/** USD per call, by fal model id (src/lib/visual/fal.ts). */
const FAL_USD_PER_CALL: Record<string, number> = {
  'fal-ai/gpt-image-2': IMAGE_USD,
  'openai/gpt-image-2/edit': 0.07,
  'fal-ai/recraft/v4/text-to-vector': 0.08,
  'fal-ai/birefnet/v2': 0.003,
}

/** USD per Tavily search query. */
const TAVILY_USD_PER_QUERY = 0.008

/** Approximate as of 2026-09; replace from the first real bank conversion. */
const EUR_PER_USD = 0.86

function toEurCents(usd: number): number {
  return Math.round(usd * EUR_PER_USD * 100)
}

export interface AnthropicUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  webSearches: number
}

/** Euro cents for one Anthropic call. An unknown model is priced at Sonnet 5 rates and logged. */
export function anthropicCostCents(model: string, usage: AnthropicUsage): number {
  const price = ANTHROPIC_USD_PER_MILLION[model]
  if (!price) console.warn(`[ai-prices] no price for model ${model}; charging Sonnet 5 rates`)
  const { input, output } = price ?? SONNET_USD
  const perToken = input / 1_000_000
  const usd =
    usage.inputTokens * perToken +
    usage.cacheCreationTokens * perToken * CACHE_WRITE_FACTOR +
    usage.cacheReadTokens * perToken * CACHE_READ_FACTOR +
    usage.outputTokens * (output / 1_000_000) +
    usage.webSearches * WEB_SEARCH_USD
  return toEurCents(usd)
}

/** Euro cents for one fal call. An unknown model is priced as a gpt-image-2 generation and logged. */
export function falCostCents(model: string): number {
  const usd = FAL_USD_PER_CALL[model]
  if (usd === undefined)
    console.warn(`[ai-prices] no price for fal model ${model}; charging image rates`)
  return toEurCents(usd ?? IMAGE_USD)
}

/** Euro cents for one Tavily query. */
export function tavilyCostCents(): number {
  return toEurCents(TAVILY_USD_PER_QUERY)
}
