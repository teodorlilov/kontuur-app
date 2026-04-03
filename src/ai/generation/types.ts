import type { ClientContext } from '@/lib/clients/fetch-client-data'
import type { PriorityPost, SlopDetection } from '@/types/api'
import type { QualityResult } from '@/ai/validation/prompts/validate-quality'
import type { LanguageValidationResult } from '@/ai/validation/prompts/validate-language'
import type { SourceGroundingResult } from '@/ai/validation/prompts/validate-source-grounding'

// ---- Shared base input — fields common to all content types ----
export interface BaseGenerateInput {
  client: ClientContext
  theme: string
  targetPillar?: string
  sourceExcerpt?: string
  sourceUrl?: string | null
  requireSourceGrounding?: boolean
  similarPastThemes?: string[]
}

// ---- Single post ----
export interface GeneratePostInput extends BaseGenerateInput {
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

export interface GenerateCarouselInput extends BaseGenerateInput {
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

export interface GenerateReelsInput extends BaseGenerateInput {}

// ---- Generation orchestration ----
export interface GeneratedPostEntry {
  post: Record<string, unknown>
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

export interface ThemeWithMeta extends Theme {
  isPriority?: boolean
  brief?: string
  targetDate?: string
  similarPastThemes?: string[]
}

export interface GeneratePostsContext {
  client: ClientContext
  platform: string
  postType: 'single' | 'carousel' | 'reels'
  slideCount: number
  requireSourceGrounding: boolean
  themes: Theme[]
  priorityPosts: PriorityPost[]
  trackTheme: (theme: ThemeWithMeta, postCount: number) => Promise<void>
}
