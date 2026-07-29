import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import { buildLanguageValidationRules } from '@/ai/validation/prompts/language-validation-rules'
import { computeLanguageScore } from '@/ai/validation/content-rules/compute-scores'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import type { LanguageIssue, LanguageValidationResult } from '@/ai/validation/types'
import { buildContentSection } from '@/ai/validation/prompts/shared/content-section'

// Re-export types for existing consumers
export type { LanguageIssue, LanguageValidationResult }

/** Raw LLM response shape — internal to this module. */
interface LlmLanguageResponse {
  issues: LanguageIssue[]
  corrected_text: string | null
  corrected_slides?: Array<{ headline: string; body: string }> | null
}

/** Shared persona + task instructions — run-invariant per language config (cacheable prefix). */
function buildLanguageSystemPrompt(languageConfig: LanguageConfig): string {
  const { language } = languageConfig
  const rules = buildLanguageValidationRules(languageConfig)

  const persona = `You are a native ${language} language editor and proofreader. Be ruthless about naturalness — flag text that sounds translated from English even if it is technically grammatically correct. Your standard is: would a native ${language} speaker write this exact phrase on social media?`

  const instructions = `
YOUR TASK: Detect all language issues and provide corrections. Do NOT assign a score — only find issues.

For every issue found, provide:
- type: the issue category
- original_text: the exact problematic phrase
- issue_description: what is wrong
- suggested_fix: the corrected version

If ANY issues are found, provide a corrected version of the full text with all fixes applied.`

  return `${persona}\n\n${rules}\n${instructions}`
}

const LANGUAGE_ISSUE_SCHEMA = {
  type: 'object' as const,
  properties: {
    type: { type: 'string' },
    original_text: { type: 'string' },
    issue_description: { type: 'string' },
    suggested_fix: { type: 'string' },
  },
  required: ['type', 'original_text', 'issue_description', 'suggested_fix'],
}

export async function validateLanguage(
  input: {
    text: string
    slides?: Array<{ headline: string; body: string }>
  },
  languageConfig: LanguageConfig
): Promise<LanguageValidationResult> {
  const { language, formality } = languageConfig
  const isCarousel = input.slides && input.slides.length > 0

  const contentSection = buildContentSection(input.text, input.slides, {
    singleTag: 'text_to_validate',
    singleIntro: '\nText:',
    captionTag: 'caption_to_validate',
    slidesTag: 'slides_to_validate',
    carouselIntro: '\nThe text below is a carousel post with a CAPTION and multiple SLIDES.',
  })

  const correctedSlideSchema = {
    type: 'object' as const,
    properties: { headline: { type: 'string' }, body: { type: 'string' } },
    required: ['headline', 'body'],
  }

  const outputSchema = {
    type: 'object' as const,
    properties: {
      issues: { type: 'array', items: LANGUAGE_ISSUE_SCHEMA },
      corrected_text: { type: ['string', 'null'] },
      ...(isCarousel
        ? { corrected_slides: { type: ['array', 'null'], items: correctedSlideSchema } }
        : {}),
    },
    required: isCarousel
      ? ['issues', 'corrected_text', 'corrected_slides']
      : ['issues', 'corrected_text'],
  }

  const carouselNotes = isCarousel
    ? `\nIMPORTANT: "corrected_text" must contain ONLY the corrected caption. "corrected_slides" must contain ALL slides in order (null if slides have no issues).`
    : ''

  const message = await callAnthropic({
    systemPrompt: buildLanguageSystemPrompt(languageConfig) + carouselNotes,
    userMessage: `${contentSection}

Language: ${language}
Formality: ${formality}`,
    maxTokens: 2048,
    model: LIGHT_MODEL,
    outputSchema,
    temperature: 0,
  })

  const parsed = extractToolInput<LlmLanguageResponse>(message)
  const issues = Array.isArray(parsed.issues) ? parsed.issues : []
  const { language_score, passes } = computeLanguageScore({ issues })

  return {
    passes,
    language_score,
    issues,
    corrected_text: parsed.corrected_text ?? null,
    ...(parsed.corrected_slides !== undefined ? { corrected_slides: parsed.corrected_slides } : {}),
  }
}

// Output budget per batched text — issues + corrected_text, no slides
const LANGUAGE_MAX_TOKENS_PER_ITEM = 1024
const LANGUAGE_BATCH_MAX_TOKENS = 6144

/**
 * Validate N single-post texts in one call (no slides — batch path is single-posts only).
 * Returns one result per text, matched by index; missing entries degrade to pass-through.
 */
export async function validateLanguageBatch(
  texts: string[],
  languageConfig: LanguageConfig
): Promise<LanguageValidationResult[]> {
  const { language, formality } = languageConfig

  const outputSchema = {
    type: 'object' as const,
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            issues: { type: 'array', items: LANGUAGE_ISSUE_SCHEMA },
            corrected_text: { type: ['string', 'null'] },
          },
          required: ['index', 'issues', 'corrected_text'],
        },
      },
    },
    required: ['results'],
  }

  const numbered = texts
    .map((text, i) => `<text_to_validate index="${i + 1}">\n${text}\n</text_to_validate>`)
    .join('\n\n')

  const message = await callAnthropic({
    systemPrompt: buildLanguageSystemPrompt(languageConfig),
    userMessage: `Validate each of the ${texts.length} texts below INDEPENDENTLY. Return one results entry per text, matched by index.

${numbered}

Language: ${language}
Formality: ${formality}`,
    maxTokens: Math.min(LANGUAGE_MAX_TOKENS_PER_ITEM * texts.length, LANGUAGE_BATCH_MAX_TOKENS),
    model: LIGHT_MODEL,
    outputSchema,
    temperature: 0,
  })

  const parsed = extractToolInput<{
    results?: Array<{ index?: number; issues?: LanguageIssue[]; corrected_text?: string | null }>
  }>(message)

  // Pass-through default: an unreported slot means "no issues found"
  const results: LanguageValidationResult[] = texts.map(() => ({
    passes: true,
    language_score: 10,
    issues: [],
    corrected_text: null,
  }))

  for (const item of parsed.results ?? []) {
    if (typeof item.index !== 'number') continue
    const slot = item.index - 1
    if (slot < 0 || slot >= results.length) continue
    const issues = Array.isArray(item.issues) ? item.issues : []
    const { language_score, passes } = computeLanguageScore({ issues })
    results[slot] = {
      passes,
      language_score,
      issues,
      corrected_text: item.corrected_text ?? null,
    }
  }

  return results
}
