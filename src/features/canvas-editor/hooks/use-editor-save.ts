'use client'

import { useCallback, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { exportDocToJpegBlob } from '../lib/export-doc'
import { loadCrossOriginImage } from '../lib/load-image'
import { savePostCanvas } from '../lib/save-canvas'
import type { CanvasEditorProps } from '../types'
import type { EditorSlidesState } from './use-editor-slides'

interface EditorSave {
  saving: boolean
  /** Slides finished out of slides in the run — only set while more than one is being saved. */
  progress: { done: number; total: number } | null
  performSave: () => Promise<void>
}

interface SaveInput {
  props: CanvasEditorProps
  slides: EditorSlidesState
}

/**
 * Save every slide the user has changed, one at a time.
 *
 * Each slide flattens to a JPEG and is stored with the document that produced it through the canvas
 * PUT, which guards against the image having changed underneath. Sequential rather than parallel —
 * every save writes the post's images, and a failure has to name the slide it belongs to.
 *
 * A save does NOT close the editor. The user came here to work on a carousel; ending the session
 * because one slide reached a good state is the surface's decision to make, not this one's.
 */
export function useEditorSave({ props, slides }: SaveInput): EditorSave {
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const { target, onSaved } = props
  const slideCount = slides.positions.length

  const performSave = useCallback(async () => {
    const positions = slides.dirtyPositions
    if (saving || positions.length === 0) return
    setSaving(true)
    setProgress(positions.length > 1 ? { done: 0, total: positions.length } : null)
    try {
      for (const position of positions) {
        const doc = slides.docAt(position)
        const image = slides.images.get(position)
        // Counted, not skipped past. `continue` jumped the increment at the bottom of the loop, so
        // a slide with no doc left the counter permanently short and "Saving 3/4…" was the last
        // thing the user saw of a save that had finished.
        if (!doc || !image) {
          setProgress((current) => (current ? { ...current, done: current.done + 1 } : null))
          continue
        }
        try {
          // Loaded per slide rather than reused from the stage: the editor only holds the ACTIVE
          // slide's background element, and the browser serves the rest from cache anyway.
          const background = await loadCrossOriginImage(doc.background.publicUrl)
          const blob = await exportDocToJpegBlob(doc, background)
          const saved = await savePostCanvas(target.postId, position, doc, blob, image.storagePath)
          slides.markSaved({
            position,
            exported: doc,
            stored: { ...doc, flattenedStoragePath: saved.storagePath },
            image: { publicUrl: saved.publicUrl, storagePath: saved.storagePath },
          })
          onSaved?.(saved)
        } catch (err) {
          // One slide failing (a 409 from a stale image, say) must not abandon the others. It
          // stays dirty and named, so the user knows exactly which one to look at.
          const reason = err instanceof Error ? err.message : 'Saving the design failed'
          toast.error(slideCount > 1 ? `Slide ${position + 1}: ${reason}` : reason)
        }
        setProgress((current) => (current ? { ...current, done: current.done + 1 } : null))
      }
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }, [saving, slides, target, slideCount, onSaved])

  return { saving, progress, performSave }
}
