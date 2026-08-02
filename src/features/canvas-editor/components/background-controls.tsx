'use client'

import type { CanvasBackgroundTransform } from '@/types/canvas'
import { MAX_BACKGROUND_ZOOM } from '@/lib/canvas/constants'
import { PanelSlider } from './panel-slider'
import { PANEL_CONTROL, PANEL_LABEL } from './panel-styles'

interface BackgroundControlsProps {
  transform: CanvasBackgroundTransform | undefined
  repositionMode: boolean
  onToggleReposition: () => void
  onEnterInpaint: () => void
  onZoom: (zoom: number) => void
  onReset: () => void
}

/** Background section: reposition mode, AI repair entry, zoom slider, reset to the cover fit. */
export function BackgroundControls({
  transform,
  repositionMode,
  onToggleReposition,
  onEnterInpaint,
  onZoom,
  onReset,
}: BackgroundControlsProps) {
  const zoom = transform?.zoom ?? 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <div style={PANEL_LABEL}>Background</div>
        <button
          type="button"
          onClick={onToggleReposition}
          style={{
            ...PANEL_CONTROL,
            cursor: 'pointer',
            background: repositionMode ? 'rgba(15,21,18,0.04)' : 'var(--paper)',
          }}
        >
          {repositionMode ? 'Done repositioning' : 'Reposition'}
        </button>
        <button
          type="button"
          onClick={onEnterInpaint}
          title="Paint over a zone and describe what should replace it"
          style={{ ...PANEL_CONTROL, marginTop: '8px', cursor: 'pointer' }}
        >
          AI repair (brush)
        </button>
      </div>
      <PanelSlider
        label={`Zoom · ${zoom.toFixed(2)}×`}
        min={1}
        max={MAX_BACKGROUND_ZOOM}
        step={0.05}
        value={zoom}
        onChange={onZoom}
      />
      {transform && (
        <button type="button" onClick={onReset} style={{ ...PANEL_CONTROL, cursor: 'pointer' }}>
          Reset crop
        </button>
      )}
    </div>
  )
}
