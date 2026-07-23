'use client'

import type { CanvasScrim } from '@/types/canvas'
import type { Palette } from '@/types/visual'
import { ColorSwatches } from './color-swatches'
import { PANEL_CONTROL, PANEL_LABEL } from './panel-styles'

interface ScrimControlsProps {
  scrim: CanvasScrim
  palette: Palette
  onChange: (patch: Partial<CanvasScrim>) => void
}

/** Contrast-scrim controls: toggle, band mode, colour, opacity. */
export function ScrimControls({ scrim, palette, onChange }: ScrimControlsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-1)', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={scrim.enabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
        />
        Contrast scrim behind text
      </label>
      {scrim.enabled && (
        <>
          <div>
            <div style={PANEL_LABEL}>Coverage</div>
            <select
              value={scrim.mode}
              onChange={(event) => onChange({ mode: event.target.value as CanvasScrim['mode'] })}
              style={PANEL_CONTROL}
            >
              <option value="bottom">Bottom band</option>
              <option value="full">Full canvas</option>
            </select>
          </div>
          <ColorSwatches label="Scrim colour" palette={palette} value={scrim.color} onChange={(color) => onChange({ color })} />
          <div>
            <div style={PANEL_LABEL}>Opacity · {Math.round(scrim.opacity * 100)}%</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={scrim.opacity}
              onChange={(event) => onChange({ opacity: Number(event.target.value) })}
              style={{ width: '100%' }}
            />
          </div>
        </>
      )}
    </div>
  )
}
