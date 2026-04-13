import { callAnthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import { buildGenerateSystemPrompt, buildGenerateUserCarouselPrompt } from '@/ai/generation/prompts/prompt-builder'

import type { CarouselInput, CarouselResult } from '../types'

export async function generateCarousel(
  input: CarouselInput,
  onToken?: (text: string) => void
): Promise<CarouselResult> {
  const systemPrompt = buildGenerateSystemPrompt(input.client, input.platform, input.targetPillar)
  const userMessage = buildGenerateUserCarouselPrompt(input)

  const message = await callAnthropic({ systemPrompt, userMessage, onToken, model: DEFAULT_MODEL })
  return parseJsonResponse<CarouselResult>(message)
}
