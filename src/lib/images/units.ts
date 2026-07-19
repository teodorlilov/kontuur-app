import type { CarouselSlide } from '@/types/api'
import { toBackdropRole } from './text-zones'
import type { VisualUnit } from './types'

/** Normalize a carousel's slides into backdrop units (index = slide position). */
export function unitsFromSlides(slides: CarouselSlide[]): VisualUnit[] {
  return slides.map((s, i) => ({
    index: i,
    role: toBackdropRole(s.slide_role),
    headline: s.headline ?? '',
    body: s.body ?? '',
  }))
}

/** One backdrop unit for a single-image post, from its caption. */
export function unitFromCaption(caption: string): VisualUnit[] {
  return [{ index: 0, role: 'cover', headline: caption.trim().slice(0, 140), body: '' }]
}
