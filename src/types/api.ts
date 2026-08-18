// Imported from './database' rather than the './index' barrel, which re-exports
// this file — going through it would make the two circular.
import type { Tables } from './database'
import type { SlideText } from './slide'
import type { CalendarPostColumns } from '@/lib/queries/select-columns'

type PostRow = Tables<'posts'>
type NotificationRow = Tables<'notifications'>
type SocialConnectionRow = Tables<'social_connections'>
type AnalyticsReportRow = Tables<'analytics_reports'>

// ---- Shared enums / unions ----

export type PostType = 'single' | 'carousel'

export interface PostImage {
  id: string
  publicUrl: string
  storagePath: string
  position: number
  fileName: string | null
  fileSize: number | null
  contentType: string | null
}

// ---- Generate ----

/**
 * A campaign or announcement written ahead of the researched mix — and the shape a
 * client idea takes once it reaches generation.
 *
 * `platform` follows the empty-string convention `targetDate` set: the editor ships
 * every field, `''` until chosen. Empty inherits the run's platform; a value
 * overrides it for that one post — so an idea asked for on Instagram can ride along
 * with researched posts written for Facebook in a single run. The wire schema
 * (`priorityPostSchema`) narrows the value to `PLATFORMS`.
 */
export interface PriorityPost {
  title: string
  brief: string
  targetDate: string
  platform: string
}

/** A slide as it is stored: its text, plus the position metadata the writer stamps on. */
export interface CarouselSlide extends SlideText {
  slide_number?: number
  slide_role?: 'cover' | 'content' | 'cta'
}

// ---- URL Analysis ----

export interface UrlAnalysisRequest {
  websiteUrl?: string
  instagramHandle?: string
}

export interface UrlAnalysisResponse {
  detected_business_name: string | null
  detected_niche: string
  detected_niche_confidence: 'high' | 'medium' | 'low'
  detected_target_audience: string[]
  detected_tone: string
  detected_content_pillars: Array<{ pillar: string; weight: number }>
  detected_services_products: string[]
  detected_language: string
  detected_language_formality: string
  detected_is_health_niche: boolean
  detected_avoid_topics: string | null
}

// ---- Research ----

export interface ResearchRequest {
  niche: string
  language: string
}

export interface ResearchFinding {
  finding: string
  suggested_theme: string
}

export interface ResearchResponse {
  findings: ResearchFinding[]
}

// ---- Pillars ----

export interface PillarsRequest {
  niche: string
  clientId?: string
}

export interface PillarsResponse {
  pillars: Array<{ pillar: string }>
}

// ---- Client Ideas ----

// The single definition. It was restated as a zod enum in the ideas feature to
// validate PATCH /api/ideas; that route is gone, and nothing parses a status off the
// wire — the values reaching `ClientIdea` come from the column, which 20260817
// constrains to exactly these three ('generating' was retired there: nothing has
// written it since the generate routes merged, and stranded rows migrate to 'new').
export type IdeaStatus = 'new' | 'generated' | 'dismissed'

export interface ClientIdea {
  id: string
  clientId: string
  clientName: string
  clientNiche: string | null
  ideaText: string
  extraNotes: string | null
  platform: string | null
  targetDate: string | null
  status: IdeaStatus
  generatedPostId: string | null
  submittedAt: string
  readAt: string | null
}

// ---- Approval ----

export interface ApprovalResponse {
  status: 'approved' | 'changes_requested'
  postNotes?: Array<{ postId: string; note: string }>
}

/** A post as the public approval page reads it, plus the note the client left. */
export type ApprovalPostData = Pick<
  PostRow,
  'id' | 'caption' | 'platform' | 'post_type' | 'scheduled_at' | 'pillar'
> & {
  slides_json: unknown
  client_note: string | null
  images: PostImage[]
}

export interface ApprovalBatchData {
  posts: ApprovalPostData[]
  clientName: string
  agencyName: string
  status: string
  expiresAt: string
}

// ---- Calendar ----

/**
 * A calendar row: everything a `CALENDAR_POST_COLUMNS` select returns, plus the joined
 * name, images and approval state the calendar resolves alongside them.
 *
 * Derived from `CalendarPostColumns` rather than restating its own `Pick`. The
 * hand-written version listed 15 of the 23 columns the query already fetched, so
 * `topic_summary`, `published_at` and four others arrived over the wire on every load
 * and were invisible to the type system — and it disagreed with the equivalent list
 * in `/review`.
 *
 * The two `Omit`ed columns are narrowed below: the raw ones are `Json`, and every
 * surface parses them into its own shape rather than trusting the column.
 */
export type CalendarPost = Omit<CalendarPostColumns, 'slides_json' | 'validation_json'> & {
  client_name: string
  /** Parsed on the way in, unlike the raw column. */
  slides_json: CarouselSlide[] | null
  validation_json: unknown
  images: PostImage[]
  approval_status: string | null
  approval_client_note: string | null
  approval_responded_at: string | null
  /**
   * When the client's approval link stops working.
   *
   * Carried because a post sitting at `pending` says nothing about whether anyone can
   * still act on it: a lapsed link and a link nobody has opened yet look identical on
   * every surface, and the answer decides whether the agency waits or re-sends.
   */
  approval_expires_at: string | null
}

// ---- Dashboard Change Requests ----

export interface DashboardChangeRequest {
  id: string
  clientId: string
  clientName: string
  caption: string | null
  platform: string
  postType: string
  slidesJson: CarouselSlide[] | null
  scheduledAt: string | null
  clientNote: string | null
  respondedAt: string | null
  postNumber: number
}

