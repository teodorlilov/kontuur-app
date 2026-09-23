import { z } from 'zod'
import { MAX_CAROUSEL_SLIDES, MAX_POSTS_PER_RUN, MIN_CAROUSEL_SLIDES } from '@/utils/constants'
import type { PriorityPost } from '@/types/api'

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
        retired_at: z.string().nullable(),
        created_at: z.string(),
      })
    )
    .default([]),
})

/**
 * The generation context the wizard round-trips back to the AI routes.
 *
 * Every field here is interpolated into an LLM prompt, so the scalars are checked
 * strictly. The three nested config objects stay loose: they are large, already
 * typed as ClientData, and only ever pass through to the prompt builders — this
 * schema exists to stop a malformed payload reaching them, not to re-model them.
 */
const clientDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  niche: z.string(),
  language: z.string(),
  tone: z.string(),
  targetAudience: z.string(),
  avoidTopics: z.string(),
  socialGoals: z.string(),
  contentPillars: z.array(z.object({ id: z.string(), pillar: z.string(), weight: z.number() })),
  isHealthNiche: z.boolean().nullable(),
  defaultCarouselSlides: z.number(),
  defaultPostType: z.string().nullable(),
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

/**
 * One user-authored brief on the wire. `''` means "not chosen" for the optional
 * fields, matching the public idea form's convention — the editor ships every
 * field, empty until typed.
 *
 * A brief used to carry a platform, which is how one post in a run could be written
 * for a different network than the rest. Copy is no longer written for a network at
 * all — where a post goes is decided when it is scheduled — so the field is gone
 * rather than defaulted.
 */
export const priorityPostSchema = z.object({
  title: z.string().trim().min(1).max(200),
  brief: z.string().max(2000).default(''),
  targetDate: z.literal('').or(z.iso.date()).default(''),
})

// Drift guard, forward direction (the stored-validation-schema idiom).
// PriorityPost stays hand-written in types/api.ts — importing this schema there
// would point types/ at a feature and invite a cycle — and the backward
// direction cannot hold on purpose: the schema narrows `targetDate` to an ISO date
// while the type carries `string`.
type SchemaPriorityPost = z.infer<typeof priorityPostSchema>
const _priorityPostForward: PriorityPost = null as unknown as SchemaPriorityPost
void _priorityPostForward

/**
 * Body of POST /api/ai/generate-stream — the wizard's batch run. `targetPostCount` and
 * `priorityPosts` are bounded at MAX_POSTS_PER_RUN, the stepper's own ceiling, because the run
 * reserves that many drafts from the allowance before any model call.
 */
export const generateStreamSchema = z.object({
  clientId: z.string().min(1),
  postType: z.enum(['single', 'carousel']),
  // Bounded by the same constants the picker offers. It was `.min(1)` and unbounded
  // above, so a hand-made request could ask the writer for a 500-slide carousel —
  // one prompt, one very expensive call, and a draft nothing in the app can render.
  slideCount: z.number().int().min(MIN_CAROUSEL_SLIDES).max(MAX_CAROUSEL_SLIDES).optional(),
  targetPostCount: z.number().int().min(0).max(MAX_POSTS_PER_RUN).default(0),
  priorityPosts: z.array(priorityPostSchema).max(MAX_POSTS_PER_RUN).optional(),
  preloadedClientData: clientDataSchema,
  /** The client idea this run answers, when the wizard was opened from one. Verified server-side. */
  ideaId: z.uuid().optional(),
})
