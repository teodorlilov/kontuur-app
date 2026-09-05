import 'server-only'

import { graphDelete, graphGet, graphPost } from '../graph-client'
import { fetchMediaSince } from '../insights'
import { IG_GRAPH_BASE } from '../constants'
import { graphAckSchema, igCommentCreatedSchema, igCommentsResponseSchema } from '../schemas'
import type { CommentablePost, CommentsAdapter, PlatformComment, PostComments } from './types'

/**
 * Instagram's comments, behind the shared contract.
 *
 * TWO failure modes here look alike and mean different things, and whatever surfaces this must
 * not conflate them, because the fix a person needs differs:
 *
 * 1. `withheld: true` on a SUCCESSFUL read — the APP lacks Advanced Access for
 *    `instagram_business_manage_comments`. Nothing throws; Instagram answers 200 with an empty
 *    list while the media's own count reads correctly. Affects every client. Only App Review
 *    fixes it.
 * 2. A thrown `GraphApiError` with `failure === 'permission'` — THIS CONNECTION's token predates
 *    the scope. Tokens do not gain permissions after issue, so an account connected before
 *    `manage_comments` joined the OAuth request fails here until that client reconnects.
 *    Affects one client, and the client can fix it today.
 *
 * "No comments yet" is a third state and is neither.
 */

/** `replies{...}` is a nested edge, not a scalar: Instagram returns a comment's replies inline. */
const COMMENT_FIELDS =
  'id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp,like_count,hidden}'

/** Instagram's page size for this edge. Requesting more is ignored. */
const COMMENTS_PAGE_LIMIT = 50

export const instagramComments: CommentsAdapter = {
  platform: 'instagram',
  label: 'Instagram',

  /**
   * The account's media, which already carries `comments_count` and every identity field the
   * queue renders — one call answering both questions.
   */
  async listCommentablePosts({ account, since }): Promise<CommentablePost[]> {
    const media = await fetchMediaSince(account.accountId, account.accessToken, since)
    return media.map((item) => ({
      externalPostId: item.id,
      commentCount: item.comments_count ?? 0,
      identity: {
        caption: item.caption ?? null,
        permalink: item.permalink ?? null,
        // thumbnail_url is video-only on /media; the image itself fills in elsewhere.
        thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
        mediaType: item.media_type ?? null,
        mediaProductType: item.media_product_type ?? null,
        postedAt: item.timestamp ?? null,
      },
    }))
  },

  async fetchComments({ account, externalPostId, expectedCount, after }): Promise<PostComments> {
    const params: Record<string, string> = {
      fields: COMMENT_FIELDS,
      limit: String(COMMENTS_PAGE_LIMIT),
    }
    if (after) params.after = after

    const data = await graphGet(
      igCommentsResponseSchema,
      `${IG_GRAPH_BASE}/${externalPostId}/comments`,
      account.accessToken,
      params
    )

    // Flattened here rather than by the caller: how a network delivers replies is its own
    // business, and Facebook delivers them from a different edge entirely.
    const comments = data.data.flatMap((comment) => [
      toPlatformComment(comment, null),
      ...(comment.replies?.data ?? []).map((reply) => toPlatformComment(reply, comment.id)),
    ])

    return {
      comments,
      // Only on the FIRST page: an empty later page is the end of the list, not a wall.
      withheld: !after && data.data.length === 0 && expectedCount > 0,
      nextCursor: data.paging?.cursors?.after ?? null,
    }
  },

  /**
   * Posted to the COMMENT's replies edge, not the media's — replying on the media edge creates a
   * new top-level comment instead of threading under the one being answered.
   */
  async reply({ account, commentId, message }): Promise<string> {
    const data = await graphPost(
      igCommentCreatedSchema,
      `${IG_GRAPH_BASE}/${commentId}/replies`,
      account.accessToken,
      { message }
    )
    return data.id
  },

  /** A POST with a QUERY parameter — Instagram does not accept `hide` in the body. */
  async setHidden({ account, commentId, hidden }): Promise<void> {
    await graphPost(
      graphAckSchema,
      `${IG_GRAPH_BASE}/${commentId}?hide=${hidden}`,
      account.accessToken,
      {}
    )
  },

  async remove({ account, commentId }): Promise<void> {
    await graphDelete(graphAckSchema, `${IG_GRAPH_BASE}/${commentId}`, account.accessToken)
  },
}

/**
 * One Instagram comment in the queue's vocabulary.
 *
 * `canHide` is unconditionally true: Instagram allows hiding any comment on the connected
 * account's own media and offers no per-comment flag to say otherwise. Facebook does, which is
 * why the field exists at all.
 */
function toPlatformComment(
  comment: {
    id: string
    text?: string
    username?: string
    timestamp?: string
    like_count?: number
    hidden?: boolean
  },
  parentId: string | null
): PlatformComment {
  return {
    id: comment.id,
    parentId,
    authorName: comment.username ?? null,
    text: comment.text ?? null,
    hidden: comment.hidden ?? false,
    canHide: true,
    likeCount: comment.like_count ?? null,
    commentedAt: comment.timestamp ?? null,
  }
}
