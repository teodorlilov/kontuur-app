import type { Json } from '@/types/database'

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
