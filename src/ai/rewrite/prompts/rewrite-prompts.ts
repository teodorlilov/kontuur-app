import { callAnthropic } from '@/utils/ai-client'
import { extractTextFromMessage, extractToolInput } from '@/utils/ai'
import { buildGenerateSystemPrompt } from '@/ai/generation/prompts/prompt-builder'
import { buildAiTells } from '@/ai/shared/build-prompt-sections'
import { formatHistory } from '@/ai/utils/prompt-helpers'
import { stripMarkdownArtifacts } from '@/ai/utils/sanitize'
import type { RewriteCaptionInput, RewriteCarouselInput, RewriteCarouselResult } from '../types'

export async function rewriteCaption(input: RewriteCaptionInput): Promise<string> {
  const { client } = input
  const lc = client.languageConfig

  const message = await callAnthropic({
    systemPrompt: buildGenerateSystemPrompt(client, input.platform, 'single') + '\n\n' + buildAiTells(lc.language),
    userMessage: `Recent topics already covered — do not drift into: ${formatHistory(client.postHistory, { limit: 15 })}

ORIGINAL POST:
<post_to_rewrite>
${input.caption}
</post_to_rewrite>

AI PROBLEMS DETECTED:
${input.aiTells.map((t) => `- ${t}`).join('\n')}
${input.qualityIssues?.length ? `\nQUALITY ISSUES TO ADDRESS:\n${input.qualityIssues.map((i) => `- ${i}`).join('\n')}` : ''}

YOUR TASK:
Rewrite this post so it reads as written by a real person who knows this business deeply. Keep the same topic, facts, and key message. Completely change the writing structure.
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
  return text ? stripMarkdownArtifacts(text.trim()) : input.caption
}

/**
 * Output schema pinned to the draft's slide count. Named rather than inline so the
 * same object reaches `extractToolInput`, which needs it to repair an array the
 * model returned as a JSON-encoded string.
 */
function buildRewriteOutputSchema(slideCount: number) {
  return {
    type: 'object' as const,
    properties: {
      main_caption: { type: 'string' },
      slides: {
        type: 'array',
        minItems: slideCount,
        maxItems: slideCount,
        items: {
          type: 'object',
          properties: { headline: { type: 'string' }, body: { type: 'string' } },
          required: ['headline', 'body'],
        },
      },
    },
    required: ['main_caption', 'slides'],
  }
}

export async function rewriteCarousel(input: RewriteCarouselInput): Promise<RewriteCarouselResult> {
  const slidesText = input.slides
    .map((s, i) => `Slide ${i + 1}:\nHeadline: ${s.headline}\nBody: ${s.body}`)
    .join('\n\n')

  const outputSchema = buildRewriteOutputSchema(input.slides.length)

  const { client } = input
  const lc = client.languageConfig

  const message = await callAnthropic({
    systemPrompt: buildGenerateSystemPrompt(client, input.platform, 'carousel') + '\n\n' + buildAiTells(lc.language),
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
    outputSchema,
  })

  const raw = extractToolInput<Partial<RewriteCarouselResult>>(message, outputSchema)
  // Same unenforced-schema guard the carousel generator carries: a truncated tool
  // call can omit either field, and mapping over the missing one threw a TypeError
  // that surfaced to the reviewer as a bare "rewrite failed".
  if (typeof raw.main_caption !== 'string' || !Array.isArray(raw.slides)) {
    throw new Error('rewriteCarousel: model returned an incomplete carousel')
  }
  return {
    main_caption: stripMarkdownArtifacts(raw.main_caption),
    slides: raw.slides.map((s) => ({
      headline: stripMarkdownArtifacts(s.headline ?? ''),
      body: stripMarkdownArtifacts(s.body ?? ''),
    })),
  }
}
