/**
 * Canonical Supabase select column strings.
 *
 * Rules:
 * - Every .select() call for a full row must reference a constant from this file.
 * - Narrow auth checks ('id', 'agency_id') stay inline — intentionally minimal.
 * - Joined selects with relationship filters stay inline at the call site.
 * - If you add a column to a table, update the relevant constant here first.
 */

import type { PostRow } from '@/types'

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
  'platform',
  'post_type',
  'slides_json',
  'image_url',
  'validation_json',
  'status',
  'priority',
  'scheduled_at',
  'published_at',
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

/**
 * The calendar's projection: the post columns, plus why a publish failed.
 *
 * `POST_COLUMNS` is deliberately not widened. Its six other readers have no use for
 * these two, and it is read for every post they hold — a failure reason is a string of
 * unbounded length on a query the dashboard runs on every load.
 *
 * Extended from the same array rather than written out again, so a column added above
 * reaches this list too. `publish_claimed_at` is not here: the scheduler writes it and
 * nothing displays it, so selecting it would be fetching a lock for a human to look at.
 */
export const CALENDAR_POST_COLUMN_KEYS = [
  ...POST_COLUMN_KEYS,
  'publish_error',
  'publish_attempts',
] as const satisfies readonly (keyof PostRow)[]

export const CALENDAR_POST_COLUMNS = CALENDAR_POST_COLUMN_KEYS.join(', ') as Join<
  typeof CALENDAR_POST_COLUMN_KEYS,
  ', '
>

export type CalendarPostColumns = Pick<PostRow, (typeof CALENDAR_POST_COLUMN_KEYS)[number]>

// clients
export const CLIENT_COLUMNS =
  'id, name, niche, posts_per_week, language, website_url, contact_email, created_at'

export const CLIENT_LIST_COLUMNS = 'id, name, niche, posts_per_week, language, created_at'

/**
 * The four fields an AI prompt needs to speak for a client. Narrower than
 * CLIENT_LIST_COLUMNS on purpose — a prompt has no use for posts_per_week or
 * created_at, and both readers pair this with an `agency_id` ownership filter.
 */
export const CLIENT_AI_CONTEXT_COLUMNS = 'id, name, niche, language'

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
export const BRAND_VISUAL_IDENTITY_COLUMNS =
  'id, client_id, identity, source_kind, report, created_at, updated_at'

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

// users
export const USER_COLUMNS = 'id, email, role, created_at'

export const USER_AUTH_COLUMNS = 'agency_id, role'

// social_connections
export const SOCIAL_CONNECTION_COLUMNS =
  'id, platform, account_id, account_name, token_expires_at, created_at'

/**
 * The credential read — the ONLY projection that pulls access_token, used by the
 * four callers that must actually talk to Meta (publish, analytics, the publish
 * scheduler, the performance source).
 *
 * Deliberately separate from SOCIAL_CONNECTION_COLUMNS, which omits the token so
 * display reads cannot leak one. Keep it that way: widening the display constant
 * to cover this would put a live token on every connections list.
 */
export const SOCIAL_CONNECTION_AUTH_COLUMNS = 'account_id, access_token, token_expires_at'

/** The metrics cron's roster read — AUTH_COLUMNS plus the client to file rows under. */
export const SOCIAL_CONNECTION_SYNC_COLUMNS = 'client_id, account_id, access_token'

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
  'id, client_id, post_type, slides_json, quality_score_avg, visuals_attempts, created_at'

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
  'id, client_id, idea_text, extra_notes, platform, target_date, status, generated_post_id, submitted_at, read_at'

// notifications
export const NOTIFICATION_COLUMNS =
  'id, agency_id, message, is_read, created_at, type, client_id, post_id, feedback_text, review_token'

// posts (dashboard + roster shared reads)

/** The PostSummary projection: upcoming publishes for the clients roster and the
 *  dashboard's next-up card, and failed ones for its publish list. */
export const UPCOMING_POST_COLUMNS =
  'id, client_id, platform, scheduled_at, clients!inner(agency_id)'

/** One row of the dashboard's review-queue preview. */
export const PENDING_PREVIEW_COLUMNS =
  'id, caption, platform, pillar, created_at, client_id, clients!inner(agency_id)'

/** A post whose client asked for changes, with the token carrying the note. */
export const CHANGE_REQUEST_COLUMNS =
  'id, client_id, caption, platform, post_type, slides_json, scheduled_at, ' +
  'clients!inner(agency_id), post_approval_tokens!inner(status, client_note, responded_at, batch_id)'

/** Token rows used to work out a post's place within its approval batch. */
export const BATCH_POSITION_COLUMNS = 'batch_id, post_id'
