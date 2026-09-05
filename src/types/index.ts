import type { Tables } from './database'

export type { Database, Json, Tables } from './database'

// Convenience row-type aliases (defined here so `supabase gen types` doesn't wipe them)
export type ClientRow = Tables<'clients'>
export type BrandProfileRow = Tables<'brand_profiles'>
export type PostingScheduleRow = Tables<'posting_schedules'>
export type PostImageRow = Tables<'post_images'>
export type PostRow = Tables<'posts'>
export type PostPublicationRow = Tables<'post_publications'>
export type IGAccountMetricsRow = Tables<'ig_account_metrics'>
export type IGPostMetricsRow = Tables<'ig_post_metrics'>
export type IGAudienceSnapshotsRow = Tables<'ig_audience_snapshots'>
export type IGCommentRow = Tables<'ig_comments'>
export type SocialConnectionRow = Tables<'social_connections'>
export type UserRow = Tables<'users'>
export type ClientSourceRow = Tables<'client_sources'>
export type AnalyticsReportRow = Tables<'analytics_reports'>
export type LanguageRuleRow = Tables<'language_rules'>
export type BrandKitExtractionRow = Tables<'brand_kit_extractions'>

export type { LanguageIssueType, SlopDetection, SourceGroundingResult } from '@/ai/validation/types'

export type { ClientSource, SourceSuggestion, DiscoverPagesResponse } from './sources'

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
  ExtractionReport,
  ExtractionResult,
} from './visual'
