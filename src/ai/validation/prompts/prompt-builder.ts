import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import { buildClientProfile, buildAiTells, buildHealthRules } from '@/ai/shared/build-prompt-sections'
import { buildContentSection } from '@/ai/validation/prompts/shared/content-section'
import { carouselSemanticRules, ISSUE_TYPE_DEFINITIONS } from '@/ai/validation/criteria'
import { buildLanguageValidationRules } from '@/ai/validation/prompts/language-validation-rules'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { QualityIssue, ClaimStatus, LanguageIssue } from '@/ai/validation/types'

export interface ValidateQualityInput {
  caption: string
  slides?: Array<{ headline: string; body: string }>
  client?: ClientData
  platform?: string
  theme?: string
  targetPillar?: string
  sourceContext?: { excerpt: string; url?: string | null }
}

export interface ValidateQualityBatchInput {
  captions: string[]
  client?: ClientData
  platform?: string
  theme?: string
  targetPillar?: string
  sourceContext?: { excerpt: string; url?: string | null }
}

/** Raw LLM response shape — internal to the validation module. */
export interface LlmQualityResponse {
  overall_score: number | null
  human_score: number | null
  ai_tells: string[]
  worst_offending_phrase: string | null
  structure_passes: boolean | null
  structure_notes: string[]
  flagged_claims: Array<{ claim: string; status: ClaimStatus; source_evidence: string | null }>
  corrected_text: string | null
  corrected_slides: Array<{ headline: string; body: string }> | null
  health_compliant: boolean | null
  issues: QualityIssue[]
  language_issues: LanguageIssue[]
}

// Output budget per rated item. 2048 restores the pre-merge envelope in one call:
// the old quality and language judges spent 1024 each over the same caption, and
// the merged item schema is the union of both payloads — including a full
// non-English corrected_text rewrite (~600-800 tokens alone). 1024 here truncated
// long corrections mid-tool-use, nulling the whole theme's validation.
const QUALITY_MAX_TOKENS_PER_ITEM = 2048
// Four items at the per-item rate; themes batch 1-3 captions in practice, so the
// cap is headroom rather than a squeeze.
const VALIDATION_BATCH_MAX_TOKENS = 8192

// ---- Prompt section builders ----

