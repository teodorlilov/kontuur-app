import { callAnthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import { buildGenerateSystemPrompt, buildGenerateUserCarouselPrompt } from '@/ai/generation/prompts/prompt-builder'

import type { CarouselInput, CarouselResult } from '../types'

/** Output schema pinned to the requested slide count — the prompt asks for N, this enforces it. */
function buildCarouselOutputSchema(slideCount: number) {
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
          properties: {
            headline: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['headline', 'body'],
        },
      },
    },
    required: ['main_caption', 'slides'],
  }
}

/** Assign slide_number and slide_role from array position. */
function enrichSlides(slides: Array<{ headline: string; body: string }>): CarouselResult['slides'] {
  const roles: Array<'cover' | 'content' | 'cta'> = slides.map((_, i) =>
    i === 0 ? 'cover' : i === slides.length - 1 ? 'cta' : 'content'
  )
  return slides.map((s, i) => ({
    slide_number: i + 1,
    slide_role: roles[i],
    headline: s.headline,
    body: s.body,
  }))
}

export async function generateCarousel(
  input: CarouselInput,
  onToken?: (text: string) => void
): Promise<CarouselResult> {
  const systemPrompt = buildGenerateSystemPrompt(input.client, input.platform, input.targetPillar)
  const userMessage = buildGenerateUserCarouselPrompt(input)
  const outputSchema = buildCarouselOutputSchema(input.slideCount)

  const message = await callAnthropic({
    systemPrompt,
    userMessage,
    onToken,
    model: DEFAULT_MODEL,
    outputSchema,
    maxTokens: 4096,
  })
  const raw = extractToolInput<{ main_caption: string; slides: Array<{ headline: string; body: string }> }>(message, outputSchema)
  return { main_caption: raw.main_caption, slides: enrichSlides(raw.slides) }
}
