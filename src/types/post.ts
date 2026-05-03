import type {
  LanguageResult,
  SlopDetection,
  SourceGroundingResult,
  ValidationCriteria,
  ValidationScores,
} from '@/types/api'

export interface ValidationData {
  language: LanguageResult
  slop: SlopDetection
  sourceGrounding?: SourceGroundingResult
  criteria: ValidationCriteria
  scores: ValidationScores
}

export interface PostData {
  id: string
  client_id: string
  caption: string | null
  platform: string | null
  post_type: string
  slides_json: unknown
  validation_json: unknown
  status: string
  priority: boolean
  quality_score_avg: number | null
  topic_summary?: string | null
  was_rewritten?: boolean
  rewrite_count?: number
  source_url?: string | null
  source_title?: string | null
  source_type?: string | null
  pillar?: string | null
  source_excerpt?: string | null
  ig_creation_id?: string | null
  ig_media_id?: string | null
  publish_error?: string | null
  publish_attempts?: number
  created_at: string
}
