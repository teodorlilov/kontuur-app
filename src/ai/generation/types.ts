import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { PriorityPost, SlopDetection } from '@/types/api'
import type { QualityResult } from '@/ai/validation/prompts/validate-quality'
import type { LanguageValidationResult } from '@/ai/validation/prompts/validate-language'
import type { SourceGroundingResult } from '@/ai/validation/prompts/validate-source-grounding'

// ---- Shared base input — fields common to all content types ----
export interface BaseGenerateInput {
  clientName: string
  niche: string
  theme: string
  tone: string
  targetAudience: string
  language: string
  languageFormality: string
  avoidTopics: string
  clientTestimonialVoice: string
  contentPillars: WeightedPillar[]
  targetPillar?: string
  bannedAnglicisms: string[]
  bannedCalques: string[]
  nativeCTAPhrases?: string
  sourceExcerpt?: string
  sourceUrl?: string | null
  requireSourceGrounding?: boolean
  similarPastThemes?: string[]
  isHealthClient?: boolean
}

// ---- Single post ----
export interface GeneratePostInput extends BaseGenerateInput {
  platform: string
  nativeCTAPhrases: string
  postHistory: string[]
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
  postHistory: string[]
  carouselSwipeCues: string
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

export interface GenerateReelsInput extends BaseGenerateInput {
  nativeCTAPhrases: string
}

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
  clientId: string
  clientName: string
  clientNiche: string
  clientLanguage: string
  platform: string
  postType: 'single' | 'carousel' | 'reels'
  slideCount: number
  tone: string
  targetAudience: string
  formality: string
  avoidTopics: string
  clientTestimonialVoice: string
  contentPillars: WeightedPillar[]
  postHistory: string[]
  bannedAnglicisms: string[]
  bannedCalques: string[]
  nativeCTAPhrases: string
  carouselSwipeCues: string
  requireSourceGrounding: boolean
  isHealthNiche: boolean | null
  themes: Theme[]
  priorityPosts: PriorityPost[]
  trackTheme: (theme: ThemeWithMeta, postCount: number) => Promise<void>
}