// ---- Generation runs ----

/** A generation batch currently composing, as surfaced by the app shell. */
export interface ActiveRun {
  id: string
  clientName: string
  targetCount: number
  doneCount: number
  startedAt: string
}

// ---- Notifications ----

export type NotificationType = 'client_approved_all' | 'client_feedback' | 'posts_ready'

export type EnrichedNotification = Pick<
  NotificationRow,
  | 'id'
  | 'agency_id'
  | 'message'
  | 'is_read'
  | 'created_at'
  | 'client_id'
  | 'post_id'
  | 'feedback_text'
  | 'review_token'
> & {
  /** Narrowed from the column's plain string to the kinds the UI actually renders. */
  type: NotificationType | null
}

// ---- Settings / Team ----

export interface TeamMember {
  id: string
  email: string
  role: string
  created_at: string
}

export interface AgencyInfo {
  id: string
  name: string
  plan: string
  mode: string
  subscription_status: string
  trial_ends_at: string
  plan_client_limit: number
  timezone: string
}

export type SettingsTab = 'team' | 'account' | 'integrations' | 'profile'

export interface InviteTeamMemberRequest {
  email: string
}

export interface UpdateAgencyRequest {
  name: string
}

// ---- Meta Connections ----

export type MetaConnection = Pick<
  SocialConnectionRow,
  'id' | 'account_id' | 'account_name' | 'token_expires_at' | 'created_at'
> & {
  /** Narrowed from the column's plain string: the table also holds 'canva' rows,
   *  which every consumer of this type filters out. */
  platform: 'instagram' | 'facebook'
}

// ---- Analytics ----

export interface AudienceDemographics {
  gender_age: Record<string, number>
  top_cities: Array<{ name: string; value: number }>
  top_countries: Array<{ name: string; value: number }>
}

export interface IGDailyInsight {
  date: string
  reach?: number
  impressions?: number
  profile_views?: number
  follower_count?: number
  accounts_engaged?: number
  website_clicks?: number
  follows?: number
  unfollows?: number
}

export interface IGPost {
  id: string
  caption: string | null
  timestamp: string
  media_type: string
  like_count: number
  comments_count: number
  saved?: number
  reach?: number
  impressions?: number
  permalink?: string
  shares?: number
  total_interactions?: number
  thumbnail_url?: string | null
}

export interface MediaTypeBreakdownItem {
  type: string
  avg_engagement_rate: number
  count: number
}

export interface InstagramMetrics {
  platform: 'instagram'
  account: {
    followers_count: number
    follows_count: number
    media_count: number
  }
  summary: {
    total_reach: number
    total_impressions: number
    total_profile_views: number
    avg_engagement_rate: number
    posts_published: number
    new_followers: number
    unfollowers: number
    net_follower_change: number
    organic_reach_pct: null
    paid_reach_pct: null
    reach_delta_pct: number | null
    views_delta_pct: number | null
    profile_views_delta_pct: number | null
    net_followers_delta_pct: number | null
    avg_save_rate: number
    total_saved: number
    total_shares: number
    total_accounts_engaged: number
    total_website_clicks: number
    accounts_engaged_delta_pct: number | null
    website_clicks_delta_pct: number | null
  }
  daily_insights: IGDailyInsight[]
  posts: IGPost[]
  audience: AudienceDemographics | null
  media_type_breakdown: MediaTypeBreakdownItem[]
}

export interface FBDailyInsight {
  date: string
  impressions?: number
  reach?: number
  engaged_users?: number
  page_views?: number
  fan_adds?: number
  fan_removes?: number
  organic_reach?: number
  paid_reach?: number
}

export interface FBPost {
  id: string
  message: string | null
  created_time: string
  reactions: number
  comments: number
  shares: number
  reach?: number
  impressions?: number
}

export interface FacebookMetrics {
  platform: 'facebook'
  account: {
    fan_count: number
    followers_count: number
  }
  summary: {
    total_reach: number
    total_impressions: number
    total_engaged_users: number
    avg_engagement_rate: number
    posts_published: number
    new_followers: number
    unfollowers: number
    organic_reach_pct: number | null
    paid_reach_pct: number | null
    reach_delta_pct: number | null
    views_delta_pct: number | null
    profile_views_delta_pct: number | null
    followers_delta_pct: number | null
    avg_save_rate: number
    total_saved: number
    total_shares: number
  }
  daily_insights: FBDailyInsight[]
  posts: FBPost[]
  audience: AudienceDemographics | null
  media_type_breakdown: MediaTypeBreakdownItem[]
}

export type AnalyticsMetrics = InstagramMetrics | FacebookMetrics

export type AnalyticsReport = Pick<
  AnalyticsReportRow,
  'id' | 'client_id' | 'platform' | 'period_start' | 'period_end' | 'ai_summary' | 'created_at'
> & {
  /** Narrowed from the column's `Json`: the report route writes this shape and every
   *  reader charts it, so the assertion lives here rather than at each use. */
  metrics_json: AnalyticsMetrics
}

// ---- API error ----

export interface ApiError {
  error: string
  code?: string
}

// Re-export validation types so consumers import from '@/types/api'
export type {
  LanguageIssueType,
  LanguageValidationResult as LanguageResult,
  SlopDetection,
  SourceGroundingResult,
  ValidationCriteria,
  ValidationScores,
} from '@/ai/validation/types'

export type { SlideText } from './slide'

export type {
  ClientSource,
  SourceSuggestion,
  SuggestSourcesRequest,
  SuggestSourcesResponse,
  DiscoverPagesRequest,
  DiscoverPagesResponse,
} from './sources'
