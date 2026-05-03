import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import { buildClientProfile, buildAiTells, buildLanguageRules, buildHealthRules } from '@/ai/shared/build-prompt-sections'
import { buildContentSection } from '@/ai/validation/prompts/shared/content-section'
import {
  HOOK_VERDICTS,
  CTA_VERDICTS,
  CAROUSEL_STRUCTURE_CHECKLIST,
  ISSUE_TYPE_DEFINITIONS,
} from '@/ai/validation/criteria'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type {
  QualityIssue,
  ClaimStatus,
} from '@/ai/validation/types'

export interface ValidateQualityInput {
  caption: string
  slides?: Array<{ headline: string; body: string }>
  client?: ClientData
  platform?: string
  theme?: string
  targetPillar?: string
  sourceContext?: { excerpt: string; url?: string | null }
}

/** Raw LLM response shape — internal to this module. */
export interface LlmQualityResponse {
  niche_fit: boolean
  niche_gap: string | null
  audience_match: boolean
  audience_gap: string | null
  pillar_match: boolean | null
  pillar_gap: string | null
  theme_adherence: boolean
  theme_gap: string | null
  hook_verdict: string
  hook_note: string | null
  cta_verdict: string
  cta_note: string | null
  structure_checks: Array<{ rule: string; passes: boolean; note: string | null }> | null
  ai_tells: string[]
  worst_offending_phrase: string | null
  brand_voice_match: boolean
  brand_voice_deviation: string | null
  formality_consistent: boolean
  formality_violation: string | null
  flagged_claims: Array<{ claim: string; status: ClaimStatus; source_evidence: string | null }>
  corrected_text: string | null
  corrected_slides: Array<{ headline: string; body: string }> | null
  health_compliant: boolean | null
  issues: QualityIssue[]
}

// ---- Prompt section builders ----

function buildHookVerdictSection(): string {
  const defs = HOOK_VERDICTS.map((v) => `- "${v.id}": ${v.description}`).join('\n')
  return `HOOK VERDICT:
Evaluate the hook. For carousels: evaluate the COVER SLIDE HEADLINE. For single posts: evaluate the first line.
${defs}`
}

function buildCtaVerdictSection(): string {
  const defs = CTA_VERDICTS.map((v) => `- "${v.id}": ${v.description}`).join('\n')
  return `CTA VERDICT — the post was allowed one CTA maximum, specific and low-pressure:
${defs}
Note: For carousels, evaluate the BODY of the last slide for the actionable CTA — not the headline. The headline may serve as framing ("Recover properly", "Take the next step"). A framing-only headline does not make the CTA "missing" as long as the body contains an action verb.`
}

function buildBriefAdherenceSection(client?: ClientData, targetPillar?: string): string {
  const audienceLabel = client?.targetAudience ?? 'the target audience'
  const clientName = client?.name ?? 'this business'
  const pillarNote = targetPillar
    ? `pillar_match: Does the post align with the declared content pillar? (Set to null when no pillar was declared for this post.)`
    : `pillar_match: Set to null — no pillar was declared for this post.`

  return `BRIEF ADHERENCE — for each check, set passes=true/false and provide gap text if false:
niche_fit: Does the post contain at least one detail that could only come from ${clientName}? Generic industry platitudes fail this check.
audience_match: Does the post speak specifically to ${audienceLabel}, or could any audience relate equally?
${pillarNote}
theme_adherence: Does the post substantively address the requested theme, or drift to adjacent topics?
brand_voice: Does the post match the tone and testimonial voice described in the client profile?
formality: Is the address register consistent throughout? (pronoun choice and formal constructions only — vocabulary anglicisms go in issues)`
}
 
function buildCarouselChecklistSection(): string {
  const rules = CAROUSEL_STRUCTURE_CHECKLIST.map((r, i) => `  ${i + 1}. ${r}`).join('\n')
  return `STRUCTURE CHECKLIST (carousel):\n${rules}`
}

