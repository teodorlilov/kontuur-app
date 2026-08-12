import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import { buildLanguageValidationRules } from '@/ai/validation/prompts/language-validation-rules'
import { QUALITY_MAX_TOKENS_PER_ITEM } from '@/ai/validation/prompts/prompt-builder'
import { buildContentSection } from '@/ai/validation/prompts/shared/content-section'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import type { LanguageIssue } from '@/ai/validation/types'
import type { SlideText } from '@/types/slide'

export interface LanguageFocusResult {
  issues: LanguageIssue[]
  corrected_text: string | null
  corrected_slides: SlideText[] | null
}
 
const ISSUE_SCHEMA = {
  type: 'object' as const,
  properties: {
    type: { type: 'string' },
    original_text: { type: 'string' },
    issue_description: { type: 'string' },
    suggested_fix: { type: 'string' },
  },
  required: ['type', 'original_text', 'issue_description', 'suggested_fix'],
}

/**
 * The focused native-proofreader pass, run ONLY for non-English clients and
 * merged over the main judge's language verdict.
 *
 * Exists because the evidence said so: the merged judge — eleven jobs in one
 * call — scored a caption containing a transliterated anglicism 10/10 with zero
 * language_issues, so nothing downstream (corrections, refine loop) ever fired.
 * This call has ONE job and the full checklist; the specialist's verdict wins
 * whenever the generalist saw nothing.
 */
export async function validateLanguageFocus(
  input: { caption: string; slides?: SlideText[] },
  languageConfig: LanguageConfig
): Promise<LanguageFocusResult> {
  const isCarousel = !!input.slides && input.slides.length > 0
  const { language, formality } = languageConfig

  const outputSchema = {
    type: 'object' as const,
    properties: {
      issues: { type: 'array', items: ISSUE_SCHEMA },
      corrected_text: { type: ['string', 'null'] },
      ...(isCarousel
        ? {
            corrected_slides: {
              type: ['array', 'null'],
              items: {
                type: 'object',
                properties: { headline: { type: 'string' }, body: { type: 'string' } },
                required: ['headline', 'body'],
              },
            },
          }
        : {}),
    },
    required: isCarousel ? ['issues', 'corrected_text', 'corrected_slides'] : ['issues', 'corrected_text'],
  }

  const systemPrompt = `You are a native ${language} editor and proofreader. Your ONLY job is language: be ruthless about naturalness and flag text that reads as translated from English even when grammatically correct. The standard: would a native ${language} speaker write this exact phrase on social media?

${buildLanguageValidationRules(languageConfig)}

Report every problem in "issues" with the exact offending phrase and its fix. "corrected_text" must be the fully corrected caption (null only when the caption needs no change).${isCarousel ? ' "corrected_slides" must contain ALL slides in their original order — the same count you were given — or null when no slide needs a change.' : ''}`

  const contentSection = buildContentSection(input.caption, input.slides, {
    singleTag: 'text_to_validate',
    singleIntro: '\nText:',
    captionTag: 'caption_to_validate',
    slidesTag: 'slides_to_validate',
    carouselIntro: '\nThe text below is a carousel post with a CAPTION and multiple SLIDES.',
  })

  const message = await callAnthropic({
    systemPrompt,
    userMessage: `${contentSection}\n\nLanguage: ${language}\nFormality: ${formality}`,
    // Same budget rule as the judge over the same payload: a carousel response
    // carries the corrected caption AND every corrected slide, so a flat
    // per-item cap truncates mid-tool-use exactly on the longest posts — and a
    // truncated focus pass throws, silently dropping back to judge-only.
    maxTokens: isCarousel ? QUALITY_MAX_TOKENS_PER_ITEM * 2 : QUALITY_MAX_TOKENS_PER_ITEM,
    model: LIGHT_MODEL,
    outputSchema,
    temperature: 0,
  })

  const parsed = extractToolInput<Partial<LanguageFocusResult>>(message, outputSchema)
  // The model echoes the checklist's uppercase category names; the score
  // weights and the stored-validation taxonomy are lowercase.
  const issues = (Array.isArray(parsed.issues) ? parsed.issues : []).map((i) => ({
    ...i,
    type: (i.type ?? '').toLowerCase() as LanguageIssue['type'],
  }))
  return {
    issues,
    corrected_text: parsed.corrected_text ?? null,
    corrected_slides: parsed.corrected_slides ?? null,
  }
}

/**
 * Merge the specialist's verdict over the generalist's: union of issues (the
 * specialist may catch what the merged judge missed and vice versa, deduped by
 * offending phrase), and the specialist's corrections win when present.
 *
 * Corrections may only be preferred this way because the caller runs the two
 * calls in sequence and hands the specialist the judge's corrected text (see
 * textForProofreader in validate-post.ts). The specialist's rewrite is therefore
 * the judge's factual fixes plus language polish, not a competing version. Run
 * these in parallel again and this rule silently discards every factual
 * correction the judge made.
 */
export function mergeLanguageVerdicts(
  fromJudge: {
    issues: LanguageIssue[]
    corrected_text: string | null
    corrected_slides?: SlideText[] | null
  },
  fromFocus: LanguageFocusResult | null
): {
  issues: LanguageIssue[]
  corrected_text: string | null
  corrected_slides: SlideText[] | null
} {
  if (!fromFocus) {
    return {
      issues: fromJudge.issues,
      corrected_text: fromJudge.corrected_text,
      corrected_slides: fromJudge.corrected_slides ?? null,
    }
  }
  const seen = new Set(fromFocus.issues.map((i) => i.original_text))
  const issues = [...fromFocus.issues, ...fromJudge.issues.filter((i) => !seen.has(i.original_text))]
  return {
    issues,
    corrected_text: fromFocus.corrected_text ?? fromJudge.corrected_text,
    corrected_slides: fromFocus.corrected_slides ?? fromJudge.corrected_slides ?? null,
  }
}
