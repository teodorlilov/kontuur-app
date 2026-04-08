import Anthropic from '@anthropic-ai/sdk'
import { anthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import { sanitizeAndParseJson } from '@/utils/ai'

export interface BriefingInput {
  agencyNiche?: string
}

export interface BriefingResult {
  platform_updates: string[]
  niche_trends: string[]
  weekly_tip: string
  action_nudge: string
  sources: string[]
}

const FALLBACK: BriefingResult = {
  platform_updates: [],
  niche_trends: [],
  weekly_tip: '',
  action_nudge: '',
  sources: [],
}

function buildPrompt(input: BriefingInput): string {
  const nicheContext = input.agencyNiche
    ? `The agency focuses on the ${input.agencyNiche} niche.`
    : 'The agency serves a mix of niches.'

  return `You are a social media intelligence analyst. ${nicheContext}

Use web search to find the most recent developments (this week) and return a JSON summary.

Return ONLY valid JSON with this structure:
{
  "platform_updates": ["<3 brief bullet points about algorithm or feature changes on Instagram, Facebook, LinkedIn, or TikTok this week>"],
  "niche_trends": ["<3 trending topics or content formats relevant to the agency niche>"],
  "weekly_tip": "<1 actionable sentence a social media manager can apply today>",
  "action_nudge": "<1 motivational sentence to help the team stay focused this week>"
}

Be specific and current. Each bullet point should be a complete sentence under 20 words.`
}

export async function generateBriefing(input: BriefingInput): Promise<BriefingResult> {
  try {
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2048,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      messages: [{ role: 'user', content: buildPrompt(input) }],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const sources: string[] = response.content
      .filter((b) => b.type === 'web_search_tool_result')
      .flatMap((b) => {
        const block = b as { type: string; content?: Array<{ url?: string }> }
        return (block.content ?? []).map((r) => r.url ?? '').filter(Boolean)
      })

    const parsed = sanitizeAndParseJson<Omit<BriefingResult, 'sources'>>(text, {
      platform_updates: [],
      niche_trends: [],
      weekly_tip: '',
      action_nudge: '',
    })

    return { ...parsed, sources }
  } catch (err) {
    console.error('[generateBriefing] Failed:', err)
    return FALLBACK
  }
}
