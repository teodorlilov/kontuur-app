import { callAnthropic } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import {
  computeQualityScores,
  safeParseHookVerdict,
  safeParseCtaVerdict,
} from '@/ai/validation/content-rules/compute-scores'
import {
  formatIssueTypes,
  formatHookVerdicts,
  formatCtaVerdicts,
  buildCriteriaChecklist,
} from '@/ai/validation/content-rules/validation-criteria'
import { buildClientProfileSection } from '@/ai/shared/build-client-profile'
import { formatAiTells } from '@/ai/shared/content-criteria'
import { buildContentSection } from '@/ai/validation/prompts/shared/content-section'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type {
  QualityIssue,
  QualityScores,
  QualityResult,
  SingleQualityResult,
  CarouselQualityResult,
} from '@/ai/validation/types/scoring'

// Re-export types for existing consumers
export type {
  QualityIssue,
  QualityResult,
  SingleQualityResult,
  CarouselQualityResult,
}

// ---- Raw LLM response (internal) ----

interface LlmQualityResponse {
  ai_tells: string[]
  worst_offending_phrase: string | null
  issues: QualityIssue[]
  hook_verdict: string
  cta_verdict: string
  brand_voice_match: boolean
  brand_voice_deviation: string | null
  audience_targeting: boolean
  audience_gap: string | null
  niche_specificity: boolean
  niche_gap: string | null
  structure_is_predictable: boolean
  structure_used: string | null
  formality_consistent: boolean
  formality_violation: string | null
  source_fidelity_ok: boolean | null
  health_compliant: boolean | null
}

// ---- Main validator ----

/**
 * Quality validator — uses ClientData as single source of truth for all brand/language context.
 * When client is omitted (e.g. detect-slop endpoint), falls back to generic English defaults.
 */
