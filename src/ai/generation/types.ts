import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { PostType, SlopDetection, CarouselSlide } from '@/types/api'
import type {
  LanguageValidationResult,
  SourceGroundingResult,
  ValidationCriteria,
  ValidationScores,
} from '@/ai/validation/types'

// ---- Shared base input — fields common to all content types ----
interface GenerationInput {
  client: ClientData
  theme: string
  targetPillar?: string
  sourceExcerpt?: string
  sourceFullText?: string
  sourceUrl?: string | null
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
  post_type: PostType
  caption: string
  status: 'draft'
  priority: boolean
  topic_summary: string
  slides_json: unknown
  validation_json: unknown
  quality_score_avg: number | null
  source_url: string | null
  source_title: string | null
  source_type: 'rss' | 'website' | 'file' | 'web_search' | 'performance' | null
  source_excerpt: string | null
  /** client_sources row that fueled this draft — resolved server-side during research. */
  client_source_id: string | null
  pillar: string | null
  /**
   * The date a brief asked for, carried through to the schedule dialog.
   *
   * Not a `posts` column and never persisted — `draftColumns` does not read it. It
   * reached the writer's prompt and stopped there, so a client saying "before the
   * 12th" shaped the wording and then vanished, leaving the reviewer to schedule
   * against nothing.
   */
  target_date: string | null
  created_at: string
}

// ---- Generation orchestration ----
export interface GenerationResult {
  post: DraftPost
  language: LanguageValidationResult
  slop: SlopDetection
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
  sourceType?: 'rss' | 'website' | 'file' | 'web_search' | 'performance'
  sourceExcerpt?: string
  sourceFullText?: string
  clientSourceId?: string | null
}

export interface EnrichedTheme extends Theme {
  isPriority?: boolean
  brief?: string
  targetDate?: string
  /**
   * Absent = the run's platform; set only by priority briefs whose author chose
   * one. Research topics and the cron never set it — `platformFor` resolves the
   * fallback at every consumption point.
   */
  platform?: string
  similarPastThemes?: string[]
}

export interface GenerationRunContext {
  client: ClientData
  platform: string
  postType: PostType
  slideCount?: number
  themes: Theme[]
  trackTheme: (theme: EnrichedTheme, postCount: number) => Promise<void>
  /** Called immediately when each theme's result is ready. Used for streaming responses. */
  onResult?: (result: GenerationResult) => void
  /**
   * Called as each theme moves through writing, judging, and (rarely) the
   * bounded refine round.
   *
   * Carries which phase it is, because judging was previously silent: the
   * progress rail's "Quality checks" stage was unreachable for the whole run, and
   * the judge call — the slowest thing after writing — was entirely unnarrated.
   * 'refining' needs no wire/UI change: the stream route maps every non-writing
   * phase onto the existing quality stage.
   */
  onProgress?: (theme: string, phase: 'writing' | 'validating' | 'refining') => void
}
