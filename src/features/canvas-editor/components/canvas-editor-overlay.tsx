'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type Konva from 'konva'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { cn } from '@/utils/cn'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useUnloadGuard } from '@/hooks/use-unload-guard'
import { CANVAS_HEIGHT, CANVAS_WIDTH, MAX_NODES } from '@/lib/canvas/constants'
import { fillCandidates, lowContrastLabels, recolourForBackdrop } from '@/lib/canvas/contrast'
import {
  applyLockup,
  getLockup,
  lockupBlock,
  lockupMemberIds,
  lockupNodeDelta,
  setHeadline,
  slideCopy as logicalCopy,
  type LockupContext,
  type LockupId,
} from '@/lib/canvas/lockups'
import { isImageNode, isTextNode, textNodes } from '@/lib/canvas/doc-nodes'
import { DEFAULT_BACKGROUND_TRANSFORM, zoomBackgroundTo } from '@/lib/canvas/reposition'
import { createShapeNode } from '@/lib/canvas/elements'
import { createTextNode } from '@/lib/canvas/seed-doc'
import { getBrandStyle } from '@/lib/visual/brand-styles'
import type {
  CanvasBackdrop,
  CanvasDoc,
  CanvasImageNode,
  CanvasShapeKind,
  CanvasShapeNode,
  CanvasTextNode,
} from '@/types/canvas'
import type { CommitOptions } from '../lib/doc-history'
import { imageFileFromTransfer, imageUrlFromTransfer } from '../lib/clipboard-image'
import { buildBackdropGrid } from '../lib/backdrop-grid'
import { decodedImage, naturalSize } from '../lib/load-image'
import type { EditorMode } from '../types'
import { useCrossOriginImage } from '../hooks/use-cross-origin-image'
import { useEditorAiOps } from '../hooks/use-editor-ai-ops'
import { useEditorAssetOps } from '../hooks/use-editor-asset-ops'
import { useEditorSlides } from '../hooks/use-editor-slides'
import { useEditorFonts } from '../hooks/use-editor-fonts'
import { useEditorJobs } from '../hooks/use-editor-jobs'
import { useEditorMode } from '../hooks/use-editor-mode'
import { useEditorSave } from '../hooks/use-editor-save'
import { useEditorSelection } from '../hooks/use-editor-selection'
import { useEditorShortcuts } from '../hooks/use-editor-shortcuts'
import { useInlineTextEdit } from '../hooks/use-inline-text-edit'
import { useStageViewport } from '../hooks/use-stage-viewport'
import { autofitDocText, overflowingTextLabels } from '../lib/measure-fit'
import { styledDoc } from '../lib/style-preview'
import type { CanvasEditorProps } from '../types'
import { EditorStage } from './editor-stage'
import { ViewportControls } from './viewport-controls'
import { ApplyStylePanel } from './workspace/apply-style-panel'
import { JobsTray } from './workspace/jobs-tray'
import { ModeBar } from './workspace/mode-bar'
import { Rail, useRailSection } from './workspace/rail'
import { RailPanel } from './workspace/rail-panel'
import { SelectionToolbar } from './workspace/selection-toolbar'
import { ShortcutsSheet } from './workspace/shortcuts-sheet'
import { SlideStrip } from './workspace/slide-strip'
import { TopBar } from './workspace/top-bar'

const MIN_VIEWPORT_WIDTH = 768
/** Stand-in canvas size for the frame before the doc loads — the viewport only needs a ratio. */
const DEFAULT_CANVAS = { w: CANVAS_WIDTH, h: CANVAS_HEIGHT }
/** Stable empty result so the top bar does not re-render on every measure pass. */
const EMPTY_OVERFLOW: string[] = []
/**
 * Fields a panel control drags through a range, firing a change per tick.
 *
 * A field missing here is not a cosmetic loss: one drag then costs one undo step PER TICK, which
 * on a 50-step cap flushes the user's real history in a single gesture.
 */
const CONTINUOUS_FIELDS = [
  'fontSize',
  'lineHeight',
  'rotation',
  'opacity',
  'width',
  'strokeWidth',
  'cornerRadius',
  'letterSpacing',
  'shadowOpacity',
  'shadowBlur',
  'shadowOffsetX',
  'shadowOffsetY',
  'arcBend',
] as const

/**
 * One panel gesture on one field is one undo step. Only the panel's own controls need this — the
 * stage's drag/transform handlers already commit once, at the end of the gesture.
 *
 * The test is on the VALUE, not on the key's presence. A text-effect preset patches every field it
 * owns, clearing the ones it does not use to `undefined` — so `'shadowBlur' in patch` is true for a
 * tile CLICK, which would hand a discrete action a coalesce key and fold it into whatever drag came
 * before it. Presence answers "is this key mentioned"; the question is "is this a drag".
 */
