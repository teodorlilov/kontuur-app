/**
 * Canonical Supabase select column strings.
 *
 * Rules:
 * - Every .select() call for a full row must reference a constant from this file.
 * - Narrow auth checks ('id', 'agency_id') stay inline — intentionally minimal.
 * - Joined selects with relationship filters stay inline at the call site.
 * - If you add a column to a table, update the relevant constant here first.
 */

import type {
  ClientRow,
  ClientSourceRow,
  IGAccountMetricsRow,
  IGAudienceSnapshotsRow,
  IGCommentRow,
  IGPostMetricsRow,
  PostPublicationRow,
  PostRow,
  SocialConnectionRow,
  UserRow,
} from '@/types'

/**
 * `[a, b, c]` joined by `D`, as a literal type rather than plain `string`.
 *
 * Needed because the Supabase client infers a query's result shape from the *literal*
 * text of the select string. `keys.join(', ')` is typed `string`, which collapses that
 * inference to `GenericStringError` at every call site — so a column list built from an
 * array has to hand the literal back.
 *
 * Local to this file: one consumer, and it is a workaround for one library's typing
 * rather than a utility anything else should reach for.
 */
type Join<T extends readonly string[], D extends string> = T extends readonly [
  infer Head extends string,
  ...infer Tail extends string[],
]
  ? Tail extends readonly []
    ? Head
    : `${Head}${D}${Join<Tail, D>}`
  : ''

// posts

/**
 * The post projection, as one list.
 *
 * The select string and its TypeScript type both derive from this array, because
 * declaring them separately is how they drift: this file listed 23 columns while
 * `calendar/page.tsx` typed 15 of them and `review/page.tsx` typed 18 — disagreeing with
 * each other about `was_rewritten`, `rewrite_count` and `topic_summary`, and leaving six
 * columns fetched on every load and typed nowhere.
 *
 * `row-mirrors.test.ts` could not catch that: each of those was a `Pick<PostRow, …>`, so
 * the guard was satisfied while four projections of one table pulled apart. The `satisfies`
 * below closes it one level up — rename a column in the schema and this is a build error.
 */
export const POST_COLUMN_KEYS = [
  'id',
  'client_id',
  'caption',
  'post_type',
  'slides_json',
  'validation_json',
  'status',
  'priority',
  'scheduled_at',
  'quality_score_avg',
  'was_rewritten',
  'rewrite_count',
  'source_url',
  'source_title',
  'source_type',
  'pillar',
  'source_excerpt',
  'client_source_id',
  'topic_summary',
  'created_at',
] as const satisfies readonly (keyof PostRow)[]

/**
 * The wire format.
 *
 * The assertion re-states what `join` provably produces — the runtime value and the
 * asserted type are the same characters — and is load-bearing: without it the constant
 * is plain `string` and Supabase stops inferring result shapes from it.
 */
export const POST_COLUMNS = POST_COLUMN_KEYS.join(', ') as Join<typeof POST_COLUMN_KEYS, ', '>

/**
 * The same list as a type — what a `POST_COLUMNS` select actually returns.
 *
 * Pages import this instead of restating a `Pick`. Adding a column to the array above
 * reaches the query and every reader at once; there is no second place to forget.
 */
export type PostColumns = Pick<PostRow, (typeof POST_COLUMN_KEYS)[number]>

/*
 * The calendar had its own projection until this change. It differed by exactly two columns,
 * `publish_error` and `publish_attempts`, and both moved onto `post_publications` when a post
 * gained more than one destination — a failure belongs to the destination that had it, not to
 * the content. That left `CALENDAR_POST_COLUMN_KEYS` a verbatim spread of `POST_COLUMN_KEYS`
 * and `CalendarPostColumns` type-identical to `PostColumns`: one projection under two names.
 *
 * It was kept for a while on the argument that the calendar is the reader most likely to need
 * a column the others do not. That is a future need, and carrying a duplicate for it is what
 * CLAUDE.md's "abstract only what is needed now" rules out — re-splitting is two lines on the
 * day it is actually needed. The calendar selects `POST_COLUMNS` with `PUBLICATION_EMBED`.
 */

