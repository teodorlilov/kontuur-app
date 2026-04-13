import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { CarouselInput, SinglePostInput } from '../types'
import {
  buildClientProfileSection,
  buildLanguageRulesSection,
  buildAiTellsSection,
  buildPostStructuresSection,
  buildPlatformLimitsSection,
  buildHealthRulesSection,
  buildAngleVariationPrompt,
} from '@/ai/shared/build-client-profile'
import { buildGroundingPrompt } from './source-grounding'
import { sanitizePromptField, sanitizePromptArray } from '@/ai/utils/sanitize'
import { formatHistory, todayDateString } from '@/ai/utils/prompt-helpers'

/**
 * System prompt for single-post and carousel generation.
 * Contains stable client context (profile, language rules, AI tells, platform limits).
 * Built once per generation call — keeps the user message lean and theme-focused.
 */
export function buildGenerateSystemPrompt(
  client: ClientData,
  platform: string,
  targetPillar?: string,
): string {
  const lc = client.languageConfig

  const sections = [
    `You are a senior social media copywriter.`,

    `WRITING RULES:
1. Language register rules below are non-negotiable 

  ${buildLanguageRulesSection(lc)}
2. Every claim must be grounded in what this specific business does.`,

    //Post Structure
    buildPostStructuresSection(),

    //Client Profile
    buildClientProfileSection(client, platform, targetPillar),

   
    //AI tells
    buildAiTellsSection(lc.language),

    (client.topPerformingPosts?.length ?? 0) > 0
      ? `PERFORMANCE REFERENCE — posts scored above 7.5. Match their standard, do not copy:\n<reference_posts>\n${sanitizePromptArray(client.topPerformingPosts!).map((p) => `<post>${p}</post>`).join('\n')}\n</reference_posts>`
      : '',

    //Platform Limitation
    buildPlatformLimitsSection(platform),

    //Health related client
    client.isHealthNiche ? buildHealthRulesSection() : '',
  ]

  return sections.filter(Boolean).join('\n\n')
}

/**
 * User message for single-post generation.
 * Contains only theme-specific context: grounding, brief, history, angle variation, directive.
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
      ? `PRIORITY BRIEF (overrides creative latitude):\n${sanitizePromptField(input.brief)}${input.targetDate ? `\nTarget publish date: ${input.targetDate}` : ''}`
      : '',

    historyText ? `Topics already covered — do not repeat: ${historyText}` : '',

    buildAngleVariationPrompt(input.similarPastThemes ?? []),

    `Today's date: ${todayDateString()}`,

    `Before writing, verify:
- Does the opener stop scrolling for this specific theme? If not, rewrite it.
- Could this post be for any ${sanitizePromptField(input.client.niche)} business? If yes, add a specific detail only ${sanitizePromptField(input.client.name)} could claim.
- Does it focus on ONE angle, not a summary?

Write ${input.count} post(s) for theme '${sanitizePromptField(input.theme)}'.
Declare the structure: [STRUCTURE: name]
Then write the post immediately after.
Separate multiple posts with ---.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function buildGenerateUserCarouselPrompt(input: CarouselInput): string {
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
      ? `PRIORITY BRIEF (overrides creative latitude):\n${sanitizePromptField(input.brief)}${input.targetDate ? `\nTarget publish date: ${input.targetDate}` : ''}`
      : '',

    historyText ? `Topics already covered — do not repeat: ${historyText}` : '',

    buildAngleVariationPrompt(input.similarPastThemes ?? []),

    `Today's date: ${todayDateString()}`,

    `Before writing, verify:
- Does the opener stop scrolling for this specific theme? If not, rewrite it.
- Could this post be for any ${sanitizePromptField(input.client.niche)} business? If yes, add a specific detail only ${sanitizePromptField(input.client.name)} could claim.
- Does the content cover a meaningful aspect of what the source says about who this helps, how it works, or what result it delivers — rather than drilling into mechanism sub-details across every slide?
- REGISTER: Does every slide maintain ${input.client.languageConfig.formality} address? Scan each slide body for first-person plural verbs ("we treat", "we help", "we use"). Replace with the patient's direct experience ("you feel", "your body"), the process impersonally ("the therapy", "this method"), or an impersonal result statement.
- BRAND VOICE: Does every slide match the declared tone? Generic industry phrases that any competitor in this niche could use will fail validation if the client's voice is evidence-based or authoritative. Replace with specific mechanisms, concrete results, data points, or observations unique to this client.

CAROUSEL-SPECIFIC RULES:
SLIDE STRUCTURE:
- Slide 1 (Cover): Bold hook headline only. Opens a loop the reader must swipe to resolve. No body text.
- Slides 2 to ${input.slideCount - 2}: One distinct idea per slide. Headline + 2-3 sentence body. Self-contained.
- Slide ${input.slideCount - 1}: Value/payoff slide. Emotional or informational peak.
- Slide ${input.slideCount} (Last): CTA only. Low-pressure. Include button text suggestion.

SLIDE HEADLINE RULES:
Every headline must name the specific mechanism, condition, technology, or result.
NEVER use topic labels or empty positives.

SLIDE BODY RULES:
Body text must add NEW information beyond the headline. Never explain the headline — extend it.
Minimum 2 sentences per content slide.
Each slide covers a DISTINCT idea — check all prior slides before writing the next.

REGISTER CONSISTENCY (${input.client.languageConfig.formality.toUpperCase()} throughout):
Language register rules from the system prompt apply to every individual slide. When describing what the service or treatment does, do NOT use first-person plural ("we", "our team", "we treat"). Use impersonal constructions ("the therapy", "this method", "the treatment") or direct address ("you feel", "your body recovers") instead.

MAIN CAPTION: 40–60 words. One sharp hook sentence + one bridging sentence + hashtags. Tease the core insight without revealing all slides.

Theme: ${sanitizePromptField(input.theme)}
You MUST return exactly ${input.slideCount} slides.

FOR EACH SLIDE: provide a design note (1-2 sentences) for Canva. For the cover slide, suggest a swipe cue overlay text from: ${input.client.languageConfig.carouselSwipeCues}
`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

