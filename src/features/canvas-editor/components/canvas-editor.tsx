'use client'

import dynamic from 'next/dynamic'
import { createPortal } from 'react-dom'
import { Spinner } from '@/components/ui/spinner'
import type { CanvasEditorProps } from '../types'

// The ssr:false boundary: Konva touches `window`, and the chunk only loads when an editor mounts —
// page navigation never pays for it.
const CanvasEditorOverlay = dynamic(() => import('./canvas-editor-overlay'), {
  ssr: false,
  // Portalled for the same reason the editor itself is: the card that opens it is
  // backdrop-filtered, which would otherwise confine this `fixed` box to the content column and
  // make the spinner jump when the real editor takes over.
  loading: () =>
    createPortal(
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-sunken">
        <Spinner size="md" />
      </div>,
      document.body
    ),
})

/** The canvas text-overlay editor. Mounted once per post or wizard draft; it holds every slide. */
export function CanvasEditor(props: CanvasEditorProps) {
  return <CanvasEditorOverlay {...props} />
}