/**
 * A post's destinations, embedded.
 *
 * Every surface that used to read `posts.status` for 'published'/'failed' reads these
 * instead, because that is where the answer moved. Named once so the calendar, the review
 * queue and the dashboard cannot embed three different subsets and disagree about what a
 * post's publish state is.
 */
/**
 * Everything a publish attempt reads from a destination.
 *
 * Lived in `publication-store.ts` as a hand-typed 11-column string beside a `Pick` listing the
 * same eleven — one column list written twice, in a feature, while this file already owned the
 * other projection of the same table (`PUBLICATION_EMBED` below). Same shape as every other
 * projection here now: one key array, joined for the query and `Pick`ed for the type, so a
 * column cannot reach one and miss the other.
 *
 * The lifecycle narrowing stays with the store — `PublicationStatus` lives in
 * `lib/posts/publish-state.ts`, which imports from this file, and pulling it in here would
 * close the loop.
 */
export const PUBLICATION_KEYS = [
  'id',
  'post_id',
  'platform',
  'account_id',
  'status',
  'external_post_id',
  'publish_ref',
  'published_at',
  'publish_error',
  'publish_attempts',
  'publish_claimed_at',
] as const satisfies readonly (keyof PostPublicationRow)[]

export const PUBLICATION_COLUMNS = PUBLICATION_KEYS.join(', ') as Join<
  typeof PUBLICATION_KEYS,
  ', '
>

export type PublicationColumns = Pick<PostPublicationRow, (typeof PUBLICATION_KEYS)[number]>

export const PUBLICATION_EMBED =
  'post_publications(id, platform, status, published_at, publish_error)'

/**
 * The embed as a type. Derived, not restated — `row-mirrors.test.ts` correctly called the
 * hand-written version a copy of the table, which is how a projection and its type drift.
 */
export type PublicationEmbedColumns = Pick<
  PostPublicationRow,
  'id' | 'platform' | 'status' | 'published_at' | 'publish_error'
>

// clients
export const CLIENT_COLUMNS =
  'id, name, niche, posts_per_week, language, website_url, contact_email, created_at'

export const CLIENT_LIST_COLUMNS = 'id, name, niche, posts_per_week, language, created_at'

/**
 * The four fields an AI prompt needs to speak for a client. Narrower than
 * CLIENT_LIST_COLUMNS on purpose — a prompt has no use for posts_per_week or
 * created_at, and both readers pair this with an `agency_id` ownership filter.
 */
const CLIENT_AI_CONTEXT_KEYS = [
  'id',
  'name',
  'niche',
  'language',
] as const satisfies readonly (keyof ClientRow)[]

export const CLIENT_AI_CONTEXT_COLUMNS = CLIENT_AI_CONTEXT_KEYS.join(', ') as Join<
  typeof CLIENT_AI_CONTEXT_KEYS,
  ', '
>

/** The companion this constant shipped without — `fetchClientData` cast the result to a
 *  hand-written `ClientIdentity` that restated all four. */
export type ClientAIContextColumns = Pick<ClientRow, (typeof CLIENT_AI_CONTEXT_KEYS)[number]>

/** All a re-read needs: the site to read, and the id proving the row was found. */
export const CLIENT_WEBSITE_COLUMNS = 'id, website_url'

/**
 * Clients roster. The social_connections embed is a REVERSE relationship
 * (social_connections holds client_id), so PostgREST returns an ARRAY here —
 * unlike brand_profiles above, which is a forward FK and returns an object.
 */
export const CLIENT_ROSTER_COLUMNS =
  'id, name, niche, social_connections(platform, account_name, token_expires_at)'

// brand_profiles
export const BRAND_PROFILE_COLUMNS =
  'id, tone, target_audience, social_goals, content_pillars, avoid_topics, default_post_type, default_carousel_slides, weekly_mix_json, language_formality, secondary_language, is_health_niche, best_time_json, best_time_updated_at, source_strategy, language_notes'

