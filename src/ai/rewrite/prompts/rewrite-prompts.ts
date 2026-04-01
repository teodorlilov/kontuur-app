import { anthropic, DEFAULT_MODEL, DEFAULT_MAX_TOKENS } from '@/ai/client'
import { extractTextFromMessage, sanitizeAndParseJson } from '@/ai/utils'
import {
  buildStaticSystemPrompt,
  buildClientProfile,
} from '@/ai/generation/prompts/prompt-sections'
import { WritingContext } from '@/ai/generation/writing-context'
import type { RewriteCaptionInput, RewriteCarouselInput, RewriteCarouselResult } from '../types'

export async function rewriteCaption(input: RewriteCaptionInput): Promise<string> {
  const ctx = new WritingContext({
    niche: input.niche,
    targetAudience: input.targetAudience,
    formality: input.formality,
    tone: input.tone,
    clientTestimonialVoice: input.clientTestimonialVoice,
    language: input.language,
    bannedAnglicisms: input.bannedAnglicisms,
    bannedCalques: input.bannedCalques,
  })

  const systemText = buildStaticSystemPrompt()

  const clientProfile = buildClientProfile({
    ctx,
    platform: input.platform,
    clientName: input.clientName,
    contentPillars: input.contentPillars,
    avoidTopics: input.avoidTopics,
    isHealthClient: input.isHealthClient ?? undefined,
  })

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `${clientProfile}

Recent topics already covered — do not drift into: ${input.postHistory.slice(0, 15).join(' | ')}

ORIGINAL POST:
<post_to_rewrite>
${input.caption}
</post_to_rewrite>

AI PROBLEMS DETECTED:
${input.aiTells.map((t) => `- ${t}`).join('\n')}
${input.qualityIssues?.length ? `\nQUALITY ISSUES TO ADDRESS:\n${input.qualityIssues.map((i) => `- ${i}`).join('\n')}` : ''}

YOUR TASK:
Rewrite this post so it reads as written by a real person who knows this business deeply. Keep the same topic, facts, key message, and hashtags. Completely change the writing structure.
- Keep the same language (${ctx.language}) and formality level (${ctx.formality})
- Keep the same tone: ${ctx.tone}
- Fix every AI tell listed above${input.qualityIssues?.length ? '\n- Address every quality issue listed above' : ''}
- If one of the AI tells is about formulaic structure, you MUST use a different post structure from the alternatives above

Return ONLY the rewritten post text. No explanations, no commentary.`,
      },
    ],
  })

  const text = extractTextFromMessage(message)
  return text ? text.trim() : input.caption
}

export async function rewriteCarousel(input: RewriteCarouselInput): Promise<RewriteCarouselResult> {
  const slidesText = input.slides.map((s, i) => `Slide ${i + 1}:\nHeadline: ${s.headline}\nBody: ${s.body}`).join('\n\n')

  const ctx = new WritingContext({
    niche: input.niche,
    targetAudience: input.targetAudience,
    formality: input.formality,
    tone: input.tone,
    clientTestimonialVoice: input.clientTestimonialVoice,
    language: input.language,
    bannedAnglicisms: input.bannedAnglicisms,
    bannedCalques: input.bannedCalques,
  })

  const systemText = buildStaticSystemPrompt()

  const clientProfile = buildClientProfile({
    ctx,
    platform: input.platform,
    clientName: input.clientName,
    contentPillars: input.contentPillars,
    avoidTopics: input.avoidTopics,
    isHealthClient: input.isHealthClient ?? undefined,
  })

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `${clientProfile}

CAROUSEL RULES:
- Make headlines punchy and specific, not generic — each must contain a number, tension, or named observation
- Mix sentence lengths in body text

Recent topics already covered — do not drift into: ${input.postHistory.slice(0, 15).join(' | ')}

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
- Keep the same language (${ctx.language}) and formality level (${ctx.formality})
- Keep the same tone: ${ctx.tone}
- Fix every AI tell listed above${input.qualityIssues?.length ? '\n- Address every quality issue listed above' : ''}
- If one of the AI tells is about formulaic structure, you MUST restructure the main caption using one of the alternatives above

Return JSON only, no markdown wrapper:
{
  "main_caption": "...",
  "slides": [{"headline": "...", "body": "..."}, ...]
}`,
      },
      { role: 'assistant', content: '{' },
    ],
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
