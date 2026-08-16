'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type Konva from 'konva'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { cn } from '@/utils/cn'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useUnloadGuard } from '@/hooks/use-unload-guard'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/canvas/constants'
import { isImageNode, textNodes } from '@/lib/canvas/doc-nodes'
import { DEFAULT_BACKGROUND_TRANSFORM, zoomBackgroundTo } from '@/lib/canvas/reposition'
import { createShapeNode } from '@/lib/canvas/elements'
import { createTextNode } from '@/lib/canvas/seed-doc'
import { getBrandStyle } from '@/lib/visual/brand-styles'
import type {
  CanvasImageNode,
  CanvasScrim,
  CanvasShapeKind,
  CanvasShapeNode,
  CanvasTextNode,
} from '@/types/canvas'
import type { CommitOptions } from '../lib/doc-history'
import { imageFileFromTransfer, imageUrlFromTransfer } from '../lib/clipboard-image'
import { naturalSize } from '../lib/load-image'
import type { EditorMode } from '../types'
import { useCrossOriginImage } from '../hooks/use-cross-origin-image'
import { useEditorAiOps } from '../hooks/use-editor-ai-ops'
import { useEditorAssetOps } from '../hooks/use-editor-asset-ops'
import { useEditorSlides } from '../hooks/use-editor-slides'
import { useEditorFonts } from '../hooks/use-editor-fonts'
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
  const { editingId, startEdit } = useInlineTextEdit((id, text) =>
    slidesState.updateNode<CanvasTextNode>(id, { text, textOverridden: true })
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
    activePosition: slidesState.activePosition,
    slideCopy,
    docState: slidesState,
    selection,
    modeState,
    backgroundImage,
    canAddNode: assetOps.canAddNode,
  })

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

  const panelScrimChange = useCallback(
    (patch: Partial<CanvasScrim>) => slidesState.setScrim(patch, panelCommit('scrim', patch)),
    [slidesState]
  )

  useEditorShortcuts({
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
  applyingStyle || showShortcuts || confirmingClose)

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
        onApplyStyle={
          slidesState.positions.length > 1 ? () => setApplyingStyle(true) : undefined
        }
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
          {ready && identity && railSection && (
            <RailPanel
              section={railSection}
              doc={slidesState.doc!}
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
                const node = createShapeNode(
                  kind,
                  slidesState.doc!.canvas,
                  identity.palette.accent
                )
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
          {ready && identity && (
            mode === 'edit' ? (
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
                onToggleReposition={() => modeState.switchMode('reposition')}
                onScrimChange={panelScrimChange}
              />
            ) : (
              <ModeBar
                mode={mode}
                brushSize={brushSize}
                hasStrokes={strokes.length > 0}
                inpaintPrompt={inpaintPrompt}
                lassoDetect={lassoDetect}
                inpainting={aiOps.inpainting}
                erasing={aiOps.erasing}
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
                onDone={modeState.exitMode}
              />
            )
          )}

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
        onApply={(targets, source) =>
          slidesState.transformSlides(targets, (doc) => styledDoc(doc, source))
        }
        onUndo={slidesState.undoSlides}
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
  const subject =
    dirtyPositions.length === 1 ? `Slide ${named} has` : `Slides ${named} have`
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
  erase: 'Paint to rub parts of the selected element away',
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
