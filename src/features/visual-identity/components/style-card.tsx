'use client'

import Image from 'next/image'
import { Check, ZoomIn } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { BrandStyle } from '@/lib/visual/brand-styles'

/** Selectable brand-style card: portrait preview, name, one-liner, selected ring, zoom-to-lightbox. */
export function StyleCard({
  style,
  selected,
  onSelect,
  onPreview,
}: {
  style: BrandStyle
  selected: boolean
  onSelect: () => void
  onPreview: () => void
}) {
  return (
    <div
      onClick={onSelect}
      onKeyDown={(event) => {
        // role="button" on a div buys none of a real button's keyboard behaviour, and it has to
        // be a div because the zoom control below is a button and buttons cannot nest.
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={cn(
        'cursor-pointer overflow-hidden rounded-lg border bg-surface',
        'transition-[border-color,box-shadow] duration-150 ease-contour',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring',
        // An inset ring rather than a 2px border: a border that thickens on select changes the
        // card's box and nudges its neighbours. No resting shadow — a card is a clearing.
        selected
          ? 'border-forest shadow-[inset_0_0_0_1px_var(--forest)]'
          : 'border-line hover:border-text3'
      )}
    >
      <div className="relative aspect-3/4 bg-sunken">
        <Image
          src={style.previewSrc}
          alt={`${style.name} preview`}
          fill
          sizes="220px"
          className="object-cover"
        />
        <button
          type="button"
          title="Preview full size"
          aria-label={`Preview ${style.name} full size`}
          onClick={(event) => {
            event.stopPropagation()
            onPreview()
          }}
          className={cn(
            'absolute right-2 top-2 grid size-7 cursor-zoom-in place-items-center rounded-sm',
            'bg-surface/85 text-text2 transition-colors duration-150 ease-contour',
            'hover:bg-surface hover:text-ink',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring'
          )}
        >
          <ZoomIn className="size-3.5" />
        </button>
        {selected && (
          <span className="absolute bottom-2 right-2 grid size-6 place-items-center rounded-full bg-forest">
            <Check className="size-3.5 text-surface" />
          </span>
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="text-caption font-semibold text-ink">{style.name}</div>
        {/* tracking-normal: Label's 0.16em is for uppercase micro-labels, not a sentence. */}
        <div className="mt-1 text-label leading-relaxed tracking-normal text-text2">
          {style.description}
        </div>
      </div>
    </div>
  )
}
