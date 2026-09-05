import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { PostType } from '@/types/api'
import type { SlideText } from '@/types/slide'

export interface RewriteContext {
  caption: string
  postType: PostType
  slidesJson?: SlideText[]
  aiTells: string[]
  qualityIssues?: string[]
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
}

export interface RewriteCarouselInput {
  mainCaption: string
  slides: SlideText[]
  aiTells: string[]
  qualityIssues?: string[]
  client: ClientData
}

export interface RewriteCarouselResult {
  main_caption: string
  slides: SlideText[]
}
