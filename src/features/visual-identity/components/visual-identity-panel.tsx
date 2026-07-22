'use client'

import { useState } from 'react'
import type { Palette, VisualIdentity } from '@/types/visual'
import { BRAND_STYLES, BRAND_STYLE_IDS, type BrandStyle, type BrandStyleId } from '@/lib/visual/brand-styles'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import { PaletteSwatches } from './palette-swatches'
import { StyleCard } from './style-card'
import type { ExtractionStatus } from '../hooks/use-extraction-status'

type VisualIdentityPanelProps = {
  identity: VisualIdentity
  onChange: (identity: VisualIdentity) => void
  /** Onboarding only: drives the "analyzing your website" hint while extraction runs. */
  status?: ExtractionStatus
  /** Settings only: re-run extraction from the client's website. */
  onReanalyze?: () => void
  reanalyzing?: boolean
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '9px',
  fontWeight: 500,
  color: 'var(--color-terracotta)',
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  marginBottom: '8px',
}

/** The shared brand visual-identity editor: the Brand Style used for AI visuals plus the editable
 *  Brand Palette measured from the client's site. Used by both the onboarding Review step and the
 *  client settings tab so the editor lives in one place. */
export function VisualIdentityPanel({ identity, onChange, status, onReanalyze, reanalyzing }: VisualIdentityPanelProps) {
  const [previewStyle, setPreviewStyle] = useState<BrandStyle | null>(null)

  // Rebuilt without palette_description: it described the old colours; generation self-heals a fresh one.
  const setPalette = (palette: Palette) => onChange({ palette, style: identity.style })
  const setStyle = (style: BrandStyleId) => onChange({ ...identity, style })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {status && status !== 'ready' && status !== 'idle' && (
        <div style={{ fontSize: '11px', color: 'var(--color-text-2)', lineHeight: 1.5 }}>
          {status === 'pending' && 'Analyzing your website for brand colours… you can keep editing; results will appear here.'}
          {status === 'failed' && 'Analysis took too long — using default colours. Adjust anything below.'}
          {status === 'fallback' && 'No site colours could be read — using defaults. Adjust below.'}
        </div>
      )}

      <div>
        <div style={LABEL_STYLE}>Brand style</div>
        <p style={{ fontSize: '11px', color: 'var(--color-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
          The design system AI visuals follow. Colours always come from the brand palette below.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '12px',
            maxWidth: 560,
          }}
        >
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
        <div style={LABEL_STYLE}>Brand palette</div>
        <PaletteSwatches palette={identity.palette} onChange={setPalette} />
      </div>

      {onReanalyze && (
        <button
          type="button"
          onClick={onReanalyze}
          disabled={reanalyzing}
          style={{
            alignSelf: 'flex-start',
            padding: '8px 14px',
            borderRadius: '8px',
            border: '0.5px solid var(--color-border-1)',
            background: 'var(--color-page)',
            color: 'var(--color-text-1)',
            fontSize: '12px',
            cursor: reanalyzing ? 'default' : 'pointer',
            opacity: reanalyzing ? 0.7 : 1,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {reanalyzing ? 'Re-analyzing…' : 'Re-analyze from website'}
        </button>
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
