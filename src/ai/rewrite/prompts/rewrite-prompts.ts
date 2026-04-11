import { callAnthropic } from '@/utils/ai-client'
import { extractTextFromMessage, sanitizeAndParseJson } from '@/utils/ai'
import { buildStaticSystemPrompt, buildClientProfile } from '@/ai/generation/prompts/client-profile'
import { formatHistory } from '@/ai/utils/prompt-helpers'
import type { RewriteCaptionInput, RewriteCarouselInput, RewriteCarouselResult } from '../types'

const systemText = buildStaticSystemPrompt()

export async function rewriteCaption(input: RewriteCaptionInput): Promise<string> {
  const { client } = input
  const lc = client.languageConfig

  const clientProfile = buildClientProfile({
    client,
    platform: input.platform,
  })

  const message = await callAnthropic({
    systemPrompt: systemText,
    userMessage: `${clientProfile}

Recent topics already covered — do not drift into: ${formatHistory(client.postHistory, { limit: 15 })}

ORIGINAL POST:
<post_to_rewrite>
${input.caption}
</post_to_rewrite>

AI PROBLEMS DETECTED:
${input.aiTells.map((t) => `- ${t}`).join('\n')}
${input.qualityIssues?.length ? `\nQUALITY ISSUES TO ADDRESS:\n${input.qualityIssues.map((i) => `- ${i}`).join('\n')}` : ''}

YOUR TASK:
Rewrite this post so it reads as written by a real person who knows this business deeply. Keep the same topic, facts, key message, and hashtags. Completely change the writing structure.
- Keep the same language (${lc.language}) and formality level (${lc.formality})
- Keep the same tone: ${client.tone}
- Fix every AI tell listed above${input.qualityIssues?.length ? '\n- Address every quality issue listed above' : ''}
- If one of the AI tells is about formulaic structure, you MUST use a different post structure from the alternatives above

Return ONLY the rewritten post text. No explanations, no commentary.`,
  })

  const text = extractTextFromMessage(message)
  return text ? text.trim() : input.caption
}

export async function rewriteCarousel(input: RewriteCarouselInput): Promise<RewriteCarouselResult> {
  const slidesText = input.slides
    .map((s, i) => `Slide ${i + 1}:\nHeadline: ${s.headline}\nBody: ${s.body}`)
    .join('\n\n')

  const { client } = input
  const lc = client.languageConfig

  const clientProfile = buildClientProfile({
    client,
    platform: input.platform,
  })

  const message = await callAnthropic({
    systemPrompt: systemText,
    userMessage: `${clientProfile}

CAROUSEL RULES:
- Make headlines punchy and specific, not generic — each must name a specific mechanism, condition, technology, or result
- Mix sentence lengths in body text

Recent topics already covered — do not drift into: ${formatHistory(client.postHistory, { limit: 15 })}

MAIN CAPTION:
<caption_to_rewrite>
${input.mainCaption}
</caption_to_rewrite>

SLIDES:
<slides_to_rewrite>
${slidesText}
</slides_to_rewrite>

AI PROBLEMS DETECTED:
${input.aiTells.map((t) => `- ${t}`).join('\n')}
${input.qualityIssues?.length ? `\nQUALITY ISSUES TO ADDRESS:\n${input.qualityIssues.map((i) => `- ${i}`).join('\n')}` : ''}

YOUR TASK:
Rewrite the caption and all slides so they read as written by a real person who knows this business deeply. Keep the same topic, facts, and structure (same number of slides).
- Keep the same language (${lc.language}) and formality level (${lc.formality})
- Keep the same tone: ${client.tone}
- Fix every AI tell listed above${input.qualityIssues?.length ? '\n- Address every quality issue listed above' : ''}
- If one of the AI tells is about formulaic structure, you MUST restructure the main caption using one of the alternatives above

Return JSON only, no markdown wrapper:
{
  "main_caption": "...",
  "slides": [{"headline": "...", "body": "..."}, ...]
}`,
    assistantPrefill: '{',
  })

  const rawText = '{' + extractTextFromMessage(message)
  const fallback: RewriteCarouselResult = { main_caption: input.mainCaption, slides: input.slides }
  const parsed = sanitizeAndParseJson<RewriteCarouselResult>(rawText, fallback)

  if (
    typeof parsed.main_caption !== 'string' ||
    !parsed.main_caption ||
    !Array.isArray(parsed.slides) ||
    parsed.slides.length === 0
  ) {
    console.warn('[rewrite] Carousel rewrite returned invalid structure, falling back to original')
    return { main_caption: input.mainCaption, slides: input.slides }
  }

  return parsed
}