function buildIssueTypesSection(): string {
  const defs = Object.entries(ISSUE_TYPE_DEFINITIONS)
    .map(([type, desc]) => `- ${type}: ${desc}`)
    .join('\n')
  return `ISSUES — flag specific problems with type and description:
${defs}`
}

function buildSourceGroundingSection(): string {
  return `SOURCE GROUNDING — when source material is provided in the user turn:
Flag every factual claim (number, statistic, price, named product, named service, specific detail, percentage) against the source.
- grounded: claim matches or is directly supported by source
- ungrounded: claim contradicts source or lacks source support
- partially_grounded: claim is more specific than source supports
General knowledge (e.g. "exercise is healthy", "skin needs hydration") does NOT need grounding — skip these.
If no source material is provided, return flagged_claims as an empty array and corrected_text as null.`
}

// ---- System prompt builder ----

function buildValidationSystemPrompt(client?: ClientData, platform?: string, targetPillar?: string): string {
  const language = client?.languageConfig?.language ?? 'English'

  const sections: string[] = [
    'You are a social media content quality assessor and AI-content detector.',
  ]

  if (client) {
    sections.push(buildClientProfile(client, platform ?? 'Instagram', targetPillar))
  }

  sections.push(buildAiTells(language))

  if (client?.languageConfig) {
    const lc = client.languageConfig
    const formality = lc.formality ?? 'neutral'
    sections.push(
      `${language}-specific AI patterns to also check:
- Literal calques from English that no native ${language} speaker would write
- Unnatural word order following English syntax
- Register violation: ${
        formality === 'formal'
          ? 'informal address in a formal-register post'
          : formality === 'casual'
            ? 'formal address in a casual-register post'
            : 'extreme formality or casualness when neutral register is required'
      }${lc.languageNotes ? `\n${lc.languageNotes}` : ''}`
    )

    sections.push(buildLanguageRules(lc))
  }

  sections.push(buildHookVerdictSection())
  sections.push(buildCtaVerdictSection())
  sections.push(buildBriefAdherenceSection(client, targetPillar))
  sections.push(buildIssueTypesSection())
  sections.push(buildSourceGroundingSection())

  if (client?.isHealthNiche) {
    sections.push(buildHealthRules())
  }

  return sections.join('\n\n')
}

// ---- User turn builder ----

function buildValidationUserPrompt(
  input: ValidateQualityInput,
  isCarousel: boolean
): string {
  const parts: string[] = []

  if (input.theme) parts.push(`Theme: ${input.theme}`)
  if (input.targetPillar) parts.push(`Pillar: ${input.targetPillar}`)
  if (isCarousel) parts.push('Is carousel: yes')

  if (isCarousel) parts.push(buildCarouselChecklistSection())
  else parts.push('STRUCTURE CHECKLIST: set structure_checks to null.')

  if (input.sourceContext?.excerpt) {
    parts.push(`SOURCE MATERIAL to verify claims against:\n<source_excerpt>\n${input.sourceContext.excerpt}\n</source_excerpt>`)
  }

  const contentSection = buildContentSection(input.caption, input.slides, {
    singleTag: 'post_to_rate',
    singleIntro: '\nPost:',
    captionTag: 'caption_to_rate',
    slidesTag: 'slides_to_rate',
    carouselIntro: '\nEvaluate the carousel as a whole (caption + all slides together).',
  })

  parts.push(contentSection)

  return parts.join('\n\n')
}

// ---- Output schema (enforces valid JSON from the API — no parsing failures) ----

