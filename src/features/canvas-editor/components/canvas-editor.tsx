'use client'

import dynamic from 'next/dynamic'
import { Spinner } from '@/components/ui/spinner'
import type { CanvasEditorProps } from '../types'

// The ssr:false boundary: Konva touches `window`, and the chunk only loads when an editor mounts —
// page navigation never pays for it.
const CanvasEditorOverlay = dynamic(() => import('./canvas-editor-overlay'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'var(--color-sunken)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Spinner size="md" />
    </div>
  ),
})

/** The canvas text-overlay editor. Mount conditionally per slide position (post or wizard draft). */
export function CanvasEditor(props: CanvasEditorProps) {
  return <CanvasEditorOverlay {...props} />
}
