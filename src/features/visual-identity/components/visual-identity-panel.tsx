'use client'

import { useState } from 'react'
import type { Palette, VisualIdentity } from '@/types/visual'
import {
  BRAND_STYLES,
  BRAND_STYLE_IDS,
  getBrandStyle,
  type BrandFontChoice,
  type BrandStyle,
  type BrandStyleId,
} from '@/lib/visual/brand-styles'
import { withPalette } from '@/lib/visual/identity'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import { LABEL_CLASS } from '@/components/ui/form/control-classes'
import { PaletteSwatches } from './palette-swatches'
import { FontPickers } from './font-pickers'
import { StyleCard } from './style-card'

type VisualIdentityPanelProps = {
  identity: VisualIdentity
  onChange: (identity: VisualIdentity) => void
  /** The client's content language — narrows the font lists to faces that can set their copy. */
  language?: string
}

/**
 * The brand visual-identity editor: the style AI visuals follow, the palette measured from the
 * client's site, and the two faces every generated slide is set in.
 *
 * Settings-only, despite what this used to claim. It carried three more props — an extraction
 * `status` that drove an "analyzing your website" hint, plus `onReanalyze`/`reanalyzing` for a
 * button — described as "onboarding only" and "settings only" respectively. Neither caller existed:
 * onboarding shows its own `PaletteRow`, and settings puts re-analysis in `VisualIdentityRail`. So
 * the hint could never render and the button could never appear, while the prop list went on
 * describing a component used in two places. knip does not check props, so nothing said a word.
 */
export function VisualIdentityPanel({ identity, onChange, language }: VisualIdentityPanelProps) {
  const [previewStyle, setPreviewStyle] = useState<BrandStyle | null>(null)

  const setPalette = (palette: Palette) => onChange(withPalette(identity, palette))
  const setStyle = (style: BrandStyleId) => onChange({ ...identity, style })
  // A plain spread, unlike `setPalette`: `withPalette` exists to clear the cached palette
  // description a colour edit invalidates, and the type pairing is not in that description.
  const setFonts = (fonts: BrandFontChoice) => onChange({ ...identity, fonts })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className={LABEL_CLASS.caps}>Brand style</div>
        <p className="mb-2.5 mt-2 text-micro leading-relaxed text-text2">
          The design system AI visuals follow. Colours always come from the brand palette below.
        </p>
        <div className="grid max-w-[560px] grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {BRAND_STYLE_IDS.map((id) => (
            <StyleCard
              key={id}
              style={BRAND_STYLES[id]}
              selected={identity.style === id}
              onSelect={() => setStyle(id)}
              onPreview={() => setPreviewStyle(BRAND_STYLES[id])}
            />
          ))}
        </div>
      </div>

      <div>
        <div className={`${LABEL_CLASS.caps} mb-2 block`}>Brand palette</div>
        <PaletteSwatches palette={identity.palette} onChange={setPalette} />
      </div>

      <div>
        <div className={`${LABEL_CLASS.caps} mb-2 block`}>Brand type</div>
        <p className="mb-2.5 mt-2 text-micro leading-relaxed text-text2">
          The two faces every generated slide is set in. Left alone, they follow the brand style
          above.
        </p>
        <FontPickers
          value={identity.fonts}
          fallback={getBrandStyle(identity.style).fonts}
          language={language}
          onChange={setFonts}
        />
      </div>

      {previewStyle && (
        <ImageLightbox
          src={previewStyle.previewSrc}
          alt={`${previewStyle.name} preview`}
          caption={previewStyle.name}
          width={768}
          height={1024}
          onClose={() => setPreviewStyle(null)}
        />
      )}
    </div>
  )
}
