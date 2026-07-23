'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { createSemaphore } from '@/lib/concurrency'
import { parseSlides } from '@/components/posts/parse-slides'
import { MAX_CONCURRENT_VISUAL_REQUESTS } from '@/lib/visual/limits'
import type { SeedIdentity } from '@/lib/canvas/seed-doc'
import { fetchClientIdentity } from '@/features/canvas-editor/lib/identity-client'
import { slideCopyAt } from '@/features/canvas-editor/lib/slide-copy'
import { draftStoragePaths, type DraftVisual } from '@/features/generate/lib/draft-visuals'

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
 * concurrency, per-draft aborts, and storage cleanup on discard. After each image generates, it is
 * auto-composed with seeded text (serially — one offscreen canvas at a time); a compose failure
 * degrades to the clean image. State is keyed by draft id.
 */
export function useDraftVisuals() {
  const [visualsByDraft, setVisualsByDraft] = useState<Record<string, DraftVisual[]>>({})
  const semaphore = useRef(createSemaphore(MAX_CONCURRENT_VISUAL_REQUESTS))
  const controllers = useRef(new Map<string, AbortController>())
  const failureToasted = useRef(new Set<string>())
  const identityCache = useRef(new Map<string, Promise<SeedIdentity>>())
  // Compose serially — one offscreen canvas at a time keeps memory flat.
  const composeSemaphore = useRef(createSemaphore(1))

  const setVisual = useCallback((draftId: string, visual: DraftVisual) => {
    setVisualsByDraft((current) => {
      if (!(draftId in current)) return current
      const rest = (current[draftId] ?? []).filter((v) => v.position !== visual.position)
      return { ...current, [draftId]: [...rest, visual].sort((a, b) => a.position - b.position) }
    })
  }, [])

  // Cache set synchronously so concurrent slides share one in-flight fetch per client.
  const clientIdentity = useCallback((clientId: string): Promise<SeedIdentity> => {
    let cached = identityCache.current.get(clientId)
    if (!cached) {
      cached = fetchClientIdentity(clientId).catch((err: unknown) => {
        identityCache.current.delete(clientId)
        throw err
      })
      identityCache.current.set(clientId, cached)
    }
    return cached
  }, [])

  /** One offscreen compose at a time — canvas memory stays flat regardless of concurrency. */
  const enqueueCompose = useCallback(async <T,>(job: () => Promise<T>): Promise<T> => {
    const release = await composeSemaphore.current.acquire()
    try {
      return await job()
    } finally {
      release()
    }
  }, [])

  const composeVisual = useCallback(
    async (
      post: DraftPostInput,
      position: number,
      clean: { publicUrl: string; storagePath: string },
      signal: AbortSignal
    ): Promise<DraftVisual | null> => {
      try {
        const slideCopy = slideCopyAt(post, position)
        if (!slideCopy) return null
        const identity = await clientIdentity(post.client_id)
        if (signal.aborted) return null
        const result = await enqueueCompose(async () => {
          if (signal.aborted) return null
          const { composeDraftVisual } = await import('@/features/canvas-editor/lib/auto-compose')
          return composeDraftVisual({
            clientId: post.client_id,
            draftId: post.id,
            position,
            identity,
            slideCopy,
            clean,
          })
        })
        if (!result || signal.aborted) return null
        return { ...result.visual, status: 'done' as const, canvasDoc: result.doc }
      } catch (err) {
        console.error(`[draft-visuals] compose for draft ${post.id} position ${position} failed:`, err)
        return null
      }
    },
    [clientIdentity, enqueueCompose]
  )

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
        const clean = { publicUrl: data.publicUrl as string, storagePath: data.storagePath as string }
        // Clean refs on the still-generating entry: an approve mid-compose attaches the clean image.
        setVisual(post.id, { position, status: 'generating', ...clean })
        const composed = await composeVisual(post, position, clean, signal)
        if (signal.aborted) return
        setVisual(post.id, composed ?? { position, status: 'done', ...clean })
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
    [setVisual, composeVisual]
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

  /** Editor save for a draft slide: swap in the edited flattened file + its doc. */
  const applyEditedVisual = useCallback(
    (draftId: string, visual: DraftVisual) => setVisual(draftId, visual),
    [setVisual]
  )

  /** Re-compose a rewritten draft's composed slides with the new copy (art untouched, D3e). */
  const recomposeDraft = useCallback(
    (post: DraftPostInput) => {
      const visuals = visualsByDraft[post.id] ?? []
      const { signal } = draftController(post.id)
      for (const visual of visuals) {
        if (visual.status !== 'done' || !visual.canvasDoc || !visual.storagePath) continue
        const { canvasDoc, storagePath } = visual
        const slideCopy = slideCopyAt(post, visual.position)
        if (!slideCopy) continue
        setVisual(post.id, { ...visual, status: 'generating' })
        void enqueueCompose(async () => {
          if (signal.aborted) return
          try {
            const { recomposeDraftVisual } = await import('@/features/canvas-editor/lib/auto-compose')
            const identity = await clientIdentity(post.client_id)
            const result = await recomposeDraftVisual({
              clientId: post.client_id,
              draftId: post.id,
              position: visual.position,
              identity,
              slideCopy,
              doc: canvasDoc,
              previousFlattenedPath: storagePath,
            })
            if (!signal.aborted) {
              setVisual(post.id, { ...result.visual, status: 'done', canvasDoc: result.doc })
            }
          } catch (err) {
            console.error(`[draft-visuals] recompose for draft ${post.id} position ${visual.position} failed:`, err)
            if (!signal.aborted) setVisual(post.id, visual)
          }
        })
      }
    },
    [visualsByDraft, draftController, setVisual, enqueueCompose, clientIdentity]
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

  /** Discard path: abort pending jobs and delete the draft's stored files (flattened + clean). */
  const discardDraft = useCallback(
    (draftId: string, clientId: string) => {
      const storagePaths = draftStoragePaths(visualsByDraft[draftId])
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

  return {
    visualsByDraft,
    enqueuePost,
    regenerate,
    applyEditedVisual,
    recomposeDraft,
    abandonDraft,
    discardDraft,
    resetAll,
  }
}
