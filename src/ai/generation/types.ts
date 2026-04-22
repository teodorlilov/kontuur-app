import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { PriorityPost, PostType, SlopDetection, CarouselSlide } from '@/types/api'
import type {
  LanguageValidationResult,
  SourceGroundingResult,
  ValidationCriteria,
  ValidationScores,
} from '@/ai/validation/types'

// ---- Shared base input — fields common to all content types ----
export interface GenerationInput {
  client: ClientData
  theme: string
  targetPillar?: string
  sourceExcerpt?: string
  sourceFullText?: string
  sourceUrl?: string | null
  requireSourceGrounding?: boolean
  similarPastThemes?: string[]
  brief?: string
  targetDate?: string
}

// ---- Single post ----
export interface SinglePostInput extends GenerationInput {
  platform: string
  count: number
}

// ---- Carousel ----
export type { CarouselSlide }

export interface CarouselResult {
  main_caption: string
  slides: CarouselSlide[]
}

export interface CarouselInput extends GenerationInput {
  slideCount: number
  platform: string
}

// ---- Draft post record (typed replacement for Record<string, unknown>) ----
export interface DraftPost {
  id: string
  client_id: string
  platform: string
  post_type: 'single' | 'carousel'
  caption: string
  status: 'draft'
  priority: boolean
  topic_summary: string
  slides_json: unknown
  validation_json: unknown
  quality_score_avg: number
  source_url: string | null
  source_title: string | null
  source_type: 'rss' | 'website' | 'file' | 'web_search' | null
  source_excerpt: string | null
  pillar: string | null
  created_at: string
}

// ---- Generation orchestration ----
export interface GenerationResult {
  post: DraftPost
  language?: LanguageValidationResult
  slop?: SlopDetection
  sourceGrounding?: SourceGroundingResult
  criteria: ValidationCriteria
  scores: ValidationScores
}

export interface Theme {
  description: string
  count: number
  pillar?: string
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceType?: 'rss' | 'website' | 'file' | 'web_search'
  sourceExcerpt?: string
  sourceFullText?: string
}

export interface EnrichedTheme extends Theme {
  isPriority?: boolean
  brief?: string
  targetDate?: string
  similarPastThemes?: string[]
}

export interface GenerationRunContext {
  client: ClientData
  platform: string
  postType: PostType
  slideCount?: number
  requireSourceGrounding: boolean
  themes: Theme[]
  priorityPosts: PriorityPost[]
  trackTheme: (theme: EnrichedTheme, postCount: number) => Promise<void>
  /** Called immediately when each theme's result is ready. Used for streaming responses. */
  onResult?: (result: GenerationResult) => void
  /** Called when generation starts for a theme. Used for progress events. */
  onProgress?: (theme: string) => void
}

export type GenerateStreamEvent =
  | { type: 'progress'; theme: string }
  | { type: 'result'; data: GenerationResult }
