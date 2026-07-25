'use client'

import { Spinner } from '@/components/ui/spinner'
import { PanelButton } from './panel-button'
import { PANEL_LABEL } from './panel-styles'

/** Everything the lasso panel needs from the overlay. */
export interface LassoPanelState {
  active: boolean
  cutting: boolean
  detectObject: boolean
  onDetectObjectChange: (detect: boolean) => void
  onToggle: () => void
}

/** Lasso-mode controls: the cut fires on release, so this is guidance + the detect toggle. */
export function LassoControls({ lasso }: { lasso: LassoPanelState }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <div style={PANEL_LABEL}>Lasso cut</div>
        <p style={{ fontSize: '11px', color: 'var(--color-muted)', margin: 0 }}>
          Draw a loose loop around anything — it becomes a movable element the moment you release.
        </p>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-1)', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={lasso.detectObject}
          onChange={(event) => lasso.onDetectObjectChange(event.target.checked)}
        />
        Detect object in the loop (AI, ~3s)
      </label>
      {lasso.cutting && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'var(--color-text-2)' }}>
          <Spinner size="sm" /> Cutting…
        </div>
      )}
      <PanelButton onClick={lasso.onToggle}>Done</PanelButton>
    </div>
  )
}
