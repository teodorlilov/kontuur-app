import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { CarouselInput, SinglePostInput } from '../types'
import {
  buildClientBrief,
  buildLanguageRules,
  buildPlatformLimits,
  buildHealthRules,
  buildQualityBar,
} from '@/ai/shared/build-prompt-sections'
import { carouselStructureRules } from '@/ai/validation/criteria'
import { buildGroundingPrompt } from './source-grounding'
import { sanitizePromptField } from '@/ai/utils/sanitize'
import { formatHistory, todayDateString } from '@/ai/utils/prompt-helpers'

/**
 * System prompt for single-post and carousel generation.
 * Run-invariant per client+platform so concurrent calls share one cached prefix.
 */
export function buildGenerateSystemPrompt(client: ClientData, platform: string): string {
  const sections = [
    `You are a social media copywriter writing for ${sanitizePromptField(client.name)}.`,
    buildClientBrief(client, platform),
    buildLanguageRules(client.languageConfig),
    buildPlatformLimits(platform),
    buildQualityBar(),
    client.isHealthNiche ? buildHealthRules() : '',
  ]
  return sections.filter(Boolean).join('\n\n')
}

/** Per-theme pillar line — lives in the user turn to keep the system prefix cacheable. */
function buildPillarLine(targetPillar?: string): string {
  return targetPillar ? `This post targets pillar: ${sanitizePromptField(targetPillar)}` : ''
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
      ? `PRIORITY BRIEF:\n${sanitizePromptField(input.brief)}${input.targetDate ? `\nTarget publish date: ${sanitizePromptField(input.targetDate)}` : ''}`
      : '',

    historyText ? `Topics already covered — do not repeat: ${historyText}` : '',

    input.similarPastThemes?.length
      ? `Similar posts exist on: ${input.similarPastThemes.join(', ')}. Take a different angle.`
      : '',

    buildPillarLine(input.targetPillar),

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
  const rules = carouselStructureRules(input.slideCount).map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')

  return [
    buildGroundingPrompt({
      sourceExcerpt: input.sourceExcerpt,
      sourceFullText: input.sourceFullText,
      sourceUrl: input.sourceUrl,
      requireSourceGrounding: input.requireSourceGrounding,
      contentLabel: 'caption',
    }),

    input.brief
      ? `PRIORITY BRIEF:\n${sanitizePromptField(input.brief)}${input.targetDate ? `\nTarget publish date: ${sanitizePromptField(input.targetDate)}` : ''}`
      : '',

    historyText ? `Topics already covered — do not repeat: ${historyText}` : '',

    input.similarPastThemes?.length
      ? `Similar posts exist on: ${input.similarPastThemes.join(', ')}. Take a different angle.`
      : '',

    buildPillarLine(input.targetPillar),

    `Today's date: ${todayDateString()}`,

    `Write a carousel with EXACTLY ${input.slideCount} slides for theme "${sanitizePromptField(input.theme)}".

CAROUSEL RULES:
${rules}
${input.client.languageConfig.carouselSwipeCues ? `- Cover slide: work a swipe cue from (${input.client.languageConfig.carouselSwipeCues}) INTO THE HEADLINE — the cover slide never has body text.` : ''}

Base content on the source material. Each slide should teach something specific from the source.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}
