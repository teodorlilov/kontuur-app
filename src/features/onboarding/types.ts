import type { WeightedPillar } from '@/lib/clients/content-pillars'

export type OnboardingStep = 'entry' | 'loading' | 'interview' | 'generating' | 'review'

export interface Question {
  id: string
  text: string
  chips: string[]
  multiSelect?: boolean
}

export interface Message {
  role: 'ai' | 'user'
  text: string
}

export interface RecommendedPlatform {
  platform: string
  priority: string
  reason: string
}

export interface OnboardProfile {
  niche: string
  niche_reasoning: string
  target_audience: string[]
  social_goals: string[]
  content_pillars: WeightedPillar[]
  content_pillars_reasoning: string
  tone: string
  avoid_topics: string
  client_testimonial_voice: string
  recommended_platforms: RecommendedPlatform[]
  platform_reasoning: string
  is_health_niche: boolean
  suggested_post_frequency: string
  language: string
  language_formality: string
  contact_email: string
}
