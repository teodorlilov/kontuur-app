import { z } from 'zod'

/** Input for logging an explicitly discarded wizard draft. */
export const discardedDraftSchema = z.object({
  clientId: z.uuid(),
  clientSourceId: z.uuid().nullable(),
  pillar: z.string().max(200).nullable(),
  sourceUrl: z.string().max(2000).nullable(),
  sourceType: z.string().max(40).nullable(),
  platform: z.string().max(40).nullable(),
})

export type DiscardedDraftInput = z.infer<typeof discardedDraftSchema>

/**
 * The client-switch refetch of GET /api/clients/[id], validated at the
 * boundary. clientData is deliberately loose — its large shape is already
 * typed as ClientData and trusted from our own API, matching today's
 * behaviour; the fields new to the redesign are validated strictly.
 */
export const clientRefreshSchema = z.object({
  clientData: z.unknown().optional(),
  sources: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        label: z.string(),
        url: z.string().nullable(),
        pillar_ids: z.array(z.string()).nullable(),
      })
    )
    .default([]),
  connections: z
    .array(
      z.object({
        id: z.string(),
        platform: z.string(),
        account_id: z.string(),
        account_name: z.string(),
        token_expires_at: z.string().nullable(),
        created_at: z.string(),
      })
    )
    .default([]),
})

export type ClientRefresh = z.infer<typeof clientRefreshSchema>

/**
 * The generation context the wizard round-trips back to the AI routes.
 *
 * Every field here is interpolated into an LLM prompt, so the scalars are checked
 * strictly. The three nested config objects stay loose: they are large, already
 * typed as ClientData, and only ever pass through to the prompt builders — this
 * schema exists to stop a malformed payload reaching them, not to re-model them.
 */
export const clientDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  niche: z.string(),
  language: z.string(),
  tone: z.string(),
  targetAudience: z.string(),
  avoidTopics: z.string(),
  socialGoals: z.string(),
  contentPillars: z.array(
    z.object({ id: z.string(), pillar: z.string(), weight: z.number() })
  ),
  isHealthNiche: z.boolean().nullable(),
  topPerformingPosts: z.array(z.string()),
  defaultCarouselSlides: z.number(),
  defaultPostType: z.string().nullable(),
  requireSourceGrounding: z.boolean(),
  sourceStrategy: z.unknown().nullable(),
  languageNotes: z.string(),
  languageConfig: z.looseObject({
    language: z.string(),
    formality: z.string(),
    carouselSwipeCues: z.string(),
    languageInstructions: z.string(),
    languageNotes: z.string(),
    formalityRules: z.unknown().nullable(),
  }),
  postHistory: z.array(z.string()),
})

/** Body of POST /api/ai/generate-stream — the wizard's batch run. */
export const generateStreamSchema = z.object({
  clientId: z.string().min(1),
  platform: z.string().min(1),
  postType: z.enum(['single', 'carousel']),
  slideCount: z.number().int().min(1).optional(),
  targetPostCount: z.number().int().min(0).default(0),
  priorityPosts: z.array(z.unknown()).optional(),
  preloadedClientData: clientDataSchema,
})

/** Body of POST /api/ai/generate-from-idea — one post from a client's submitted idea. */
export const generateFromIdeaSchema = z.object({
  ideaId: z.string().min(1),
  postType: z.enum(['single', 'carousel']),
  slideCount: z.number().int().min(1).optional(),
  preloadedClientData: clientDataSchema,
})
