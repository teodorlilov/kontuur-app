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
export const BEST_TIME_REFRESH_DAYS = 30
export const TRIAL_DAYS = 14
export const MAX_RSS_ITEMS = 40
export const TAVILY_API_URL = 'https://api.tavily.com/search'
export const USER_AGENT_BROWSER = 'Mozilla/5.0 (compatible; Postflow/1.0)'
export const USER_AGENT_BOT = 'PostflowBot/1.0'

export const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'X / Twitter', 'TikTok'] as const

/**
 * Per-client identity colours. A single forest→sage ramp rather than a rainbow:
 * clients stay distinguishable by lightness, not by competing hues.
 */
export const CLIENT_COLORS = [
  '#164430',
  '#2E9E68',
  '#7FA588',
  '#0C2E20',
  '#3E8E6E',
  '#5C8A6E',
  '#1F6B4A',
  '#96BFA4',
] as const

export const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #2E9E68, #16593C)',
  'linear-gradient(135deg, #164430, #0C2E20)',
  'linear-gradient(135deg, #7FA588, #3E6E56)',
  'linear-gradient(135deg, #3E8E6E, #1F5A40)',
] as const

export const TOP_BAR_GRADIENTS = [
  'linear-gradient(90deg, #2E9E68, #164430)',
  'linear-gradient(90deg, #164430, #0C2E20)',
  'linear-gradient(90deg, #7FA588, #3E6E56)',
  'linear-gradient(90deg, #3E8E6E, #1F5A40)',
] as const

export const SETUP_TOP_BAR_GRADIENT = 'linear-gradient(90deg, #CFEA45, #2E9E68)'

export const WEEKDAY_OPTIONS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
] as const