export async function validateQuality(
  input: {
    caption: string
    slides?: Array<{ headline: string; body: string }>
  },
  client?: ClientData,
  opts?: {
    theme?: string
    targetPillar?: string
    declaredStructure?: string
    platform?: string
    sourceExcerpt?: string
  }
): Promise<QualityResult> {
  const isCarousel = !!(input.slides && input.slides.length > 0)
  const lc = client?.languageConfig
  const language = lc?.language ?? 'English'
  const formality = lc?.formality ?? 'neutral'
  const themeLabel = opts?.theme ? ` for the theme "${opts.theme}"` : ''

  // Full CLIENT PROFILE — same section the generator sees
  const brandContext = client
    ? buildClientProfileSection(client, opts?.platform ?? 'Instagram', opts?.targetPillar)
    : ''

  // AI tell patterns (language-specific)
  const aiTellsSection = `AI PATTERNS — list every one found in ai_tells:\n${formatAiTells(language)}\nOnly flag a pattern when it is clearly present and harms readability or authenticity. Do not flag marginal or borderline cases — when in doubt, do not flag.`

  // Language-specific calque/word order patterns (separate from AI tells)
  const langTells = lc
    ? `\n${language}-specific AI patterns to also check:
- Literal calques from English that no native ${language} speaker would write
- Unnatural word order following English syntax
- Register violation: ${
        formality === 'formal'
          ? 'informal address in a formal-register post'
          : formality === 'casual'
            ? 'formal address in a casual-register post'
            : 'extreme formality or casualness when neutral register is required'
      }${lc.languageNotes ? `\n${lc.languageNotes}` : ''}`
    : ''

  // Brand voice check — tone/testimonial are already in CLIENT PROFILE above
  const brandVoiceCheck = `BRAND CHECKS:
- brand_voice_match: Does the post feel right for this brand? Flag only when the post clearly drifts from the brand voice described above.${
    client?.isHealthNiche
      ? '\n  Note: cautious language required by health content regulations (hedging claims, avoiding absolutes) is expected — do NOT flag it as brand voice deviation.'
      : ''
  }
- audience_targeting: Does the post speak specifically to the target audience? Or could ANY audience relate equally?
- niche_specificity: Does the post contain at least one specific detail, example, or insight that could ONLY come from this business/niche? Generic industry platitudes fail this check.`

  const hookLabel = isCarousel
    ? `Does the COVER SLIDE HEADLINE open a loop that requires swiping to resolve${themeLabel} in ${formality} register?`
    : `Does the opener stop scrolling${themeLabel} in ${formality} register?`

  const ctaNote = isCarousel
    ? 'Note: "missing" is never acceptable for carousels — the CTA slide is required.'
    : 'Note: "missing" is acceptable when the post uses MYTH-BREAKER or CONFESSION structure.'

  const criteriaChecklist = buildCriteriaChecklist({
    platform: opts?.platform,
    hasSource: !!opts?.sourceExcerpt,
    isHealthClient: client?.isHealthNiche ?? false,
    languageConfig: lc,
    theme: opts?.theme,
    declaredStructure: opts?.declaredStructure,
    isCarousel,
  })

  const systemPrompt = [`You are a social media content quality assessor and AI-content detector.`, brandContext].filter(Boolean).join('\n\n') + `

${aiTellsSection}${langTells}

HOOK VERDICT — ${hookLabel}
${formatHookVerdicts()}

CTA VERDICT — The post was allowed ONE CTA maximum, specific and low-pressure:
${formatCtaVerdicts()}
${ctaNote}

${brandVoiceCheck}

ISSUES: Flag specific problems with type and description.
${formatIssueTypes()}

${criteriaChecklist}`

  const contentSection = buildContentSection(input.caption, input.slides, {
    singleTag: 'post_to_rate',
    singleIntro: '\nPost:',
    captionTag: 'caption_to_rate',
    slidesTag: 'slides_to_rate',
    carouselIntro: '\nEvaluate the carousel as a whole (caption + all slides together).',
  })

  const returnFormat = `{
  "ai_tells": string[],
  "worst_offending_phrase": string | null,
  "issues": [{ "type": string, "description": string }],
  "hook_verdict": "stops_scroll" | "clear_value" | "generic" | "buries_lead" | "no_hook",
  "cta_verdict": "natural_specific" | "clear_relevant" | "generic" | "weak_mismatched" | "missing",
  "brand_voice_match": boolean,
  "brand_voice_deviation": string | null,
  "audience_targeting": boolean,
  "audience_gap": string | null,
  "niche_specificity": boolean,
  "niche_gap": string | null,
  "structure_is_predictable": boolean,
  "structure_used": string | null,
  "formality_consistent": boolean,    // address register ONLY (pronoun choice, formal constructions) — vocabulary anglicisms go in ai_tells
  "formality_violation": string | null,
  "source_fidelity_ok": boolean | null,
  "health_compliant": boolean | null
}`

  const message = await callAnthropic({
    systemPrompt,
    userMessage: `${contentSection}

Return JSON only. Inside all string values use single-quotes — never double-quotes:
${returnFormat}`,
    maxTokens: 1024,
  })

  const parsed = parseJsonResponse<LlmQualityResponse>(message)

  const hook_verdict = safeParseHookVerdict(parsed.hook_verdict)
  const cta_verdict = safeParseCtaVerdict(parsed.cta_verdict)
  const ai_tells = Array.isArray(parsed.ai_tells) ? parsed.ai_tells : []
  const issues = Array.isArray(parsed.issues) ? parsed.issues : []
  const brand_voice_match = parsed.brand_voice_match ?? true
  const audience_targeting = parsed.audience_targeting ?? true
  const niche_specificity = parsed.niche_specificity ?? true
  const structure_used = parsed.structure_used ?? null

  const scores = computeQualityScores({
    ai_tells,
    issues,
    hook_verdict,
    cta_verdict,
    brand_voice_match,
    audience_targeting,
    niche_specificity,
    structure_used,
  })

  const result: QualityScores = {
    ...scores,
    hook_verdict,
    cta_verdict,
    brand_voice_match,
    brand_voice_deviation: parsed.brand_voice_deviation ?? null,
    audience_targeting,
    audience_gap: parsed.audience_gap ?? null,
    niche_specificity,
    niche_gap: parsed.niche_gap ?? null,
    ai_tells,
    worst_offending_phrase: parsed.worst_offending_phrase ?? null,
    issues,
    structure_is_predictable: parsed.structure_is_predictable ?? false,
    structure_used,
    formality_consistent: parsed.formality_consistent ?? true,
    formality_violation: parsed.formality_violation ?? null,
    source_fidelity_ok: parsed.source_fidelity_ok ?? null,
    health_compliant: parsed.health_compliant ?? null,
  }

  if (isCarousel) {
    return { ...result, kind: 'carousel' }
  }
  return { ...result, kind: 'single' }
}
