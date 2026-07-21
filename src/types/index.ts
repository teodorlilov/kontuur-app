import type { Tables } from './database'

export type { Database, Json, Tables } from './database'

// Convenience row-type aliases (defined here so `supabase gen types` doesn't wipe them)
export type ClientRow = Tables<'clients'>
export type BrandProfileRow = Tables<'brand_profiles'>
export type PostingScheduleRow = Tables<'posting_schedules'>
export type PostImageRow = Tables<'post_images'>

export type {
  HookVerdict,
  CtaVerdict,
  LanguageIssueType,
  SlopDetection,
  SourceGroundingResult,
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

export type {
  PriorityPost,
  CarouselSlide,
  OnboardRequest,
  OnboardResponse,
  UrlAnalysisRequest,
  UrlAnalysisResponse,
  ResearchRequest,
  ResearchResponse,
  ResearchFinding,
  PillarsRequest,
  PillarsResponse,
  BestTimeRequest,
  BestTimeResponse,
  BestTimePlatform,
  BestTimeWindow,
  SendApprovalRequest,
  ApprovalResponse,
  CalendarPost,
  PostImage,
  TeamMember,
  InviteTeamMemberRequest,
  UpdateAgencyRequest,
  ApiError,
} from './api'

export type {
  ColorRole,
  Palette,
  SourceKind,
  VisualIdentity,
  Confidence,
  ExtractionField,
  ExtractionReport,
  ExtractionResult,
} from './visual'
