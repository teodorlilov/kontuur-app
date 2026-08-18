import { parseSlides } from '@/lib/posts/parse-slides'
import type { CarouselSlide } from '@/types/api'

/**
 * Returns a new slides array with one field of one slide replaced — the same
 * edit shape components/posts/carousel-slides.tsx applies, so a draft edited in
 * the generate flow serializes identically to one edited in review. Takes the
 * raw slides_json through parseSlides (arrays only — malformed input yields [])
 * and returns the parsed array, which is what the review view's edit state stores.
 */
export function updateSlideField(
  slidesJson: unknown,
  index: number,
  field: 'headline' | 'body',
  value: string
): CarouselSlide[] {
  return parseSlides(slidesJson).map((slide, i) =>
    i === index ? { ...slide, [field]: value } : slide
  )
}
