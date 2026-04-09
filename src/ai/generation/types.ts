import type { ClientContext } from '@/lib/clients/fetch-client-data'
import type { PriorityPost, PostType, SlopDetection } from '@/types/api'
import type { QualityResult } from '@/ai/validation/prompts/validate-quality'
import type { LanguageValidationResult } from '@/ai/validation/prompts/validate-language'
import type { SourceGroundingResult } from '@/ai/validation/prompts/validate-source-grounding'

// ---- Shared base input — fields common to all content types ----
export interface GenerationInput {
  client: ClientContext
  theme: string
  targetPillar?: string
  sourceExcerpt?: string
  sourceUrl?: string | null
  requireSourceGrounding?: boolean
  similarPastThemes?: string[]
}

// ---- Single post ----
export interface SinglePostInput extends GenerationInput {
  platform: string
  count: number
}

// ---- Carousel ----
export interface CarouselSlide {
  slide_number: number
  slide_role: 'cover' | 'content' | 'value' | 'cta'
  headline: string
  body: string
  cta_text: string | null
  design_note: string
}

export interface CarouselResult {
  main_caption: string
  slides: CarouselSlide[]
}

export interface CarouselInput extends GenerationInput {
  slideCount: number
}

// ---- Reels ----
export interface ReelsResult {
  hook: string
  main_points: string[]
  cta: string
  on_screen_text: string[]
  visual_directions: string[]
  estimated_seconds: number
}

// ---- Draft post record (typed replacement for Record<string, unknown>) ----
export interface DraftPost {
  id: string
  client_id: string
  platform: string
  post_type: PostType
  caption: string
  status: 'draft'
  priority: boolean
  topic_summary: string
  slides_json: unknown
  carousel_quality_json: unknown
  quality_score_avg: number
  source_url: string | null
  source_title: string | null
  source_type: 'rss' | 'website' | 'file' | null
  source_excerpt: string | null
  pillar: string | null
  created_at: string
}

// ---- Generation orchestration ----
export interface GenerationResult {
  post: DraftPost
  quality: QualityResult
  language: LanguageValidationResult
  slop: SlopDetection
  sourceGrounding?: SourceGroundingResult
}

export interface Theme {
  description: string
  count: number
  pillar?: string
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceType?: 'rss' | 'website' | 'file'
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
  client: ClientContext
  platform: string
  postType: PostType
  slideCount?: number
  requireSourceGrounding: boolean
  themes: Theme[]
  priorityPosts: PriorityPost[]
  trackTheme: (theme: EnrichedTheme, postCount: number) => Promise<void>
  /** Called immediately when each theme's result is ready. Used for streaming responses. */
  onResult?: (result: GenerationResult) => void
}
