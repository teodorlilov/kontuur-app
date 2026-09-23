'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { fetchVisualProgress } from '@/lib/actions/visual-progress'
import { mapImageRow } from '@/lib/posts/map-image-row'
import { createSemaphore } from '@/lib/concurrency'
import { MAX_CONCURRENT_VISUAL_REQUESTS } from '@/lib/visual/limits'
import { StaleImageError } from '@/features/canvas-editor/lib/save-canvas'
import { slideCopyAt, slideTotal, type SlideCopySource } from '@/lib/posts/slide-copy'
import { uploadSlideImage } from '@/lib/posts/upload-slide-image'
import type { DraftVisual } from '@/lib/visual/draft-visuals'
import { toVisualSlots } from '@/lib/visual/visual-slots'
import { isUnbakedArt, totalVisualSlots } from '@/lib/visual/visual-backlog'
import type { PostImage } from '@/types/api'
import type { PostImageRow } from '@/types/index'

/** The post a visual belongs to: its id, and the copy its text is baked from. */
export type VisualPost = SlideCopySource & { id: string }

/** Which positions of each post are in flight — one map for the picture, one for the bake. */
type PositionsByPost = Record<string, number[]>

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

/**
 * A refused generation — the image allowance used up, a paused workspace — in the server's own
 * words. Not a failure to retry, and shown once per surface rather than once per slide.
 */
class RefusedError extends Error {}

/** 409 — the position is claimed by another session or the cron (`lib/visual/visual-jobs.ts`). */
class InFlightError extends Error {}

