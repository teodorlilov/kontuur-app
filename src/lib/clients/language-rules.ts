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

// ---- Opener examples (from language_rules.opener_examples JSONB) ----

export interface OpenerExample {
  formality: string
  id: string
  description: string
  content: string
}

// ---- Unified language config (assembled from language_rules + brand_profiles) ----

export interface LanguageConfig {
  language: string
  formality: string
  nativeCTAPhrases: string
  carouselSwipeCues: string
  formalityRules: FormalityRulesData | null
  languageInstructions: string
  openerExamples: OpenerExample[]
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

/** Parse opener_examples JSONB into typed OpenerExample[]. */
export function toOpenerExamples(val: Json | null | undefined): OpenerExample[] {
  if (!val || !Array.isArray(val)) return []
  return (val as unknown[]).filter(
    (v): v is OpenerExample =>
      typeof v === 'object' && v !== null &&
      'formality' in v && 'id' in v && 'description' in v && 'content' in v
  )
}

/** Extract a string array from a JSON column value (handles null, non-array). */
export function toStringArray(val: Json | null | undefined): string[] {
  if (!val || !Array.isArray(val)) return []
  return val.filter((v): v is string => typeof v === 'string')
}

/** Extract CTA phrases from a JSON column value (string, object values, or empty). */
export function toCTAPhrases(val: Json | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object' && !Array.isArray(val)) {
    return Object.values(val as Record<string, unknown>).join(', ')
  }
  return ''
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
