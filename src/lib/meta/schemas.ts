import { z } from 'zod'

/**
 * Meta Graph / Instagram Business Login response shapes.
 *
 * These are third-party responses, so they are parsed rather than asserted: the
 * OAuth callback writes their contents straight into social_connections, and a
 * shape change at Meta's end used to surface as `undefined` in the database
 * instead of an error at the boundary.
 *
 * Every schema is permissive about extra keys (Meta adds fields freely) and
 * strict about the ones we store.
 */

/**
 * Business Login wraps the token in a data array ({"data":[{access_token,...}]});
 * the legacy flat shape ({access_token,...}) still appears on some responses.
 * `user_id` arrives as a number or a string depending on the shape, so it is
 * coerced — everything downstream stores it as text.
 */
export const igShortLivedTokenSchema = z.looseObject({
  access_token: z.string().min(1),
  user_id: z.union([z.string(), z.number()]).transform(String),
})

/** The Business Login wrapper. Tried first; the flat schema above is the fallback. */
export const igShortLivedWrappedSchema = z.looseObject({
  data: z.array(igShortLivedTokenSchema).min(1),
})

export const igLongLivedTokenSchema = z.looseObject({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number(),
})

export const igUserSchema = z.looseObject({
  id: z.string(),
  username: z.string().optional(),
  name: z.string().optional(),
})

/** ig_refresh_token response; `error` arrives instead of a token when the refresh is rejected. */
export const igRefreshResponseSchema = z.looseObject({
  access_token: z.string().optional(),
  expires_in: z.number().optional(),
  error: z.looseObject({ message: z.string().optional(), code: z.number().optional() }).optional(),
})

export type IGShortLivedToken = { access_token: string; user_id: string }
export type IGLongLivedToken = z.infer<typeof igLongLivedTokenSchema>

// ── Content publishing shapes ──────────────────────────────────────────────

/** POST /{ig-user-id}/media and /{ig-user-id}/media_publish both return an id. */
export const igContainerResponseSchema = z.looseObject({
  id: z.string().min(1),
})

export const igContainerStatusSchema = z.looseObject({
  status_code: z.enum(['EXPIRED', 'ERROR', 'FINISHED', 'IN_PROGRESS', 'PUBLISHED']).optional(),
  status: z.string().optional(),
})

/** GET /{ig-user-id}/content_publishing_limit — quota over the trailing 24h. */
export const igPublishingLimitSchema = z.looseObject({
  data: z
    .array(
      z.looseObject({
        quota_usage: z.number(),
        config: z.looseObject({ quota_total: z.number().optional() }).optional(),
      })
    )
    .optional(),
})

/** GET /{ig-user-id}/media — the lean projection reconciliation reads. */
export const igRecentMediaSchema = z.looseObject({
  data: z.array(z.looseObject({ id: z.string(), timestamp: z.string().optional() })).optional(),
})

// ── Insights shapes ────────────────────────────────────────────────────────
//
// One envelope tolerates every shape the live probe recorded
// (memory: project_meta_probe_results): time_series entries carry values[]
// (end_time account-level, absent on media insights), total_value entries may
// carry value, breakdowns, both — or, when a breakdown is present, neither
// `value` nor `breakdowns[].results`. The silent-empty failure mode is
// `{"data":[]}` with HTTP 200, which parses fine here and MUST map to null
// downstream, never 0.

export const igInsightEntrySchema = z.looseObject({
  name: z.string(),
  values: z
    .array(
      z.looseObject({
        // `unknown`, not number: online_followers returns `{}` values even on a
        // real account. The extraction helpers keep only numbers.
        value: z.unknown().optional(),
        end_time: z.string().optional(),
      })
    )
    .optional(),
  total_value: z
    .looseObject({
      value: z.number().optional(),
      breakdowns: z
        .array(
          z.looseObject({
            dimension_keys: z.array(z.string()).optional(),
            // Absent entirely when the breakdown has no data.
            results: z
              .array(
                z.looseObject({
                  dimension_values: z.array(z.string()),
                  value: z.number(),
                })
              )
              .optional(),
          })
        )
        .optional(),
    })
    .optional(),
})

