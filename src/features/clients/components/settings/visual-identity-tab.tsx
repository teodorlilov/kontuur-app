'use client'

import type { VisualIdentity } from '@/types/visual'
import { VisualIdentityPanel } from '@/features/visual-identity/components/visual-identity-panel'

/** Settings tab wrapper for the shared visual-identity editor (palette, preset, typography, re-analyze). */
export function VisualIdentityTab({
  identity,
  onChange,
  onReanalyze,
  reanalyzing,
}: {
  identity: VisualIdentity
  onChange: (identity: VisualIdentity) => void
  onReanalyze: () => void
  reanalyzing: boolean
}) {
  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
      <VisualIdentityPanel
        identity={identity}
        onChange={onChange}
        onReanalyze={onReanalyze}
        reanalyzing={reanalyzing}
      />
    </div>
  )
}