function panelCommit(id: string, patch: Record<string, unknown>): CommitOptions | undefined {
  const field = CONTINUOUS_FIELDS.find((name) => patch[name] !== undefined)
  // A patch touching several continuous fields at once is a preset, not a drag — `find` would
  // otherwise pick whichever happens to be first and coalesce the whole thing under it.
  const single = CONTINUOUS_FIELDS.filter((name) => patch[name] !== undefined).length === 1
  return field && single ? { coalesceKey: `${id}:${field}` } : undefined
}
/** The "Remove object" brush preset — removal is an inpaint with a fixed, well-tested prompt. */
const REMOVE_OBJECT_PROMPT =
  'remove the marked object completely and seamlessly continue the surrounding background'

/** The full-screen canvas editor. Holds the whole carousel; all Konva code lives beneath this file. */
function CanvasEditorOverlay(props: CanvasEditorProps) {
  const { target, slides, onClose } = props
  const isMobile = useIsMobile(MIN_VIEWPORT_WIDTH)
  const slidesState = useEditorSlides(target, slides, props.initialPosition)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const viewport = useStageViewport(workspaceRef, slidesState.doc?.canvas ?? DEFAULT_CANVAS)
  const liveNodeIds = useMemo(
    () => new Set((slidesState.doc?.nodes ?? []).map((node) => node.id)),
    [slidesState.doc]
  )
  const selection = useEditorSelection(liveNodeIds)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [railSection, setRailSection] = useRailSection()
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [applyingStyle, setApplyingStyle] = useState(false)
  /**
   * What the last multi-slide apply landed on, and what those slides held BEFORE it.
   *
   * The docs are captured, not just the positions: undoing a set by stepping each history back one
   * entry only undoes the apply while nothing has happened since, and both panels stay open
   * afterwards. See `restoreSlides`.
   */
  const [lockupApplied, setLockupApplied] = useState<AppliedSet | null>(null)
  const [styleApplied, setStyleApplied] = useState<AppliedSet | null>(null)
  // Every wait in one list, above the ops that create them: the top bar reads it to show what the
  // editor is working on, and each op reports into it for its whole life.
  const jobs = useEditorJobs()
  const modeState = useEditorMode(selection.clear)
  const { mode, strokes, brushSize, inpaintPrompt, lassoDetect } = modeState
  // Read from the live prop, not from the load: the surface's copy edits ride in while the editor
  // is open, and a generate request should use what the user can currently see.
  const slideCopy =
    slides.find((slide) => slide.position === slidesState.activePosition)?.slideCopy ?? null

  const { identity } = slidesState
  const families = useMemo(() => {
    if (!identity) return []
    const style = getBrandStyle(identity.style)
    // Every slide's families, not just the active one: any slide can be exported by a Save, and a
    // family that is not loaded bakes as a system face.
    const docFamilies = [...slidesState.docsByPosition.values()].flatMap((doc) =>
      textNodes(doc).map((node) => node.fontFamily)
    )
    // Sorted, because `useEditorFonts` keys readiness on the joined list: in node order, merely
    // restacking two text layers reorders it, which reads as a new set and flips fontsReady
    // false for a frame — unmounting the stage over a z-order change.
    return [...new Set([...docFamilies, style.fonts.display, style.fonts.body])].sort()
  }, [identity, slidesState.docsByPosition])

  // The client's colours plus their brand pairing — everything a lockup needs to resolve itself.
  // The slide half is the ACTIVE position, so an index numeral says what slide it is on.
  const lockupCtx = useMemo<LockupContext | null>(
    () =>
      identity
        ? {
            palette: identity.palette,
            fonts: getBrandStyle(identity.style).fonts,
            slide: {
              position: slidesState.activePosition,
              total: slidesState.positions.length,
            },
          }
        : null,
    [identity, slidesState.activePosition, slidesState.positions.length]
  )

  const fontsReady = useEditorFonts(families)
  // Memoized because it is not cheap: every layer gets a synchronous Konva text-wrap measure, and
  // the viewport lives in this component — panning would otherwise re-measure the whole doc per frame.
  const overflowing = useMemo(
    () => (slidesState.doc && fontsReady ? overflowingTextLabels(slidesState.doc) : EMPTY_OVERFLOW),
    [slidesState.doc, fontsReady]
  )
  // Later font-family switches must not unmount the stage — only first readiness gates rendering;
  // `fontsReady` flipping true again after a switch re-renders (and thus redraws) the loaded face.
  const [initialFontsReady, setInitialFontsReady] = useState(false)
  // Adjusted during render rather than in an effect: this is a latch on a value we already have,
  // so an effect would only add a second render pass before the stage could appear.
  if (fontsReady && !initialFontsReady) setInitialFontsReady(true)
  const backgroundImage = useCrossOriginImage(slidesState.backgroundUrl)

  /**
   * Layers the picture is swallowing, measured against the composed art.
   *
   * Gated on `backgroundImage` because the grid is read from real pixels; until the art decodes
   * there is nothing to compare against and the honest answer is to say nothing.
   */
  /**
   * Deferred, because measuring costs a 108×135 offscreen draw and a full `getImageData`.
   *
   * The doc changes on every tick of every slider and every frame of every drag, and each one was
   * rebuilding the whole grid to answer a question the user reads at rest. `useDeferredValue` lets
   * React drop the intermediate values and measure once the gesture settles — the warning arrives a
   * beat late, which is the correct priority for a warning, and the drag stops competing with it.
   */
  const settledDoc = useDeferredValue(slidesState.doc)
  const lowContrast = useMemo(() => {
    if (!settledDoc || !backgroundImage || !fontsReady) return EMPTY_OVERFLOW
    const grid = buildBackdropGrid(settledDoc, backgroundImage)
    return grid ? lowContrastLabels(settledDoc, grid) : EMPTY_OVERFLOW
  }, [settledDoc, backgroundImage, fontsReady])

  const { editingId, startEdit } = useInlineTextEdit(
    (id, text) => {
      const doc = slidesState.doc
      const node = doc?.nodes.find((candidate) => candidate.id === id)
      // A hero lockup keeps the headline in two boxes. Editing either one edits the SENTENCE, and
      // `setHeadline` re-splits it — so replacing the poster word cannot leave the old remainder
      // trailing behind it when a flat lockup rejoins them later.
      if (doc && node && isTextNode(node) && (node.role === 'hero' || node.role === 'headline')) {
        slidesState.transformDoc((current) => setHeadline(current, text))
        return
      }
      slidesState.updateNode<CanvasTextNode>(id, { text, textOverridden: true })
    },
    (node) =>
      slidesState.doc && (node.role === 'hero' || node.role === 'headline')
        ? logicalCopy(slidesState.doc).headline
        : node.text
  )

  // Build every slide's history once fonts can measure — seeded layers autofit before first paint.
  const initializedRef = useRef(false)
  useEffect(() => {
    if (initializedRef.current || !fontsReady || slidesState.status !== 'ready') return
    initializedRef.current = true
    slidesState.initDocs((doc, seeded) => (seeded ? autofitDocText(doc) : doc))
  }, [fontsReady, slidesState])

  // Switching slides is not an edit: it must not be undoable, and it must not carry a half-drawn
  // mask or a selection of nodes that only exist on the slide being left.
  const goToSlide = useCallback(
    (position: number) => {
      if (position === slidesState.activePosition) return
      modeState.exitMode()
      selection.clear()
      slidesState.goToSlide(position)
    },
    [modeState, selection, slidesState]
  )

  // Cancel steps OUT of reposition/inpaint mode first; the next attempt confirms and closes.
  const attemptClose = useCallback(() => {
    if (mode !== 'edit') {
      modeState.exitMode()
      return
    }
    if (slidesState.dirty) {
      setConfirmingClose(true)
      return
    }
    onClose()
  }, [mode, modeState, slidesState.dirty, onClose])

  // Escape and the backdrop walk a ladder — leave the mode, then the selection, then the editor.
  // Dropping the selection first is what every design tool does; closing on the first Escape while
  // something is selected reads as the editor throwing the work away.
  const escapeLadder = useCallback(() => {
    if (mode === 'edit' && selection.ids.length > 0) {
      selection.clear()
      return
    }
    attemptClose()
  }, [mode, selection, attemptClose])

  const assetOps = useEditorAssetOps(target, slidesState, selection)
  const aiOps = useEditorAiOps({
    target,
    jobs,
    goToSlide,
    activePosition: slidesState.activePosition,
    slideCopy,
    docState: slidesState,
    selection,
    modeState,
    backgroundImage,
    canAddNode: assetOps.canAddNode,
  })

  // The shared definition, not a local copy of the list: the tiles and the compose pipeline resolve
  // against the same one, and a preview that predicts a different colour than the export produces is
  // the whole reason it is stated once.
  const candidates = useMemo(() => (identity ? fillCandidates(identity.palette) : []), [identity])

  /**
   * Resolve fills against the art once the lockup has moved the text.
   *
   * The grid is measured HERE, outside the mutate: reading pixels needs a canvas, and
   * `transformDoc`'s callback runs inside a React state updater that Strict Mode double-invokes.
   * Measured first and closed over, the transform stays pure and the repaint costs no second
   * undo step.
   */
  const withContrast = useCallback(
    (next: CanvasDoc, art: HTMLImageElement | null): CanvasDoc => {
      if (!art || candidates.length === 0) return next
      const grid = buildBackdropGrid(next, art)
      return grid ? recolourForBackdrop(next, grid, candidates) : next
    },
    [candidates]
  )

  /**
   * Put a lockup on the active slide.
   *
   * Ids are minted HERE, not inside the mutate: `transformDoc`'s callback runs inside a React state
   * updater that Strict Mode double-invokes, so ids generated in there differ between invocations
   * and anything captured to select afterwards would point at nodes that do not exist.
   */
  const applyLockupHere = useCallback(
    (id: LockupId) => {
      const doc = slidesState.doc
      if (!doc || !lockupCtx) return
      // The cap guard is GROSS — it knows nothing about the nodes this operation first sweeps — so
      // it must be asked about the NET delta, or a nearly-full slide is refused an edit that
      // actually frees room.
      if (!assetOps.canAddNode(lockupNodeDelta(doc, id, lockupCtx))) return
      const ids = lockupMemberIds(doc, id, lockupCtx, () => crypto.randomUUID())
      slidesState.transformDoc((current) =>
        withContrast(applyLockup(current, id, lockupCtx, ids), backgroundImage)
      )
    },
    [slidesState, lockupCtx, assetOps, withContrast, backgroundImage]
  )

  /**
   * Put one lockup on every slide, each laid out around its OWN words and its own position.
   *
   * One `transformSlides` dispatch rather than a loop, following the apply-style idiom. Ids are
   * minted per position up front for the same Strict Mode reason as above, and because one prebuilt
   * array shared across N docs would give every slide the same node ids — survivable today only by
   * accident of scoping, and data corruption the moment anything merges two docs.
   */
  const applyLockupEverywhere = useCallback(
    (id: LockupId) => {
      if (!lockupCtx) return
      const total = slidesState.positions.length
      const lockup = getLockup(id)
      if (!lockup) return

      /**
       * Only the slides the lockup can actually hold.
       *
       * Every slide has its OWN words, and the picker only ever measured the active one — so a
       * carousel where slide 1's first word fits happily could stamp slide 4's eleven-character one
       * into the same poster slot and run it off the canvas. Autofit cannot rescue that: it measures
       * to the canvas floor, sees room, and lets the hero crash through the headline beneath it.
       * Slides that cannot take the lockup are skipped and named rather than quietly broken.
       */
      const targets: number[] = []
      const skipped: { position: number; reason: SkipReason }[] = []
      for (const position of slidesState.positions) {
        const doc = slidesState.docsByPosition.get(position)
        if (!doc) continue
        const slideCtx = { ...lockupCtx, slide: { position, total } }
        const block = lockupBlock(lockup, slideCtx, logicalCopy(doc))
        const room = doc.nodes.length + lockupNodeDelta(doc, id, slideCtx) <= MAX_NODES
        const reason: SkipReason | null = block.wrongScript
          ? 'script'
          : block.tooMuchCopy
            ? 'copy'
            : !room
              ? 'room'
              : null
        if (reason) skipped.push({ position, reason })
        else targets.push(position)
      }
      if (targets.length === 0) {
        toast.error('None of the other slides have copy short enough for this lockup')
        return
      }

      const idsByPosition = new Map(
        targets.map((position) => {
          const doc = slidesState.docsByPosition.get(position)
          const slideCtx = { ...lockupCtx, slide: { position, total } }
          return [
            position,
            doc ? lockupMemberIds(doc, id, slideCtx, () => crypto.randomUUID()) : [],
          ] as const
        })
      )
      slidesState.transformSlides(targets, (doc, position) => {
        const next = applyLockup(
          doc,
          id,
          { ...lockupCtx, slide: { position, total } },
          idsByPosition.get(position) ?? []
        )
        // Each slide is resolved against ITS OWN art. `decodedImage` is a synchronous cache read,
        // so a slide the user has never opened has nothing decoded and simply keeps its colours —
        // the alternative is awaiting a decode per slide inside a state updater, which is not a
        // thing a pure mutate may do.
        return withContrast(next, decodedImage(next.background.publicUrl))
      })
      // Remembered so the panel can offer ONE undo. `transformSlides` commits an entry per slide,
      // and ⌘Z steps only the active one — so without this the way to back out a seven-slide apply
      // is to visit each slide and undo it there.
      setLockupApplied(appliedSet(targets, slidesState.docsByPosition))
      if (skipped.length > 0) toast.info(skipReport(skipped))
    },
    [slidesState, lockupCtx, withContrast]
  )

  const removeNodes = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      // No need to touch the selection: it filters against the nodes that still exist, so the
      // deleted ids fall out on their own and an unrelated selection survives.
      slidesState.removeNodes(ids)
    },
    [slidesState]
  )

  const setSelectedNodeAsBackground = useCallback(() => {
    const id = selection.primaryId
    if (!id) return
    // Say why rather than no-op silently: the doc layer refuses a mirrored node, because the
    // background carries no orientation and promoting one would quietly un-mirror the picture.
    const node = slidesState.doc?.nodes.find((candidate) => candidate.id === id)
    if (node && isImageNode(node) && (node.flipX || node.flipY)) {
      toast.error('Un-flip this picture before making it the background')
      return
    }
    slidesState.setNodeAsBackground(id)
    selection.clear()
    toast.success('Background updated')
  }, [slidesState, selection])

  const backgroundZoom = useCallback(
    (zoom: number) => {
      if (!slidesState.doc || !backgroundImage) return
      const canvas = slidesState.doc.canvas
      slidesState.setBackgroundTransform(
        zoomBackgroundTo(
          slidesState.doc.backgroundTransform ?? DEFAULT_BACKGROUND_TRANSFORM,
          zoom,
          { x: canvas.w / 2, y: canvas.h / 2 },
          naturalSize(backgroundImage),
          canvas
        ),
        { coalesceKey: 'background:zoom' }
      )
    },
    [slidesState, backgroundImage]
  )

  const panelTextChange = useCallback(
    // `discrete` is how a control says "this is a press, not a drag". A text-effect preset patches
    // several range-backed fields at once, and inferring intent from the patch alone cannot tell
    // that from a gesture — so the control that knows says so.
    (id: string, patch: Partial<CanvasTextNode>, discrete?: boolean) =>
      slidesState.updateNode<CanvasTextNode>(
        id,
        patch,
        discrete ? undefined : panelCommit(id, patch)
      ),
    [slidesState]
  )

  const panelAssetChange = useCallback(
    (id: string, patch: Partial<CanvasImageNode>) =>
      slidesState.updateNode<CanvasImageNode>(id, patch, panelCommit(id, patch)),
    [slidesState]
  )

  const panelShapeChange = useCallback(
    (id: string, patch: Partial<CanvasShapeNode>) =>
      slidesState.updateNode<CanvasShapeNode>(id, patch, panelCommit(id, patch)),
    [slidesState]
  )

  const panelBackdropChange = useCallback(
    (patch: Partial<CanvasBackdrop>) =>
      slidesState.setBackdrop(patch, panelCommit('backdrop', patch)),
    [slidesState]
  )

  useEditorShortcuts(
    {
      onEscape: escapeLadder,
      undo: slidesState.undo,
      redo: slidesState.redo,
      removeSelected: () => removeNodes(selection.ids),
      duplicateSelected: () => {
        if (!assetOps.canAddNode(selection.ids.length)) return
        const copies = slidesState.duplicateNodes(selection.ids)
        if (copies.length > 0) selection.selectMany(copies)
      },
      nudgeSelected: (dx, dy) => {
        if (selection.ids.length > 0) slidesState.nudgeNodes(selection.ids, dx, dy)
      },
      reorderSelected: (direction, toEdge) => {
        // Stacking moves one node at a time — with several selected the order between them is
        // ambiguous, so the primary one moves.
        if (selection.primaryId) slidesState.moveNode(selection.primaryId, direction, toEdge)
      },
      zoomIn: viewport.zoomIn,
      zoomOut: viewport.zoomOut,
      fitToScreen: viewport.fit,
      actualSize: viewport.actualSize,
      showShortcuts: () => setShowShortcuts(true),
    },
    // The editor's own dialogs portal outside this subtree, so the handler's target check cannot see
    // them. Without this, ⌘Z over an open panel undoes on the canvas behind it.
    applyingStyle || showShortcuts || confirmingClose
  )

  // The browser's own guard for the tab closing on unsaved work — the in-app ladder only covers
  // the editor's own close paths.
  useUnloadGuard(slidesState.dirty)

  const { saving, progress, performSave } = useEditorSave({ props, slides: slidesState })

  if (isMobile) {
    return (
      <Backdrop onClose={onClose}>
        <CenterNotice>
          The canvas editor needs a larger screen — open it on a desktop.
          <span className="mt-3">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </span>
        </CenterNotice>
      </Backdrop>
    )
  }

  const ready = Boolean(identity && initialFontsReady && backgroundImage && slidesState.doc)

  return (
    <Backdrop onClose={escapeLadder}>
      <TopBar
        position={slidesState.activePosition}
        slideCount={slidesState.positions.length}
        overflowing={overflowing}
        lowContrast={lowContrast}
        onAutoFit={() => slidesState.transformDoc(autofitDocText)}
        canUndo={slidesState.canUndo}
        canRedo={slidesState.canRedo}
        undo={slidesState.undo}
        redo={slidesState.redo}
        saving={saving}
        progress={progress}
        // Nothing to save is a real state now that the editor stays open after saving — the button
        // stops offering an action that would do nothing.
        canSave={ready && !saving && mode === 'edit' && slidesState.dirty}
        canApplyStyle={ready && !saving && mode === 'edit'}
        onCancel={attemptClose}
        onShowShortcuts={() => setShowShortcuts(true)}
        onSave={() => {
          void performSave()
        }}
        // One slide has nothing to apply its style to — the same gate the slide strip uses.
        onApplyStyle={slidesState.positions.length > 1 ? () => setApplyingStyle(true) : undefined}
        jobs={<JobsTray jobs={jobs.jobs} discard={jobs.discard} />}
      />
      <div className="flex min-h-0 flex-1">
        <Rail
          active={railSection}
          busy={
            // The dot answers for ANY slide — a job started on slide 1 is still the user's job
            // after they move to slide 3, and a rail that went quiet would say otherwise.
            aiOps.generatingAnySlide || aiOps.isolating || aiOps.expanding ? ['ai'] : undefined
          }
          onSelect={setRailSection}
        >
          {ready && identity && lockupCtx && railSection && (
            <RailPanel
              section={railSection}
              jobs={jobs}
              doc={slidesState.doc!}
              lockupContext={lockupCtx}
              onApplyLockup={(id) => {
                setLockupApplied(null)
                applyLockupHere(id)
              }}
              appliedToAll={lockupApplied?.positions ?? null}
              onUndoApplyToAll={() => {
                if (lockupApplied) slidesState.restoreSlides(lockupApplied.before)
                setLockupApplied(null)
              }}
              // One slide has nothing to apply a lockup across — the same gate the strip uses.
              onApplyLockupToAll={
                slidesState.positions.length > 1 ? applyLockupEverywhere : undefined
              }
              selectedIds={selection.ids}
              busy={{
                uploadingAsset: assetOps.uploadingAsset,
                isolating: aiOps.isolating,
                generatingSvg: aiOps.generatingSvg,
                replacingBackground: assetOps.replacingBackground,
                generatingBackground: aiOps.generatingBackground,
                expanding: aiOps.expanding,
              }}
              hasSlideCopy={slideCopy !== null}
              candidates={aiOps.candidates}
              onGenerateBackground={(direction) => {
                void aiOps.generateBackground(direction)
              }}
              onExpandBackground={() => {
                void aiOps.expandBackground()
              }}
              onCancelBackground={aiOps.cancelBackground}
              onPickCandidate={aiOps.pickCandidate}
              onSelect={(id, additive) => {
                if (additive) selection.toggle(id)
                else selection.selectOnly(id)
              }}
              onHoverNode={setHoveredId}
              onAddText={() => {
                if (!assetOps.canAddNode()) return
                const node = createTextNode('custom', identity)
                slidesState.addNode(node)
                selection.selectOnly(node.id)
              }}
              onAddShape={(kind: CanvasShapeKind) => {
                if (!assetOps.canAddNode()) return
                const node = createShapeNode(kind, slidesState.doc!.canvas, identity.palette.accent)
                slidesState.addNode(node)
                selection.selectOnly(node.id)
              }}
              onRemoveNode={(id) => removeNodes([id])}
              onReorderNode={slidesState.reorderNode}
              onToggleHidden={(node) =>
                slidesState.updateNode(node.id, { hidden: !node.hidden || undefined })
              }
              onToggleLocked={(node) =>
                slidesState.updateNode(node.id, { locked: !node.locked || undefined })
              }
              onUploadAsset={(file: File) => {
                void assetOps.addImageFromFile(file)
              }}
              onReplaceBackground={(file) => {
                void assetOps.replaceBackground(file)
              }}
              onBackgroundZoom={backgroundZoom}
              onBackgroundReset={() => slidesState.setBackgroundTransform(undefined)}
              onEnterInpaint={() => modeState.switchMode('inpaint')}
              onEnterLasso={() => modeState.switchMode('lasso')}
              onIsolateSubject={() => {
                void aiOps.isolateSubject()
              }}
              onGenerateSvg={(prompt) => {
                void aiOps.generateSvg(prompt)
              }}
            />
          )}
        </Rail>

        <div className="flex min-w-0 flex-1 flex-col">
          {ready &&
            identity &&
            (mode === 'edit' ? (
              <SelectionToolbar
                doc={slidesState.doc!}
                palette={identity.palette}
                selectedIds={selection.ids}
                busy={{ removingBackground: aiOps.removingBackground }}
                onTextChange={panelTextChange}
                onAssetChange={panelAssetChange}
                onShapeChange={panelShapeChange}
                onMoveNode={slidesState.moveNode}
                onRemoveNodes={removeNodes}
                onSetNodeAsBackground={setSelectedNodeAsBackground}
                onRemoveNodeBackground={() => {
                  void aiOps.removeSelectedNodeBackground()
                }}
                onEraseSelected={() => modeState.switchMode('erase')}
                onRepairSelected={() => modeState.switchMode('repair')}
                onToggleReposition={() => modeState.switchMode('reposition')}
                onBackdropChange={panelBackdropChange}
              />
            ) : (
              <ModeBar
                mode={mode}
                jobs={jobs}
                brushSize={brushSize}
                hasStrokes={strokes.length > 0}
                inpaintPrompt={inpaintPrompt}
                lassoDetect={lassoDetect}
                inpainting={aiOps.inpainting}
                erasing={aiOps.erasing}
                repairing={aiOps.repairing}
                lassoCutting={aiOps.lassoCutting}
                onBrushSizeChange={modeState.setBrushSize}
                onPromptChange={modeState.setInpaintPrompt}
                onDetectChange={modeState.setLassoDetect}
                onClearStrokes={modeState.clearStrokes}
                onApplyInpaint={() => {
                  void aiOps.applyInpaint()
                }}
                onRemoveObject={() => {
                  void aiOps.applyInpaint(REMOVE_OBJECT_PROMPT)
                }}
                onApplyErase={() => {
                  void aiOps.applyErase()
                }}
                onApplyRepair={() => {
                  void aiOps.repairSelectedNode()
                }}
                onDone={modeState.exitMode}
              />
            ))}

          <div
            ref={workspaceRef}
            className={cn(
              'relative min-h-0 flex-1 overflow-hidden bg-sunken',
              viewport.panning && 'cursor-grab'
            )}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const rect = event.currentTarget.getBoundingClientRect()
              // Screen → canvas space through the current view transform.
              const point = {
                x: (event.clientX - rect.left - viewport.x) / viewport.scale,
                y: (event.clientY - rect.top - viewport.y) / viewport.scale,
              }
              const file = imageFileFromTransfer(event.dataTransfer)
              if (file) return void assetOps.addImageFromFile(file, point)
              const url = imageUrlFromTransfer(event.dataTransfer)
              if (url) void assetOps.addImageFromUrl(url, point)
            }}
          >
            {slidesState.message && <CenterNotice>{slidesState.message}</CenterNotice>}
            {!slidesState.message && !ready && (
              <CenterNotice>
                <Spinner size="md" />
                <span className="mt-2.5">Preparing canvas…</span>
              </CenterNotice>
            )}
            {ready && (
              <>
                <EditorStage
                  doc={slidesState.doc!}
                  backgroundImage={backgroundImage!}
                  viewport={viewport}
                  selection={selection}
                  hoveredId={hoveredId}
                  editingId={editingId}
                  mode={mode}
                  brushSize={brushSize}
                  strokes={strokes}
                  onSelect={(id, additive) => {
                    if (!id) selection.clear()
                    else if (additive) selection.toggle(id)
                    else selection.selectOnly(id)
                  }}
                  onNodeChange={slidesState.updateNode}
                  onPlaceNodes={slidesState.placeNodes}
                  onStartEdit={(node: CanvasTextNode, text: Konva.Text) =>
                    startEdit(node, text, viewport.scale)
                  }
                  onBackgroundTransform={slidesState.setBackgroundTransform}
                  onStrokeEnd={(stroke) => {
                    if (mode === 'lasso') void aiOps.lassoCut(stroke.points)
                    else modeState.addStroke(stroke)
                  }}
                />
                <ViewportControls viewport={viewport} />
                {mode !== 'edit' && <ModeHint mode={mode} />}
              </>
            )}
          </div>

          {slidesState.positions.length > 1 && (
            <SlideStrip
              positions={slidesState.positions}
              activePosition={slidesState.activePosition}
              images={slidesState.images}
              dirtyPositions={slidesState.dirtyPositions}
              onSelect={goToSlide}
            />
          )}
        </div>
      </div>
      <ApplyStylePanel
        open={applyingStyle}
        onClose={() => setApplyingStyle(false)}
        sourcePosition={slidesState.activePosition}
        positions={slidesState.positions}
        docsByPosition={slidesState.docsByPosition}
        onApply={(targets, source) => {
          setStyleApplied(appliedSet(targets, slidesState.docsByPosition))
          slidesState.transformSlides(targets, (doc) => styledDoc(doc, source))
        }}
        onUndo={() => {
          if (styleApplied) slidesState.restoreSlides(styleApplied.before)
        }}
      />
      <ShortcutsSheet open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <ConfirmDialog
        open={confirmingClose}
        title="Discard unsaved changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmingClose(false)
          onClose()
        }}
        onClose={() => setConfirmingClose(false)}
      >
        {/* Names the slides, because with a carousel open the unsaved work can be somewhere the
            user is not currently looking. */}
        {dirtyNotice(slidesState.dirtyPositions, slidesState.positions.length)}
      </ConfirmDialog>
    </Backdrop>
  )
}

