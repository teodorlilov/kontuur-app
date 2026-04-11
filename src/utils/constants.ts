export const PROMPT_HISTORY_LIMIT = 20

/**
 * Generate this many extra posts per requested count.
 * 1.5 = request 50% more than needed, keep the best ones.
 * Only applies to single posts — carousel and reels generate exactly one result.
 */
export const OVER_REQUEST_MULTIPLIER = 1.5

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
export const BEST_TIME_REFRESH_DAYS = 30
export const TRIAL_DAYS = 14
export const MAX_RSS_ITEMS = 20

export const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'X / Twitter', 'TikTok'] as const

export const CLIENT_COLORS = [
  '#4F46E5',
  '#7C3AED',
  '#DB2777',
  '#EA580C',
  '#D97706',
  '#059669',
  '#0891B2',
  '#2563EB',
] as const

export const WEEKDAY_OPTIONS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
] as const
