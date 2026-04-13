import { callAnthropic } from '@/utils/ai-client'
import { extractTextFromMessage, sanitizeAndParseJson } from '@/utils/ai'
import { buildClientSection } from '@/ai/shared/build-client-profile'
import { formatHistory } from '@/ai/utils/prompt-helpers'
import { DEFENSIVE_DATA_CLAUSE } from '@/ai/utils/sanitize'
import type { RewriteCaptionInput, RewriteCarouselInput, RewriteCarouselResult } from '../types'

const SYSTEM_PROMPT = `You are a senior social media copywriter. You write for humans, not algorithms. ${DEFENSIVE_DATA_CLAUSE}

OPENER — the most important line. Choose whatever stops scrolling for this specific theme and register.
NEVER bury the lead — start with the payoff, not the context.

WRITING RULES:
1. Mix short and long sentences. At least one under 6 words and one over 20.
   Never three consecutive sentences of similar length.
2. One CTA maximum. Specific and low-pressure.
3. Follow hashtag and word count limits from the client brief.
4. The language register rules are in the client brief. Follow them exactly — they are non-negotiable.
5. Every claim must be grounded in what this specific business does — not abstract promises.

SELF-CHECK (before returning your response):
- Does the opener make someone stop scrolling? If not — rewrite it.
- Could this post be written about any business in the niche? If yes — add specificity.
- If source was provided: does the post focus on ONE angle or summarize?
- Read the post aloud as if speaking to a person. Does every sentence sound like something a real human would say? Any sentence that sounds like a written report, consultant memo, or bureaucratic form must be rewritten in spoken language.`

export async function rewriteCaption(input: RewriteCaptionInput): Promise<string> {
  const { client } = input
  const lc = client.languageConfig

  const clientProfile = buildClientSection(client, input.platform)

  const message = await callAnthropic({
    systemPrompt: SYSTEM_PROMPT,
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

  const clientProfile = buildClientSection(client, input.platform)

  const message = await callAnthropic({
    systemPrompt: SYSTEM_PROMPT,
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
