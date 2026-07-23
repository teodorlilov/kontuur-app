'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { mapImageRow } from '@/features/publishing/lib/map-image-row'
import { createSemaphore } from '@/lib/concurrency'
import { MAX_CONCURRENT_VISUAL_REQUESTS } from '@/lib/visual/limits'
import type { SlideCopy } from '@/features/canvas-editor/types'
import type { PostImage } from '@/types/api'
import type { PostImageRow } from '@/types/index'

async function requestVisual(postId: string, position: number): Promise<PostImage> {
  const res = await fetch(`/api/posts/${postId}/visuals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Visual generation failed')
  return mapImageRow(data.image as PostImageRow)
}

/**
 * Client-side orchestration for AI visuals on persisted posts (review + calendar): fires one request
 * per position with bounded concurrency and reports each finished image through `onImage`. When
 * `getSlideCopy` is provided, each fresh image is then auto-composed with text (existing doc reused,
 * else seeded from copy) — a compose failure just leaves the clean image.
 */
export function useGenerateVisuals(
  postId: string,
  onImage: (image: PostImage) => void,
  getSlideCopy?: (position: number) => SlideCopy | null
) {
  const [generatingPositions, setGeneratingPositions] = useState<number[]>([])
  const [composingPositions, setComposingPositions] = useState<number[]>([])
  const semaphore = useRef(createSemaphore(MAX_CONCURRENT_VISUAL_REQUESTS))
  // Compose serially — one offscreen canvas at a time keeps memory flat.
  const composeSemaphore = useRef(createSemaphore(1))

  // One mounted card can switch posts (calendar prev/next) — tracked positions belong to the
  // previous post, so drop them. In-flight requests still complete against their captured post.
  useEffect(() => {
    setGeneratingPositions([])
    setComposingPositions([])
  }, [postId])

  const composeTail = useCallback(
    (position: number, image: PostImage) => {
      if (!getSlideCopy) return
      setComposingPositions((current) => [...current, position])
      void (async () => {
        const release = await composeSemaphore.current.acquire()
        try {
          const { composePersistedPosition } = await import('@/features/canvas-editor/lib/auto-compose')
          const composed = await composePersistedPosition({
            postId,
            position,
            image,
            slideCopy: getSlideCopy(position),
          })
          if (composed) onImage(composed)
        } catch (err) {
          console.error(`[use-generate-visuals] compose at position ${position} failed:`, err)
        } finally {
          release()
          setComposingPositions((current) => current.filter((p) => p !== position))
        }
      })()
    },
    [postId, onImage, getSlideCopy]
  )

  const generate = useCallback(
    async (positions: number[]) => {
      const fresh = positions.filter((p) => !generatingPositions.includes(p))
      if (fresh.length === 0) return
      setGeneratingPositions((current) => [...current, ...fresh])

      let failures = 0
      await Promise.all(
        fresh.map(async (position) => {
          const release = await semaphore.current.acquire()
          try {
            const image = await requestVisual(postId, position)
            onImage(image)
            composeTail(position, image)
          } catch (err) {
            failures += 1
            console.error(`[use-generate-visuals] position ${position} failed:`, err)
          } finally {
            release()
            setGeneratingPositions((current) => current.filter((p) => p !== position))
          }
        })
      )
      if (failures > 0) toast.error(`${failures} visual${failures > 1 ? 's' : ''} failed to generate`)
    },
    [postId, onImage, generatingPositions, composeTail]
  )

  return { generatingPositions, composingPositions, generate }
}