// Default-only, deliberately: the sole consumer is a `dynamic(() => import(…))` boundary, and a
// second named export would be another door into the chunk that is meant to load on demand.
export default CanvasEditorOverlay

/** What the discard confirmation says is at stake — by slide, when there is more than one. */
function dirtyNotice(dirtyPositions: number[], slideCount: number): string {
  if (slideCount <= 1) {
    return 'This slide has edits that are not saved. Closing the editor now throws them away.'
  }
  const named = dirtyPositions.map((position) => position + 1).join(', ')
  const subject = dirtyPositions.length === 1 ? `Slide ${named} has` : `Slides ${named} have`
  return `${subject} edits that are not saved. Closing the editor now throws them away.`
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    // role="dialog": page-level shortcut handlers (the review flow's keys) suspend
    // themselves while a [role="dialog"] is open — without it a stray keypress on the
    // canvas can act on the page beneath the editor.
    //
    // flex-col is load-bearing, not cosmetic: the workspace row below the header claims its
    // height with flex-1, so a block box here collapses it to its content and the canvas fits
    // itself into ~150px.
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[200] flex flex-col bg-sunken"
    >
      {children}
    </div>,
    // Portalled to the body because both surfaces that open the editor sit inside a
    // backdrop-filtered card, and backdrop-filter makes an ancestor the containing block for
    // `fixed` — without this the "full-screen" editor is confined to the content column.
    document.body
  )
}

