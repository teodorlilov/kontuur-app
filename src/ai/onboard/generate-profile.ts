import { anthropic, DEFAULT_MODEL, DEFAULT_MAX_TOKENS } from '@/ai/client'
import { parseJsonResponse } from '@/ai/utils'
import type { OnboardResponse, UrlAnalysisResponse } from '@/types/api'

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
Detected niche: ${data.detected_niche} (confidence: ${data.detected_niche_confidence})
Detected services: ${data.detected_services_products?.join(', ') ?? 'none'}
Detected target audience: ${data.detected_target_audience?.join(', ') ?? 'none'}
Detected tone: ${data.detected_tone ?? 'none'}
Detected content pillars: ${data.detected_content_pillars?.map((p) => `${p.pillar} (${p.weight}%)`).join(', ') ?? 'none'}
Detected language: ${data.detected_language ?? 'none'} (${data.detected_language_formality ?? 'none'})
Detected health niche: ${data.detected_is_health_niche ?? false}
Detected testimonial voice: ${data.detected_testimonial_voice ?? 'none'}
Detected avoid topics: ${data.detected_avoid_topics ?? 'none'}
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
  "niche": string,
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
${answers.q7 ? `The user selected these content pillar preferences: ${answers.q7}. Use these as a starting point but refine and expand based on the business.` : ''}

<user_answers>
Q1 (business description): ${answers.q1}
Q2 (target audience): ${answers.q2}
Q3 (post goal): ${answers.q3}
Q4 (tone): ${answers.q4 ?? ''}
Q4b (language/formality): ${answers.q4b ?? ''}
Q5 (avoid topics): ${answers.q5 ?? ''}
Q6 (testimonial voice): ${answers.q6 ?? ''}
</user_answers>`
}

export async function generateProfile(input: GenerateProfileInput): Promise<OnboardResponse> {
  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: 'You are a social media strategist.',
    messages: [{ role: 'user', content: buildPrompt(input) }],
  })

  return parseJsonResponse<OnboardResponse>(message)
}
