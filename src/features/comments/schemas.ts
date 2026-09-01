import { z } from 'zod'

/**
 * An Instagram comment id is NOT a uuid, so `parseActionId` does not apply here —
 * it is a numeric string Meta issues, and the only thing worth asserting about its
 * shape is that it is one. The real check is not syntactic: a comment id carries no
 * agency scope at all, so every action below resolves it through the stored row and
 * the client that owns it before touching Instagram.
 */
const commentId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[0-9_]+$/, 'not an Instagram comment id')

/**
 * Instagram rejects a comment over 2,200 characters, and an empty reply is not a
 * reply. Both bounds are here rather than in the UI so a hand-rolled request cannot
 * spend a Graph call to be told the same thing.
 */
export const replyToCommentInputSchema = z.object({
  commentId,
  message: z.string().trim().min(1).max(2200),
})

export const setCommentHiddenInputSchema = z.object({
  commentId,
  hidden: z.boolean(),
})

export const deleteCommentInputSchema = z.object({
  commentId,
})

export type ReplyToCommentInput = z.infer<typeof replyToCommentInputSchema>
export type SetCommentHiddenInput = z.infer<typeof setCommentHiddenInputSchema>
export type DeleteCommentInput = z.infer<typeof deleteCommentInputSchema>