const MODE_HINTS: Record<Exclude<EditorMode, 'edit'>, string> = {
  reposition: 'Drag to reposition · scroll to zoom the image',
  inpaint: 'Paint over what should change, then Apply',
  lasso: 'Draw a loop around the object to cut it out',
  // Names the limit, not just the gesture. The brush covers the whole slide but only cuts into the
  // outlined picture, and a stroke that crosses onto the artwork behind it leaves that untouched —
  // which reads as the tool half-working unless it was said up front.
  erase: 'Rubs out only the outlined picture — the rest of the slide is untouched',
  // Same limit as the eraser, and one more: the model fills the whole painted zone, so a stroke
  // hanging off the picture's edge comes back as invented pixels rather than transparency.
  repair: 'Paint inside the outlined picture, say what belongs there, then Apply',
}

/** A multi-slide apply, with what its targets held beforehand so the set can be put back. */
interface AppliedSet {
  positions: number[]
  before: Map<number, CanvasDoc>
}

/** Capture the targets' current docs, so "Undo" can restore them whatever happens in between. */
function appliedSet(positions: number[], docs: Map<number, CanvasDoc>): AppliedSet {
  const before = new Map<number, CanvasDoc>()
  for (const position of positions) {
    const doc = docs.get(position)
    if (doc) before.set(position, doc)
  }
  return { positions, before }
}

