import type { CarouselSlide } from '@/types/api'

/** Parse an untrusted `slides_json` blob into a typed slides array; anything malformed yields []. */
export function parseSlides(raw: unknown): CarouselSlide[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (slide): slide is CarouselSlide =>
      !!slide && typeof slide === 'object' &&
      typeof (slide as CarouselSlide).headline === 'string' &&
      typeof (slide as CarouselSlide).body === 'string'
  )
}