/** GET /{id}/insights for accounts and media alike. */
export const igInsightsEnvelopeSchema = z.looseObject({
  data: z.array(igInsightEntrySchema),
})

export type IGInsightEntry = z.infer<typeof igInsightEntrySchema>

/** GET /{ig-user-id}?fields=followers_count,follows_count,media_count */
export const igAccountFieldsSchema = z.looseObject({
  followers_count: z.number(),
  follows_count: z.number(),
  media_count: z.number(),
})

/** One /media item. thumbnail_url is video-only; media_product_type speaks FEED/REELS. */
export const igMediaItemSchema = z.looseObject({
  id: z.string(),
  caption: z.string().optional(),
  media_type: z.string().optional(),
  media_product_type: z.string().optional(),
  timestamp: z.string().optional(),
  like_count: z.number().optional(),
  comments_count: z.number().optional(),
  permalink: z.string().optional(),
  thumbnail_url: z.string().optional(),
  media_url: z.string().optional(),
})

/** A /media page; paging.next works as-is once the Bearer header is re-attached. */
export const igMediaListSchema = z.looseObject({
  data: z.array(igMediaItemSchema).optional(),
  paging: z.looseObject({ next: z.string().optional() }).optional(),
})

export type IGMediaItem = z.infer<typeof igMediaItemSchema>
export type IGMediaListPage = z.infer<typeof igMediaListSchema>

// ── Comments ──────────────────────────────────────────────────────────────────────────────────

/**
 * One comment on a media item.
 *
 * `username` and `text` are OPTIONAL, and that is the whole story of this feature: with Standard
 * (development) Access Instagram withholds the body and author of comments written by the general
 * public. The edge answers HTTP 200 with an empty `data` array — it does not error — so a schema
 * that required these fields would turn a permissions state into a parse crash.
 */
export const igCommentSchema = z.looseObject({
  id: z.string(),
  text: z.string().optional(),
  username: z.string().optional(),
  timestamp: z.string().optional(),
  like_count: z.number().optional(),
  hidden: z.boolean().optional(),
  /**
   * Replies arrive nested when asked for; absent otherwise.
   *
   * Typed with the fields the request actually asks for. It named `id` alone, so every other
   * field on a reply was carried by `looseObject` and invisible to the code reading it.
   */
  replies: z
    .looseObject({
      data: z.array(
        z.looseObject({
          id: z.string(),
          text: z.string().optional(),
          username: z.string().optional(),
          timestamp: z.string().optional(),
          like_count: z.number().optional(),
          hidden: z.boolean().optional(),
        })
      ),
    })
    .optional(),
})

export const igCommentsResponseSchema = z.looseObject({
  data: z.array(igCommentSchema),
  paging: z
    .looseObject({ cursors: z.looseObject({ after: z.string().optional() }).optional() })
    .optional(),
})

/** A created reply returns only its id, like every other Graph write. */
export const igCommentCreatedSchema = z.looseObject({ id: z.string() })

/**
 * `{ success: true }` — what every Graph write that returns no object answers.
 *
 * Shared by both networks: Instagram's hide and delete, Facebook's publish, hide and delete all
 * return exactly this. It was spelled twice, once per network, for one shape neither owns.
 */
export const graphAckSchema = z.looseObject({ success: z.boolean().optional() })

// ---- Facebook Login and Pages ----
// Shapes recorded in docs/META-FB-PROBE.md against a real Page, not taken from the docs.

/** Both Facebook token exchanges answer with this: the code swap and the long-lived upgrade. */
export const fbTokenSchema = z.looseObject({
  access_token: z.string(),
  /** Absent on a long-lived user token, which Facebook does not date. */
  expires_in: z.number().optional(),
})

export const fbUserSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
})

/**
 * One Page, from `/me/accounts` or read directly as `/{page-id}`.
 *
 * Both return the same shape, which is what lets a Page missing from the list be recovered by
 * id: the Page token rides in the response itself, with no expiry field anywhere, which is what
 * lets a Page connection store a null `token_expires_at`.
 *
 * `tasks` is what the PERSON may do with the Page and only `/me/accounts` returns it. What the
 * APP may do is a different question, answered by `fbDebugTokenSchema` below.
 */