function buildRubricSection(client?: ClientData): string {
  const audienceLabel = client?.targetAudience ?? 'the target audience'
  const clientName = client?.name ?? 'this business'

  return `SCORING RUBRIC — evaluate silently against ALL of these, then report only scores and failing issues:
- Niche fit: does the post contain at least one detail that could only come from ${clientName}? Generic industry platitudes fail.
- Audience: does the post speak specifically to ${audienceLabel}, or could any audience relate equally?
- Theme & pillar: does the post substantively address the requested theme, and align with the declared pillar (when a "Pillar:" line is present in the user turn)?
- Hook: does the first line (carousels: the cover slide headline) stop the scroll or promise clear value? Generic or buried hooks lower the score.
- CTA: one CTA maximum, specific and low-pressure. For carousels the actionable CTA lives in the LAST SLIDE BODY — a framing-only headline is fine.
- Brand voice & register: does it match the tone and address formality in the client profile?

overall_score (0-10): holistic quality for this business, audience, and theme. 8+ = publish as-is; 5-7 = usable with edits; <5 = weak.
human_score (0-10): how human the text reads. 10 = indistinguishable from a skilled human writer; every AI tell drags it down.

REPORTING DISCIPLINE — you are a publish gate, not a critic:
- Default is ZERO issues. Report an issue ONLY if it makes the post not publishable as-is for this client — a defect a paying client would reject, not an improvement you can imagine. Reporting a weak issue is worse than reporting none. Hard cap: 3.
- overall_score 7+ with any issue listed is a contradiction — resolve it by DROPPING non-blocking issues, never by lowering the score.
- Scope: weak_hook and buried_lead refer ONLY to the caption's first line / the cover headline. Middle-slide problems belong in structure_notes, stated once — never duplicated into issues.
- When quoting the post (in issues, ai_tells, or worst_offending_phrase): copy the EXACT substring from the post — never paraphrase inside quotation marks.
- ai_tells: at most 3 — exact phrase + pattern name only, no rewrite advice.`
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

/** Run-invariant per client+platform so concurrent validation calls share one cached prefix. */
function buildValidationSystemPrompt(client?: ClientData, platform?: string): string {
  const language = client?.languageConfig?.language ?? 'English'

  const sections: string[] = [
    'You are a social media content quality assessor and AI-content detector.',
  ]

  if (client) {
    sections.push(buildClientProfile(client, platform ?? 'Instagram'))
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
      }`
    )

    // One language block only: buildLanguageValidationRules already carries the
    // formality rules, language instructions and client notes, so adding
    // buildLanguageRules here (as generation does) would state each twice.
    sections.push(buildLanguageValidationRules(lc))
    sections.push(`You are also the native ${language} proofreader for this text. Be ruthless about naturalness — flag phrasing that reads as translated from English even when it is grammatically correct. The standard is: would a native ${language} speaker write this exact phrase on social media?

Report every language problem in "language_issues" with the exact offending phrase and its fix.

"corrected_text" is the SINGLE corrected version of the post. It must carry every fix you would make — factual corrections against the source material AND language corrections — because nothing downstream merges two versions. Leave it null only when the text needs no change at all.`)
  }

  sections.push(buildRubricSection(client))
  sections.push(buildIssueTypesSection())
  sections.push(buildSourceGroundingSection())

  if (client?.isHealthNiche) {
    sections.push(buildHealthRules())
  }

  return sections.join('\n\n')
}

// ---- User turn builders ----

function buildSharedContextParts(input: {
  theme?: string
  targetPillar?: string
  sourceContext?: { excerpt: string }
}): string[] {
  const parts: string[] = []
  if (input.theme) parts.push(`Theme: ${input.theme}`)
  if (input.targetPillar) parts.push(`Pillar: ${input.targetPillar}`)
  if (input.sourceContext?.excerpt) {
    parts.push(
      `SOURCE MATERIAL to verify claims against:\n<source_excerpt>\n${input.sourceContext.excerpt}\n</source_excerpt>`
    )
  }
  return parts
}

function buildValidationUserPrompt(input: ValidateQualityInput, isCarousel: boolean): string {
  const parts = buildSharedContextParts(input)

  if (isCarousel) {
    parts.push('Is carousel: yes')
    // Validate against the actual slide count produced — structure roles are positional.
    // Mechanical rules (word counts, cover-body) are checked in code, never by the LLM.
    const rules = carouselSemanticRules(input.slides?.length ?? 0)
      .map((r, i) => `  ${i + 1}. ${r}`)
      .join('\n')
    parts.push(
      `STRUCTURE CHECKLIST (carousel) — evaluate ONLY these semantic rules, then set structure_passes. Do NOT report word counts or cover-body-text — those are verified in code.
structure_notes: ONLY the failed rules, one short failure description each. NEVER include passing rules, never prefix entries with "PASS"/"FAIL" — if everything passes, return [].
${rules}`
    )
    // "Same count, original order" is load-bearing: corrections are applied to
    // slides positionally, so a partial or reordered list would land fixes on the
    // wrong slides. This lives outside the language-gated section because clients
    // without a languageConfig still get carousel corrections.
    parts.push(
      `IMPORTANT: "corrected_text" must contain ONLY the corrected caption. "corrected_slides" must contain ALL slides in their original order — the same count you were given — or null when no slide needs a change.`
    )
  } else {
    parts.push('STRUCTURE: not a carousel — set structure_passes to null and structure_notes to [].')
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

function buildValidationBatchUserPrompt(input: ValidateQualityBatchInput): string {
  const parts = buildSharedContextParts(input)

  parts.push('STRUCTURE: not a carousel — set structure_passes to null and structure_notes to [].')
  parts.push(
    `Rate each of the ${input.captions.length} posts below INDEPENDENTLY. Return one results entry per post, matched by index.`
  )

  input.captions.forEach((caption, i) => {
    parts.push(`<post_to_rate index="${i + 1}">\n${caption}\n</post_to_rate>`)
  })

  return parts.join('\n\n')
}

// ---- Output schemas (enforce valid JSON from the API — no parsing failures) ----

const QUALITY_ITEM_PROPERTIES = {
  overall_score: { type: 'integer', minimum: 0, maximum: 10 },
  human_score: { type: 'integer', minimum: 0, maximum: 10 },
  ai_tells: {
    type: 'array',
    description: 'At most the 3 worst AI-sounding patterns found — not an exhaustive list',
    items: { type: 'string' },
  },
  worst_offending_phrase: { type: ['string', 'null'] },
  structure_passes: { type: ['boolean', 'null'] },
  structure_notes: {
    type: 'array',
    description: 'FAILED structure rules only, one short failure description each; [] when all pass',
    items: { type: 'string' },
  },
  flagged_claims: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        claim: { type: 'string' },
        status: { type: 'string' },
        source_evidence: { type: ['string', 'null'] },
      },
      required: ['claim', 'status', 'source_evidence'],
    },
  },
  corrected_text: { type: ['string', 'null'] },
  corrected_slides: {
    anyOf: [
      { type: 'null' },
      {
        type: 'array',
        items: {
          type: 'object',
          properties: { headline: { type: 'string' }, body: { type: 'string' } },
          required: ['headline', 'body'],
        },
      },
    ],
  },
  health_compliant: { type: ['boolean', 'null'] },
  issues: {
    type: 'array',
    description:
      'At most 3 material problems whose fix would visibly raise overall_score; excludes structure failures (structure_notes carries those)',
    items: {
      type: 'object',
      properties: { type: { type: 'string' }, description: { type: 'string' } },
      required: ['type', 'description'],
    },
  },
  language_issues: {
    type: 'array',
    description: 'Every language/naturalness problem found; [] when the text reads natively',
    items: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        original_text: { type: 'string' },
        issue_description: { type: 'string' },
        suggested_fix: { type: 'string' },
      },
      required: ['type', 'original_text', 'issue_description', 'suggested_fix'],
    },
  },
}

const QUALITY_ITEM_REQUIRED = [
  'overall_score', 'human_score', 'ai_tells', 'worst_offending_phrase', 'structure_passes',
  'structure_notes', 'flagged_claims', 'corrected_text', 'corrected_slides', 'health_compliant',
  'issues', 'language_issues',
]

const QUALITY_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: QUALITY_ITEM_PROPERTIES,
  required: QUALITY_ITEM_REQUIRED,
}

const QUALITY_BATCH_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, ...QUALITY_ITEM_PROPERTIES },
        required: ['index', ...QUALITY_ITEM_REQUIRED],
      },
    },
  },
  required: ['results'],
}

function normalizeQualityResponse(parsed: Partial<LlmQualityResponse>): LlmQualityResponse {
  return {
    // A non-numeric score means the judge answered without judging. Absence is the
    // honest record; the neutral number this used to substitute was indistinguishable
    // from a real verdict and cleared every downstream threshold.
    overall_score: typeof parsed.overall_score === 'number' ? parsed.overall_score : null,
    human_score: typeof parsed.human_score === 'number' ? parsed.human_score : null,
    ai_tells: Array.isArray(parsed.ai_tells) ? parsed.ai_tells : [],
    worst_offending_phrase: parsed.worst_offending_phrase ?? null,
    structure_passes: parsed.structure_passes ?? null,
    structure_notes: Array.isArray(parsed.structure_notes) ? parsed.structure_notes : [],
    flagged_claims: Array.isArray(parsed.flagged_claims) ? parsed.flagged_claims : [],
    corrected_text: parsed.corrected_text ?? null,
    corrected_slides: parsed.corrected_slides ?? null,
    health_compliant: parsed.health_compliant ?? null,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    language_issues: Array.isArray(parsed.language_issues) ? parsed.language_issues : [],
  }
}

// ---- Main validators ----

/** Validate one post (single or carousel) — carousels keep the slides-aware single call. */
export async function validateQuality(input: ValidateQualityInput): Promise<LlmQualityResponse> {
  const isCarousel = !!(input.slides && input.slides.length > 0)

  if (!isCarousel) {
    const [result] = await validateQualityBatch({
      captions: [input.caption],
      client: input.client,
      platform: input.platform,
      theme: input.theme,
      targetPillar: input.targetPillar,
      sourceContext: input.sourceContext,
    })
    if (!result) throw new Error('Quality validation returned no result')
    return result
  }

  const message = await callAnthropic({
    systemPrompt: buildValidationSystemPrompt(input.client, input.platform),
    userMessage: buildValidationUserPrompt(input, isCarousel),
    maxTokens: QUALITY_MAX_TOKENS_PER_ITEM * 2, // carousel returns corrected_slides too
    outputSchema: QUALITY_OUTPUT_SCHEMA,
    model: LIGHT_MODEL,
    temperature: 0,
  })

  return normalizeQualityResponse(extractToolInput<LlmQualityResponse>(message))
}

/**
 * Validate N single-post captions sharing one theme/pillar/source in one call.
 * Returns one slot per caption, matched by index; missing/malformed entries are null.
 */
export async function validateQualityBatch(
  input: ValidateQualityBatchInput
): Promise<Array<LlmQualityResponse | null>> {
  const message = await callAnthropic({
    systemPrompt: buildValidationSystemPrompt(input.client, input.platform),
    userMessage: buildValidationBatchUserPrompt(input),
    maxTokens: Math.min(QUALITY_MAX_TOKENS_PER_ITEM * input.captions.length, VALIDATION_BATCH_MAX_TOKENS),
    outputSchema: QUALITY_BATCH_OUTPUT_SCHEMA,
    model: LIGHT_MODEL,
    temperature: 0,
  })

  const parsed = extractToolInput<{ results?: Array<Partial<LlmQualityResponse> & { index?: number }> }>(message)
  const slots: Array<LlmQualityResponse | null> = input.captions.map(() => null)

  for (const item of parsed.results ?? []) {
    if (typeof item.index !== 'number') continue
    const slot = item.index - 1
    if (slot < 0 || slot >= slots.length) continue
    slots[slot] = normalizeQualityResponse(item)
  }

  return slots
}
