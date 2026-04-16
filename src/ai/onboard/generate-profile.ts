import { callAnthropic } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import type { OnboardResponse, UrlAnalysisResponse } from '@/types/api'
import {
  sanitizePromptField,
  PROMPT_FIELD_LIMITS,
  DEFENSIVE_DATA_CLAUSE,
} from '@/ai/utils/sanitize'

export interface GenerateProfileInput {
  answers: {
    q1: string
    q2: string
    q3: string
    q4?: string
    q4b?: string
    q5?: string
    q6?: string
    q7?: string
  }
  analysisData?: UrlAnalysisResponse
}

function buildAnalysisContext(data: UrlAnalysisResponse): string {
  return `
WEBSITE/SOCIAL MEDIA ANALYSIS DATA (use this to improve accuracy):
Detected niche: ${sanitizePromptField(data.detected_niche)} (confidence: ${data.detected_niche_confidence})
Detected services: ${data.detected_services_products?.map((s) => sanitizePromptField(s)).join(', ') ?? 'none'}
Detected target audience: ${data.detected_target_audience?.map((a) => sanitizePromptField(a)).join(', ') ?? 'none'}
Detected tone: ${sanitizePromptField(data.detected_tone) || 'none'}
Detected content pillars: ${data.detected_content_pillars?.map((p) => `${sanitizePromptField(p.pillar)} (${p.weight}%)`).join(', ') ?? 'none'}
Detected language: ${sanitizePromptField(data.detected_language, PROMPT_FIELD_LIMITS.short) || 'none'} (${sanitizePromptField(data.detected_language_formality, PROMPT_FIELD_LIMITS.short) || 'none'})
Detected health niche: ${data.detected_is_health_niche ?? false}
Detected testimonial voice: ${sanitizePromptField(data.detected_testimonial_voice) || 'none'}
Detected avoid topics: ${sanitizePromptField(data.detected_avoid_topics) || 'none'}
The user confirmed or corrected these detections in the answers below.
`
}

function buildPrompt(input: GenerateProfileInput): string {
  const { answers, analysisData } = input
  const analysisContext = analysisData ? buildAnalysisContext(analysisData) : ''

  return `Based on these answers generate a complete social media brand profile.
${analysisContext}
Return JSON only, no other text:
{
  "niche": string (2-5 words, e.g. "physiotherapy clinic", "real estate agency", "dermatology clinic" — concise and search-friendly, NOT a full description),
  "niche_reasoning": string,
  "target_audience": string[],
  "social_goals": string[],
  "content_pillars": [{ "pillar": string, "weight": number }],
  "content_pillars_reasoning": string,
  "tone": string,
  "avoid_topics": string,
  "client_testimonial_voice": string,
  "recommended_platforms": [{ "platform": string, "priority": string, "reason": string }],
  "platform_reasoning": string,
  "is_health_niche": boolean,
  "suggested_post_frequency": string,
  "language": string,
  "language_formality": string
}

For content_pillars: suggest 3-6 pillars with weights that sum to 100. Each pillar should be a specific content theme relevant to this business.
${answers.q7 ? `The user selected these content pillar preferences: ${sanitizePromptField(answers.q7)}. Use these as a starting point but refine and expand based on the business.` : ''}

${DEFENSIVE_DATA_CLAUSE}
<user_answers>
Q1 (business description): ${sanitizePromptField(answers.q1, PROMPT_FIELD_LIMITS.long)}
Q2 (target audience): ${sanitizePromptField(answers.q2, PROMPT_FIELD_LIMITS.long)}
Q3 (post goal): ${sanitizePromptField(answers.q3)}
Q4 (tone): ${sanitizePromptField(answers.q4)}
Q4b (language/formality): ${sanitizePromptField(answers.q4b)}
Q5 (avoid topics): ${sanitizePromptField(answers.q5)}
Q6 (testimonial voice): ${sanitizePromptField(answers.q6)}
</user_answers>`
}

export async function generateProfile(input: GenerateProfileInput): Promise<OnboardResponse> {
  const message = await callAnthropic({
    systemPrompt: `You are a social media strategist. ${DEFENSIVE_DATA_CLAUSE}`,
    userMessage: buildPrompt(input),
    cacheSystemPrompt: false,
  })

  return parseJsonResponse<OnboardResponse>(message)
}
