'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { mapImageRow } from '@/features/publishing/lib/map-image-row'
import { createSemaphore } from '@/lib/concurrency'
import { MAX_CONCURRENT_VISUAL_REQUESTS } from '@/lib/visual/limits'
import { StaleImageError } from '@/features/canvas-editor/lib/save-canvas'
import { slideCopyAt, type SlideCopySource } from '@/features/canvas-editor/lib/slide-copy'
import type { SlideCopy } from '@/features/canvas-editor/types'
import type { CanvasDoc } from '@/types/canvas'
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
 * else seeded from copy) — a compose failure just leaves the clean image. `recompose` re-bakes
 * doc'd positions after a copy edit (fresh copy passed explicitly by the surface).
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

  // Shared skeleton for the post-hoc compose passes (recompose after a copy edit, apply-style-to-
  // all): serial, slot feedback via composingPositions, one summary toast covering all failures.
  const runComposePass = useCallback(
    async (
      images: PostImage[],
      exclude: number | null,
      task: (image: PostImage) => Promise<PostImage | null>,
      failureMessage: string
    ) => {
      const targets = images.filter(
        (image) =>
          image.position !== exclude &&
          !generatingPositions.includes(image.position) &&
          !composingPositions.includes(image.position)
      )
      if (targets.length === 0) return
      setComposingPositions((current) => [...current, ...targets.map((image) => image.position)])

      let failures = 0
      await Promise.all(
        targets.map(async (image) => {
          const release = await composeSemaphore.current.acquire()
          try {
            const composed = await task(image)
            if (composed) onImage(composed)
          } catch (err) {
            // 409 = the image changed underneath — a newer flow owns that slot, skip silently.
            if (!(err instanceof StaleImageError)) {
              failures += 1
              console.error(`[use-generate-visuals] compose pass at position ${image.position} failed:`, err)
            }
          } finally {
            release()
            setComposingPositions((current) => current.filter((p) => p !== image.position))
          }
        })
      )
      if (failures > 0) toast.info(failureMessage)
    },
    [onImage, generatingPositions, composingPositions]
  )

  // Copy changed on a persisted post: re-bake every position that has a doc (TECH-DEBT 2.5).
  // Fresh copy comes in explicitly — surface state, never the possibly-stale getSlideCopy.
  const recompose = useCallback(
    (source: SlideCopySource, images: PostImage[]) =>
      runComposePass(
        images,
        null,
        async (image) => {
          const slideCopy = slideCopyAt(source, image.position)
          if (!slideCopy) return null
          const { recomposePersistedPosition } = await import('@/features/canvas-editor/lib/auto-compose')
          return recomposePersistedPosition({
            postId,
            position: image.position,
            baseImagePath: image.storagePath,
            slideCopy,
          })
        },
        'Text on the visuals may be outdated — open a slide in the editor to refresh it.'
      ),
    [postId, runComposePass]
  )

  // "Save & apply to all": carry the saved slide's look onto every sibling (TECH-DEBT 2.6).
  const applyStyle = useCallback(
    (sourceDoc: CanvasDoc, sourcePosition: number, source: SlideCopySource, images: PostImage[]) =>
      runComposePass(
        images,
        sourcePosition,
        async (image) => {
          const { applyStyleToPostSibling } = await import('@/features/canvas-editor/lib/auto-compose')
          return applyStyleToPostSibling({
            postId,
            position: image.position,
            image: { publicUrl: image.publicUrl, storagePath: image.storagePath },
            slideCopy: slideCopyAt(source, image.position),
            source: sourceDoc,
          })
        },
        'Some slides could not be restyled — open them in the editor to adjust.'
      ),
    [postId, runComposePass]
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

  return { generatingPositions, composingPositions, generate, recompose, applyStyle }
}
