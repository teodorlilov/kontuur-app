'use client'

import { VisualIdentityPanel } from '@/features/visual-identity/components/visual-identity-panel'
import type { VisualIdentity } from '@/types/visual'

interface VisualIdentityTabProps {
  identity: VisualIdentity
  onChange: (identity: VisualIdentity) => void
}

/**
 * Brand style and palette for AI visuals.
 *
 * A thin wrapper on purpose: `FormPanel` supplies the title and save bar, and re-analysis lives in
 * the rail. `onReanalyze` is deliberately not forwarded, so the panel renders no button of its own.
 */
export function VisualIdentityTab({ identity, onChange }: VisualIdentityTabProps) {
  return <VisualIdentityPanel identity={identity} onChange={onChange} />
}
