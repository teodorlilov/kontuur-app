'use client'

import { useCallback, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { exportDocToJpegBlob } from '../lib/export-doc'
import { loadCrossOriginImage } from '../lib/load-image'
import { saveDraftCanvas, savePostCanvas } from '../lib/save-canvas'
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
 * Each slide flattens to a JPEG and is stored with the document that produced it: a persisted post
 * through the canvas PUT (which guards against the image having changed underneath), a wizard draft
 * through the draft upload. Sequential rather than parallel — the two save paths both write the
 * post's images, and a failure has to name the slide it belongs to.
 *
 * A save does NOT close the editor. The user came here to work on a carousel; ending the session
 * because one slide reached a good state is the surface's decision to make, not this one's.
 */
export function useEditorSave({ props, slides }: SaveInput): EditorSave {
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const { target, onSaved, onSavedDraft } = props
  const slideCount = slides.positions.length

  const performSave = useCallback(
    async () => {
      const positions = slides.dirtyPositions
      if (saving || positions.length === 0) return
      setSaving(true)
      setProgress(positions.length > 1 ? { done: 0, total: positions.length } : null)
      try {
        for (const position of positions) {
          const doc = slides.docAt(position)
          const image = slides.images.get(position)
          if (!doc || !image) continue
          try {
            // Loaded per slide rather than reused from the stage: the editor only holds the ACTIVE
            // slide's background element, and the browser serves the rest from cache anyway.
            const background = await loadCrossOriginImage(doc.background.publicUrl)
            const blob = await exportDocToJpegBlob(doc, background)
            if (target.kind === 'post') {
              const saved = await savePostCanvas(
                target.postId,
                position,
                doc,
                blob,
                image.storagePath
              )
              slides.markSaved({
                position,
                exported: doc,
                stored: { ...doc, flattenedStoragePath: saved.storagePath },
                image: { publicUrl: saved.publicUrl, storagePath: saved.storagePath },
              })
              onSaved?.(saved)
            } else {
              // Replace the previous FLATTENED file only — the clean background must survive
              // re-editing.
              const previousPath =
                image.storagePath !== doc.background.storagePath ? image.storagePath : undefined
              const { visual, doc: stored } = await saveDraftCanvas(
                target,
                position,
                doc,
                blob,
                previousPath
              )
              slides.markSaved({
                position,
                exported: doc,
                stored,
                image: { publicUrl: visual.publicUrl, storagePath: visual.storagePath },
              })
              onSavedDraft?.(visual, stored)
            }
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
    },
    [saving, slides, target, slideCount, onSaved, onSavedDraft]
  )

  return { saving, progress, performSave }
}
