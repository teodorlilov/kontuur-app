'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useGenerateVisuals, type VisualPost } from '@/components/posts/use-generate-visuals'
import { upsertImageAtPosition } from '@/lib/posts/image-list'
import type { DraftVisual } from '@/lib/visual/draft-visuals'
import { missingPositions, unbakedImages } from '@/lib/visual/visual-backlog'
import type { PostImage } from '@/types/api'

/** What a draft already has when the flow picks it up again — the shared editorial read's fields. */
interface ResumedVisuals {
  images?: PostImage[]
  composedPositions?: number[]
  generatingPositions?: number[]
}

/**
 * The run's visuals as the generate flow holds them: each draft's landed images, keyed by the
 * draft's row id, over the one visuals orchestrator every surface drives
 * (`components/posts/use-generate-visuals.ts`). Nothing here fetches, queues or composes — this
 * hook decides WHAT a draft still needs (the positions with no picture, the clean art with no
 * text) and keeps the pictures that come back, so a run and a resumed run read the same way.
 *
 * Approving a draft only stops tracking it: pictures still in flight finish onto the row, which is
 * what the commitment bar promises. Discarding cancels them — the row is about to go.
 */
export function useDraftVisuals() {
  const [imagesByPost, setImagesByPost] = useState<Record<string, PostImage[]>>({})
  const tracked = useRef(new Set<string>())

  /**
   * A picture for a draft that is no longer tracked landed on its row and is simply not shown —
   * the draft was approved (fine) or discarded (its cancel already stopped the rest).
   */
  const mergeImage = useCallback((postId: string, image: PostImage) => {
    setImagesByPost((current) =>
      postId in current
        ? { ...current, [postId]: upsertImageAtPosition(current[postId] ?? [], image) }
        : current
    )
  }, [])

  const visuals = useGenerateVisuals(mergeImage)

  /**
   * Start tracking a draft and finish whatever it lacks: a fresh draft owes every slot, a resumed
   * one only the positions with no picture and the text on any clean art that arrived before the
   * run was interrupted (`composedPositions` says which slots already carry a doc).
   *
   * A position whose picture is still being generated (`generatingPositions`, claimed by the run
   * this flow left behind) is owed by nobody here: it is shown as generating and left to the
   * invocation already making it, or the same slide would be paid for twice.
   */
  const enqueuePost = useCallback(
    (post: VisualPost, state: ResumedVisuals = {}) => {
      const { images = [], composedPositions = [], generatingPositions = [] } = state
      tracked.current.add(post.id)
      setImagesByPost((current) => ({ ...current, [post.id]: images }))
      visuals.noteInFlight(post, generatingPositions)
      const owed = missingPositions(post, images).filter(
        (position) => !generatingPositions.includes(position)
      )
      if (owed.length > 0) void visuals.generate(post, owed)
      const clean = unbakedImages(images, composedPositions)
      if (clean.length > 0) void visuals.composeMissing(post, clean)
    },
    [visuals]
  )

  const regenerate = useCallback(
    (post: VisualPost, position: number) => void visuals.generate(post, [position]),
    [visuals]
  )

  const replaceVisual = useCallback(
    (post: VisualPost, position: number, file: File) => visuals.replaceImage(post, position, file),
    [visuals]
  )

  /** Re-bake a rewritten draft's composed slides with the new copy — the art stays. */
  const recomposeDraft = useCallback(
    (post: VisualPost) => void visuals.recompose(post, imagesByPost[post.id] ?? []),
    [visuals, imagesByPost]
  )

  const slotsFor = useCallback(
    (post: VisualPost): DraftVisual[] => visuals.slotsFor(post, imagesByPost[post.id] ?? []),
    [visuals, imagesByPost]
  )

  const untrack = useCallback((postId: string) => {
    tracked.current.delete(postId)
    setImagesByPost((current) => {
      const { [postId]: _gone, ...others } = current
      return others
    })
  }, [])

  /** Approve path: stop showing the draft; pictures still in flight finish onto the row. */
  const abandonDraft = untrack

  /** Discard path: the row is going, so nothing that comes back for it is wanted. */
  const discardDraft = useCallback(
    (postId: string) => {
      visuals.cancel(postId)
      untrack(postId)
    },
    [visuals, untrack]
  )

  /** A fresh run starts from nothing — every tracked draft of the last one is cancelled. */
  const resetAll = useCallback(() => {
    for (const postId of tracked.current) visuals.cancel(postId)
    tracked.current.clear()
    setImagesByPost({})
  }, [visuals])

  return useMemo(
    () => ({
      slotsFor,
      enqueuePost,
      regenerate,
      replaceVisual,
      recomposeDraft,
      mergeImage,
      abandonDraft,
      discardDraft,
      resetAll,
    }),
    [
      slotsFor,
      enqueuePost,
      regenerate,
      replaceVisual,
      recomposeDraft,
      mergeImage,
      abandonDraft,
      discardDraft,
      resetAll,
    ]
  )
}
