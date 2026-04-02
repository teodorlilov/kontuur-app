import type { QualityScores, CarouselQuality, LanguageValidation, SlopDetection } from '@/ai/validation/types/scoring'

// ---- Shared enums / unions ----

export type PostType = 'single' | 'carousel' | 'reels'

// ---- Generate ----

export interface PriorityPost {
  title: string
  brief: string
  platform: string
  targetDate: string
}

export interface CarouselSlide {
  slide_number?: number
  slide_role?: 'cover' | 'content' | 'value' | 'cta'
  headline: string
  body: string
  cta_text?: string | null
  design_note?: string
}

export interface ReelsScript {
  hook: string
  main_points: string[]
  cta: string
  on_screen_text: string[]
  visual_directions: string[]
  estimated_seconds: number
}

export interface GeneratedPost {
  theme: string
  platform: string
  postType: 'single' | 'carousel' | 'reels'
  caption: string
  slides?: CarouselSlide[]
  reelsScript?: ReelsScript
  qualityScores?: QualityScores
  carouselQuality?: CarouselQuality
  languageValidation?: LanguageValidation
  slopDetection?: SlopDetection
  isPriority: boolean
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
  carousel_quality_json: CarouselQuality | null
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
  approval_status: string | null
  approval_client_note: string | null
}

// ---- API error ----

export interface ApiError {
  error: string
  code?: string
}

// Re-export scoring and source types so existing `from '@/types/api'` imports keep working
export type {
  HookVerdict,
  CtaVerdict,
  QualityScores,
  CarouselQuality,
  LanguageIssueType,
  LanguageValidation,
  LanguageValidation as LanguageResult,
  SlopDetection,
  SourceGroundingResult,
} from '@/ai/validation/types/scoring'

export type {
  SingleQualityResult,
  CarouselQualityResult,
  QualityResult,
} from '@/ai/validation/prompts/validate-quality'

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
