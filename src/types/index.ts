import type { Tables } from './database'

export type { Database, Json, Tables } from './database'

// Convenience row-type aliases (defined here so `supabase gen types` doesn't wipe them)
export type ClientRow = Tables<'clients'>
export type BrandProfileRow = Tables<'brand_profiles'>
export type PostingScheduleRow = Tables<'posting_schedules'>
export type PostImageRow = Tables<'post_images'>
export type PostRow = Tables<'posts'>
export type AnalyticsReportRow = Tables<'analytics_reports'>

export type { LanguageIssueType, SlopDetection, SourceGroundingResult } from '@/ai/validation/types'

export type {
  ClientSource,
  SourceSuggestion,
  DiscoverPagesRequest,
  DiscoverPagesResponse,
} from './sources'

export type {
  PriorityPost,
  CarouselSlide,
  UrlAnalysisResponse,
  CalendarPost,
  PostImage,
  TeamMember,
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
