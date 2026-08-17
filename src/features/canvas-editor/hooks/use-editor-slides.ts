'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasDoc } from '@/types/canvas'
import type { SeedIdentity } from '@/lib/canvas/seed-doc'
import { fetchCanvasDocs } from '../lib/canvas-state-client'
import { fetchClientIdentity } from '../lib/identity-client'
import { resolveSlideDocs, type ResolvedSlide } from '../lib/resolve-slides'
import {
  commitHistory,
  initHistory,
  redoHistory,
  undoHistory,
  type DocHistory,
} from '../lib/doc-history'
import { useDocActions, type EditorDocState, type TransformDoc } from './use-doc-actions'
import type { EditorSlide, EditorTarget } from '../types'

interface SlideImage {
  publicUrl: string
  storagePath: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; identity: SeedIdentity; resolved: Map<number, ResolvedSlide> }

/** What one finished save reports back: what it exported, what to hold, and the file it produced. */
export interface SavedSlide {
  position: number
  /** The doc the export was made from — the save only lands if the slide still holds exactly it. */
  exported: CanvasDoc
  /** The doc to hold from now on: `exported` plus the path of the jpeg it just became. */
  stored: CanvasDoc
  image: SlideImage
}

export interface EditorSlidesState extends EditorDocState {
  status: LoadState['status']
  message: string | null
  identity: SeedIdentity | null
  /** The slides this session is editing, ascending. Fixed at mount — see `images` for why. */
  positions: number[]
  activePosition: number
  goToSlide: (position: number) => void
  initDocs: (prepare: (doc: CanvasDoc, seeded: boolean) => CanvasDoc) => void
  /**
   * Commit the same mutation to several NAMED slides, one undo step each.
   *
   * Deliberately plural, and deliberately not a singular `transformAt(position, …)`. A singular
   * verb invites a caller to name a position at call time — the exact hazard `transformDoc`'s
   * comment below exists to prevent, since an op that resolves after the user has moved on would
   * then land on the wrong slide. Nothing has one target but the active slide; the only thing with
   * several is a panel where the user has just ticked them by hand.
   */
  transformSlides: (
    positions: number[],
    mutate: (doc: CanvasDoc, position: number) => CanvasDoc
  ) => void
  /**
   * Put slides back to docs captured before a multi-slide apply — the undo half of `transformSlides`.
   *
   * Takes the DOCS, not the positions, and commits forward rather than stepping histories back. A
   * step-back is only the apply if nothing has happened since, and something usually has: both
   * panels stay open afterwards and invite the user to look around the carousel. On a slide edited
   * in between it undid that edit and left the apply standing — neither what the button says nor
   * anything the user asked for. Restoring what was captured is right whatever came after, and being
   * an ordinary commit it is itself undoable with ⌘Z.
   */
  restoreSlides: (docs: Map<number, CanvasDoc>) => void
  /** Every slide's current doc, by position. Reactive, unlike `docAt`. */
  docsByPosition: Map<number, CanvasDoc>
  docAt: (position: number) => CanvasDoc | null
  /** The file stored at each position: the save's stale-guard, and the slide strip's thumbnails. */
  images: Map<number, SlideImage>
  /** The active slide's clean background, resolved before the histories exist so it loads early. */
  backgroundUrl: string | null
  dirtyPositions: number[]
  dirty: boolean
  markSaved: (saved: SavedSlide) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

/**
 * Every slide of the post being edited, each with its own undo history.
 *
 * One history per slide rather than one for the editor: switching slides is not an edit, so it must
 * not be undoable, and a stack shared across slides would make ⌘Z on slide 3 reach back into
 * slide 1. The histories are plain values from `doc-history.ts`, which is why that core is pure.
 *
 * Everything loads in one pass at mount. The editor no longer remounts per slide, so this is the
 * only chance to read — and a per-slide fetch on switch would be a waterfall the user sits through.
 */
export function useEditorSlides(
  target: EditorTarget,
  slides: EditorSlide[],
  initialPosition: number
): EditorSlidesState {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [histories, setHistories] = useState<Map<number, DocHistory>>(new Map())
  /** The doc each slide was last loaded or saved at — what `dirty` is measured against. */
  const [saved, setSaved] = useState<Map<number, CanvasDoc>>(new Map())
  const [images, setImages] = useState<Map<number, SlideImage>>(
    () => new Map(slides.map((slide) => [slide.position, slide.image]))
  )
  // Fixed at mount, like the histories and images they index. A slide that appeared in the prop
  // afterwards has no history and no loaded doc, so offering it in the strip would open a slide
  // the editor cannot draw.
  const [positions] = useState(() => slides.map((slide) => slide.position).sort((a, b) => a - b))
  const [activePosition, setActivePosition] = useState(initialPosition)

  useEffect(() => {
    let cancelled = false
    loadSlides(target)
      .then(({ identity, storedDoc }) => {
        if (cancelled) return
        setLoad({
          status: 'ready',
          identity,
          resolved: resolveSlideDocs(slides, storedDoc, identity),
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoad({
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load the editor',
        })
      })
    return () => {
      cancelled = true
    }
    // Deliberately mount-only. The surface re-renders this component with a fresh `slides` array
    // after every save; re-reading then would discard the user's open histories and undo stacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The save loop reads a slide's doc between awaits, by which point the state it closed over is
  // stale. Every such read happens after an await, so this effect has always flushed by then.
  const latestHistories = useRef(histories)
  useEffect(() => {
    latestHistories.current = histories
  }, [histories])

  const initDocs = useCallback(
    (prepare: (doc: CanvasDoc, seeded: boolean) => CanvasDoc) => {
      if (load.status !== 'ready') return
      const prepared = new Map(
        [...load.resolved].map(([position, slide]) => [position, prepare(slide.doc, slide.seeded)])
      )
      setHistories(new Map([...prepared].map(([position, doc]) => [position, initHistory(doc)])))
      // Only slides whose doc IS what is stored count as saved. A seeded or rebound slide opens
      // dirty on purpose: the canvas is already showing something the stored image does not have,
      // and Save is gated on dirty, so marking it clean would offer no way to keep it.
      setSaved(
        new Map(
          [...prepared].filter(([position]) => load.resolved.get(position)?.matchesStored === true)
        )
      )
    },
    [load]
  )

  /**
   * Step the named slides' histories, one entry each, in a single state update.
   *
   * Every position arrives as an argument and the update is functional, so this closes over
   * nothing and never goes stale. The Map is copied once for the whole set, and an all-no-op call
   * returns the same Map — which is what keeps a no-op action from re-rendering the editor.
   */
  const stepSlides = useCallback(
    (positions: number[], step: (history: DocHistory, position: number) => DocHistory) => {
      setHistories((current) => {
        let next: Map<number, DocHistory> | null = null
        for (const position of positions) {
          const history = current.get(position)
          if (!history) continue
          const stepped = step(history, position)
          if (stepped === history) continue
          next ??= new Map(current)
          next.set(position, stepped)
        }
        return next ?? current
      })
    },
    []
  )

  // Bound to the slide that was active when it was created, NOT to whatever is active when it
  // runs. That is what keeps a 60s AI op honest: the callback an op closed over at its start
  // commits to the slide it was started from, even if the user has moved on. Reading the position
  // from a ref here would look equivalent and would silently land those results on the wrong slide.
  const transformDoc = useCallback<TransformDoc>(
    (mutate, options) => stepSlides([activePosition], (history) => commitHistory(history, mutate, options)),
    [stepSlides, activePosition]
  )

  /**
   * The mutate receives the POSITION it is running for, so a transform can differ per slide.
   *
   * Apply-style does not need it — one source doc restyles every target identically — but a lockup
   * does: its index numeral and counter are the slide's own position, and a lockup applied across a
   * carousel that numbered every slide "01" would be worse than one that numbered none.
   */
  const transformSlides = useCallback(
    (positions: number[], mutate: (doc: CanvasDoc, position: number) => CanvasDoc) =>
      stepSlides(positions, (history, position) =>
        commitHistory(history, (doc) => mutate(doc, position))
      ),
    [stepSlides]
  )

  const markSaved = useCallback(({ position, exported, stored, image }: SavedSlide) => {
    setHistories((current) => {
      const history = current.get(position)
      // The canvas stays live while a save is in flight. Adopting the stored doc when the slide has
      // moved on would silently throw those edits away, so the stamp only lands on what was
      // exported — and the slide correctly stays dirty when it has not.
      if (!history || history.present !== exported) return current
      return new Map(current).set(position, { ...history, present: stored })
    })
    setSaved((current) => new Map(current).set(position, stored))
    setImages((current) => new Map(current).set(position, image))
  }, [])

  const activeHistory = histories.get(activePosition) ?? null
  const doc = activeHistory?.present ?? null
  const actions = useDocActions(doc, transformDoc)

  const dirtyPositions = useMemo(
    () =>
      [...histories]
        .filter(([position, history]) => history.present !== saved.get(position))
        .map(([position]) => position)
        .sort((a, b) => a - b),
    [histories, saved]
  )

  const docsByPosition = useMemo(() => {
    // Before the histories exist the resolved docs are the only ones there are — and the font union
    // must already cover them, or a seeded slide would autofit against a face that is not loaded.
    if (histories.size > 0) {
      return new Map([...histories].map(([position, history]) => [position, history.present]))
    }
    return load.status === 'ready'
      ? new Map([...load.resolved].map(([position, slide]) => [position, slide.doc]))
      : new Map<number, CanvasDoc>()
  }, [histories, load])

  const backgroundUrl =
    (doc ?? (load.status === 'ready' ? load.resolved.get(activePosition)?.doc : null))?.background
      .publicUrl ?? null

  return {
    ...actions,
    doc,
    status: load.status,
    message: load.status === 'error' ? load.message : null,
    identity: load.status === 'ready' ? load.identity : null,
    positions,
    activePosition,
    goToSlide: setActivePosition,
    initDocs,
    transformSlides,
    restoreSlides: useCallback(
      (docs: Map<number, CanvasDoc>) =>
        stepSlides([...docs.keys()], (history, position) =>
          commitHistory(history, (doc) => docs.get(position) ?? doc)
        ),
      [stepSlides]
    ),
    docsByPosition,
    docAt: useCallback((position) => latestHistories.current.get(position)?.present ?? null, []),
    images,
    backgroundUrl,
    dirtyPositions,
    dirty: dirtyPositions.length > 0,
    markSaved,
    undo: useCallback(() => stepSlides([activePosition], undoHistory), [stepSlides, activePosition]),
    redo: useCallback(() => stepSlides([activePosition], redoHistory), [stepSlides, activePosition]),
    canUndo: (activeHistory?.past.length ?? 0) > 0,
    canRedo: (activeHistory?.future.length ?? 0) > 0,
  }
}

/** The identity to seed from, and where each slide's stored doc comes from for this target kind. */
async function loadSlides(
  target: EditorTarget
): Promise<{ identity: SeedIdentity; storedDoc: (slide: EditorSlide) => CanvasDoc | null }> {
  if (target.kind === 'post') {
    const { docs, identity } = await fetchCanvasDocs(target.postId)
    const byPosition = new Map(docs.map((entry) => [entry.position, entry.doc]))
    return { identity, storedDoc: (slide) => byPosition.get(slide.position) ?? null }
  }
  // A wizard draft has no rows yet — the surface holds each slide's doc in memory and hands it over.
  return {
    identity: await fetchClientIdentity(target.clientId),
    storedDoc: (slide) => slide.doc ?? null,
  }
}
