import { z } from 'zod'

/**
 * Body of /api/approval/send and /api/approval/email: a batch is defined by
 * exactly one of a scheduled week (calendar, done view) or an explicit post
 * selection (the queue's send-to-client).
 *
 * In `lib/`, not inside the review feature, because three features and two routes speak
 * it. `request-approval.ts` beside this file types its input from it, so the client and
 * the server now share one declaration of what an approval request *is* rather than one
 * validating and three guessing.
 */
export const approvalRequestSchema = z
  .object({
    clientId: z.string().uuid(),
    weekStart: z.string().min(1).optional(),
    postIds: z.array(z.string().uuid()).min(1).optional(),
  })
  .refine((value) => Boolean(value.weekStart) !== Boolean(value.postIds), {
    message: 'Provide exactly one of weekStart or postIds',
  })

export type ApprovalRequest = z.infer<typeof approvalRequestSchema>