const QUALITY_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    niche_fit: { type: 'boolean' },
    niche_gap: { type: ['string', 'null'] },
    audience_match: { type: 'boolean' },
    audience_gap: { type: ['string', 'null'] },
    pillar_match: { type: ['boolean', 'null'] },
    pillar_gap: { type: ['string', 'null'] },
    theme_adherence: { type: 'boolean' },
    theme_gap: { type: ['string', 'null'] },
    hook_verdict: { type: 'string' },
    hook_note: { type: ['string', 'null'] },
    cta_verdict: { type: 'string' },
    cta_note: { type: ['string', 'null'] },
    structure_checks: {
      anyOf: [
        { type: 'null' },
        { type: 'array', items: { type: 'object', properties: { rule: { type: 'string' }, passes: { type: 'boolean' }, note: { type: ['string', 'null'] } }, required: ['rule', 'passes', 'note'] } },
      ],
    },
    ai_tells: { type: 'array', items: { type: 'string' } },
    worst_offending_phrase: { type: ['string', 'null'] },
    brand_voice_match: { type: 'boolean' },
    brand_voice_deviation: { type: ['string', 'null'] },
    formality_consistent: { type: 'boolean' },
    formality_violation: { type: ['string', 'null'] },
    flagged_claims: {
      type: 'array',
      items: { type: 'object', properties: { claim: { type: 'string' }, status: { type: 'string' }, source_evidence: { type: ['string', 'null'] } }, required: ['claim', 'status', 'source_evidence'] },
    },
    corrected_text: { type: ['string', 'null'] },
    corrected_slides: {
      anyOf: [
        { type: 'null' },
        { type: 'array', items: { type: 'object', properties: { headline: { type: 'string' }, body: { type: 'string' } }, required: ['headline', 'body'] } },
      ],
    },
    health_compliant: { type: ['boolean', 'null'] },
    issues: {
      type: 'array',
      items: { type: 'object', properties: { type: { type: 'string' }, description: { type: 'string' } }, required: ['type', 'description'] },
    },
  },
  required: [
    'niche_fit', 'niche_gap', 'audience_match', 'audience_gap', 'pillar_match', 'pillar_gap',
    'theme_adherence', 'theme_gap', 'hook_verdict', 'hook_note', 'cta_verdict', 'cta_note',
    'structure_checks', 'ai_tells', 'worst_offending_phrase', 'brand_voice_match',
    'brand_voice_deviation', 'formality_consistent', 'formality_violation', 'flagged_claims',
    'corrected_text', 'corrected_slides', 'health_compliant', 'issues',
  ],
}
 
// ---- Main validator ----

export async function validateQuality(input: ValidateQualityInput): Promise<LlmQualityResponse> {
  const isCarousel = !!(input.slides && input.slides.length > 0)

  const systemPrompt = buildValidationSystemPrompt(input.client, input.platform, input.targetPillar)
  const userMessage = buildValidationUserPrompt(input, isCarousel)

  const message = await callAnthropic({
    systemPrompt,
    userMessage,
    maxTokens: 2048,
    outputSchema: QUALITY_OUTPUT_SCHEMA,
    model: LIGHT_MODEL,
  })

  const parsed = extractToolInput<LlmQualityResponse>(message)

  return {
    niche_fit: parsed.niche_fit ?? true,
    niche_gap: parsed.niche_gap ?? null,
    audience_match: parsed.audience_match ?? true,
    audience_gap: parsed.audience_gap ?? null,
    pillar_match: parsed.pillar_match ?? null,
    pillar_gap: parsed.pillar_gap ?? null,
    theme_adherence: parsed.theme_adherence ?? true,
    theme_gap: parsed.theme_gap ?? null,
    hook_verdict: parsed.hook_verdict ?? 'generic',
    hook_note: parsed.hook_note ?? null,
    cta_verdict: parsed.cta_verdict ?? 'generic',
    cta_note: parsed.cta_note ?? null,
    structure_checks: Array.isArray(parsed.structure_checks) ? parsed.structure_checks : null,
    ai_tells: Array.isArray(parsed.ai_tells) ? parsed.ai_tells : [],
    worst_offending_phrase: parsed.worst_offending_phrase ?? null,
    brand_voice_match: parsed.brand_voice_match ?? true,
    brand_voice_deviation: parsed.brand_voice_deviation ?? null,
    formality_consistent: parsed.formality_consistent ?? true,
    formality_violation: parsed.formality_violation ?? null,
    flagged_claims: Array.isArray(parsed.flagged_claims) ? parsed.flagged_claims : [],
    corrected_text: parsed.corrected_text ?? null,
    corrected_slides: parsed.corrected_slides ?? null,
    health_compliant: parsed.health_compliant ?? null,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
  }
}
