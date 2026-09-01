import 'server-only'

import { graphDelete, graphGet, graphPost } from './graph-client'
import { IG_GRAPH_BASE } from './constants'
import {
  igCommentCreatedSchema,
  igCommentsResponseSchema,
  igSuccessSchema,
  type IgComment,
} from './schemas'

/**
 * Reading and moderating Instagram comments.
 *
 * TWO failure modes here look similar and mean different things. Whatever surfaces this must not
 * conflate them, because the fix a user needs differs:
 *
 * 1. `withheld: true` on a successful read — the APP lacks Advanced Access for
 *    `instagram_business_manage_comments`. Nothing throws; Instagram answers 200 with an empty
 *    list. Affects every client. Fixed only by App Review.
 * 2. A thrown `GraphApiError` with `failure === 'permission'` — THIS CONNECTION's token predates
 *    the scope. Tokens do not gain permissions after they are issued, so every account connected
 *    before `manage_comments` was added to the OAuth request will fail here until that client
 *    reconnects. Affects one client, and the client can fix it today.
 *
 * "No comments yet" is a third state and is neither of those.
 */

/** The fields a comment list needs. `replies{...}` is a nested edge, not a scalar. */
const COMMENT_FIELDS =
  'id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp,hidden}'

/** Instagram's page size for this edge. Requesting more is ignored. */
const COMMENTS_PAGE_LIMIT = 50

export interface MediaComments {
  comments: IgComment[]
  /**
   * The post HAS comments that Instagram did not return.
   *
   * Not an error and not an empty post — a permissions state. With Standard (development) Access
   * the `/{media}/comments` edge answers HTTP 200 with an empty `data` array and valid paging
   * cursors, while `comments_count` on the media itself reads correctly. `?fields=comments{...}`
   * behaves the same way, silently dropping the field. Instagram withholds the body and author of
   * comments written by the general public until the app has **Advanced Access** for
   * `instagram_business_manage_comments`, granted through App Review.
   *
   * This was established empirically against a live account, not read from the docs, and it is the
   * single thing most likely to be mistaken for a bug: everything returns 200, nothing throws, and
   * the list is simply empty. Surfacing it as a flag means the UI can say so instead of rendering
   * a blank panel under a post that visibly has comments.
   *
   * Before App Review, the flow is still testable: a user who holds a role on the Meta app
   * (admin, developer or tester) will have THEIR comments returned.
   */
  withheld: boolean
  /** Cursor for the next page, when there is one. */
  nextCursor: string | null
}

/**
 * Read a media item's comments.
 *
 * `expectedCount` is the media's own `comments_count`, which the caller already holds from the
 * media list. It is required rather than optional because it is the only way to tell "no comments"
 * from "comments withheld" — the edge itself reports both as an empty array.
 */
export async function fetchMediaComments(
  mediaId: string,
  accessToken: string,
  expectedCount: number,
  after?: string
): Promise<MediaComments> {
  const params: Record<string, string> = {
    fields: COMMENT_FIELDS,
    limit: String(COMMENTS_PAGE_LIMIT),
  }
  if (after) params.after = after

  const data = await graphGet(
    igCommentsResponseSchema,
    `${IG_GRAPH_BASE}/${mediaId}/comments`,
    accessToken,
    params
  )

  const comments = data.data
  return {
    comments,
    // Only on the FIRST page: an empty later page is the end of the list, not a permissions wall.
    withheld: !after && comments.length === 0 && expectedCount > 0,
    nextCursor: data.paging?.cursors?.after ?? null,
  }
}

/**
 * Reply to a comment, as the connected Instagram account.
 *
 * Posted to the COMMENT's replies edge, not the media's — replying on the media edge creates a
 * new top-level comment instead of threading under the one being answered.
 */
export async function replyToComment(
  commentId: string,
  accessToken: string,
  message: string
): Promise<string> {
  const data = await graphPost(
    igCommentCreatedSchema,
    `${IG_GRAPH_BASE}/${commentId}/replies`,
    accessToken,
    { message }
  )
  return data.id
}

/**
 * Hide or unhide a comment.
 *
 * Hiding is the reversible moderation action and should be preferred over deleting: the comment
 * stops appearing publicly, its author is not told, and it can be brought back. It is a POST with
 * a query parameter — Instagram does not accept `hide` in the body.
 */
export async function setCommentHidden(
  commentId: string,
  accessToken: string,
  hidden: boolean
): Promise<void> {
  await graphPost(igSuccessSchema, `${IG_GRAPH_BASE}/${commentId}?hide=${hidden}`, accessToken, {})
}

/**
 * Delete a comment. Irreversible — prefer `setCommentHidden`.
 *
 * Only comments on the connected account's own media can be deleted, and only ones it is allowed
 * to moderate; anything else comes back as a Graph error the caller's boundary logs.
 */
export async function deleteComment(commentId: string, accessToken: string): Promise<void> {
  await graphDelete(igSuccessSchema, `${IG_GRAPH_BASE}/${commentId}`, accessToken)
}