// brand_visual_identity
// Just the blob: `fetchVisualIdentity` reads `data.identity` and nothing else. `source_kind` and
// `report` are written by the extractor and never read back — they are forensics living in the
// table, not fields this query has a use for.
export const BRAND_VISUAL_IDENTITY_COLUMNS = 'identity'

// brand_kit_extractions
export const BRAND_KIT_EXTRACTION_COLUMNS =
  'id, onboarding_session_id, agency_id, status, identity, report, created_at, updated_at'

// posting_schedules
export const POSTING_SCHEDULE_COLUMNS =
  'id, is_active, frequency_type, frequency_value, auto_generate_day, auto_generate_time'

/**
 * The generate cron's sweep across every active schedule. Genuinely not the
 * constant above: it needs client_id to resolve each row's owner, and has no use
 * for frequency_type. Named rather than left inline because the two had already
 * drifted apart unnoticed — which is the whole reason this file exists.
 */
export const POSTING_SCHEDULE_DUE_COLUMNS =
  'id, client_id, is_active, frequency_value, auto_generate_day, auto_generate_time'

// agencies
export const AGENCY_COLUMNS =
  'id, name, plan, mode, agency_logo, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, plan_client_limit, timezone, created_at'

export const AGENCY_SETTINGS_COLUMNS =
  'id, name, plan, mode, subscription_status, trial_ends_at, plan_client_limit, timezone'

// client_sources
export const CLIENT_SOURCE_COLUMNS =
  'id, client_id, type, label, url, is_active, last_fetched_at, last_fetch_status, last_fetch_error, config, pillar_ids, created_at'

export const CLIENT_SOURCE_FULL_COLUMNS =
  'id, client_id, type, label, url, is_active, last_fetched_at, last_fetch_status, last_fetch_error, config, pillar_ids, file_path, extracted_text, created_at'

// client_sources (research pipeline — active only, with extracted_text for file sources)
export const CLIENT_SOURCE_RESEARCH_COLUMNS =
  'id, type, label, url, config, pillar_ids, extracted_text'

// client_sources (UI summaries — the generate flow's run-plan preview; deliberately
// excludes extracted_text and config, which are heavy and research-only)
export const CLIENT_SOURCE_SUMMARY_COLUMNS = 'id, type, label, url, pillar_ids'

// client_sources — just enough to rewrite a source's pillar scoping
const CLIENT_SOURCE_PILLARS_KEYS = [
  'id',
  'pillar_ids',
] as const satisfies readonly (keyof ClientSourceRow)[]

export const CLIENT_SOURCE_PILLARS_COLUMNS = CLIENT_SOURCE_PILLARS_KEYS.join(', ') as Join<
  typeof CLIENT_SOURCE_PILLARS_KEYS,
  ', '
>

/** `pillar_ids` is `Json`, not `string[]` — the hand-written mirror claimed otherwise. */
export type ClientSourcePillarsColumns = Pick<
  ClientSourceRow,
  (typeof CLIENT_SOURCE_PILLARS_KEYS)[number]
>

// users
const USER_KEYS = [
  'id',
  'email',
  'role',
  'created_at',
] as const satisfies readonly (keyof UserRow)[]

export const USER_COLUMNS = USER_KEYS.join(', ') as Join<typeof USER_KEYS, ', '>

/**
 * The companion this constant shipped without.
 *
 * `TeamMember` restated these four by hand and got `created_at` wrong — `string` over a nullable
 * column — and `fetchTeamMembersByAgency` applied it with a cast, so nothing ever checked. The
 * member list renders it through `new Date(...)`, which turns a null into 1 January 1970.
 */
export type UserColumns = Pick<UserRow, (typeof USER_KEYS)[number]>

export const USER_AUTH_COLUMNS = 'agency_id, role'

// social_connections
export const SOCIAL_CONNECTION_COLUMNS =
  'id, platform, account_id, account_name, token_expires_at, created_at'

