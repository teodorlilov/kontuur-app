'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { getBrandStyle, type BrandStyle, type BrandStyleId } from '@/lib/visual/brand-styles'
import { BrandStyleDialog } from './brand-style-dialog'

interface BrandStylePickerProps {
  value: BrandStyleId
  onChange: (style: BrandStyleId) => void
}

/**
 * How a client's brand style is chosen, on the settings panel and the onboarding sheet alike.
 *
 * The catalogue does not live on the page: this is one row naming the current style, and the whole
 * of it opens in `BrandStyleDialog`. That is the point — the row is the same height whether the
 * registry holds four styles or five hundred, where the grid it replaced grew a poster at a time.
 *
 * Resolves through `getBrandStyle` rather than indexing `BRAND_STYLES`, because a client can be
 * holding a style id that has since left the registry; that fallback is what the function is for and
 * what `visual-identity-panel` already relies on for the font pairing.
 */
export function BrandStylePicker({ value, onChange }: BrandStylePickerProps) {
  const [open, setOpen] = useState(false)
  const style = getBrandStyle(value)

  /**
   * Take the dialog's answer, and stay quiet when it is the style we already had.
   *
   * Both callers diff their draft against a baseline to decide whether a save bar appears, so an
   * emit that changes nothing would arm a save bar the user never armed. Same rule, same reason, as
   * `components/ui/listbox.tsx`.
   */
  function commit(next: BrandStyleId) {
    setOpen(false)
    if (next !== value) onChange(next)
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-panel border border-line bg-surface p-3">
        <Image
          src={style.previewSrc}
          alt=""
          width={48}
          height={64}
          className="h-16 w-12 flex-none rounded-sm bg-sunken object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-ink">{style.name}</p>
          <p className="truncate text-caption text-text2">{style.description}</p>
          <p className="mt-1 truncate text-micro text-text3">
            Sets headlines and body in {fontPairing(style)}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Change
        </Button>
      </div>

      {open && (
        <BrandStyleDialog current={value} onConfirm={commit} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

/**
 * "Yeseva One · Sofia Sans" — the pairing every generated slide is set in.
 *
 * Shown on the row rather than only in the dialog because onboarding has no font pickers anywhere:
 * without this line, a client choosing their look there never sees what type comes with it.
 */
function fontPairing(style: BrandStyle): string {
  return `${style.fonts.display} · ${style.fonts.body}`
}
