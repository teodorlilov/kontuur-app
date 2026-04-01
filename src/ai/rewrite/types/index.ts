import type { WeightedPillar } from '@/lib/clients/content-pillars'

export interface RewriteContext {
  caption: string
  postType: 'single' | 'carousel' | 'reels'
  slidesJson?: Array<{ headline: string; body: string }>
  aiTells: string[]
  qualityIssues?: string[]
  platform: string
  sourceExcerpt?: string | null
  sourceUrl?: string | null
  rewriteReason: 'quality' | 'language' | 'source_grounding' | 'manual'
  clientName: string
  clientLanguage: string
  niche: string
  tone: string
  formality: string
  targetAudience: string
  clientTestimonialVoice: string
  avoidTopics: string
  bannedAnglicisms: string[]
  bannedCalques: string[]
  contentPillars: WeightedPillar[]
  postHistory: string[]
  isHealthNiche: boolean | null
}

export interface RewriteCaptionInput {
  caption: string
  aiTells: string[]
  qualityIssues?: string[]
  clientName: string
  language: string
  formality: string
  tone: string
  platform: string
  bannedAnglicisms: string[]
  bannedCalques: string[]
  niche: string
  targetAudience: string
  clientTestimonialVoice: string
  contentPillars: WeightedPillar[]
  avoidTopics: string
  postHistory: string[]
  isHealthClient: boolean | null
}

export interface RewriteCarouselInput {
  mainCaption: string
  slides: Array<{ headline: string; body: string }>
  aiTells: string[]
  qualityIssues?: string[]
  clientName: string
  language: string
  formality: string
  tone: string
  platform: string
  bannedAnglicisms: string[]
  bannedCalques: string[]
  niche: string
  targetAudience: string
  clientTestimonialVoice: string
  contentPillars: WeightedPillar[]
  avoidTopics: string
  postHistory: string[]
  isHealthClient: boolean | null
}

export interface RewriteCarouselResult {
  main_caption: string
  slides: Array<{ headline: string; body: string }>
}