/**
 * The credential read — the ONLY projection that pulls access_token, used by the
 * callers that must actually talk to Meta (the manual publish route, the publish
 * scheduler, the analytics regenerate action's window refresh, and the comment
 * moderation actions). Day-to-day analytics reads and the performance source
 * stay on the stored ig_* tables and never touch a token.
 *
 * `account_name` rides along rather than justifying a fourth near-identical
 * projection: replying to a comment has to stamp the reply with the handle it
 * was posted as, in the same breath as fetching the token to post it.
 *
 * Deliberately separate from SOCIAL_CONNECTION_COLUMNS, which omits the token so
 * display reads cannot leak one. Keep it that way: widening the display constant
 * to cover this would put a live token on every connections list.
 */
export const SOCIAL_CONNECTION_AUTH_COLUMNS =
  'account_id, account_name, access_token, token_expires_at'

/**
 * The AUTH_COLUMNS projection, as a type. Two callers hand-wrote this shape
 * inline because the constant shipped without one — the same reason every
 * metrics constant below carries a `Pick<…>` beside it.
 */
export type SocialConnectionAuthColumns = Pick<
  SocialConnectionRow,
  'account_id' | 'account_name' | 'access_token' | 'token_expires_at'
>

/** The metrics cron's roster read — AUTH_COLUMNS plus the client to file rows under. */
const SOCIAL_CONNECTION_SYNC_KEYS = [
  'client_id',
  'account_id',
  'access_token',
] as const satisfies readonly (keyof SocialConnectionRow)[]

export const SOCIAL_CONNECTION_SYNC_COLUMNS = SOCIAL_CONNECTION_SYNC_KEYS.join(', ') as Join<
  typeof SOCIAL_CONNECTION_SYNC_KEYS,
  ', '
>

/**
 * The companion this constant shipped without.
 *
 * Two hand-written copies existed — sync-metrics' IGConnection and refresh-tokens'
 * ExpiringConnection — and both declared `client_id` and `access_token` non-null over nullable
 * columns, applied by casts so nothing checked. The access_token half is true at runtime (the
 * queries filter it), which is why callers narrow it explicitly; `client_id` was never filtered.
 */
export type SocialConnectionSyncColumns = Pick<
  SocialConnectionRow,
  (typeof SOCIAL_CONNECTION_SYNC_KEYS)[number]
>

// ig_account_metrics — the analytics document's daily rows: only what it renders.
// Columns the sync captures but nothing displays yet (accounts_engaged,
// profile_links_taps, follows_count, media_count, …) stay unselected on purpose.
export const IG_ACCOUNT_METRIC_KEYS = [
  'metric_date',
  'followers_count',
  'reach',
  'views',
  'total_interactions',
  'likes',
  'comments',
  'saves',
  'shares',
  'replies',
  'profile_views',
  'website_clicks',
  'follows',
  'unfollows',
  'profile_links_taps',
  'reach_by_media_product_type',
  'interactions_by_media_product_type',
  'link_taps_by_button_type',
  'online_followers_by_hour',
] as const satisfies readonly (keyof IGAccountMetricsRow)[]

export const IG_ACCOUNT_METRIC_COLUMNS = IG_ACCOUNT_METRIC_KEYS.join(', ') as Join<
  typeof IG_ACCOUNT_METRIC_KEYS,
  ', '
>

export type IGAccountMetricColumns = Pick<
  IGAccountMetricsRow,
  (typeof IG_ACCOUNT_METRIC_KEYS)[number]
>

// ig_post_metrics — the posts table + the research performance source.
export const IG_POST_METRIC_KEYS = [
  'ig_media_id',
  'post_id',
  'media_type',
  'media_product_type',
  'permalink',
  'thumbnail_url',
  'caption',
  'posted_at',
  'reach',
  'views',
  'like_count',
  'comments_count',
  'saved',
  'shares',
  'total_interactions',
  'follows',
  'profile_visits',
] as const satisfies readonly (keyof IGPostMetricsRow)[]

