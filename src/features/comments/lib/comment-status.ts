import type { CommentStatus } from '@/types/api'

/**
 * Has this been dealt with?
 *
 * The one definition of that question. The queue's tabs and the sidebar badge both
 * call it, over the same cached read, which is what stops them disagreeing — and
 * the reason there is no `status` column. A stored status would drift the moment
 * someone replied from the Instagram app, and the sync would have no way to notice.
 *
 * Order matters: hidden wins. A hidden comment we also replied to is hidden — the
 * moderation decision is the later and stronger one, and showing it under Answered
 * would put it back in front of someone who has already dealt with it.
 */
export function commentStatus(
  comment: { hidden: boolean },
  replies: ReadonlyArray<{ authorUsername: string | null }>,
  accountName: string | null
): CommentStatus {
  if (comment.hidden) return 'hidden'
  if (replies.some((reply) => isOurs(reply.authorUsername, accountName))) return 'answered'
  return 'needs_reply'
}

/**
 * Was this reply posted by the client's own account?
 *
 * Case-insensitive because the two sides come from different places. Instagram
 * hands back comment authors as lowercase usernames, but `social_connections.
 * account_name` falls back to the account's DISPLAY name when the username is
 * absent (`api/meta/callback/route.ts`) — "Haelan Clinic" where the comment says
 * "haelanclinic". An exact match would silently file every one of our own replies
 * as unanswered for any account that took that fallback.
 *
 * A null on either side is not a match. Null author means Advanced Access is
 * missing and Instagram withheld it, which is precisely the case where we must not
 * guess that it was us.
 */
export function isOurs(authorUsername: string | null, accountName: string | null): boolean {
  if (!authorUsername || !accountName) return false
  return authorUsername.toLowerCase() === accountName.toLowerCase()
}

/** The queue's unanswered count, and the sidebar badge's — same function, same answer. */
export function countNeedingReply(
  groups: ReadonlyArray<{ comments: ReadonlyArray<{ status: CommentStatus }> }>
): number {
  return groups.reduce(
    (total, group) => total + group.comments.filter((c) => c.status === 'needs_reply').length,
    0
  )
}
