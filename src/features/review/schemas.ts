import { z } from 'zod'

/**
 * Body of /api/approval/send and /api/approval/email: a batch is defined by
 * exactly one of a scheduled week (calendar, done view) or an explicit post
 * selection (the queue's send-to-client).
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
