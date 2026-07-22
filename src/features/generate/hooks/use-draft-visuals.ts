'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { createSemaphore } from '@/lib/concurrency'
import { parseSlides } from '@/components/posts/parse-slides'
import { MAX_CONCURRENT_VISUAL_REQUESTS } from '@/lib/visual/limits'
import type { DraftVisual } from '@/features/generate/lib/draft-visuals'

/** The draft fields visual generation needs — satisfied by both `PostData` and `DraftPost`. */
export interface DraftPostInput {
  id: string
  client_id: string
  post_type: string
  caption: string | null
  slides_json: unknown
}

function buildJobPayload(post: DraftPostInput, position: number): Record<string, unknown> {
  if (post.post_type === 'carousel') {
    const slides = parseSlides(post.slides_json)
    const slide = slides[position]
    return {
      clientId: post.client_id,
      draftId: post.id,
      position,
      postType: 'carousel',
      headline: slide?.headline ?? '',
      body: slide?.body ?? '',
      slideCount: slides.length,
    }
  }
  return { clientId: post.client_id, draftId: post.id, position: 0, postType: 'single', caption: post.caption ?? '' }
}

/**
 * Auto-generation queue for wizard-draft visuals: one stateless request per slide with bounded
 * concurrency, per-draft aborts, and storage cleanup on discard. State is keyed by draft id.
 */
export function useDraftVisuals() {
  const [visualsByDraft, setVisualsByDraft] = useState<Record<string, DraftVisual[]>>({})
  const semaphore = useRef(createSemaphore(MAX_CONCURRENT_VISUAL_REQUESTS))
  const controllers = useRef(new Map<string, AbortController>())
  const failureToasted = useRef(new Set<string>())

  const setVisual = useCallback((draftId: string, visual: DraftVisual) => {
    setVisualsByDraft((current) => {
      if (!(draftId in current)) return current
      const rest = (current[draftId] ?? []).filter((v) => v.position !== visual.position)
      return { ...current, [draftId]: [...rest, visual].sort((a, b) => a.position - b.position) }
    })
  }, [])

  const runJob = useCallback(
    async (post: DraftPostInput, position: number, signal: AbortSignal) => {
      const release = await semaphore.current.acquire()
      try {
        if (signal.aborted) return
        const res = await fetch('/api/ai/generate-visual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify(buildJobPayload(post, position)),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Visual generation failed')
        setVisual(post.id, { position, status: 'done', publicUrl: data.publicUrl, storagePath: data.storagePath })
      } catch (err) {
        if (signal.aborted) return
        console.error(`[draft-visuals] draft ${post.id} position ${position} failed:`, err)
        setVisual(post.id, { position, status: 'error' })
        if (!failureToasted.current.has(post.id)) {
          failureToasted.current.add(post.id)
          toast.error('A visual failed to generate — use Retry on the slide')
        }
      } finally {
        release()
      }
    },
    [setVisual]
  )

  const draftController = useCallback((draftId: string): AbortController => {
    let controller = controllers.current.get(draftId)
    if (!controller || controller.signal.aborted) {
      controller = new AbortController()
      controllers.current.set(draftId, controller)
    }
    return controller
  }, [])

  /** Queue every slide of a freshly streamed draft (single posts queue position 0). */
  const enqueuePost = useCallback(
    (post: DraftPostInput) => {
      const total = post.post_type === 'carousel' ? parseSlides(post.slides_json).length : 1
      if (total === 0) return
      const positions = Array.from({ length: total }, (_, i) => i)
      setVisualsByDraft((current) => ({
        ...current,
        [post.id]: positions.map((position) => ({ position, status: 'generating' as const })),
      }))
      const { signal } = draftController(post.id)
      for (const position of positions) void runJob(post, position, signal)
    },
    [draftController, runJob]
  )

  /** Re-generate one slide's visual (retry after error or explicit regenerate). */
  const regenerate = useCallback(
    (post: DraftPostInput, position: number) => {
      setVisual(post.id, { position, status: 'generating' })
      void runJob(post, position, draftController(post.id).signal)
    },
    [draftController, runJob, setVisual]
  )

  /** Stop pending jobs and drop tracking, keeping stored files (approve path — images were attached). */
  const abandonDraft = useCallback((draftId: string) => {
    controllers.current.get(draftId)?.abort()
    controllers.current.delete(draftId)
    failureToasted.current.delete(draftId)
    setVisualsByDraft((current) => {
      const next = { ...current }
      delete next[draftId]
      return next
    })
  }, [])

  /** Discard path: abort pending jobs and delete the draft's stored files. */
  const discardDraft = useCallback(
    (draftId: string, clientId: string) => {
      const storagePaths = (visualsByDraft[draftId] ?? [])
        .filter((v) => v.status === 'done' && !!v.storagePath)
        .map((v) => v.storagePath!)
      abandonDraft(draftId)
      if (storagePaths.length > 0) {
        void fetch('/api/ai/generate-visual', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, storagePaths }),
        })
      }
    },
    [abandonDraft, visualsByDraft]
  )

  /** Abort everything and clear tracking — called when a fresh generation run starts. */
  const resetAll = useCallback(() => {
    for (const controller of controllers.current.values()) controller.abort()
    controllers.current.clear()
    failureToasted.current.clear()
    setVisualsByDraft({})
  }, [])

  return { visualsByDraft, enqueuePost, regenerate, abandonDraft, discardDraft, resetAll }
}