/** Why apply-to-all passed a slide over. Each has its own fix, so each is said in the user's terms. */
type SkipReason = 'script' | 'copy' | 'room'

const SKIP_PHRASES: Record<SkipReason, { one: string; many: string }> = {
  script: {
    one: 'its text is Cyrillic and this lockup has no Cyrillic letters',
    many: 'their text is Cyrillic and this lockup has no Cyrillic letters',
  },
  copy: {
    one: 'its copy is too long for this lockup',
    many: 'their copy is too long for this lockup',
  },
  room: {
    one: 'it is already at the layer limit',
    many: 'they are already at the layer limit',
  },
}

/**
 * What the skipped-slides toast says.
 *
 * Names the reason only when every skipped slide shares one. The old wording said "copy is too long"
 * whatever had happened, which sent the user off shortening a slide that had actually been passed
 * over for its alphabet — a fix that could never work on a problem they were never told about.
 */
function skipReport(skipped: { position: number; reason: SkipReason }[]): string {
  const first = skipped[0]
  if (!first) return ''
  if (skipped.length === 1) {
    return `Slide ${first.position + 1} was skipped — ${SKIP_PHRASES[first.reason].one}`
  }
  const shared = skipped.every((entry) => entry.reason === first.reason)
  const why = shared ? SKIP_PHRASES[first.reason].many : 'this lockup cannot hold them'
  return `${skipped.length} slides were skipped — ${why}`
}

/** Names the active mode and its way out — until now the only exit was a button in the panel. */
function ModeHint({ mode }: { mode: Exclude<EditorMode, 'edit'> }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
      <span className="rounded-chip bg-surface-dark px-3 py-1.5 font-sans text-caption text-ink-inv shadow-dark">
        {MODE_HINTS[mode]} · <kbd className="font-sans">Esc</kbd> to finish
      </span>
    </div>
  )
}

function CenterNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex size-full flex-col items-center justify-center p-6 text-center font-sans text-body text-text2">
      {children}
    </div>
  )
}
