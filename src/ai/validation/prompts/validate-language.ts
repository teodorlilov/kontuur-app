import { callAnthropic } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import { buildLanguageValidationRules } from '@/ai/validation/prompts/language-validation-rules'
import { computeLanguageScore } from '@/ai/validation/content-rules/compute-scores'
import type { LanguageConfig } from '@/lib/clients/language-rules'

export interface LanguageIssue {
  type: 'anglicism' | 'calque' | 'grammar' | 'formality' | 'register' | 'mixed_script' | 'vocabulary'
  original_text: string
  issue_description: string
  suggested_fix: string
}

export interface LanguageValidationResult {
  passes: boolean
  language_score: number
  issues: LanguageIssue[]
  corrected_text: string | null
  corrected_slides?: Array<{ headline: string; body: string }> | null
}

/** Raw LLM response shape — internal to this module. */
interface LlmLanguageResponse {
  issues: LanguageIssue[]
  corrected_text: string | null
  corrected_slides?: Array<{ headline: string; body: string }> | null
}

export async function validateLanguage(
  input: {
    text: string
    slides?: Array<{ headline: string; body: string }>
  },
  languageConfig: LanguageConfig,
): Promise<LanguageValidationResult> {
  const { language, formality } = languageConfig
  const rules = buildLanguageValidationRules(languageConfig)
  const isCarousel = input.slides && input.slides.length > 0

  const persona = `You are a native ${language} language editor and proofreader. Be ruthless about naturalness — flag text that sounds translated from English even if it is technically grammatically correct. Your standard is: would a native ${language} speaker write this exact phrase on social media?`

  const instructions = `
YOUR TASK: Detect all language issues and provide corrections. Do NOT assign a score — only find issues.

For every issue found, provide:
- type: the issue category
- original_text: the exact problematic phrase
- issue_description: what is wrong
- suggested_fix: the corrected version

If ANY issues are found, provide a corrected version of the full text with all fixes applied.`

  let contentSection: string
  let returnFormat: string

  if (isCarousel) {
    const slidesText = input.slides!
      .map((s, i) => `[SLIDE ${i + 1}]\nHeadline: ${s.headline}\nBody: ${s.body}`)
      .join('\n\n')

    contentSection = `
The text below is a carousel post with a CAPTION and multiple SLIDES.

[CAPTION]
<caption_to_validate>
${input.text}
</caption_to_validate>

<slides_to_validate>
${slidesText}
</slides_to_validate>`

    returnFormat = `{
  "issues": [{
    "type": "anglicism" | "calque" | "grammar" | "formality" | "register" | "mixed_script" | "vocabulary",
    "original_text": string,
    "issue_description": string,
    "suggested_fix": string
  }],
  "corrected_text": string | null (corrected CAPTION only, null if caption has no issues),
  "corrected_slides": [{
    "headline": string,
    "body": string
  }] | null (corrected slides array with ALL slides — each slide corrected — null if slides have no issues)
}

IMPORTANT: "corrected_text" must contain ONLY the corrected caption, NOT the slide text. "corrected_slides" must contain ALL slides in order, each with corrected headline and body.`
  } else {
    contentSection = `
Text:
<text_to_validate>
${input.text}
</text_to_validate>`

    returnFormat = `{
  "issues": [{
    "type": "anglicism" | "calque" | "grammar" | "formality" | "register" | "mixed_script" | "vocabulary",
    "original_text": string,
    "issue_description": string,
    "suggested_fix": string
  }],
  "corrected_text": string | null (full corrected text if any issues found, null if no issues)
}`
  }

  // Static instructions — persona + rules cached; content is dynamic
  const systemText = `${persona}

${rules}
${instructions}`

  const message = await callAnthropic({
    systemPrompt: systemText,
    userMessage: `${contentSection}

Language: ${language}
Formality: ${formality}

Return JSON only:
${returnFormat}`,
    maxTokens: 2048,
  })

  const parsed = parseJsonResponse<LlmLanguageResponse>(message)
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
