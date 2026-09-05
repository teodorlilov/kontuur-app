export const PROMPT_HISTORY_LIMIT = 10
export const DAYS_PER_WEEK = 7
export const MS_PER_HOUR = 3_600_000
export const MS_PER_DAY = 86_400_000
/** The same day in the unit Meta's Graph API takes for since/until. */
export const SECONDS_PER_DAY = 86_400

/**
 * Minimum quality_score_avg for a pending post to be worth spending image
 * generation on. Nothing is discarded on score: generation ranks rather than
 * gates, and triage routes a weak post to needs_attention where a human decides.
 * This is only the visuals cron's spend gate — a null score is eligible, since an
 * absent verdict means the judge never ran, which is not the post's fault.
 */
export const QUALITY_FLOOR = 5
export const MAX_POST_HISTORY_COUNT = 30
export const MAX_CAROUSEL_SLIDES = 10
export const MIN_CAROUSEL_SLIDES = 3
export const DEFAULT_CAROUSEL_SLIDES = 6
export const CAROUSEL_SLIDE_OPTIONS = [4, 5, 6, 7, 8, 9, 10] as const
export const APPROVAL_TOKEN_EXPIRY_HOURS = 48
/** A sourced post older than this is flagged in review — its source may no longer be current. */
export const STALE_REVIEW_DAYS = 7
/**
 * Days of follower-online history a posting-time recommendation requires.
 *
 * Fourteen, so every weekday has at least two observations before we claim a pattern. It was five,
 * which is not a pattern — it is one Tuesday. Here rather than beside the derivation because the
 * surfaces that explain an absent recommendation quote the number, and copy that restates a
 * threshold is copy that outlives it.
 */
export const MIN_BEST_TIME_DAYS = 14

/** How often the cron re-distills a client's style memo from review edits. */
export const STYLE_MEMO_REFRESH_DAYS = 7
export const MAX_RSS_ITEMS = 40
export const TAVILY_API_URL = 'https://api.tavily.com/search'
/**
 * Stored `label` of a client's web-research row. Written at client creation and by
 * the sources toggle, so it lives here rather than being retyped at each writer.
 */
export const WEB_RESEARCH_SOURCE_LABEL = 'Web research'
export const USER_AGENT_BROWSER = 'Mozilla/5.0 (compatible; Postflow/1.0)'
export const USER_AGENT_BOT = 'PostflowBot/1.0'

/**
 * The two Supabase Storage buckets. Every object in both is written under a `{clientId}/`
 * prefix, which is what lets deleteClient sweep a whole client by prefix rather than by
 * enumerating rows.
 *
 * Here rather than in assets/lib/storage.ts because that file is `server-only` and the sources
 * feature needs the second name too — three inline copies of it existed before.
 *
 * This comment used to name `publishing/lib/storage.ts`, and the file it pointed at was itself
 * misfiled: the storage layer had nothing to do with Meta publishing and now lives under
 * features/assets. Two facts had to be re-derived to move one file, which is the tax this
 * reorganisation is paying off.
 */
export const POST_IMAGES_BUCKET = 'post-images'
export const CLIENT_FILES_BUCKET = 'client-files'

/**
 * Per-client identity colours — the one job here is telling clients apart, so
 * these step through hue AND lightness. A pure green ramp was tried and failed:
 * at pill opacity, forest vs forest-deep and spring vs sea read as the same
 * swatch. Kept desaturated so none of them competes with the green chrome.
 * Rendered only through `getClientTone`/`getPillarColor` in
 * `components/ui/colors/identity-colors.ts`, which owns the one sanctioned tint recipe.
 */
export const CLIENT_COLORS = [
  '#164430', // forest
  '#2E9E68', // spring
  '#1F6B7A', // teal
  '#8A6116', // ochre
  '#6E7F52', // olive
  '#5FA8B5', // sky
  '#A2603F', // clay
  '#7FA588', // sage
] as const

/**
 * Weekday and month names, Monday-first, in one place.
 *
 * Six copies of these lists had accumulated across the calendar alone — three identical
 * `['Mon'…'Sun']` arrays, two full weekday lists and two `MONTH_NAMES` — each free to
 * drift from the others and from `date-helpers`' own lookup table. A calendar that names
 * the same day two ways is a calendar with two calendars in it.
 *
 * Monday-first, matching every grid in the app. The Sunday-first list `date-helpers`
 * keeps for `Date.getDay()` indexing is deliberately separate and says so.
 */
export const WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

/** The same seven, at column-header width. */
export const WEEKDAY_LABELS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Indexed by `MonthView.month` / `Date.getMonth()` — January is 0. */
export const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** The picker's form of `WEEKDAY_LABELS`: a stored lowercase value beside its label. */
export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = WEEKDAY_LABELS.map(
  (label) => ({ value: label.toLowerCase(), label })
)

/**
 * Languages a client's content can be written in. The one list — every language picker reads it.
 *
 * Two, because these are the two the product actually supports end to end. `language_rules` holds
 * rows for English and Bulgarian only, so any other language was offered in the picker and then had
 * no writing standards behind it. The font library is the same story: it records Cyrillic coverage
 * per family and nothing about Greek, so a Greek client could be offered faces that cannot set their
 * copy. Offering a language the pipeline cannot serve is worse than not offering it.
 *
 * Removing one is safe for clients already on it: every picker wraps this in `ensureOption`, which
 * prepends a stored value the list no longer contains rather than silently switching them.
 */
export const CONTENT_LANGUAGE_OPTIONS = [
  { value: 'Bulgarian', label: 'Bulgarian' },
  { value: 'English', label: 'English' },
] as const

export const LANGUAGE_FORMALITY_OPTIONS = [
  { value: 'formal', label: 'Formal' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'casual', label: 'Casual' },
] as const

/** How many posts one generation run produces. */
export const POSTS_PER_RUN_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  value: String(n),
  label: String(n),
}))

/** Run size assumed when a client has no posts_per_week set. */
export const DEFAULT_RUN_SIZE = 3

/**
 * Full-hour slots for the autonomous-generation time picker. The cron matches
 * day + hour, so a free time input would accept minutes it silently ignores.
 */
export const GENERATION_HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, '0')}:00`
  return { value, label: value }
})