export const fbPageSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  access_token: z.string(),
  category: z.string().optional(),
  tasks: z.array(z.string()).optional(),
})

export const fbPagesResponseSchema = z.looseObject({
  data: z.array(fbPageSchema),
})

/**
 * `POST /{page-id}/photos` and `POST /{page-id}/feed` both answer with just an id.
 *
 * The photo id is the handle a feed post attaches; the feed id is `<page-id>_<post-id>` and is
 * what `post_publications.external_post_id` stores. Neither response carries a status, because
 * neither call is asynchronous — probed live, recorded in `docs/META-FB-PROBE.md`.
 */
export const fbCreatedObjectSchema = z.looseObject({
  id: z.string(),
})

/**
 * `GET /{page-id}/published_posts` with a comment summary — the Page's own post list.
 *
 * `comments.summary(true).limit(0)` returns the tally without the bodies, which is the cheap
 * count the comment sync compares before fetching anything. Probed; see docs/META-FB-PROBE.md.
 */
export const fbPagePostsSchema = z.looseObject({
  data: z.array(
    z.looseObject({
      id: z.string(),
      message: z.string().optional(),
      permalink_url: z.string().optional(),
      full_picture: z.string().optional(),
      created_time: z.string().optional(),
      comments: z
        .looseObject({ summary: z.looseObject({ total_count: z.number().optional() }).optional() })
        .optional(),
    })
  ),
})

/**
 * One comment on a Facebook Page post.
 *
 * Every field name differs from Instagram's — `message` not `text`, `created_time` not
 * `timestamp`, `is_hidden` not `hidden`, and `from` is an object carrying a display NAME where
 * Instagram gives a `username` handle. Probed against a real visitor comment; see
 * `docs/META-FB-PROBE.md`.
 *
 * `comment_count` is how many REPLIES a comment has. Replies do not appear on the post's own
 * comments edge, so a non-zero count is the signal to read `/{comment-id}/comments`.
 *
 * `can_hide` is per comment, not per Page: Facebook refuses to hide a Page's own comment and
 * says so here before the attempt.
 */
export const fbCommentSchema = z.looseObject({
  id: z.string(),
  message: z.string().optional(),
  from: z.looseObject({ name: z.string().optional(), id: z.string().optional() }).optional(),
  created_time: z.string().optional(),
  like_count: z.number().optional(),
  comment_count: z.number().optional(),
  can_hide: z.boolean().optional(),
  is_hidden: z.boolean().optional(),
})

export const fbCommentsResponseSchema = z.looseObject({
  data: z.array(fbCommentSchema),
  paging: z
    .looseObject({ cursors: z.looseObject({ after: z.string().optional() }).optional() })
    .optional(),
})

/** `GET /{media-id}?fields=permalink` — where a person can see an Instagram post. */
export const igPermalinkSchema = z.looseObject({
  permalink: z.string().optional(),
})

/** `GET /{post-id}?fields=permalink_url` — the same question on a Facebook Page. */
export const fbPermalinkSchema = z.looseObject({
  permalink_url: z.string().optional(),
})

/**
 * `/debug_token` — the record of what this token was actually granted, per asset.
 *
 * `scopes` says a permission was granted at all; `granular_scopes` says which Pages it covers.
 * Those are different questions and Facebook answers them differently: a token can report
 * `pages_show_list` as granted while covering exactly one Page, or none.
 *
 * An ABSENT `target_ids` means the scope covers every asset — the shape Instagram's scopes have
 * on this same token, and the shape "opt in to all current and future Pages" produces. An
 * absent SCOPE means it was not granted at all. Empty and absent are not the same answer, which
 * is why the parsed field stays optional rather than defaulting to `[]`.
 */
export const fbDebugTokenSchema = z.looseObject({
  data: z.looseObject({
    is_valid: z.boolean().optional(),
    granular_scopes: z
      .array(
        z.looseObject({
          scope: z.string(),
          target_ids: z.array(z.string()).optional(),
        })
      )
      .optional(),
  }),
})
