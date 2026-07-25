'use client'

import { BrushSizeSlider } from './brush-size-slider'
import { PanelButton } from './panel-button'
import { PANEL_LABEL } from './panel-styles'

/** Everything the eraser panel needs from the overlay. */
export interface ErasePanelState {
  active: boolean
  applying: boolean
  brushSize: number
  hasStrokes: boolean
  onBrushSizeChange: (size: number) => void
  onClearStrokes: () => void
  onApply: () => void
  onToggle: () => void
}

/** Eraser-mode controls: paint the parts to remove from the selected element, then apply. */
export function EraseControls({ erase }: { erase: ErasePanelState }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <div style={PANEL_LABEL}>Erase from element</div>
        <p style={{ fontSize: '11px', color: 'var(--color-muted)', margin: 0 }}>
          Paint over the parts of the selected element to remove — they become transparent.
        </p>
      </div>
      <BrushSizeSlider size={erase.brushSize} onChange={erase.onBrushSizeChange} />
      <PanelButton onClick={erase.onApply} busy={erase.applying} disabled={!erase.hasStrokes}>
        {erase.applying ? 'Erasing…' : 'Apply erase'}
      </PanelButton>
      <PanelButton onClick={erase.onClearStrokes} disabled={!erase.hasStrokes || erase.applying}>
        Clear strokes
      </PanelButton>
      <PanelButton onClick={erase.onToggle}>Done</PanelButton>
    </div>
  )
}
