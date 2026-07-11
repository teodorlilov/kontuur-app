import type { BrandTokens } from '@/lib/scene-graph'

/**
 * How a given extracted field was arrived at, surfaced as a badge in the Review step (§2.4):
 * `measured` = read off the live page, `inferred` = judged by vision, `guessed` = proposed from a
 * category (image path — no font is ever `measured` there).
 */
export type Confidence = 'measured' | 'inferred' | 'guessed'

export type ExtractionField = 'colors' | 'accent' | 'fonts' | 'typeScale' | 'mood' | 'subjects'

/** The per-field confidence map plus the feed-system recommendation and any soft-fallback reason. */
export type ExtractionReport = {
  source: 'website' | 'image'
  confidence: Partial<Record<ExtractionField, Confidence>>
  feedSystemRecommendation?: { slug: string; reason: string }
  fallback?: { toDefaultKit: boolean; reason: string }
}

/** What an extractor returns: a renderable kit, its confidence report, and the subject vocabularies. */
export type ExtractionResult = {
  tokens: BrandTokens
  report: ExtractionReport
  subjects: { photographic: string[]; motifs: string[] }
}
