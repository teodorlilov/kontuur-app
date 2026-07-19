'use client'

import type { Palette, VibePresetId, VisualIdentity } from '@/types/visual'
import { presetTypography } from '@/lib/visual/identity'
import { PaletteSwatches } from './palette-swatches'
import { StyleSpotlight } from './style-spotlight'
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

/** The shared brand visual-identity editor: a style spotlight (preset + typography preview in the
 *  brand's colours) over the single editable Brand Palette. Used by both the onboarding Review step and
 *  the client settings tab so the editor exists in exactly one place. */
export function VisualIdentityPanel({ identity, onChange, status, onReanalyze, reanalyzing }: VisualIdentityPanelProps) {
  // Switching preset re-locks the typography to that preset's pairing (preset is authoritative).
  const selectPreset = (id: VibePresetId) =>
    onChange({ ...identity, vibe_preset: id, typography: presetTypography(id) })

  const setPalette = (palette: Palette) => onChange({ ...identity, palette })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {status && status !== 'ready' && status !== 'idle' && (
        <div style={{ fontSize: '11px', color: 'var(--color-text-2)', lineHeight: 1.5 }}>
          {status === 'pending' && 'Analyzing your website for colours and style… you can keep editing; results will appear here.'}
          {status === 'failed' && 'Analysis took too long — using your vibe preset defaults. Adjust anything below.'}
          {status === 'fallback' && 'Used your vibe preset defaults — no site colours could be read. Adjust below.'}
        </div>
      )}

      <div>
        <div style={LABEL_STYLE}>Style</div>
        <StyleSpotlight selected={identity.vibe_preset} onSelect={selectPreset} palette={identity.palette} />
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
    </div>
  )
}
