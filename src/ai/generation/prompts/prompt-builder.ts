import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { CarouselInput, SinglePostInput } from '../types'
import {
  buildClientBrief,
  buildLanguageRules,
  buildPlatformLimits,
  buildHealthRules,
} from '@/ai/shared/build-prompt-sections'
import { CAROUSEL_STRUCTURE_CHECKLIST } from '@/ai/validation/criteria'
import { buildGroundingPrompt } from './source-grounding'
import { sanitizePromptField } from '@/ai/utils/sanitize'
import { formatHistory, todayDateString } from '@/ai/utils/prompt-helpers'

/**
 * System prompt for single-post and carousel generation.
 */
export function buildGenerateSystemPrompt(
  client: ClientData,
  platform: string,
  targetPillar?: string,
): string {
  const sections = [
    `You are a social media copywriter writing for ${sanitizePromptField(client.name)}.`,
    buildClientBrief(client, platform, targetPillar),
    buildLanguageRules(client.languageConfig),
    buildPlatformLimits(platform),
    client.isHealthNiche ? buildHealthRules() : '',
  ]
  return sections.filter(Boolean).join('\n\n')
}

/**
 * User message for single-post generation.
 */
export function buildGenerateUserPrompt(input: SinglePostInput): string {
  const historyText = formatHistory(input.client.postHistory)

  return [
    buildGroundingPrompt({
      sourceExcerpt: input.sourceExcerpt,
      sourceFullText: input.sourceFullText,
      sourceUrl: input.sourceUrl,
      requireSourceGrounding: input.requireSourceGrounding,
      contentLabel: 'caption',
    }),

    input.brief
      ? `PRIORITY BRIEF:\n${sanitizePromptField(input.brief)}${input.targetDate ? `\nTarget publish date: ${input.targetDate}` : ''}`
      : '',

    historyText ? `Topics already covered — do not repeat: ${historyText}` : '',

    input.similarPastThemes?.length
      ? `Similar posts exist on: ${input.similarPastThemes.join(', ')}. Take a different angle.`
      : '',

    `Today's date: ${todayDateString()}`,

    `Write ${input.count} post(s) for theme "${sanitizePromptField(input.theme)}".
Base it on the source material. Keep it informative and relevant to ${sanitizePromptField(input.client.targetAudience)}.
Separate multiple posts with ---.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * User message for carousel generation.
 */
export function buildGenerateUserCarouselPrompt(input: CarouselInput): string {
  const historyText = formatHistory(input.client.postHistory)
  const rules = CAROUSEL_STRUCTURE_CHECKLIST.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')

  return [
    buildGroundingPrompt({
      sourceExcerpt: input.sourceExcerpt,
      sourceFullText: input.sourceFullText,
      sourceUrl: input.sourceUrl,
      requireSourceGrounding: input.requireSourceGrounding,
      contentLabel: 'caption',
    }),

    input.brief
      ? `PRIORITY BRIEF:\n${sanitizePromptField(input.brief)}${input.targetDate ? `\nTarget publish date: ${input.targetDate}` : ''}`
      : '',

    historyText ? `Topics already covered — do not repeat: ${historyText}` : '',

    input.similarPastThemes?.length
      ? `Similar posts exist on: ${input.similarPastThemes.join(', ')}. Take a different angle.`
      : '',

    `Today's date: ${todayDateString()}`,

    `Write a ${input.slideCount}-slide carousel for theme "${sanitizePromptField(input.theme)}".

CAROUSEL RULES:
${rules}
${input.client.languageConfig.carouselSwipeCues ? `- For the cover slide headline, use a swipe cue from: ${input.client.languageConfig.carouselSwipeCues}` : ''}

Base content on the source material. Each slide should teach something specific from the source.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}
