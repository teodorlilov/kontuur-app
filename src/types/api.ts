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

export interface PriorityPost {
  title: string
  brief: string
  platform: string
  targetDate: string
}

export interface CarouselSlide {
  slide_number?: number
  slide_role?: 'cover' | 'content' | 'cta'
  headline: string
  body: string
}


// ---- Onboarding ----

export interface OnboardRequest {
  answers: {
    q1: string
    q2: string
    q3: string
    q4: string
    q4b: string
    q5: string
    q6: string
    q7?: string
  }
  analysisData?: UrlAnalysisResponse
}

export interface OnboardResponse {
  niche: string
  niche_reasoning: string
  target_audience: string[]
  social_goals: string[]
  content_pillars: Array<{ pillar: string; weight: number }>
  content_pillars_reasoning: string
  tone: string
  avoid_topics: string
  client_testimonial_voice: string
  recommended_platforms: Array<{ platform: string; priority: string; reason: string }>
  platform_reasoning: string
  is_health_niche: boolean
  suggested_post_frequency: string
  language: string
  language_formality: string
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
  detected_testimonial_voice: string | null
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

// ---- Best Time ----

export interface BestTimeRequest {
  clientId: string
}

export interface BestTimeWindow {
  time: string
  label: string
  reason: string
}

export interface BestTimePlatform {
  platform: string
  best_days: string[]
  best_time_windows: BestTimeWindow[]
  avoid: string
  confidence: 'research-backed' | 'ai-derived'
  reasoning_summary: string
}

export interface BestTimeResponse {
  platforms: BestTimePlatform[]
  upgrade_note: string
}

// ---- Client Ideas ----

export type IdeaStatus = 'new' | 'generating' | 'generated' | 'dismissed'

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

export interface SendApprovalRequest {
  clientId: string
  weekStart: string // ISO date string (Monday of the week)
}

export interface ApprovalResponse {
  status: 'approved' | 'changes_requested'
  postNotes?: Array<{ postId: string; note: string }>
}

export interface ApprovalPostData {
  id: string
  caption: string | null
  platform: string | null
  post_type: string
  slides_json: unknown
  scheduled_at: string | null
  pillar: string | null
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

export interface CalendarPost {
  id: string
  client_id: string
  client_name: string
  caption: string | null
  platform: string | null
  post_type: string
  slides_json: CarouselSlide[] | null
  validation_json: unknown
  status: string
  scheduled_at: string | null
  priority: boolean
  quality_score_avg: number | null
  source_url: string | null
  source_title: string | null
  source_type: string | null
  pillar: string | null
  source_excerpt: string | null
  created_at: string
  images: PostImage[]
  approval_status: string | null
  approval_client_note: string | null
  approval_responded_at: string | null
}

// ---- Dashboard Change Requests ----

export interface DashboardChangeRequest {
  id: string
  clientId: string
  clientName: string
  caption: string | null
  platform: string | null
  postType: string
  slidesJson: CarouselSlide[] | null
  scheduledAt: string | null
  clientNote: string | null
  respondedAt: string | null
  postNumber: number
}

// ---- Notifications ----

export type NotificationType = 'client_approved_all' | 'client_feedback'

export interface EnrichedNotification {
  id: string
  agency_id: string
  message: string | null
  is_read: boolean
  created_at: string
  type: NotificationType | null
  client_id: string | null
  post_id: string | null
  feedback_text: string | null
  review_token: string | null
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

export interface MetaConnection {
  id: string
  platform: 'instagram' | 'facebook'
  account_id: string
  account_name: string
  token_expires_at: string | null
  created_at: string
}

// ---- Analytics ----

export interface AnalyticsReportRequest {
  client_id: string
  platform: 'instagram' | 'facebook'
  period_start: string // ISO date YYYY-MM-DD
  period_end: string // ISO date YYYY-MM-DD
}

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

export interface AnalyticsReport {
  id: string
  client_id: string
  platform: string
  period_start: string
  period_end: string
  metrics_json: AnalyticsMetrics
  ai_summary: string
  created_at: string
}

// ---- API error ----

export interface ApiError {
  error: string
  code?: string
}

// Re-export validation types so consumers import from '@/types/api'
export type {
  HookVerdict,
  CtaVerdict,
  LanguageIssueType,
  LanguageValidationResult as LanguageResult,
  SlopDetection,
  SourceGroundingResult,
  ValidationCriteria,
  ValidationScores,
  CriterionResult,
  StructureCheck,
} from '@/ai/validation/types'

export type {
  ClientSource,
  AddSourceRequest,
  AddSourceResponse,
  SourceSuggestion,
  SuggestSourcesRequest,
  SuggestSourcesResponse,
  SourceStrategy,
  DiscoverPagesRequest,
  DiscoverPagesResponse,
} from './sources'

