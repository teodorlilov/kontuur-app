export const PROMPT_HISTORY_LIMIT = 10

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
export const TAVILY_API_URL = 'https://api.tavily.com/search'
export const USER_AGENT_BROWSER = 'Mozilla/5.0 (compatible; Postflow/1.0)'
export const USER_AGENT_BOT = 'PostflowBot/1.0'

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

export const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #2C5F4A, #1A3D2E)',
  'linear-gradient(135deg, #8A3A5A, #5A2040)',
  'linear-gradient(135deg, #5A4A2A, #3A2A10)',
  'linear-gradient(135deg, #2C3E5F, #1A2A4A)',
] as const

export const TOP_BAR_GRADIENTS = [
  'linear-gradient(90deg, #C07B55, #8B5A3A)',
  'linear-gradient(90deg, #2C5F8A, #1A3D5A)',
  'linear-gradient(90deg, #5A8A4A, #3A6A2A)',
  'linear-gradient(90deg, #8A5A2A, #5A3A10)',
] as const

export const SETUP_TOP_BAR_GRADIENT = 'linear-gradient(90deg, #C07B55, #E8A87C)'

export const WEEKDAY_OPTIONS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
] as const
