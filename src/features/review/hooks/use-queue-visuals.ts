'use client'

import { useCallback } from 'react'
import { toast } from '@/components/ui/toast'
import { mapImageRow } from '@/features/publishing/lib/map-image-row'
import { useGenerateVisuals } from '@/features/publishing/hooks/use-generate-visuals'
import { slideCopyAt, type SlideCopySource } from '@/features/canvas-editor/lib/slide-copy'
import type { SlideCopy } from '@/features/canvas-editor/types'
import type { PostImage } from '@/types/api'
import type { PostImageRow } from '@/types/index'

interface UseQueueVisualsOptions {
  postId: string
  /** The focused post's WORKING copy — composes bake the edits, not the stored row. */
  copySource: SlideCopySource | null
  onImage: (image: PostImage) => void
}

/**
 * Post-backed visual actions for the focused queue post: regenerate through
 * the visuals endpoint (with auto-compose), replace through upload, plus the
 * shared recompose pass.
 */
export function useQueueVisuals({ postId, copySource, onImage }: UseQueueVisualsOptions) {
  const getSlideCopy = useCallback(
    (position: number): SlideCopy | null =>
      copySource ? slideCopyAt(copySource, position) : null,
    [copySource]
  )

  const { generatingPositions, composingPositions, generate, recompose } =
    useGenerateVisuals(postId, onImage, getSlideCopy)

  const replaceImage = useCallback(
    async (position: number, file: File): Promise<boolean> => {
      try {
        const formData = new FormData()
        formData.set('file', file)
        formData.set('position', String(position))
        const res = await fetch(`/api/posts/${postId}/images`, { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Upload failed')
        onImage(mapImageRow(data.image as PostImageRow))
        return true
      } catch (err) {
        console.error(`[review] replace image at position ${position} failed:`, err)
        toast.error(err instanceof Error ? err.message : 'Upload failed')
        return false
      }
    },
    [postId, onImage]
  )

  return { generatingPositions, composingPositions, generate, recompose, replaceImage }
}
