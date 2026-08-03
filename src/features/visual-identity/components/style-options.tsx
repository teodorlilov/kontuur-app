'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Check, ZoomIn } from 'lucide-react'
import { cn } from '@/utils/cn'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import {
  BRAND_STYLES,
  BRAND_STYLE_IDS,
  type BrandStyle,
  type BrandStyleId,
} from '@/lib/visual/brand-styles'

interface StyleOptionsProps {
  value: BrandStyleId | ''
  onChange: (style: BrandStyleId) => void
}

/**
 * The brand-style picker at row scale, for the onboarding draft sheet.
 *
 * Settings uses `StyleCard` — a grid of 220px portrait posters, which is the right shape for a
 * page devoted to visual identity. On the draft sheet that gallery was the most striking thing
 * on the page and the least likely to be seen: it only fitted below the fold, past every field.
 * At row scale it sits in the sheet's footer band and gets read, and the zoom still opens the
 * real preview — the trade `StyleCard` already makes with its own lightbox.
 */
export function StyleOptions({ value, onChange }: StyleOptionsProps) {
  const [previewStyle, setPreviewStyle] = useState<BrandStyle | null>(null)

  return (
    <>
      <div
        role="group"
        aria-label="Visual system"
        className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]"
      >
        {BRAND_STYLE_IDS.map((id) => (
          <StyleOption
            key={id}
            style={BRAND_STYLES[id]}
            selected={value === id}
            onSelect={() => onChange(id)}
            onPreview={() => setPreviewStyle(BRAND_STYLES[id])}
          />
        ))}
      </div>

      {previewStyle && (
        <ImageLightbox
          src={previewStyle.previewSrc}
          alt={`${previewStyle.name} preview`}
          caption={`${previewStyle.name} · ${fontPairing(previewStyle)}`}
          width={768}
          height={1024}
          onClose={() => setPreviewStyle(null)}
        />
      )}
    </>
  )
}

/** "Oswald · Source Sans 3" — the pairing text overlays are set in. */
function fontPairing(style: BrandStyle): string {
  return `${style.fonts.display} · ${style.fonts.body}`
}

function StyleOption({
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
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        // A div, because the zoom control sits inside the row and buttons cannot nest — so the
        // keyboard behaviour a real button would provide has to be written out.
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-surface p-2',
        'transition-[border-color,box-shadow] duration-150 ease-contour',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring',
        // Inset ring, not a thicker border: selecting must not resize the row.
        selected
          ? 'border-forest shadow-[inset_0_0_0_1px_var(--forest)]'
          : 'border-line hover:border-text3'
      )}
    >
      <Image
        src={style.previewSrc}
        alt=""
        width={56}
        height={72}
        className="h-[72px] w-14 flex-none rounded-sm bg-sunken object-cover"
      />

      <span className="min-w-0">
        <span className="block text-caption font-semibold text-ink">{style.name}</span>
        <span className="mt-0.5 block text-micro leading-relaxed text-text2">
          {style.description}
        </span>
        <span className="mt-1 block text-micro text-text3">{fontPairing(style)}</span>
      </span>

      <span className="flex flex-none items-center gap-1">
        <button
          type="button"
          title="See it full size"
          aria-label={`See ${style.name} full size`}
          onClick={(event) => {
            event.stopPropagation()
            onPreview()
          }}
          className={cn(
            'grid size-7 cursor-zoom-in place-items-center rounded-sm text-text3',
            'transition-colors duration-150 ease-contour hover:bg-sunken hover:text-ink',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring'
          )}
        >
          <ZoomIn className="size-3.5" />
        </button>
        {/* Reserved rather than mounted on select, so choosing a row does not reflow the other. */}
        <span
          aria-hidden
          className={cn(
            'grid size-6 place-items-center rounded-full bg-forest',
            !selected && 'invisible'
          )}
        >
          <Check className="size-3.5 text-surface" />
        </span>
      </span>
    </div>
  )
}
