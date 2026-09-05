'use client'

import { Image as ImageIcon, GalleryHorizontalEnd } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { PostType } from '@/types/api'

interface FormatCardsProps {
  value: PostType
  slideCount: number
  onChange: (value: PostType) => void
}

/**
 * Single image vs carousel. Selected is an active state — a Deep Pine edge on
 * Wash, never lime: the header band already carries this view's lime answer,
 * and a format card is a surface, not a standing place.
 */
export function FormatCards({ value, slideCount, onChange }: FormatCardsProps) {
  // Every format is writable. Which networks take a carousel is decided by the adapters
  // when the post is scheduled, not by the wizard before the copy exists.
  const carouselAvailable = true

  const options: Array<{
    type: PostType
    title: string
    sub: string
    icon: React.ReactNode
    disabled: boolean
  }> = [
    {
      type: 'single',
      title: 'Single image',
      sub: 'One caption, one composed visual',
      icon: <ImageIcon aria-hidden className="size-4" strokeWidth={1.6} />,
      disabled: false,
    },
    {
      type: 'carousel',
      title: 'Carousel',
      sub: carouselAvailable ? `${slideCount} slides, a visual on each` : 'Instagram only',
      icon: <GalleryHorizontalEnd aria-hidden className="size-4" strokeWidth={1.6} />,
      disabled: !carouselAvailable,
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((option) => {
        const pressed = value === option.type
        return (
          <button
            key={option.type}
            type="button"
            aria-pressed={pressed}
            disabled={option.disabled}
            onClick={() => onChange(option.type)}
            className={cn(
              'rounded-panel border p-4 text-left transition-colors duration-150 ease-contour',
              pressed
                ? 'border-forest bg-wash shadow-[inset_0_0_0_1px_var(--forest)]'
                : 'border-line2 bg-surface hover:border-text3/45 hover:bg-sunken',
              option.disabled && 'cursor-not-allowed opacity-50 hover:border-line2 hover:bg-surface'
            )}
          >
            <span
              className={cn(
                'mb-3 grid size-8 place-items-center rounded-chip',
                pressed ? 'bg-forest text-accent' : 'bg-sunken text-text2'
              )}
            >
              {option.icon}
            </span>
            <span className="block text-title font-semibold text-ink">{option.title}</span>
            <span className="mt-1 block text-caption text-text2">{option.sub}</span>
          </button>
        )
      })}
    </div>
  )
}
