import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { PostType } from '@/types/api'
import type { CarouselInput, SinglePostInput } from '../types'
import {
  buildClientBrief,
  buildLanguageRules,
  buildNativeWritingRules,
  buildPlatformLimits,
  buildHealthRules,
  buildQualityBar,
} from '@/ai/shared/build-prompt-sections'
import { carouselStructureRules } from '@/ai/validation/criteria'
import { buildGroundingPrompt, selectGroundingText } from './source-grounding'
import { DEFENSIVE_DATA_CLAUSE, sanitizePromptField } from '@/ai/utils/sanitize'
import { formatHistory, todayDateString } from '@/ai/utils/prompt-helpers'

/**
 * The heading that opens the exemplar section. Exported for the prompt tests:
 * instruction invariants (e.g. "the single prompt never says carousel") must be
 * asserted on the text BEFORE this marker, because everything after it is
 * client-approved caption text that may legally contain any word.
 */
export const VOICE_SECTION_MARKER = 'VOICE — captions this client approved.'

/**
 * Approved posts as style demonstrations — models imitate examples far better
 * than they follow rules, so this section, not the rule sections, is what
 * carries the client's voice. Exemplar text is verbatim client-approved copy:
 * never sanitized, never truncated mid-caption (bounds live in the fetcher).
 */
function buildVoiceSection(client: ClientData, format: PostType): string {
  const bank = client.exemplars
  if (!bank) return ''
  if (format === 'carousel') {
    if (bank.carousel.length === 0) return ''
    const items = bank.carousel
      .map(
        (e, i) =>
          `Example ${i + 1} — cover headline: ${e.coverHeadline || '(none stored)'}\nCaption:\n${e.caption}`
      )
      .join('\n\n')
    return `${VOICE_SECTION_MARKER} Match their rhythm, register and vocabulary; do NOT copy their topics or claims:\n\n${items}`
  }
  if (bank.single.length === 0) return ''
  const items = bank.single.map((caption, i) => `Example ${i + 1}:\n${caption}`).join('\n\n')
  return `${VOICE_SECTION_MARKER} Match their rhythm, register and vocabulary; do NOT copy their topics or claims:\n\n${items}`
}

/** Same test-boundary role as VOICE_SECTION_MARKER — memo rules are derived text. */
export const LEARNED_SECTION_MARKER = "LEARNED FROM THIS CLIENT'S REVIEWS"

/**
 * Rules the engine distilled from this client's review history — what their
 * reviewer keeps correcting. Writer-only by design: the judge stays independent
 * of the memo so it can catch a bad memo rather than grade compliance with it.
 */
function buildLearnedSection(client: ClientData): string {
  const memo = client.styleMemo
  if (!memo || memo.length === 0) return ''
  return `${LEARNED_SECTION_MARKER} — recurring corrections; do not repeat these mistakes:
${memo.map((rule) => `- ${rule}`).join('\n')}`
}

/**
 * System prompt for single-post and carousel generation.
 * Run-invariant per client+platform+format so concurrent calls share one cached
 * prefix. Format is part of the key because the quality bar phrases its hook and
 * CTA rules per format — carousel instructions in a single-post prompt taught
 * the writer to emit slide structure as caption text. Exemplars and the learned
 * memo are per-client data fetched once per run, so they keep the prefix stable.
 */
export function buildGenerateSystemPrompt(
  client: ClientData,
  platform: string,
  format: PostType
): string {
  const sections = [
    `You are a social media copywriter writing for ${sanitizePromptField(client.name)}.

${DEFENSIVE_DATA_CLAUSE}`,
    buildClientBrief(client, platform),
    buildLanguageRules(client.languageConfig),
    buildNativeWritingRules(client.languageConfig),
    buildPlatformLimits(platform),
    buildQualityBar(format),
    client.isHealthNiche ? buildHealthRules() : '',
    // Last on purpose: everything above is instructions the tests pin;
    // everything from the VOICE marker on is client-derived text (approved
    // captions, distilled rules) with no wording invariants.
    buildVoiceSection(client, format),
    buildLearnedSection(client),
  ]
  return sections.filter(Boolean).join('\n\n')
}

/** Per-theme pillar line — lives in the user turn to keep the system prefix cacheable. */
function buildPillarLine(targetPillar?: string): string {
  return targetPillar ? `This post targets pillar: ${sanitizePromptField(targetPillar)}` : ''
}

/**
 * The client's own request, rendered identically for both formats. Declared
 * authoritative because the theme and source arrive from the planner, which can
 * drift off the request when no gathered source covers it — the writer is the
 * last chance to honor the client's actual words.
 */
function buildPriorityBriefBlock(input: { brief?: string; targetDate?: string }): string {
  if (!input.brief) return ''
  const dateLine = input.targetDate
    ? `\nTarget publish date: ${sanitizePromptField(input.targetDate)}`
    : ''
  return `PRIORITY BRIEF — the client asked for this post in their own words below. The post MUST deliver on this request; if the theme or source material points elsewhere, this request wins:
${sanitizePromptField(input.brief)}${dateLine}`
}

/**
 * User message for single-post generation.
 */
export function buildGenerateUserPrompt(input: SinglePostInput): string {
  const historyText = formatHistory(input.client.postHistory)

  return [
    buildGroundingPrompt({
      ...selectGroundingText(input, input.client.languageConfig.language, 'single'),
      sourceUrl: input.sourceUrl,
      contentLabel: 'caption',
    }),

    buildPriorityBriefBlock(input),

    historyText ? `Topics already covered — do not repeat: ${historyText}` : '',

    input.similarPastThemes?.length
      ? `Similar posts exist on: ${input.similarPastThemes.join(', ')}. Take a different angle.`
      : '',

    buildPillarLine(input.targetPillar),

    `Today's date: ${todayDateString()}`,

    `Write ${input.count} single-image post caption(s) for theme "${sanitizePromptField(input.theme)}".
Base it on the source material. Keep it informative and relevant to ${sanitizePromptField(input.client.targetAudience)}.
Each caption is the plain text of ONE post — no markdown syntax, no headings, no slide structure or SLIDE/Cover labels.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * The follow-up turn of the bounded refine loop: the writer sees its own draft
 * (replayed via conversationHistory so the cached system prefix is reused) and
 * a list of validation failures a judge text-fix cannot repair — structure
 * violations, or flagged language issues the judge broke contract on.
 */
export function buildRevisionPrompt(notes: string[]): string {
  return `Your draft above failed validation. Return the corrected post in full, fixing EVERY issue listed — change only what the issues require and keep the topic, facts and voice.

ISSUES TO FIX:
${notes.map((n) => `- ${n}`).join('\n')}`
}

/**
 * User message for carousel generation.
 */
export function buildGenerateUserCarouselPrompt(input: CarouselInput): string {
  const historyText = formatHistory(input.client.postHistory)
  const rules = carouselStructureRules(input.slideCount).map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')

  return [
    buildGroundingPrompt({
      ...selectGroundingText(input, input.client.languageConfig.language, 'carousel'),
      sourceUrl: input.sourceUrl,
      contentLabel: 'caption',
    }),

    buildPriorityBriefBlock(input),

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
