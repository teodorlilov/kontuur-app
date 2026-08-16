import { z } from 'zod'
import { MAX_CAROUSEL_SLIDES, MIN_CAROUSEL_SLIDES, PLATFORMS } from '@/utils/constants'
import type { PriorityPost } from '@/types/api'

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
  contentPillars: z.array(
    z.object({ id: z.string(), pillar: z.string(), weight: z.number() })
  ),
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
 * field, empty until typed. `platform: ''` inherits the run platform; a value
 * overrides it for that one post. The enum is load-bearing: it is what
 * guarantees only canonical display-case values ever reach `posts.platform`,
 * whose CHECK (20260809) rejects anything else.
 */
export const priorityPostSchema = z.object({
  title: z.string().trim().min(1).max(200),
  brief: z.string().max(2000).default(''),
  targetDate: z.literal('').or(z.iso.date()).default(''),
  platform: z.literal('').or(z.enum(PLATFORMS)).default(''),
})

// Drift guard, forward direction (the stored-validation-schema idiom).
// PriorityPost stays hand-written in types/api.ts — importing this schema there
// would point types/ at a feature and invite a cycle — and the backward
// direction cannot hold on purpose: the schema narrows `platform` to the enum
// while the type carries `string`, exactly like `targetDate`.
type SchemaPriorityPost = z.infer<typeof priorityPostSchema>
const _priorityPostForward: PriorityPost = null as unknown as SchemaPriorityPost
void _priorityPostForward

/** Body of POST /api/ai/generate-stream — the wizard's batch run. */
export const generateStreamSchema = z.object({
  clientId: z.string().min(1),
  // The run default every theme without its own platform falls back to.
  platform: z.enum(PLATFORMS),
  postType: z.enum(['single', 'carousel']),
  // Bounded by the same constants the picker offers. It was `.min(1)` and unbounded
  // above, so a hand-made request could ask the writer for a 500-slide carousel —
  // one prompt, one very expensive call, and a draft nothing in the app can render.
  slideCount: z.number().int().min(MIN_CAROUSEL_SLIDES).max(MAX_CAROUSEL_SLIDES).optional(),
  targetPostCount: z.number().int().min(0).default(0),
  priorityPosts: z.array(priorityPostSchema).optional(),
  preloadedClientData: clientDataSchema,
})

/**
 * The wizard's draft-visual generation request. `slides` carries the whole array rather than the
 * one slide's fields so the route can hand it straight to `slideTextBlock` — the same derivation
 * the persisted-post path uses, instead of a second copy of the carousel-vs-single branch.
 *
 * `slideCount` is gone with it: the array's own length is the count, and the two could disagree.
 */
export const generateDraftVisualSchema = z.object({
  clientId: z.string().min(1),
  draftId: z.string().min(1),
  position: z.number().int().min(0),
  postType: z.string().min(1),
  slides: z.array(z.object({ headline: z.string(), body: z.string() })).default([]),
  caption: z.string().nullable().default(null),
})

/** Discard cleanup: delete a draft's stored visuals. Paths are re-checked against the client's
 *  prefix in the route — this only proves the shape. */
export const deleteDraftVisualsSchema = z.object({
  clientId: z.string().min(1),
  storagePaths: z.array(z.string().min(1)).min(1),
})
