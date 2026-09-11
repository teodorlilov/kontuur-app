import 'server-only'

import { mapWithConcurrency } from '@/lib/concurrency'
import { PLATFORM_NAMES } from '@/lib/meta/platforms'
import { graphDelete, graphGet, graphPost } from '../graph-client'
import { FB_GRAPH_BASE } from '../constants'
import {
  fbCommentSchema,
  fbCommentsResponseSchema,
  fbPagePostsSchema,
  graphAckSchema,
  graphCreatedIdSchema,
  type FBComment,
} from '../schemas'
import type {
  CommentablePost,
  CommentsAdapter,
  NetworkAccount,
  PlatformComment,
  PostComments,
} from './types'

/**
 * A Facebook Page's comments, behind the shared contract.
 *
 * The shape differs from Instagram's in every field name and in one structural way, and both
 * were probed against a real visitor comment rather than read from the reference — see
 * `docs/META-FB-PROBE.md`.
 *
 * **Replies are not on the post's edge.** `GET /{post-id}/comments` returns top-level comments
 * only, each carrying `comment_count`; a reply is reachable only at `GET /{comment-id}/comments`.
 * Instagram nests replies in the same response, so this adapter makes a second round of calls
 * where Instagram makes none — which is exactly the difference the contract exists to hide.
 */

/** Matches Instagram's page size, so a queue page holds the same amount from either network. */
const COMMENTS_PAGE_LIMIT = 50

// Derived from the schema's own keys so the request and the parse cannot drift apart.
const COMMENT_FIELDS = Object.keys(fbCommentSchema.shape).join(',')

/** How far back one sweep looks. Matches the media page the Instagram side pulls. */
const POST_PAGE_LIMIT = 50

/** Reply reads run concurrently but politely, as the carousel uploads do. */
const REPLY_FETCH_CONCURRENCY = 3

export const facebookComments: CommentsAdapter = {
  platform: 'facebook',
  label: PLATFORM_NAMES.facebook,
  // Probed 2026-09-06: `comments.summary(true)` said 2 while the edge itself listed 1, and
  // read 0 over a stored comment. A tally that disagrees with its own edge cannot gate a
  // fetch — every post that has, or had, comments is read instead.
  countIsExact: false,

  /**
   * The Page's published posts, with the comment tally attached.
   *
   * `comments.summary(true).limit(0)` is what makes this one call rather than one per post: it
   * returns `total_count` and no bodies. Unpublished posts are excluded by the edge itself,
   * which is correct — nobody can comment on something that is not live.
   *
   * The identity rides on the same call — `message`, `permalink_url` and `full_picture` cost
   * nothing extra here and are what the queue renders above a conversation. Before
   * `platform_post_metrics` held both networks they had nowhere to live, and a Page post showed
   * as an untitled grey box with no link.
   */
  async listCommentablePosts({ account, since }): Promise<CommentablePost[]> {
    const posts = await graphGet(
      fbPagePostsSchema,
      `${FB_GRAPH_BASE}/${account.accountId}/published_posts`,
      account.accessToken,
      {
        fields:
          'id,created_time,message,permalink_url,full_picture,comments.summary(true).limit(0)',
        since: String(Math.floor(new Date(since).getTime() / 1000)),
        limit: String(POST_PAGE_LIMIT),
      }
    )
    return posts.data.map((post) => ({
      externalPostId: post.id,
      commentCount: post.comments?.summary?.total_count ?? 0,
      identity: {
        caption: post.message ?? null,
        permalink: post.permalink_url ?? null,
        thumbnailUrl: post.full_picture ?? null,
        // Facebook offers no equivalent of Instagram's media_type/media_product_type on this
        // edge, and inventing one would put a guess in a column the analytics page reads.
        mediaType: null,
        mediaProductType: null,
        postedAt: post.created_time ?? null,
      },
    }))
  },

  async fetchComments({ account, externalPostId, expectedCount, after }): Promise<PostComments> {
    const params: Record<string, string> = {
      fields: COMMENT_FIELDS,
      limit: String(COMMENTS_PAGE_LIMIT),
    }
    if (after) params.after = after

    const page = await graphGet(
      fbCommentsResponseSchema,
      `${FB_GRAPH_BASE}/${externalPostId}/comments`,
      account.accessToken,
      params
    )

    // Only comments that HAVE replies are followed; `comment_count` is what makes that cheap,
    // and it is why the field is requested at all.
    const replies = await mapWithConcurrency(
      page.data.filter((comment) => (comment.comment_count ?? 0) > 0),
      REPLY_FETCH_CONCURRENCY,
      (comment) => fetchReplies(account, comment.id)
    )

    return {
      comments: [
        ...page.data.map((comment) => toPlatformComment(comment, null)),
        ...replies.flat(),
      ],
      // The same evidence Instagram uses, and the same caveat: only the FIRST page, because an
      // empty later page is the end of the list. Whether Facebook withholds under Standard
      // Access the way Instagram does is NOT established — the probe ran as a person holding a
      // role on the app, which is precisely the case Instagram exempts.
      withheld: !after && page.data.length === 0 && expectedCount > 0,
      nextCursor: page.paging?.cursors?.after ?? null,
    }
  },

  /**
   * Answering uses the same edge as commenting — the parent is the path, not a parameter.
   *
   * A reply's id is keyed to the POST, not to its parent: replying to
   * `122167637282960180_1386857980259623` produced `122167637282960180_1584549173454318`.
   */
  async reply({ account, commentId, message }): Promise<string> {
    const data = await graphPost(
      graphCreatedIdSchema,
      `${FB_GRAPH_BASE}/${commentId}/comments`,
      account.accessToken,
      { message }
    )
    return data.id
  },

  /**
   * Hiding is a field write on the comment itself, in the body — unlike Instagram's query
   * parameter.
   *
   * Refused on a Page's own comment with `(#200) Can not hide or unhide this comment`, which
   * the action surfaces as its error. Graph's per-comment `can_hide` flag could say so before
   * the attempt, but nothing stores or reads it — see docs/META-FB-PROBE.md if a control ever
   * wants to disable itself up front.
   */
  async setHidden({ account, commentId, hidden }): Promise<void> {
    await graphPost(graphAckSchema, `${FB_GRAPH_BASE}/${commentId}`, account.accessToken, {
      is_hidden: hidden,
    })
  },

  async remove({ account, commentId }): Promise<void> {
    await graphDelete(graphAckSchema, `${FB_GRAPH_BASE}/${commentId}`, account.accessToken)
  },
}

/** One comment's replies, already stamped with the parent they answer. */
async function fetchReplies(
  account: NetworkAccount,
  commentId: string
): Promise<PlatformComment[]> {
  const page = await graphGet(
    fbCommentsResponseSchema,
    `${FB_GRAPH_BASE}/${commentId}/comments`,
    account.accessToken,
    { fields: COMMENT_FIELDS, limit: String(COMMENTS_PAGE_LIMIT) }
  )
  return page.data.map((reply) => toPlatformComment(reply, commentId))
}

/**
 * One Facebook comment in the queue's vocabulary.
 *
 * `from.name` is a display name, where Instagram's `username` is a handle. Both answer "who
 * said it" and neither is more correct, so both land in the same field.
 */
function toPlatformComment(comment: FBComment, parentId: string | null): PlatformComment {
  return {
    id: comment.id,
    parentId,
    authorName: comment.from?.name ?? null,
    text: comment.message ?? null,
    hidden: comment.is_hidden ?? false,
    likeCount: comment.like_count ?? null,
    commentedAt: comment.created_time ?? null,
  }
}
