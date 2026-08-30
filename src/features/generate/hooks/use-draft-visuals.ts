'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { createSemaphore } from '@/lib/concurrency'
import { parseSlides } from '@/lib/posts/parse-slides'
import { MAX_CONCURRENT_VISUAL_REQUESTS } from '@/lib/visual/limits'
import type { ColorScheme } from '@/lib/visual/color-scheme'
import type { SeedIdentity } from '@/lib/canvas/seed-doc'
import type { CanvasDoc } from '@/types/canvas'
import { fetchClientIdentity } from '@/features/canvas-editor/lib/identity-client'
import { slideCopyAt, slideTotal } from '@/features/canvas-editor/lib/slide-copy'
import type { DraftVisualResult } from '@/features/canvas-editor/types'
import {
  draftScheme,
  draftStoragePaths,
  schemeOf,
  type DraftVisual,
} from '@/lib/visual/draft-visuals'
import { totalVisualSlots } from '@/lib/visual/visual-backlog'

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
  /**
   * How many drafts this run has already enqueued — the server's colour-scheme offset.
   *
   * A ref rather than the length of `visualsByDraft`, because that count is only readable from
   * inside a state updater, and an updater does not run at the point it is called: React defers it
   * to the next render, so a value assigned in there and read on the following line is still the
   * one it started at. This ordinal was doing exactly that and was 0 for every draft in the run,
   * which left three concurrent drafts hashing independently and colliding on a colour about half
   * the time — the failure the offset exists to prevent. A ref increments where it is read.
   */
  const draftsEnqueued = useRef(0)
  /**
   * The base every draft in this run counts its offset from — the id of the first draft to arrive.
   *
   * One value for the run is what makes consecutive offsets spread; per-draft bases made the offset
   * statistically worthless. The FIRST DRAFT'S ID rather than a minted uuid, because it satisfies
   * both halves at once: constant for the run, and different from the next run's, with nothing
   * random anywhere near the pipeline.
   */
  const runBase = useRef<string | null>(null)
  // Compose serially — one offscreen canvas at a time keeps memory flat.
  const composeSemaphore = useRef(createSemaphore(1))

  /**
   * Replace one slide's entry — carrying the draft's colour pair forward when the incoming entry
   * has none.
   *
   * The pair is a fact about the DRAFT, not about the file being swapped in, and almost every writer
   * here rebuilds an entry from something that does not carry it: a `DraftVisualResult` from a
   * compose pass has no `scheme` field at all, and the editor's save handler builds a literal from
   * the file it just wrote. Each of those silently dropped it, so a draft that was rewritten or
   * edited before approval reached `POST /api/posts` with no `visual_ground`, and the post then
   * picked a fresh pair on its first regenerate — recolouring one slide away from its siblings.
   *
   * Merging here rather than at each writer because there is no writer that should ever clear it:
   * once a draft has colours it keeps them until it is discarded.
   */
  const setVisual = useCallback((draftId: string, visual: DraftVisual) => {
    setVisualsByDraft((current) => {
      if (!(draftId in current)) return current
      const slides = current[draftId] ?? []
      const carried = visual.scheme ? visual : { ...visual, ...schemeOf(slides) }
      const rest = slides.filter((v) => v.position !== carried.position)
      return { ...current, [draftId]: [...rest, carried].sort((a, b) => a.position - b.position) }
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
            total: slideTotal(post),
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
      previousDoc?: CanvasDoc,
      previousStoragePath?: string,
      /** Where this draft sits in its run — both halves together, because one without the other
       *  does not spread anything. Absent on a regenerate, which sends `knownScheme` instead. */
      run?: { index: number; base: string },
      /** The pair this draft is already wearing, sent on a regenerate so the route does not redraw it. */
      knownScheme?: ColorScheme
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
            ...(previousStoragePath ? { previousStoragePath } : {}),
            ...(run ? { runIndex: run.index, runBase: run.base } : {}),
            ...(knownScheme ? { scheme: knownScheme } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Visual generation failed')
        const clean = {
          publicUrl: data.publicUrl as string,
          storagePath: data.storagePath as string,
        }
        // The scheme rides along so approve can hand it to the post — every slide of this draft
        // reports the same pair, and the post has to inherit it or its first regenerate recolours.
        const scheme = (data.scheme as { ground: string; accent: string } | null) ?? undefined
        const groundField = scheme ? { scheme } : {}
        // Clean refs on the still-generating entry: an approve mid-compose attaches the clean image.
        setVisual(post.id, { position, status: 'generating', ...clean, ...groundField })
        const composed = await composeVisual(post, position, clean, signal, previousDoc)
        if (signal.aborted) return
        setVisual(
          post.id,
          composed
            ? { ...composed, ...groundField }
            : { position, status: 'done', ...clean, ...groundField }
        )
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
      // `totalVisualSlots`, not `slideTotal`: the guard below is the reason. An empty carousel has
      // nothing to generate, and the floored count would queue a slot with no copy behind it.
      const total = totalVisualSlots(post)
      if (total === 0) return
      const positions = Array.from({ length: total }, (_, i) => i)
      // This draft's ordinal in the run. The server spreads a batch across colour schemes with it —
      // drafts generate concurrently against one snapshot of history, so independent hashes collide
      // where consecutive offsets cannot. Read before the state update, because the update is the
      // thing that cannot report it in time.
      const runIndex = draftsEnqueued.current++
      runBase.current ??= post.id
      const base = runBase.current
      setVisualsByDraft((current) => ({
        ...current,
        [post.id]: positions.map((position) => ({ position, status: 'generating' as const })),
      }))
      const { signal } = draftController(post.id)
      for (const position of positions)
        void runJob(post, position, signal, undefined, undefined, { index: runIndex, base })
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
      const slides = visualsByDraft[post.id]
      const previous = (slides ?? []).find((v) => v.position === position)
      // Any sibling's pair answers — every slide of a draft wears the same one — so a slide that
      // failed before it reported a scheme still rerolls into its carousel's colours, not out of them.
      const scheme = draftScheme(slides)
      setVisual(post.id, { position, status: 'generating' })
      // The outgoing image's path is the reroll nonce: without it the route recomposes the identical
      // slide, and pressing regenerate on a layout you dislike returns that layout forever.
      void runJob(
        post,
        position,
        draftController(post.id).signal,
        previous?.canvasDoc,
        previous?.storagePath,
        undefined,
        scheme
      )
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
    draftsEnqueued.current = 0
    runBase.current = null
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
