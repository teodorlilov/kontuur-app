export const PROMPT_HISTORY_LIMIT = 10
export const DAYS_PER_WEEK = 7

/**
 * Minimum quality_score_avg for a post to enter the review queue.
 * Posts below this score are discarded before the agency sees them.
 * Set to 0 to disable filtering.
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
export const BEST_TIME_REFRESH_DAYS = 30
export const TRIAL_DAYS = 14
export const MAX_RSS_ITEMS = 40
export const TAVILY_API_URL = 'https://api.tavily.com/search'
export const USER_AGENT_BROWSER = 'Mozilla/5.0 (compatible; Postflow/1.0)'
export const USER_AGENT_BOT = 'PostflowBot/1.0'

export const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'X / Twitter', 'TikTok'] as const

/** The subset of PLATFORMS that can actually publish today. The rest of the list is roadmap. */
export const LIVE_PLATFORMS = new Set<string>(['Instagram', 'Facebook'])

export interface PlatformAccount {
  id: string
  label: string
  initials: string
  note: string
  supported: boolean
}

/**
 * The accounts a client can connect, in the order both surfaces list them — the settings
 * Connected accounts tab and the onboarding platform row.
 *
 * These labels are the *account* vocabulary ("Facebook Page"), not the PLATFORMS vocabulary
 * ("Facebook"). The two lists describe different things and must not be derived from each other.
 */
export const PLATFORM_ACCOUNTS: readonly PlatformAccount[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    initials: 'IG',
    note: 'Business or Creator account required',
    supported: true,
  },
  {
    id: 'facebook',
    label: 'Facebook Page',
    initials: 'FB',
    note: 'Needed for Instagram publishing',
    supported: true,
  },
  { id: 'linkedin', label: 'LinkedIn', initials: 'LI', note: 'Company pages', supported: false },
]

/**
 * Per-client identity colours — the one job here is telling clients apart, so
 * these step through hue AND lightness. A pure green ramp was tried and failed:
 * at pill opacity, forest vs forest-deep and spring vs sea read as the same
 * swatch. Kept desaturated so none of them competes with the green chrome.
 * Consumed as dots/avatars directly, and as calendar pills via CLIENT_PILL_TONES.
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
 * Calendar pill tones, derived from CLIENT_COLORS rather than hand-listed a
 * second time — the same client must read as the same colour on the dashboard
 * dot and the calendar pill, and two literal tables would drift.
 */
export const CLIENT_PILL_TONES = CLIENT_COLORS.map((hex) => ({
  dotColor: hex,
  bgColor: `color-mix(in srgb, ${hex} 12%, transparent)`,
  textColor: `color-mix(in srgb, ${hex} 72%, var(--ink))`,
}))

export const WEEKDAY_OPTIONS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
] as const

/** Languages a client's content can be written in. The one list — every language picker reads it. */
export const CONTENT_LANGUAGE_OPTIONS = [
  { value: 'Bulgarian', label: 'Bulgarian' },
  { value: 'English', label: 'English' },
  { value: 'French', label: 'French' },
  { value: 'German', label: 'German' },
  { value: 'Greek', label: 'Greek' },
  { value: 'Italian', label: 'Italian' },
  { value: 'Portuguese', label: 'Portuguese' },
  { value: 'Spanish', label: 'Spanish' },
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
