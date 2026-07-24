'use client'

import type { CanvasBackgroundTransform } from '@/types/canvas'
import { MAX_BACKGROUND_ZOOM } from '@/lib/canvas/constants'
import { PANEL_CONTROL, PANEL_LABEL } from './panel-styles'

interface BackgroundControlsProps {
  transform: CanvasBackgroundTransform | undefined
  repositionMode: boolean
  onToggleReposition: () => void
  onZoom: (zoom: number) => void
  onReset: () => void
}

/** Background section: enter/leave reposition mode, zoom slider, reset to the centered cover fit. */
export function BackgroundControls({
  transform,
  repositionMode,
  onToggleReposition,
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
            background: repositionMode ? 'var(--color-overlay)' : 'var(--color-page)',
          }}
        >
          {repositionMode ? 'Done repositioning' : 'Reposition'}
        </button>
      </div>
      <div>
        <div style={PANEL_LABEL}>Zoom · {zoom.toFixed(2)}×</div>
        <input
          type="range"
          min={1}
          max={MAX_BACKGROUND_ZOOM}
          step={0.05}
          value={zoom}
          onChange={(event) => onZoom(Number(event.target.value))}
          style={{ width: '100%' }}
        />
      </div>
      {transform && (
        <button type="button" onClick={onReset} style={{ ...PANEL_CONTROL, cursor: 'pointer' }}>
          Reset crop
        </button>
      )}
    </div>
  )
}
