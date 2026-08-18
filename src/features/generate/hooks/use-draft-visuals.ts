'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { createSemaphore } from '@/lib/concurrency'
import { parseSlides } from '@/components/posts/parse-slides'
import { MAX_CONCURRENT_VISUAL_REQUESTS } from '@/lib/visual/limits'
import type { SeedIdentity } from '@/lib/canvas/seed-doc'
import type { CanvasDoc } from '@/types/canvas'
import { fetchClientIdentity } from '@/features/canvas-editor/lib/identity-client'
import { slideCopyAt } from '@/features/canvas-editor/lib/slide-copy'
import type { DraftVisualResult } from '@/features/canvas-editor/types'
import { draftStoragePaths, type DraftVisual } from '@/lib/visual/draft-visuals'

/** The draft fields visual generation needs — satisfied by both `PostData` and `DraftPost`. */
export interface DraftPostInput {
  id: string
  client_id: string
  post_type: string
  caption: string | null
  slides_json: unknown
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
  const enqueueCompose = useCallback(async <T>(job: () => Promise<T>): Promise<T> => {
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
      signal: AbortSignal,
      previousDoc?: CanvasDoc
    ): Promise<DraftVisual | null> => {
      try {
        const slideCopy = slideCopyAt(post, position)
        if (!slideCopy) return null
        const identity = await clientIdentity(post.client_id)
        if (signal.aborted) return null
        const result = await enqueueCompose(async () => {
          if (signal.aborted) return null
          const compose = await import('@/features/canvas-editor/lib/auto-compose')
          if (previousDoc) {
            // A background swap keeps the editor's work: the existing doc —
            // hand-edited layers included — rebinds onto the new clean art.
            // The stored pan/zoom belonged to the old image, so it resets.
            return compose.recomposeDraftVisual({
              clientId: post.client_id,
              draftId: post.id,
              position,
              identity,
              slideCopy,
              doc: { ...previousDoc, background: clean, backgroundTransform: undefined },
            })
          }
          return compose.composeDraftVisual({
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
        console.error(
          `[draft-visuals] compose for draft ${post.id} position ${position} failed:`,
          err
        )
        return null
      }
    },
    [clientIdentity, enqueueCompose]
  )

  const runJob = useCallback(
    async (
      post: DraftPostInput,
      position: number,
      signal: AbortSignal,
      previousDoc?: CanvasDoc
    ) => {
      const release = await semaphore.current.acquire()
      try {
        if (signal.aborted) return
        const res = await fetch('/api/ai/generate-visual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          // The whole slides array, not this slide's fields: the route derives its text block with
          // the same `slideTextBlock` the persisted-post path uses.
          body: JSON.stringify({
            clientId: post.client_id,
            draftId: post.id,
            position,
            postType: post.post_type,
            slides: parseSlides(post.slides_json),
            caption: post.caption,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Visual generation failed')
        const clean = {
          publicUrl: data.publicUrl as string,
          storagePath: data.storagePath as string,
        }
        // Clean refs on the still-generating entry: an approve mid-compose attaches the clean image.
        setVisual(post.id, { position, status: 'generating', ...clean })
        const composed = await composeVisual(post, position, clean, signal, previousDoc)
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

  /**
   * Re-generate one slide's visual (retry after error or explicit regenerate).
   *
   * The existing doc is read BEFORE the status reset — `setVisual` replaces the whole entry, so a
   * moment later there is no `canvasDoc` left to find. Carrying it over makes a regenerate a
   * background swap that keeps the editor's work, matching what `replaceVisual` does for an upload
   * and what `composePersistedPosition` already does for a persisted post. A retry after an error
   * has no doc to carry, so it seeds from copy exactly as before.
   */
  const regenerate = useCallback(
    (post: DraftPostInput, position: number) => {
      const previousDoc = (visualsByDraft[post.id] ?? []).find(
        (v) => v.position === position
      )?.canvasDoc
      setVisual(post.id, { position, status: 'generating' })
      void runJob(post, position, draftController(post.id).signal, previousDoc)
    },
    [draftController, runJob, setVisual, visualsByDraft]
  )

  /** Editor save for a draft slide: swap in the edited flattened file + its doc. */
  const applyEditedVisual = useCallback(
    (draftId: string, visual: DraftVisual) => setVisual(draftId, visual),
    [setVisual]
  )

  // Shared per-slide skeleton for the post-hoc compose passes (rewrite recompose, apply-style-to-
  // all): mark generating, run serially, swap in the result or restore the prior visual.
  const runDraftComposeTask = useCallback(
    (
      post: DraftPostInput,
      visual: DraftVisual,
      signal: AbortSignal,
      task: () => Promise<{ visual: DraftVisualResult; doc: CanvasDoc } | null>
    ) => {
      setVisual(post.id, { ...visual, status: 'generating' })
      void enqueueCompose(async () => {
        if (signal.aborted) return
        try {
          const result = await task()
          if (signal.aborted) return
          setVisual(
            post.id,
            result ? { ...result.visual, status: 'done', canvasDoc: result.doc } : visual
          )
        } catch (err) {
          console.error(
            `[draft-visuals] compose pass for draft ${post.id} position ${visual.position} failed:`,
            err
          )
          if (!signal.aborted) setVisual(post.id, visual)
        }
      })
    },
    [setVisual, enqueueCompose]
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
        runDraftComposeTask(post, visual, signal, async () => {
          const { recomposeDraftVisual } = await import('@/features/canvas-editor/lib/auto-compose')
          const identity = await clientIdentity(post.client_id)
          return recomposeDraftVisual({
            clientId: post.client_id,
            draftId: post.id,
            position: visual.position,
            identity,
            slideCopy,
            doc: canvasDoc,
            previousFlattenedPath: storagePath,
          })
        })
      }
    },
    [visualsByDraft, draftController, runDraftComposeTask, clientIdentity]
  )

  /**
   * Replace one slide's art with a user-supplied image. The upload becomes the
   * new CLEAN background and the text layer is re-composed on top: a slide
   * with a doc keeps its (possibly hand-edited) layers, a doc-less slide seeds
   * from the post copy, and a slide whose copy yields no layers keeps the
   * clean upload as-is. Callers must only offer this on `done`/`error` slides:
   * a `generating` slide has a compose job in flight whose late result would
   * overwrite the upload.
   *
   * The old state is kept until the upload succeeds, so a failed upload loses
   * nothing. Cleanup: the endpoint deletes the old FLATTENED file via
   * `previousStoragePath`; the old doc's clean background is deleted here. The
   * doc's element assets are left alone — apply-style-to-all can share one
   * asset across sibling docs, so deleting them for this slide could break
   * another slide's doc. They are cleaned up with the rest on discard.
   */
  const replaceVisual = useCallback(
    async (post: DraftPostInput, position: number, file: File): Promise<boolean> => {
      const previous = (visualsByDraft[post.id] ?? []).find((v) => v.position === position)
      try {
        const formData = new FormData()
        formData.set('file', file)
        formData.set('clientId', post.client_id)
        formData.set('draftId', post.id)
        formData.set('position', String(position))
        if (previous?.storagePath) formData.set('previousStoragePath', previous.storagePath)

        const res = await fetch('/api/ai/generate-visual/upload', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Upload failed')
        const clean = {
          publicUrl: data.publicUrl as string,
          storagePath: data.storagePath as string,
        }

        // Clean refs on the generating entry — an approve mid-compose attaches
        // the clean upload rather than nothing.
        setVisual(post.id, { position, status: 'generating', ...clean })

        const backgroundPath = previous?.canvasDoc?.background.storagePath
        if (backgroundPath) {
          void fetch('/api/ai/generate-visual', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: post.client_id, storagePaths: [backgroundPath] }),
          })
        }

        const { signal } = draftController(post.id)
        const composed = await composeVisual(post, position, clean, signal, previous?.canvasDoc)
        if (!signal.aborted) setVisual(post.id, composed ?? { position, status: 'done', ...clean })
        return true
      } catch (err) {
        console.error(
          `[draft-visuals] replace for draft ${post.id} position ${position} failed:`,
          err
        )
        toast.error(err instanceof Error ? err.message : 'Upload failed')
        return false
      }
    },
    [visualsByDraft, setVisual, composeVisual, draftController]
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
    replaceVisual,
    recomposeDraft,
    abandonDraft,
    discardDraft,
    resetAll,
  }
}
