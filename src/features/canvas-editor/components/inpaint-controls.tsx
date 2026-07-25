'use client'

import { BrushSizeSlider } from './brush-size-slider'
import { PanelButton } from './panel-button'
import { PANEL_CONTROL, PANEL_LABEL } from './panel-styles'

/** Everything the inpaint panel needs from the overlay, grouped to keep the panel signature sane. */
export interface InpaintPanelState {
  active: boolean
  applying: boolean
  prompt: string
  brushSize: number
  hasStrokes: boolean
  onToggle: () => void
  onPromptChange: (prompt: string) => void
  onBrushSizeChange: (size: number) => void
  onClearStrokes: () => void
  onApply: () => void
  onRemoveObject: () => void
}

/** Inpaint-mode controls: describe the fill, size the brush, apply (~30–60s), clear, done. */
export function InpaintControls({ inpaint }: { inpaint: InpaintPanelState }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <div style={PANEL_LABEL}>AI repair</div>
        <p style={{ fontSize: '11px', color: 'var(--color-muted)', margin: '0 0 8px' }}>
          Paint over what should change, then describe what belongs there instead.
        </p>
        <input
          type="text"
          value={inpaint.prompt}
          placeholder="e.g. remove the object, continue the background"
          onChange={(event) => inpaint.onPromptChange(event.target.value)}
          style={PANEL_CONTROL}
        />
      </div>
      <BrushSizeSlider size={inpaint.brushSize} onChange={inpaint.onBrushSizeChange} />
      <PanelButton
        onClick={inpaint.onApply}
        busy={inpaint.applying}
        disabled={!inpaint.hasStrokes || inpaint.prompt.trim().length === 0}
      >
        {inpaint.applying ? 'Repainting… (~30–60s)' : 'Apply'}
      </PanelButton>
      <PanelButton
        onClick={inpaint.onRemoveObject}
        disabled={!inpaint.hasStrokes || inpaint.applying}
        title="Erase what you painted over and let AI continue the background"
      >
        Remove object
      </PanelButton>
      <PanelButton onClick={inpaint.onClearStrokes} disabled={!inpaint.hasStrokes || inpaint.applying}>
        Clear strokes
      </PanelButton>
      <PanelButton onClick={inpaint.onToggle}>Done</PanelButton>
    </div>
  )
}
