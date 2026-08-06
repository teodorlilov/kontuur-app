import { z } from 'zod'

/**
 * One idea brief as a client submits it through the public link.
 *
 * This is the single definition of that shape: the public form, the submit
 * route and the insert helper previously each hand-wrote their own copy, and
 * they had already drifted apart.
 */
export const ideaBriefSchema = z.object({
  ideaText: z.string().trim().min(1),
  extraNotes: z.string().optional(),
  platform: z.string().optional(),
  targetDate: z.string().optional(),
})

/** Public submission payload: the client's link token plus at least one brief. */
export const submitIdeasSchema = z.object({
  token: z.string().min(1),
  ideas: z.array(ideaBriefSchema).min(1),
})

/** The four states an idea moves through; mirrors IdeaStatus in types/api.ts. */
export const ideaStatusSchema = z.enum(['new', 'generating', 'generated', 'dismissed'])

/**
 * PATCH /api/ideas accepts two distinct operations on one route, so the body is
 * a union rather than a bag of optional fields — that way "mark these read" can
 * never be parsed as a malformed status update.
 */
export const updateIdeasSchema = z.union([
  z.object({
    action: z.literal('mark_read'),
    ids: z.array(z.string()).min(1),
  }),
  z
    .object({
      ideaId: z.string().min(1),
      status: ideaStatusSchema.optional(),
      postId: z.string().optional(),
    })
    .refine((body) => body.status !== undefined || body.postId !== undefined, {
      message: 'status or postId is required',
    }),
])

/** Server-action arg: the client whose idea link is being issued. */
export const ensureIdeaTokenSchema = z.uuid()

export type IdeaBrief = z.infer<typeof ideaBriefSchema>
export type SubmitIdeasInput = z.infer<typeof submitIdeasSchema>
export type UpdateIdeasInput = z.infer<typeof updateIdeasSchema>
