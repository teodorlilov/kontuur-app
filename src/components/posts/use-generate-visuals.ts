'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { mapImageRow } from '@/lib/posts/map-image-row'
import { createSemaphore } from '@/lib/concurrency'
import { MAX_CONCURRENT_VISUAL_REQUESTS } from '@/lib/visual/limits'
import { StaleImageError } from '@/features/canvas-editor/lib/save-canvas'
import { slideCopyAt, slideTotal, type SlideCopySource } from '@/lib/posts/slide-copy'
import type { PostImage } from '@/types/api'
import type { PostImageRow } from '@/types/index'

/**
 * Start a compose pass: load the compose module and the post's canvas, once, together.
 *
 * The dynamic import is not decoration — `auto-compose` reaches Konva, which is 1.8 MB, and the
 * review queue and calendar are dashboard pages that must not carry it for users who never bake
 * text onto a picture. Loading the module and the canvas in one place is what keeps every position
 * in a pass sharing both, instead of each importing and each fetching.
 */
function startComposePass(postId: string) {
  return import('@/features/canvas-editor/lib/auto-compose').then(
    async ({ composePersistedPosition, recomposePersistedPosition, loadPostCanvas }) => ({
      // Destructured, not returned as a namespace: reached through `mod.x` these look unused to
      // knip, and `npm run deadcode` reported a live function as dead.
      composePersistedPosition,
      recomposePersistedPosition,
      canvas: await loadPostCanvas(postId),
    })
  )
}

type ComposePass = ReturnType<typeof startComposePass>

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
  /**
   * The post's working copy. Taken whole rather than as a `(position) => copy` closure because the
   * compose now needs the slide COUNT as well as the copy — a closure can only answer one of those,
   * and deriving them from the same two fields keeps them from disagreeing about the carousel's
   * length.
   */
  copySource?: SlideCopySource | null
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

  /**
   * Compose one slide against a canvas the whole run shares.
   *
   * `pass` arrives as a PROMISE, not a value: the composes are staggered — each fires as its own
   * image lands, tens of seconds apart — so awaiting the read at the top of `generate` would stall
   * the first image behind it. Every position awaits the same promise, so it happens once and
   * blocks nobody.
   */
  const composeTail = useCallback(
    (position: number, image: PostImage, pass: ComposePass) => {
      if (!copySource) return
      setComposingPositions((current) => [...current, position])
      void (async () => {
        const release = await composeSemaphore.current.acquire()
        try {
          const { composePersistedPosition, canvas } = await pass
          if (!canvas) return
          const composed = await composePersistedPosition({
            postId,
            position,
            total: slideTotal(copySource),
            image,
            slideCopy: slideCopyAt(copySource, position),
            identity: canvas.identity,
            doc: canvas.docs.get(position) ?? null,
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
    [postId, onImage, copySource]
  )

  // The post-hoc compose pass — re-baking every position after a copy edit: serial, slot feedback
  // via composingPositions, one summary toast covering all failures.
  const runComposePass = useCallback(
    async (
      images: PostImage[],
      task: (image: PostImage) => Promise<PostImage | null>,
      failureMessage: string
    ) => {
      const targets = images.filter(
        (image) =>
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
              console.error(
                `[use-generate-visuals] compose pass at position ${image.position} failed:`,
                err
              )
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
    (source: SlideCopySource, images: PostImage[]) => {
      // One module load and one read for the whole pass — see `startComposePass`.
      const pass = startComposePass(postId)
      return runComposePass(
        images,
        async (image) => {
          const slideCopy = slideCopyAt(source, image.position)
          if (!slideCopy) return null
          const { recomposePersistedPosition, canvas } = await pass
          if (!canvas) return null
          return recomposePersistedPosition({
            postId,
            position: image.position,
            baseImagePath: image.storagePath,
            slideCopy,
            identity: canvas.identity,
            doc: canvas.docs.get(image.position) ?? null,
          })
        },
        'Text on the visuals may be outdated — open a slide in the editor to refresh it.'
      )
    },
    [postId, runComposePass]
  )

  /**
   * Bake copy onto AI art that arrived clean — the cron's images, on first open.
   *
   * The review queue had its own copy of this: its own dynamic import, its own `loadPostCanvas`,
   * its own serial loop. Serial WITHIN itself, but sharing no semaphore with this hook — so a
   * compose-on-open and a regenerate-compose could run two offscreen Konva canvases against the
   * same post, which is the thing `composeSemaphore` exists to prevent. It also showed no slot
   * feedback while it worked, and logged a 409 as an error rather than reading it as "a newer flow
   * owns that slot".
   *
   * Caller decides WHICH images qualify — the queue only paints over `visual-*` files with no doc,
   * because a user-uploaded creative is finished work.
   */
  const composeMissing = useCallback(
    (source: SlideCopySource, images: PostImage[]) => {
      const pass = startComposePass(postId)
      return runComposePass(
        images,
        async (image) => {
          const { composePersistedPosition, canvas } = await pass
          if (!canvas) return null
          return composePersistedPosition({
            postId,
            position: image.position,
            total: slideTotal(source),
            image,
            slideCopy: slideCopyAt(source, image.position),
            identity: canvas.identity,
            doc: canvas.docs.get(image.position) ?? null,
          })
        },
        'Text could not be added to some visuals — open a slide in the editor to refresh it.'
      )
    },
    [postId, runComposePass]
  )

  const generate = useCallback(
    async (positions: number[]) => {
      const fresh = positions.filter((p) => !generatingPositions.includes(p))
      if (fresh.length === 0) return
      setGeneratingPositions((current) => [...current, ...fresh])

      // Started here, not awaited here: it runs alongside the image generations, and each compose
      // awaits it as its own image lands. One read for the run instead of one per slide.
      const pass = startComposePass(postId)

      let failures = 0
      await Promise.all(
        fresh.map(async (position) => {
          const release = await semaphore.current.acquire()
          try {
            const image = await requestVisual(postId, position)
            onImage(image)
            composeTail(position, image, pass)
          } catch (err) {
            failures += 1
            console.error(`[use-generate-visuals] position ${position} failed:`, err)
          } finally {
            release()
            setGeneratingPositions((current) => current.filter((p) => p !== position))
          }
        })
      )
      if (failures > 0)
        toast.error(`${failures} visual${failures > 1 ? 's' : ''} failed to generate`)
    },
    [postId, onImage, generatingPositions, composeTail]
  )

  return { generatingPositions, composingPositions, generate, recompose, composeMissing }
}
