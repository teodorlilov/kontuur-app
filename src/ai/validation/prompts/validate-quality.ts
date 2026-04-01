import { anthropic, DEFAULT_MODEL } from '@/ai/client'
import { parseJsonResponse } from '@/ai/utils'
import {
  computeQualityScores,
  safeParseHookVerdict,
  safeParseCtaVerdict,
} from '@/ai/validation/content-rules/compute-scores'
import {
  formatAiTellPatterns,
  formatIssueTypes,
  formatHookVerdicts,
  formatCtaVerdicts,
  buildCriteriaChecklist,
} from '@/ai/validation/content-rules/validation-criteria'
import {
  formatAllowedOpeners,
  formatBannedOpeners,
} from '@/ai/generation/generation-criteria'
import type { HookVerdict, CtaVerdict } from '@/types/api'

// ---- Types ----

export interface QualityContext {
  language?: string
  tone?: string
  formality?: string
  targetAudience?: string
  niche?: string
  // Generation criteria alignment
  platform?: string
  clientTestimonialVoice?: string
  sourceExcerpt?: string
  targetPillar?: string
  isHealthClient?: boolean
}

export interface QualityIssue {
  type: string
  description: string
}

interface QualityBase {
  human_score: number
  hook_score: number
  cta_score: number
  criteria_score: number
  quality_score_avg: number
  hook_verdict: HookVerdict
  cta_verdict: CtaVerdict
  brand_voice_match: boolean
  brand_voice_deviation: string | null
  audience_targeting: boolean
  audience_gap: string | null
  niche_specificity: boolean
  niche_gap: string | null
  ai_tells: string[]
  worst_offending_phrase: string | null
  issues: QualityIssue[]
  // New detection fields
  opener_follows_rules: boolean
  opener_violation: string | null
  structure_is_predictable: boolean
  structure_used: string | null
  formality_consistent: boolean
  formality_violation: string | null
  source_fidelity_ok: boolean | null
  health_compliant: boolean | null
}

export interface SingleQualityResult extends QualityBase {
  kind: 'single'
}

export interface CarouselQualityResult extends QualityBase {
  kind: 'carousel'
}

/** Discriminated union — narrow with `quality.kind` */
export type QualityResult = SingleQualityResult | CarouselQualityResult

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
  // New detection fields
  opener_follows_rules: boolean
  opener_violation: string | null
  structure_is_predictable: boolean
  structure_used: string | null
  formality_consistent: boolean
  formality_violation: string | null
  source_fidelity_ok: boolean | null
  health_compliant: boolean | null
}

// ---- Prompt builders (single responsibility) ----

function buildBrandContext(ctx?: QualityContext): string {
  if (!ctx?.tone && !ctx?.targetAudience && !ctx?.niche) return ''
  return `
BRAND CONTEXT: This post is for a ${ctx.niche ?? 'general'} business.
Tone: ${ctx.tone ?? 'professional'}. Register: ${ctx.formality ?? 'neutral'}. Target audience: ${ctx.targetAudience ?? 'general audience'}.`
}

function buildBrandVoiceCheck(ctx?: QualityContext): string {
  const tone = ctx?.tone ?? 'professional'
  const testimonial = ctx?.clientTestimonialVoice
  const formality = ctx?.formality ?? 'neutral'

  let check = `BRAND CHECKS:
- brand_voice_match: Does the post feel right for this brand?
  This brand sounds: ${tone}`
  if (testimonial) {
    check += `\n  Clients describe it as: '${testimonial}'
  These two descriptions define one emotional identity.`
  }
  check += `\n  Evaluate within the ${formality} register. Flag only when the post clearly drifts from the brand's voice.`
  check += `
- audience_targeting: Does the post speak specifically to the target audience? Or could ANY audience relate equally?
- niche_specificity: Does the post contain at least one specific detail, example, or insight that could ONLY come from this business/niche? Generic industry platitudes fail this check.`

  return check
}

