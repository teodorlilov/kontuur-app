'use client'

import type { CanvasScrim } from '@/types/canvas'
import type { Palette } from '@/types/visual'
import { ColorSwatches } from './color-swatches'
import { PanelCheckbox } from './panel-checkbox'
import { PanelSlider } from './panel-slider'
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
      <PanelCheckbox
        label="Contrast scrim behind text"
        checked={scrim.enabled}
        onChange={(enabled) => onChange({ enabled })}
      />
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
          <ColorSwatches
            label="Scrim colour"
            palette={palette}
            value={scrim.color}
            onChange={(color) => onChange({ color })}
          />
          <PanelSlider
            label={`Opacity · ${Math.round(scrim.opacity * 100)}%`}
            min={0}
            max={1}
            step={0.05}
            value={scrim.opacity}
            onChange={(opacity) => onChange({ opacity })}
          />
        </>
      )}
    </div>
  )
}
