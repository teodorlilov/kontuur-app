import { callAnthropic } from '@/utils/ai-client'
import { extractTextFromMessage, extractToolInput } from '@/utils/ai'
import { buildGenerateSystemPrompt } from '@/ai/generation/prompts/prompt-builder'
import { formatHistory } from '@/ai/utils/prompt-helpers'
import type { RewriteCaptionInput, RewriteCarouselInput, RewriteCarouselResult } from '../types'

export async function rewriteCaption(input: RewriteCaptionInput): Promise<string> {
  const { client } = input
  const lc = client.languageConfig

  const message = await callAnthropic({
    systemPrompt: buildGenerateSystemPrompt(client, input.platform),
    userMessage: `Recent topics already covered — do not drift into: ${formatHistory(client.postHistory, { limit: 15 })}

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
- If one of the AI tells is about formulaic structure, you MUST use a different post structure

OPENER — the most important line. Choose whatever stops scrolling for this specific theme and register.
NEVER bury the lead — start with the payoff, not the context.

SELF-CHECK before returning:
- Does the opener make someone stop scrolling? If not — rewrite it.
- Could this post be written about any business in the niche? If yes — add specificity.
- Read the post aloud as if speaking to a person. Any sentence that sounds like a written report or consultant memo must be rewritten in spoken language.

Return ONLY the rewritten post text. No explanations, no commentary.`,
  })

  const text = extractTextFromMessage(message)
  return text ? text.trim() : input.caption
}

export async function rewriteCarousel(input: RewriteCarouselInput): Promise<RewriteCarouselResult> {
  const slidesText = input.slides
    .map((s, i) => {
      const role = (s as Record<string, unknown>).slide_role
      const cta = (s as Record<string, unknown>).cta_text
      let text = `Slide ${i + 1}${role ? ` (${role})` : ''}:\nHeadline: ${s.headline}\nBody: ${s.body}`
      if (cta) text += `\nCTA: ${cta}`
      return text
    })
    .join('\n\n')

  const { client } = input
  const lc = client.languageConfig

  const message = await callAnthropic({
    systemPrompt: buildGenerateSystemPrompt(client, input.platform),
    userMessage: `Recent topics already covered — do not drift into: ${formatHistory(client.postHistory, { limit: 15 })}

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
- If one of the AI tells is about formulaic structure, you MUST restructure the main caption
- Make headlines punchy and specific — each must name a specific mechanism, condition, technology, or result

SELF-CHECK before returning:
- Does the opener make someone stop scrolling? If not — rewrite it.
- Could this post be written about any business in the niche? If yes — add specificity.
- Read each slide aloud. Any sentence that sounds like a written report must be rewritten in spoken language.`,
    outputSchema: {
      type: 'object' as const,
      properties: {
        main_caption: { type: 'string' },
        slides: {
          type: 'array',
          minItems: input.slides.length,
          maxItems: input.slides.length,
          items: {
            type: 'object',
            properties: { headline: { type: 'string' }, body: { type: 'string' } },
            required: ['headline', 'body'],
          },
        },
      },
      required: ['main_caption', 'slides'],
    },
  })

  return extractToolInput<RewriteCarouselResult>(message)
}