function buildLanguageTells(ctx?: QualityContext): string {
  if (!ctx?.language) return ''

  let tells = `
${ctx.language}-specific AI patterns to also check:
- Literal calques from English that no native speaker would write
- Unnatural word order following English syntax
- Generic filler phrases that sound translated`

  if (ctx.formality === 'formal') {
    tells += `\n- Register violation: using informal address or casual phrasing when formal register is required`
  } else if (ctx.formality === 'casual') {
    tells += `\n- Register violation: using formal address or corporate phrasing when casual register is required`
  } else if (ctx.formality === 'neutral') {
    tells += `\n- Register violation: drifting into overly formal or overly casual register when neutral is required`
  }

  if (ctx.language === 'Bulgarian') {
    tells += `
- "в днешния свят", "ние сме развълнувани да", "от изключително значение"
- Mixing formal (Вие) and informal (ти) address`
    if (ctx.formality === 'formal') {
      tells += ` — text must use Вие/Вас consistently`
    } else if (ctx.formality === 'casual') {
      tells += ` — text must use ти/теб consistently`
    }
    tells += `\n- Overly literary/bookish language inappropriate for social media`
  }

  return tells
}

function buildBasePrompt(brandCtx: string, langTells: string, ctx?: QualityContext): string {
  const formality = ctx?.formality ?? 'neutral'

  const criteriaChecklist = buildCriteriaChecklist({
    formality,
    platform: ctx?.platform,
    hasSource: !!ctx?.sourceExcerpt,
    isHealthClient: ctx?.isHealthClient,
  })

  return `You are a social media content quality assessor and AI-content detector.
${brandCtx}

AI PATTERNS — list every one found in ai_tells:
${formatAiTellPatterns()}
Only flag a pattern when it is clearly present and harms readability or authenticity. Do not flag marginal or borderline cases — when in doubt, do not flag.
${langTells}

HOOK VERDICT — Evaluate the opening against these rules:
ALLOWED opener types:
${formatAllowedOpeners(formality)}

BANNED opener types:
${formatBannedOpeners()}

${formatHookVerdicts()}

CTA VERDICT — The post was allowed ONE CTA maximum, specific and low-pressure:
${formatCtaVerdicts()}
Note: "missing" is acceptable when the post uses MYTH-BREAKER or CONFESSION structure.

${buildBrandVoiceCheck(ctx)}

ISSUES: Flag specific problems with type and description.
${formatIssueTypes()}

${criteriaChecklist}`
}

// ---- Main validator ----

export async function validateQuality(
  input: {
    caption: string
    slides?: Array<{ headline: string; body: string }>
  },
  ctx?: QualityContext
): Promise<QualityResult> {
  const brandCtx = buildBrandContext(ctx)
  const langTells = buildLanguageTells(ctx)
  const base = buildBasePrompt(brandCtx, langTells, ctx)
  const isCarousel = input.slides && input.slides.length > 0

  let contentSection: string

  if (isCarousel) {
    const slidesText = input.slides!
      .map((s, i) => `[SLIDE ${i + 1}]\nHeadline: ${s.headline}\nBody: ${s.body}`)
      .join('\n\n')

    contentSection = `

Evaluate the carousel as a whole (caption + all slides together).

[CAPTION]
<caption_to_rate>
${input.caption}
</caption_to_rate>

<slides_to_rate>
${slidesText}
</slides_to_rate>`
  } else {
    contentSection = `

Post:
<post_to_rate>
${input.caption}
</post_to_rate>`
  }

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
  "opener_follows_rules": boolean,
  "opener_violation": string | null,
  "structure_is_predictable": boolean,
  "structure_used": string | null,
  "formality_consistent": boolean,
  "formality_violation": string | null,
  "source_fidelity_ok": boolean | null,
  "health_compliant": boolean | null
}`

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: base, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `${contentSection}

Return JSON only:
${returnFormat}`,
      },
    ],
  })

  const parsed = parseJsonResponse<LlmQualityResponse>(message)

  // Safe-parse verdicts (LLM may return unexpected strings)
  const hook_verdict = safeParseHookVerdict(parsed.hook_verdict)
  const cta_verdict = safeParseCtaVerdict(parsed.cta_verdict)
  const ai_tells = Array.isArray(parsed.ai_tells) ? parsed.ai_tells : []
  const issues = Array.isArray(parsed.issues) ? parsed.issues : []
  const brand_voice_match = parsed.brand_voice_match ?? true
  const audience_targeting = parsed.audience_targeting ?? true
  const niche_specificity = parsed.niche_specificity ?? true
  const structure_used = parsed.structure_used ?? null

  // Compute deterministic scores from detections
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

  const result: QualityBase = {
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
    opener_follows_rules: parsed.opener_follows_rules ?? true,
    opener_violation: parsed.opener_violation ?? null,
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
