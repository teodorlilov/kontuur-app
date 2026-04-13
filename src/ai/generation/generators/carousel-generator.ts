import { callAnthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import { buildGenerateSystemPrompt, buildGenerateUserCarouselPrompt } from '@/ai/generation/prompts/prompt-builder'

import type { CarouselInput, CarouselResult } from '../types'

const CAROUSEL_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    main_caption: { type: 'string' },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slide_number: { type: 'number' },
          slide_role: { type: 'string' },
          headline: { type: 'string' },
          body: { type: 'string' },
          cta_text: { type: ['string', 'null'] },
          design_note: { type: 'string' },
        },
        required: ['slide_number', 'slide_role', 'headline', 'body', 'cta_text', 'design_note'],
      },
    },
  },
  required: ['main_caption', 'slides'],
}

export async function generateCarousel(
  input: CarouselInput,
  onToken?: (text: string) => void
): Promise<CarouselResult> {
  const systemPrompt = buildGenerateSystemPrompt(input.client, input.platform, input.targetPillar)
  const userMessage = buildGenerateUserCarouselPrompt(input)

  const message = await callAnthropic({
    systemPrompt,
    userMessage,
    onToken,
    model: DEFAULT_MODEL,
    outputSchema: CAROUSEL_OUTPUT_SCHEMA,
  })
  return extractToolInput<CarouselResult>(message)
}
