import type { Json } from '@/types/database'

// ---- Formality rules types (from language_rules.formality_rules JSONB) ----

export interface FormalityExample {
  bad: string
  good: string
  reason: string
}

export interface NeutralFormalityExample {
  too_formal: string
  too_casual: string
  good_neutral: string
  reason: string
}

export interface FormalityRuleSet {
  rules: string[]
  examples: Record<string, (FormalityExample | NeutralFormalityExample)[]>
}

export interface FormalityRulesData {
  registers: Record<string, FormalityRuleSet>
}

// ---- Unified language config (assembled from language_rules + brand_profiles) ----

export interface LanguageConfig {
  language: string
  formality: string
  carouselSwipeCues: string
  formalityRules: FormalityRulesData | null
  languageInstructions: string
  languageNotes: string
}

// ---- JSON transforms ----

/** Parse formality_rules JSONB into typed FormalityRulesData. */
export function toFormalityRulesData(val: Json | null | undefined): FormalityRulesData | null {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return null
  const obj = val as Record<string, unknown>
  if (!obj.registers || typeof obj.registers !== 'object') return null
  return val as unknown as FormalityRulesData
}

/** Extract a string array from a JSON column value (handles null, non-array). */
export function toStringArray(val: Json | null | undefined): string[] {
  if (!val || !Array.isArray(val)) return []
  return val.filter((v): v is string => typeof v === 'string')
}

/** Extract carousel swipe cues from a JSON column value. */
export function toCarouselSwipeCues(val: Json | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>
    if (obj.carousel_swipe) return String(obj.carousel_swipe)
    return Object.values(obj).join(', ')
  }
  return ''
}
