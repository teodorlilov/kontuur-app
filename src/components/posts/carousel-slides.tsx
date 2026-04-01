'use client'

import { useState } from 'react'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import type { CarouselSlide } from '@/types/api'

interface CarouselSlidesProps {
  slides: CarouselSlide[]
}

export function CarouselSlides({ slides }: CarouselSlidesProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const activeSlide = slides[activeIndex]

  function handleCopyAll() {
    const text = slides
      .map((s, i) => `Slide ${s.slide_number ?? i + 1}\n${s.headline}${s.body ? `\n${s.body}` : ''}${s.cta_text ? `\n${s.cta_text}` : ''}`)
      .join('\n---\n')
    void navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Carousel · {slides.length} slides
        </span>
        <button
          onClick={handleCopyAll}
          className="text-xs text-gray-500 hover:text-gray-700 font-medium"
        >
          Copy all slides
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        {slides.map((slide, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={cn(
              'px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeIndex === i
                ? 'bg-brand-purple-light text-brand-purple'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {slide.slide_number ?? i + 1}
          </button>
        ))}
      </div>

      {/* Active slide content */}
      {activeSlide && (
        <div className="bg-gray-50 rounded-lg p-4 flex flex-col gap-3">
          {activeSlide.slide_role && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400 uppercase">
                {activeSlide.slide_role}
              </span>
            </div>
          )}

          <p className="text-sm font-semibold text-gray-900">{activeSlide.headline}</p>

          {activeSlide.body && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{activeSlide.body}</p>
          )}

          {activeSlide.cta_text && (
            <p className="text-xs font-medium text-brand-purple">→ {activeSlide.cta_text}</p>
          )}

          {activeSlide.design_note && (
            <p className="text-xs text-gray-400 italic border-l-2 border-gray-200 pl-2">
              {activeSlide.design_note}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
