'use client'

import { CarouselSlides } from '@/components/posts/carousel-slides'
import type { CarouselSlide } from '@/types/api'

interface SlidesSectionProps {
  slidesJson: unknown
  postType: string
}

/** Parse slides_json safely into a typed array. */
function parseSlides(raw: unknown): CarouselSlide[] {
  if (!Array.isArray(raw)) return []
  return raw as CarouselSlide[]
}

/** Renders carousel slides in read-only mode. Returns null for non-carousel posts. */
export function SlidesSection({ slidesJson, postType }: SlidesSectionProps) {
  if (postType !== 'carousel') return null
  const slides = parseSlides(slidesJson)
  if (slides.length === 0) return null
  return <CarouselSlides slides={slides} editable={false} />
}
