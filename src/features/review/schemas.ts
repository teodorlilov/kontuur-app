import { z } from 'zod'

/**
 * Caps on what a client's approval link can send.
 *
 * `submitApproval` is one of only two unauthenticated writes in the app — it is
 * authorised by a URL token, not a session, and runs on the service-role client. That
 * combination is exactly why the shape has to be proved before the write rather than
 * trusted from the caller: the only thing standing between a leaked or forwarded link
 * and the database is this file.
 *
 * Generous against real use. A note is a paragraph of feedback on one post, and a batch
 * is however many posts one approval email covered — a normal week is single digits.
 * Exported so `feedback-box` can enforce the same number as a `maxLength` instead of
 * letting a client discover it as a rejection after typing.
 */
export const APPROVAL_NOTE_MAX = 2000

/**
 * Notes one submission may carry — one per post in the batch, so this bounds the batch
 * rather than the client's typing. Well above any batch the app produces.
 */
export const APPROVAL_NOTES_MAX = 100

/**
 * The client's verdict on a batch.
 *
 * An enum, not a hand-rolled `!==` pair. The route-level version of that mistake is what
 * `boundary-validation.test.ts` exists to stop (§7.4) — a hand-written check on one field
 * reads as validation while every other field passes through untouched, which is exactly
 * what happened here: `status` was checked and `postNotes` was not.
 */
export const approvalStatusSchema = z.enum(['approved', 'changes_requested'])

export type ApprovalStatus = z.infer<typeof approvalStatusSchema>

/** One post's feedback, as the public approval page submits it. */
const approvalNoteSchema = z.object({
  postId: z.uuid(),
  note: z.string().trim().min(1).max(APPROVAL_NOTE_MAX),
})

/**
 * A whole approval submission.
 *
 * The token is `min(1)` rather than a uuid: `batch_id` is minted by the send flow and
 * the lookup is an equality match that finds nothing for a malformed value, so shape is
 * not where a bad token needs to fail.
 */
export const submitApprovalSchema = z.object({
  token: z.string().trim().min(1).max(200),
  status: approvalStatusSchema,
  postNotes: z.array(approvalNoteSchema).max(APPROVAL_NOTES_MAX).optional(),
})

export type SubmitApprovalInput = z.infer<typeof submitApprovalSchema>
