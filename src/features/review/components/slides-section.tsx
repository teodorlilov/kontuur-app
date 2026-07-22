'use client'

import { CarouselSlides } from '@/components/posts/carousel-slides'
import { parseSlides } from '@/components/posts/parse-slides'
import { PostImagePreview } from './post-image-preview'
import type { PostImage } from '@/types/api'

interface SlidesSectionProps {
  slidesJson: unknown
  postType: string
  images?: PostImage[]
}

/** Renders carousel slides in read-only mode (with per-slide visuals when present). Returns null for non-carousel posts. */
export function SlidesSection({ slidesJson, postType, images }: SlidesSectionProps) {
  if (postType !== 'carousel') return null
  const slides = parseSlides(slidesJson)
  if (slides.length === 0) return null
  return (
    <CarouselSlides
      slides={slides}
      editable={false}
      renderImageSlot={
        images && images.length > 0
          ? (activeIndex) => (
              <PostImagePreview
                image={images.find((img) => img.position === activeIndex) ?? null}
                altText={slides[activeIndex]?.headline ?? 'Slide visual'}
              />
            )
          : undefined
      }
    />
  )
}
