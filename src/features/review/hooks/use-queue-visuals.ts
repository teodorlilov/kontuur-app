'use client'

import { useCallback } from 'react'
import { toast } from '@/components/ui/toast'
import { useGenerateVisuals } from '@/components/posts/use-generate-visuals'
import type { SlideCopySource } from '@/lib/posts/slide-copy'
import type { PostImage } from '@/types/api'
import { uploadSlideImage } from '@/lib/posts/upload-slide-image'

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
  const { generatingPositions, composingPositions, generate, recompose, composeMissing } =
    useGenerateVisuals(postId, onImage, copySource)

  const replaceImage = useCallback(
    async (position: number, file: File): Promise<boolean> => {
      try {
        onImage(await uploadSlideImage(postId, position, file))
        return true
      } catch (err) {
        console.error(`[review] replace image at position ${position} failed:`, err)
        toast.error(err instanceof Error ? err.message : 'Upload failed')
        return false
      }
    },
    [postId, onImage]
  )

  return {
    generatingPositions,
    composingPositions,
    generate,
    recompose,
    composeMissing,
    replaceImage,
  }
}
