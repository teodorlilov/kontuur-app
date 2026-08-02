'use client'

import { Spinner } from '@/components/ui/spinner'
import { PanelButton } from './panel-button'
import { PanelCheckbox } from './panel-checkbox'
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
        <p style={{ fontSize: 'var(--text-micro)', color: 'var(--text2)', margin: 0 }}>
          Draw a loose loop around anything — it becomes a movable element the moment you release.
        </p>
      </div>
      <PanelCheckbox
        label="Detect object in the loop (AI, ~3s)"
        checked={lasso.detectObject}
        onChange={lasso.onDetectObjectChange}
      />
      {lasso.cutting && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--text-caption)',
            color: 'var(--text2)',
          }}
        >
          <Spinner size="sm" /> Cutting…
        </div>
      )}
      <PanelButton onClick={lasso.onToggle}>Done</PanelButton>
    </div>
  )
}
