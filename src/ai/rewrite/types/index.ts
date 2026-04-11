import type { ClientData } from '@/lib/clients/fetch-client-data'

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
  client: ClientData
}

export interface RewriteCaptionInput {
  caption: string
  aiTells: string[]
  qualityIssues?: string[]
  client: ClientData
  platform: string
}

export interface RewriteCarouselInput {
  mainCaption: string
  slides: Array<{ headline: string; body: string }>
  aiTells: string[]
  qualityIssues?: string[]
  client: ClientData
  platform: string
}

export interface RewriteCarouselResult {
  main_caption: string
  slides: Array<{ headline: string; body: string }>
}