export const IG_POST_METRIC_COLUMNS = IG_POST_METRIC_KEYS.join(', ') as Join<
  typeof IG_POST_METRIC_KEYS,
  ', '
>

export type IGPostMetricColumns = Pick<IGPostMetricsRow, (typeof IG_POST_METRIC_KEYS)[number]>

/**
 * posts, as the analytics union reads it: Kontuur's own published ledger fills the trend's
 * publish pins when Instagram no longer reports a post (deleted after publish) or the
 * nightly sync has not seen it yet.
 *
 * The media id and the publish time are no longer here — they belong to the destination
 * that produced them, so the pin query embeds `PUBLICATION_EMBED` and reads them from
 * there. A post published to two networks has two of each.
 */
const PUBLISHED_POST_PIN_KEYS = [
  'id',
  'caption',
  'post_type',
] as const satisfies readonly (keyof PostRow)[]

export const PUBLISHED_POST_PIN_COLUMNS = PUBLISHED_POST_PIN_KEYS.join(', ') as Join<
  typeof PUBLISHED_POST_PIN_KEYS,
  ', '
>

type PublishedPostPinColumns = Pick<PostRow, (typeof PUBLISHED_POST_PIN_KEYS)[number]>

/**
 * A published destination with the post it carried — what the pin query actually returns.
 *
 * The query reads `post_publications`, not `posts`: "published", "when" and "which media"
 * are all facts about a destination now, and only the caption and post type come from the
 * content. Filtering posts by a status they no longer carry is what this replaces.
 */
export type PublishedPostPin = Pick<PostPublicationRow, 'external_post_id' | 'published_at'> & {
  posts: PublishedPostPinColumns
}

/**
 * posts, as the comments queue reads it: enough to render the post a comment sits under,
 * beside the comment.
 *
 * A fourth posts projection rather than a reused one, because none of the three above fits
 * and widening any of them would cost every one of their callers.
 *
 * No media id: a comment already carries the `post_id` its sync resolved, so the queue
 * joins on that rather than matching ids back through the post. No publish time either —
 * that is the destination's, and the queue embeds `PUBLICATION_EMBED` for it.
 */
const COMMENTED_POST_KEYS = [
  'id',
  'client_id',
  'caption',
  'pillar',
] as const satisfies readonly (keyof PostRow)[]

export const COMMENTED_POST_COLUMNS = COMMENTED_POST_KEYS.join(', ') as Join<
  typeof COMMENTED_POST_KEYS,
  ', '
>

export type CommentedPostColumns = Pick<PostRow, (typeof COMMENTED_POST_KEYS)[number]>

// ig_comments
/**
 * The queue's read. Everything except `synced_at`, which records when we last heard
 * from Instagram and is bookkeeping the surface has no use for.
 */
const IG_COMMENT_KEYS = [
  'id',
  'client_id',
  'ig_account_id',
  'ig_media_id',
  'post_id',
  'parent_id',
  'author_username',
  'text',
  'hidden',
  'like_count',
  'commented_at',
] as const satisfies readonly (keyof IGCommentRow)[]

export const IG_COMMENT_COLUMNS = IG_COMMENT_KEYS.join(', ') as Join<typeof IG_COMMENT_KEYS, ', '>

export type IGCommentColumns = Pick<IGCommentRow, (typeof IG_COMMENT_KEYS)[number]>

// ig_audience_snapshots
const IG_AUDIENCE_SNAPSHOT_KEYS = [
  'snapshot_date',
  'follower_demographics',
  'engaged_audience_demographics',
] as const satisfies readonly (keyof IGAudienceSnapshotsRow)[]

export const IG_AUDIENCE_SNAPSHOT_COLUMNS = IG_AUDIENCE_SNAPSHOT_KEYS.join(', ') as Join<
  typeof IG_AUDIENCE_SNAPSHOT_KEYS,
  ', '
>

