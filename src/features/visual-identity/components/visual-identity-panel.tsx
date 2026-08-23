'use client'

import { useState } from 'react'
import type { Palette, VisualIdentity } from '@/types/visual'
import {
  BRAND_STYLES,
  BRAND_STYLE_IDS,
  type BrandStyle,
  type BrandStyleId,
} from '@/lib/visual/brand-styles'
import { withPalette } from '@/lib/visual/identity'
import { Button } from '@/components/ui/button'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import { LABEL_CLASS } from '@/components/ui/form/control-classes'
import { PaletteSwatches } from './palette-swatches'
import { StyleCard } from './style-card'
import { EXTRACTION_HINT, type ExtractionStatus } from '../hooks/use-extraction-status'

type VisualIdentityPanelProps = {
  identity: VisualIdentity
  onChange: (identity: VisualIdentity) => void
  /** Onboarding only: drives the "analyzing your website" hint while extraction runs. */
  status?: ExtractionStatus
  /** Settings only: re-run extraction from the client's website. */
  onReanalyze?: () => void
  reanalyzing?: boolean
}

/** The shared brand visual-identity editor: the Brand Style used for AI visuals plus the editable
 *  Brand Palette measured from the client's site. Used by both the onboarding Review step and the
 *  client settings tab so the editor lives in one place. */
export function VisualIdentityPanel({
  identity,
  onChange,
  status,
  onReanalyze,
  reanalyzing,
}: VisualIdentityPanelProps) {
  const [previewStyle, setPreviewStyle] = useState<BrandStyle | null>(null)

  const setPalette = (palette: Palette) => onChange(withPalette(identity, palette))
  const setStyle = (style: BrandStyleId) => onChange({ ...identity, style })

  const hint = status ? EXTRACTION_HINT[status] : undefined

  return (
    <div className="flex flex-col gap-5">
      {hint && <p className="text-micro leading-relaxed text-text2">{hint}</p>}

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

      {onReanalyze && (
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={onReanalyze}
          loading={reanalyzing}
          className="self-start"
        >
          {reanalyzing ? 'Re-analyzing…' : 'Re-analyze from website'}
        </Button>
      )}

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
