import { callAnthropic } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import { computeGroundingScore } from '@/ai/validation/content-rules/compute-scores'

export interface SourceGroundingIssue {
  claim: string
  status: 'grounded' | 'ungrounded' | 'partially_grounded'
  source_evidence: string | null
}

export interface SourceGroundingResult {
  grounded: boolean
  grounding_score: number
  flagged_claims: SourceGroundingIssue[]
  corrected_text: string | null
  corrected_slides?: Array<{ headline: string; body: string }> | null
}

/** Raw LLM response shape — internal to this module. */
interface LlmGroundingResponse {
  flagged_claims: SourceGroundingIssue[]
  corrected_text: string | null
  corrected_slides?: Array<{ headline: string; body: string }> | null
}

export async function validateSourceGrounding(
  generatedText: string,
  sourceExcerpt: string,
  slides?: Array<{ headline: string; body: string }>
): Promise<SourceGroundingResult> {
  const isCarousel = slides && slides.length > 0

  let postSection: string
  let returnFormat: string
  let correctionRules: string

  if (isCarousel) {
    const slidesText = slides
      .map((s, i) => `[SLIDE ${i + 1}]\nHeadline: ${s.headline}\nBody: ${s.body}`)
      .join('\n\n')

    postSection = `GENERATED POST:

[CAPTION]
<caption_to_check>
${generatedText}
</caption_to_check>

<slides_to_check>
${slidesText}
</slides_to_check>`

    returnFormat = `{
  "flagged_claims": [
    {
      "claim": string,
      "status": "grounded" | "ungrounded" | "partially_grounded",
      "source_evidence": string | null
    }
  ],
  "corrected_text": string | null (corrected CAPTION only, null if caption has no issues),
  "corrected_slides": [{"headline": string, "body": string}] | null (corrected slides array with ALL slides — each slide corrected — null if slides have no issues)
}`

    correctionRules = `- "corrected_text": If ANY caption claims are ungrounded, provide a corrected CAPTION only. If caption is grounded, set to null.
- "corrected_slides": If ANY slide claims are ungrounded, provide ALL slides in order with corrected headline and body. If all slides are grounded, set to null.`
  } else {
    postSection = `GENERATED POST:
<post_to_check>
${generatedText}
</post_to_check>`

    returnFormat = `{
  "flagged_claims": [
    {
      "claim": string,
      "status": "grounded" | "ungrounded" | "partially_grounded",
      "source_evidence": string | null
    }
  ],
  "corrected_text": string | null
}`

    correctionRules = `- "corrected_text": If ANY claims are ungrounded or partially_grounded, provide a corrected version of the ENTIRE post where ungrounded claims are removed or rephrased using ONLY facts from the source material. Keep the post's tone, style, and structure intact. If all claims are grounded, set to null.`
  }

  // Static instructions cached; source material and generated text are dynamic
  const systemText = `You are a fact-checking editor. Compare the generated social media post against the source material provided.

Check every factual claim, statistic, number, price, distance, percentage, or specific detail in the generated post against the source material.

Rules:
- General knowledge (e.g. "skin needs hydration", "exercise is healthy") does NOT need source grounding — skip these
- Specific numbers, prices, statistics, distances, percentages, named products, or services MUST be grounded in the source
- If the post makes a claim more specific than the source supports, mark "partially_grounded"
- An empty flagged_claims array means no specific factual claims were made (acceptable)`

  const message = await callAnthropic({
    systemPrompt: systemText,
    userMessage: `SOURCE MATERIAL:
<source_excerpt>
${sourceExcerpt}
</source_excerpt>

${postSection}

${correctionRules}

Return JSON only:
${returnFormat}`,
    maxTokens: 2048,
  })

  const parsed = parseJsonResponse<LlmGroundingResponse>(message)
  const flagged_claims = Array.isArray(parsed.flagged_claims) ? parsed.flagged_claims : []

  // Compute deterministic score from claim verdicts
  const { grounding_score, grounded } = computeGroundingScore({ flagged_claims })

  return {
    grounded,
    grounding_score,
    flagged_claims,
    corrected_text: parsed.corrected_text ?? null,
    ...(parsed.corrected_slides !== undefined ? { corrected_slides: parsed.corrected_slides } : {}),
  }
}
