import { z } from 'zod'
import type { UrlAnalysisResponse } from '@/types/api'

/**
 * The shape a website read is allowed to hand to the rest of the app.
 *
 * The response is a model's JSON, not an API contract, so it is parsed rather than trusted:
 * `buildDraftFromAnalysis` (src/features/onboarding/lib/build-draft.ts:50) reads `.length` off two
 * of these arrays, and a missing key would throw there.
 *
 * Every field carries `.catch()` rather than failing the parse, because a field the model could
 * not fill already has a meaning downstream: the draft leaves it empty and the sheet asks about it.
 * That is the flow's whole promise, and it is a better answer than rejecting a response that is
 * ninety percent usable. So any object parses, and `analyzeUrl` (src/utils/ai.ts:95) always hands
 * it one — a reply with no JSON object arrives as `{}` (`parseJsonResponse`) — which means an
 * unparseable reply reads as an empty profile; only the model call itself failing throws.
 */
export const urlAnalysisResponseSchema = z.object({
  detected_business_name: z.string().nullable().catch(null),
  detected_niche: z.string().catch(''),
  detected_niche_confidence: z.enum(['high', 'medium', 'low']).catch('low'),
  detected_target_audience: z.array(z.string()).catch([]),
  detected_tone: z.string().catch(''),
  detected_content_pillars: z.array(z.object({ pillar: z.string(), weight: z.number() })).catch([]),
  detected_services_products: z.array(z.string()).catch([]),
  detected_language: z.string().catch(''),
  detected_language_formality: z.string().catch(''),
  detected_is_health_niche: z.boolean().catch(false),
  detected_avoid_topics: z.string().nullable().catch(null),
})

// Fails the build if the schema and the hand-written type drift apart — the guard convention from
// src/features/clients/schemas.ts. Keeping the type in src/types/api.ts means the client-side
// consumers of a website read never pull zod into their bundle.
type SchemaUrlAnalysis = z.infer<typeof urlAnalysisResponseSchema>
const _urlAnalysisForward: UrlAnalysisResponse = null as unknown as SchemaUrlAnalysis
const _urlAnalysisBackward: SchemaUrlAnalysis = null as unknown as UrlAnalysisResponse
void _urlAnalysisForward
void _urlAnalysisBackward