async function requestVisual(
  postId: string,
  position: number,
  signal: AbortSignal
): Promise<PostImage> {
  const res = await fetch(`/api/posts/${postId}/visuals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position }),
    signal,
  })
  const data = await res.json()
  if (res.status === 402)
    throw new RefusedError(data.error ?? 'AI images are not available right now')
  if (res.status === 409) throw new InFlightError()
  if (!res.ok) throw new Error(data.error ?? 'Visual generation failed')
  return mapImageRow(data.image as PostImageRow)
}

function withPositions(map: PositionsByPost, postId: string, positions: number[]): PositionsByPost {
  return { ...map, [postId]: [...(map[postId] ?? []), ...positions] }
}

function withoutPosition(map: PositionsByPost, postId: string, position: number): PositionsByPost {
  const rest = (map[postId] ?? []).filter((p) => p !== position)
  if (rest.length === 0) {
    const { [postId]: _gone, ...others } = map
    return others
  }
  return { ...map, [postId]: rest }
}

const isAbort = (err: unknown) => err instanceof Error && err.name === 'AbortError'

/**
 * How often to ask whether a picture somebody else is making has landed.
 *
 * Only while at least one position is in flight elsewhere, so a surface with nothing being made
 * issues no requests at all — the same shape as the shell's active-run poll. Five seconds against a
 * job that takes about a minute: a dozen small reads per picture, and the slide resolves within a
 * breath of the file existing.
 */
const PROGRESS_POLL_MS = 5_000

/**
 * Client-side orchestration for AI visuals on posts — the review queue, the calendar card and the
 * generate flow's run all drive this one hook: one request per position with bounded concurrency,
 * each finished image reported through `onImage` with the post it belongs to, then auto-composed
 * with text (existing doc reused, else seeded from the post's copy) — a compose failure leaves the
 * clean image. `recompose` re-bakes doc'd positions after a copy edit; `composeMissing` bakes AI
 * art that arrived clean; `replaceImage` puts a user's own file at a position, which lands and is
 * composed exactly like a generated one; `pictureLanded` is that same step for a surface that did
 * its own upload; `cancel` stops listening for a post that is being thrown away.
 * `slotsFor` projects a post's images and its in-flight and failed positions into the slots the
 * shared review leaves render — one projection for every surface. Positions being generated
 * ELSEWHERE — a run resumed in another tab, the cron — are shown the same way once the surface
 * has said so (`noteInFlight`, from the claims the server read) or once a request came back 409,
 * so a slide already being made is never asked for, or paid for, twice; a poll that runs only while
 * such a position exists brings its picture in without a reload.
 *
 * Positions are tracked PER POST, so a surface that shows one post at a time asks for its own and
 * a run of several generates them all at once. A failed position stays marked until the next
 * request for it, so the slot offers Retry; a refusal (402) is announced once, in the server's
 * words, because it is the allowance and not the slide. Callbacks are stable given a stable
 * `onImage`: the in-flight sets live in refs the callbacks read, mirrored into state for rendering
 * — so an effect may list them as dependencies without re-running on every landed picture. A
 * post's compose pass — the canvas read behind every bake — is opened once and shared by all its
 * jobs while any are in flight, so a resumed draft that owes pictures and text reads its canvas
 * once, not once per job.
 */
export function useGenerateVisuals(onImage: (postId: string, image: PostImage) => void) {
  const [generatingByPost, setGeneratingByPost] = useState<PositionsByPost>({})
  const [composingByPost, setComposingByPost] = useState<PositionsByPost>({})
  const [failedByPost, setFailedByPost] = useState<PositionsByPost>({})
  const [elsewhereByPost, setElsewhereByPost] = useState<PositionsByPost>({})
  const generatingRef = useRef<PositionsByPost>({})
  const composingRef = useRef<PositionsByPost>({})
  const elsewhereRef = useRef<PositionsByPost>({})
  const elsewherePosts = useRef(new Map<string, VisualPost>())
  const semaphore = useRef(createSemaphore(MAX_CONCURRENT_VISUAL_REQUESTS))
  // Compose serially — one offscreen canvas at a time keeps memory flat.
  const composeSemaphore = useRef(createSemaphore(1))
  const controllers = useRef(new Map<string, AbortController>())
  const passes = useRef(new Map<string, ComposePass>())

  const updateGenerating = useCallback((next: (current: PositionsByPost) => PositionsByPost) => {
    generatingRef.current = next(generatingRef.current)
    setGeneratingByPost(generatingRef.current)
  }, [])
  const updateComposing = useCallback((next: (current: PositionsByPost) => PositionsByPost) => {
    composingRef.current = next(composingRef.current)
    setComposingByPost(composingRef.current)
  }, [])
  const updateElsewhere = useCallback((next: (current: PositionsByPost) => PositionsByPost) => {
    elsewhereRef.current = next(elsewhereRef.current)
    setElsewhereByPost(elsewhereRef.current)
  }, [])

  const passFor = useCallback((postId: string): ComposePass => {
    let pass = passes.current.get(postId)
    if (!pass) {
      pass = startComposePass(postId)
      passes.current.set(postId, pass)
    }
    return pass
  }, [])

  const settleJob = useCallback(
    (map: 'generating' | 'composing', postId: string, position: number) => {
      const update = map === 'generating' ? updateGenerating : updateComposing
      update((current) => withoutPosition(current, postId, position))
      const busy =
        (generatingRef.current[postId] ?? []).length + (composingRef.current[postId] ?? []).length
      if (busy === 0) passes.current.delete(postId)
    },
    [updateGenerating, updateComposing]
  )

  const signalFor = useCallback((postId: string): AbortSignal => {
    let controller = controllers.current.get(postId)
    if (!controller || controller.signal.aborted) {
      controller = new AbortController()
      controllers.current.set(postId, controller)
    }
    return controller.signal
  }, [])

  /**
   * The calendar card's leaves say which of the two waits a slot is in, so it reads the lists.
   *
   * A position being made elsewhere counts as generating: to the person looking at the slot there
   * is no difference, and leaving it out drew an empty slot with a Generate button that the server
   * refuses — the claim is already paid for. The same three maps `slotsFor` reads, so the two
   * surfaces cannot disagree about what is in flight.
   */
  const positionsFor = useCallback(
    (postId: string) => ({
      generating: [...(generatingByPost[postId] ?? []), ...(elsewhereByPost[postId] ?? [])],
      composing: composingByPost[postId] ?? [],
    }),
    [generatingByPost, composingByPost, elsewhereByPost]
  )

  /**
   * Positions this session is not generating but something else is — read from the claims the
   * server holds, or learnt from a 409. They render as generating and are never requested: the
   * picture is already being paid for.
   *
   * The post is kept, not just its id, because the poll below finishes these the way this session
   * finishes its own: a picture that lands still owes the slide's text, and baking it needs the
   * copy. The post is dropped again once none of its positions are in flight.
   */
  const noteInFlight = useCallback(
    (post: VisualPost, positions: number[]) => {
      if (positions.length === 0) return
      elsewherePosts.current.set(post.id, post)
      updateElsewhere((current) => withPositions(current, post.id, positions))
    },
    [updateElsewhere]
  )

  /** Stop watching these positions, and forget the post once it has none left in flight. */
  const forgetElsewhere = useCallback(
    (postId: string, positions: number[]) => {
      if (positions.length === 0) return
      updateElsewhere((current) =>
        positions.reduce((map, position) => withoutPosition(map, postId, position), current)
      )
      if ((elsewhereRef.current[postId] ?? []).length === 0) elsewherePosts.current.delete(postId)
    },
    [updateElsewhere]
  )

  const slotsFor = useCallback(
    (post: VisualPost, images: PostImage[]): DraftVisual[] =>
      toVisualSlots(
        images,
        [...(generatingByPost[post.id] ?? []), ...(elsewhereByPost[post.id] ?? [])],
        composingByPost[post.id] ?? [],
        failedByPost[post.id] ?? [],
        totalVisualSlots(post)
      ),
    [generatingByPost, composingByPost, failedByPost, elsewhereByPost]
  )

  /**
   * A picture has arrived at this position: report it, then bake the slide's text onto it.
   *
   * The one place a landed picture is composed, whoever made it — the model, or the person who
   * uploaded their own file. Those were two behaviours until 2026-09-23, which is how one carousel
   * could carry three composed slides and one bare photo. A slide with layers keeps them, rebound
   * onto the new picture; a slide whose copy yields no layers keeps the picture untouched.
   *
   * The canvas read is shared and awaited here rather than at the caller: the composes are
   * staggered — each fires as its own image lands, tens of seconds apart — so awaiting it up front
   * would stall the first picture behind it. `passFor` memoises, so it happens once per post.
   */
  const pictureLanded = useCallback(
    (post: VisualPost, position: number, image: PostImage) => {
      onImage(post.id, image)
      updateComposing((current) => withPositions(current, post.id, [position]))
      void (async () => {
        const release = await composeSemaphore.current.acquire()
        try {
          const { composePersistedPosition, canvas } = await passFor(post.id)
          if (!canvas) return
          const composed = await composePersistedPosition({
            postId: post.id,
            position,
            total: slideTotal(post),
            image,
            slideCopy: slideCopyAt(post, position),
            identity: canvas.identity,
            doc: canvas.docs.get(position) ?? null,
          })
          if (composed) onImage(post.id, composed)
        } catch (err) {
          console.error(`[use-generate-visuals] compose at position ${position} failed:`, err)
        } finally {
          release()
          settleJob('composing', post.id, position)
        }
      })()
    },
    [onImage, updateComposing, settleJob, passFor]
  )

  /**
   * Ask, while anything is being made elsewhere, whether it has arrived.
   *
   * A picture leaves no trace until it lands as a row, and the invocation making it is not this
   * one — so without this the slide says "Generating image…" until the surface is loaded again,
   * however long the person sits there. A position whose claim has gone is finished with: its
   * picture lands exactly as one this session made — through `pictureLanded`, so the slide's text
   * is baked onto it rather than the person being handed bare art — and it stops being counted as
   * in flight either way, which is what empties the map and stops the loop.
   *
   * A post the read does not answer for has been deleted, here or in another tab. Its positions
   * are dropped too: nothing will ever settle them, and the loop would outlive the post.
   */
  const inFlightKey = Object.keys(elsewhereByPost).sort().join(',')
  useEffect(() => {
    if (!inFlightKey) return
    const postIds = inFlightKey.split(',')
    let stopped = false

    async function check() {
      const result = await fetchVisualProgress(postIds)
      if (stopped || !result.ok) return
      const answered = new Set(result.data.map((progress) => progress.postId))
      for (const progress of result.data) {
        const claimed = new Set(progress.generatingPositions)
        const settled = (elsewhereRef.current[progress.postId] ?? []).filter(
          (position) => !claimed.has(position)
        )
        if (settled.length === 0) continue
        const post = elsewherePosts.current.get(progress.postId)
        for (const position of settled) {
          const image = progress.images.find((candidate) => candidate.position === position)
          if (!image) continue
          if (post && isUnbakedArt(image)) pictureLanded(post, position, image)
          else onImage(progress.postId, image)
        }
        forgetElsewhere(progress.postId, settled)
      }
      for (const postId of postIds) {
        if (!answered.has(postId)) forgetElsewhere(postId, elsewhereRef.current[postId] ?? [])
      }
    }

    const timer = window.setInterval(() => void check(), PROGRESS_POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [inFlightKey, onImage, pictureLanded, forgetElsewhere])

  // The post-hoc compose pass — re-baking every position after a copy edit: serial, slot feedback
  // via the composing map, one summary toast covering all failures.
  const runComposePass = useCallback(
    async (
      postId: string,
      images: PostImage[],
      task: (image: PostImage) => Promise<PostImage | null>,
      failureMessage: string
    ) => {
      const busy = new Set([
        ...(generatingRef.current[postId] ?? []),
        ...(composingRef.current[postId] ?? []),
      ])
      const targets = images.filter((image) => !busy.has(image.position))
      if (targets.length === 0) return
      updateComposing((current) =>
        withPositions(
          current,
          postId,
          targets.map((image) => image.position)
        )
      )

      let failures = 0
      await Promise.all(
        targets.map(async (image) => {
          const release = await composeSemaphore.current.acquire()
          try {
            const composed = await task(image)
            if (composed) onImage(postId, composed)
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
            settleJob('composing', postId, image.position)
          }
        })
      )
      if (failures > 0) toast.info(failureMessage)
    },
    [onImage, updateComposing, settleJob]
  )

  // Copy changed on a post: re-bake every position that has a doc (TECH-DEBT 2.5). Fresh copy
  // comes in on `post` explicitly — surface state, never a possibly-stale row.
  const recompose = useCallback(
    (post: VisualPost, images: PostImage[]) => {
      const pass = passFor(post.id)
      return runComposePass(
        post.id,
        images,
        async (image) => {
          const slideCopy = slideCopyAt(post, image.position)
          if (!slideCopy) return null
          const { recomposePersistedPosition, canvas } = await pass
          if (!canvas) return null
          return recomposePersistedPosition({
            postId: post.id,
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
    [runComposePass, passFor]
  )

  /**
   * Bake copy onto AI art that arrived clean — the cron's images on first open, a run's
   * interrupted slides on resume.
   *
   * Caller decides WHICH images qualify — the surfaces pass `unbakedImages`
   * (lib/visual/visual-backlog.ts), which is art still named as the model left it. A picture that
   * already carries text, whoever put it there, is never painted over a second time.
   */
  const composeMissing = useCallback(
    (post: VisualPost, images: PostImage[]) => {
      const pass = passFor(post.id)
      return runComposePass(
        post.id,
        images,
        async (image) => {
          const { composePersistedPosition, canvas } = await pass
          if (!canvas) return null
          return composePersistedPosition({
            postId: post.id,
            position: image.position,
            total: slideTotal(post),
            image,
            slideCopy: slideCopyAt(post, image.position),
            identity: canvas.identity,
            doc: canvas.docs.get(image.position) ?? null,
          })
        },
        'Text could not be added to some visuals — open a slide in the editor to refresh it.'
      )
    },
    [runComposePass, passFor]
  )

  const generate = useCallback(
    async (post: VisualPost, positions: number[]) => {
      const busy = generatingRef.current[post.id] ?? []
      const fresh = positions.filter((p) => !busy.includes(p))
      if (fresh.length === 0) return
      updateGenerating((current) => withPositions(current, post.id, fresh))
      setFailedByPost((current) =>
        fresh.reduce((map, position) => withoutPosition(map, post.id, position), current)
      )
      const signal = signalFor(post.id)
      // Warmed now rather than when the first picture lands, so the compose behind it does not wait
      // on a round trip; every position of this post shares the one read.
      void passFor(post.id)

      let failures = 0
      let refusal: string | null = null
      await Promise.all(
        fresh.map(async (position) => {
          const release = await semaphore.current.acquire()
          try {
            if (signal.aborted) return
            pictureLanded(post, position, await requestVisual(post.id, position, signal))
          } catch (err) {
            if (isAbort(err)) return
            if (err instanceof InFlightError) {
              noteInFlight(post, [position])
              return
            }
            setFailedByPost((current) => withPositions(current, post.id, [position]))
            if (err instanceof RefusedError) {
              refusal = err.message
              return
            }
            failures += 1
            console.error(`[use-generate-visuals] position ${position} failed:`, err)
          } finally {
            release()
            settleJob('generating', post.id, position)
          }
        })
      )
      if (refusal) toast.error(refusal, { id: 'visuals-refused' })
      if (failures > 0)
        toast.error(`${failures} visual${failures > 1 ? 's' : ''} failed to generate`)
    },
    [pictureLanded, signalFor, updateGenerating, passFor, settleJob, noteInFlight]
  )

  /** A picture the person supplied, landing exactly like one the model made — text and all. */
  const replaceImage = useCallback(
    async (post: VisualPost, position: number, file: File): Promise<boolean> => {
      try {
        pictureLanded(post, position, await uploadSlideImage(post.id, position, file))
        return true
      } catch (err) {
        console.error(`[use-generate-visuals] replace image at position ${position} failed:`, err)
        toast.error(err instanceof Error ? err.message : 'Upload failed')
        return false
      }
    },
    [pictureLanded]
  )

  /**
   * Stop listening for a post that is being thrown away. The server finishes any picture it has
   * already started and then deletes the file, because the row it would have hung on is gone
   * (`generateClaimedVisual`, lib/visual/generate-post-visual.ts) — nothing reaches `onImage` and
   * no failure is announced.
   */
  const cancel = useCallback(
    (postId: string) => {
      controllers.current.get(postId)?.abort()
      controllers.current.delete(postId)
      passes.current.delete(postId)
      elsewherePosts.current.delete(postId)
      const drop = (current: PositionsByPost) => {
        const { [postId]: _gone, ...others } = current
        return others
      }
      updateGenerating(drop)
      updateComposing(drop)
      setFailedByPost(drop)
      updateElsewhere(drop)
    },
    [updateGenerating, updateComposing, updateElsewhere]
  )

  return useMemo(
    () => ({
      positionsFor,
      slotsFor,
      noteInFlight,
      pictureLanded,
      generate,
      recompose,
      composeMissing,
      replaceImage,
      cancel,
    }),
    [
      positionsFor,
      slotsFor,
      noteInFlight,
      pictureLanded,
      generate,
      recompose,
      composeMissing,
      replaceImage,
      cancel,
    ]
  )
}