/**
 * The companion this constant shipped without — the only metrics constant that had none, while
 * IG_ACCOUNT_METRIC and IG_POST_METRIC both did and their readers import them.
 *
 * Its absence produced two structurally identical hand-written declarations, `SnapshotRow` and
 * `AudienceSnapshotInput`, in files that pass rows from one to the other through a double cast.
 */
export type IGAudienceSnapshotColumns = Pick<
  IGAudienceSnapshotsRow,
  (typeof IG_AUDIENCE_SNAPSHOT_KEYS)[number]
>

// intelligence_briefings
export const BRIEFING_COLUMNS =
  'briefing_text, action_nudge, weekly_tip, platform_updates, week_start, coaching_points'

// language_rules
export const LANGUAGE_RULES_COLUMNS = 'native_cta_phrases, formality_rules, language_instructions'

// post_history
export const POST_HISTORY_COLUMNS = 'topic_summary'

/** The fields the exemplar bank reads to teach the writer this client's approved voice. */
export const EXEMPLAR_COLUMNS = 'caption, slides_json, post_type, edited_at, created_at'

// post_canvas_docs
export const POST_CANVAS_DOC_COLUMNS = 'id, post_id, position, doc, created_at, updated_at'

/** The fields the visuals cron needs to pick its backlog. */
export const VISUAL_BACKLOG_POST_COLUMNS =
  'id, client_id, post_type, slides_json, quality_score_avg, visuals_attempts, visuals_attempted_at, created_at'

// post_images
export const POST_IMAGE_COLUMNS =
  'id, post_id, public_url, storage_path, position, file_name, file_size, content_type, created_at'

/** Just enough to delete a stored object: the row to remove and the blob it points at. */
export const POST_IMAGE_STORAGE_COLUMNS = 'id, storage_path'

// client_ideas
// No agency_id or token_id: every read is already scoped by agency in its WHERE
// clause, and `mapIdeaRow` discarded both. They were bytes over the wire on every
// idea, on a page that loads all of them.
export const CLIENT_IDEA_COLUMNS =
  'id, client_id, idea_text, extra_notes, target_date, status, generated_post_id, submitted_at, read_at'

// notifications
export const NOTIFICATION_COLUMNS =
  'id, agency_id, message, is_read, created_at, type, client_id, post_id, feedback_text, review_token'

// posts (dashboard + roster shared reads)

/** The PostSummary projection: upcoming publishes for the clients roster and the
 *  dashboard's next-up card, and failed ones for its publish list. */
export const UPCOMING_POST_COLUMNS = 'id, client_id, scheduled_at, clients!inner(agency_id)'

/** One row of the dashboard's review-queue preview. */
const PENDING_PREVIEW_KEYS = [
  'id',
  'caption',
  'pillar',
  'created_at',
  'client_id',
] as const satisfies readonly (keyof PostRow)[]

export const PENDING_PREVIEW_COLUMNS =
  `${PENDING_PREVIEW_KEYS.join(', ')}, clients!inner(agency_id)` as `${Join<typeof PENDING_PREVIEW_KEYS, ', '>}, clients!inner(agency_id)`

/**
 * The companion this constant shipped without.
 *
 * `ReviewQueueRow` restated these six by hand and got `caption` wrong — `string` over a nullable
 * column — which then propagated into `PendingPostPreview` and reached `toPreviewLine`, whose body
 * calls `caption.replace` with no guard. Nothing filters null captions out of the query.
 */
export type PendingPreviewColumns = Pick<PostRow, (typeof PENDING_PREVIEW_KEYS)[number]>

/** A post whose client asked for changes, with the token carrying the note. */
export const CHANGE_REQUEST_COLUMNS =
  'id, client_id, caption, post_type, slides_json, scheduled_at, ' +
  'clients!inner(agency_id), post_approval_tokens!inner(status, client_note, responded_at, batch_id)'

/** Token rows used to work out a post's place within its approval batch. */
export const BATCH_POSITION_COLUMNS = 'batch_id, post_id'
