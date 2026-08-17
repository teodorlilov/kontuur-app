'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Layer, Rect, Stage, Transformer } from 'react-konva'
import Konva from 'konva'
import type {
  CanvasBackgroundTransform,
  CanvasDoc,
  CanvasNode,
  CanvasTextNode,
} from '@/types/canvas'
import {
  CHROME_DANGER,
  CHROME_MARQUEE_FILL,
  CHROME_MARQUEE_STROKE,
  CHROME_SPRING,
} from '../lib/canvas-chrome'
import {
  CANVAS_PAPER,
  MIN_ELEMENT_SIZE,
  MIN_TEXT_LAYER_WIDTH,
  WHEEL_ZOOM_RATE,
} from '@/lib/canvas/constants'
import { coverCrop } from '@/lib/canvas/cover-crop'
import {
  grabbableIds,
  isLocked,
  isShapeNode,
  isTextNode,
  visibleNodes,
} from '@/lib/canvas/doc-nodes'
import { backgroundNodeAttrs, scrimNodeAttrs } from '@/lib/canvas/node-attrs'
import {
  DEFAULT_BACKGROUND_TRANSFORM,
  panBackground,
  zoomBackgroundTo,
} from '@/lib/canvas/reposition'
import { idsIntersectingRect, rectFromPoints } from '@/lib/canvas/marquee'
import {
  SNAP_TOLERANCE,
  collectSnapStops,
  snapRect,
  type SnapGuide,
  type SnapStops,
} from '@/lib/canvas/snapping'
import type { BrushStroke, EditorMode } from '../types'
import type { EditorSelection } from '../hooks/use-editor-selection'
import type { ViewportControls } from '../hooks/use-stage-viewport'
import { naturalSize } from '../lib/load-image'
import { isSingleLine } from '../lib/measure-fit'
import {
  BrushSurface,
  ERASE_STROKE_COLOR,
  INPAINT_STROKE_COLOR,
  LASSO_PREVIEW_WIDTH,
  LASSO_STROKE_COLOR,
} from './brush-surface'
import { ArcHandle } from './arc-handle'
import { ImageNode } from './image-node'
import { ShapeNode } from './shape-node'
import { TextNode } from './text-node'

/**
 * How every measuring site asks for a node's box.
 *
 * Konva grows a client rect by the stroke width plus the shadow offset and twice its blur. A text
 * layer wearing an Outline or a Shadow would therefore snap, marquee-select and outline against its
 * halo rather than its glyphs — so alignment guides would line up the blur, not the letters.
 */
const MEASURE_BOX = { skipStroke: true, skipShadow: true } as const

/** Wheel gestures settle into ONE doc commit (and one undo step) after this pause. */
const WHEEL_COMMIT_DELAY_MS = 150

interface EditorStageProps {
  doc: CanvasDoc
  backgroundImage: HTMLImageElement
  viewport: ViewportControls
  selection: EditorSelection
  /** The node the pointer is over in a panel list — outlined so rows and canvas stay connected. */
  hoveredId: string | null
  editingId: string | null
  mode: EditorMode
  brushSize: number
  strokes: BrushStroke[]
  /** Click on a node: `additive` (shift held) extends the selection instead of replacing it. */
  onSelect: (id: string | null, additive?: boolean) => void
  /** Patch one node; the patch is typed to the node's own kind at the call site. */
  onNodeChange: <T extends CanvasNode>(id: string, patch: Partial<T>) => void
  /** A finished multi-node drag: every moved node's final position, as one undo step. */
  onPlaceNodes: (placements: Array<{ id: string; x: number; y: number }>) => void
  onStartEdit: (node: CanvasTextNode, text: Konva.Text) => void
  onBackgroundTransform: (transform: CanvasBackgroundTransform) => void
  onStrokeEnd: (stroke: BrushStroke) => void
}

// Konva's Transformer box shape (screen space).
interface TransformerBox {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

// Text resizes by width only (re-wrap); elements resize by corners with the aspect locked. A
// multi-selection resizes as one box, so it uses the element rules whatever it contains.
function transformerConfigFor(
  selectedKind: 'text' | 'line' | 'element' | 'multiple',
  scale: number,
  unlockRatio: boolean
) {
  if (selectedKind === 'text') {
    return {
      enabledAnchors: ['middle-left', 'middle-right'],
      keepRatio: false,
      boundBoxFunc: (oldBox: TransformerBox, newBox: TransformerBox) =>
        newBox.width < MIN_TEXT_LAYER_WIDTH * scale ? oldBox : newBox,
    }
  }
  // A line is length, angle and thickness — and only length is a resize. Its box is 6px tall by
  // construction, so the element rule below (which rejects a box under 40px in EITHER axis) would
  // reject every gesture and the handles would do nothing at all. Angle is `rotation`; thickness is
  // the strokeWidth control in the toolbar.
  if (selectedKind === 'line') {
    return {
      enabledAnchors: ['middle-left', 'middle-right'],
      keepRatio: false,
      boundBoxFunc: (oldBox: TransformerBox, newBox: TransformerBox) =>
        newBox.width < MIN_ELEMENT_SIZE * scale ? oldBox : newBox,
    }
  }
  return {
    enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    // Elements keep their aspect unless Shift is held — the convention everywhere else.
    keepRatio: selectedKind === 'multiple' ? true : !unlockRatio,
    boundBoxFunc: (oldBox: TransformerBox, newBox: TransformerBox) =>
      newBox.width < MIN_ELEMENT_SIZE * scale || newBox.height < MIN_ELEMENT_SIZE * scale
        ? oldBox
        : newBox,
  }
}

/** The live canvas: background (cover-cropped) → scrim → the node list in order → Transformer. */
export function EditorStage({
  doc,
  backgroundImage,
  viewport,
  selection,
  hoveredId,
  editingId,
  mode,
  brushSize,
  strokes,
  onSelect,
  onNodeChange,
  onPlaceNodes,
  onStartEdit,
  onBackgroundTransform,
  onStrokeEnd,
}: EditorStageProps) {
  const scale = viewport.scale
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const backgroundRef = useRef<Konva.Image>(null)
  const contentRef = useRef<Konva.Layer>(null)
  const guidesRef = useRef<Konva.Layer>(null)
  // Stops are collected once per drag: the siblings can't move while one node is being dragged.
  const snapStopsRef = useRef<SnapStops | null>(null)
  // The gesture in progress: which node the pointer holds, and every node moving with it.
  const dragGestureRef = useRef<{ leader: Konva.Node; ids: string[] } | null>(null)
  // The band carries the ids that existed when it started: the release handler lives on window and
  // outlives the render that created it, and nodes cannot appear mid-sweep anyway.
  const marqueeRef = useRef<{
    start: { x: number; y: number }
    rect: Konva.Rect
    ids: Set<string>
  } | null>(null)
  // The band's release handler lives on window, so closing the editor mid-sweep would otherwise
  // leave it bound to a stage that no longer exists.
  const marqueeReleaseRef = useRef<((event: MouseEvent) => void) | null>(null)
  useEffect(
    () => () => {
      if (marqueeReleaseRef.current) window.removeEventListener('mouseup', marqueeReleaseRef.current)
    },
    []
  )
  const [unlockRatio, setUnlockRatio] = useState(false)
  // Bumped when an element's asset finishes loading — its Konva node appears AFTER selection,
  // so the attach effect must re-run then or a freshly added element never gets its frame.
  const [nodesReady, setNodesReady] = useState(0)
  const handleNodeReady = useCallback(() => setNodesReady((count) => count + 1), [])

  const drawGuides = useCallback(
    (guides: SnapGuide[]) => {
      const layer = guidesRef.current
      if (!layer) return
      layer.destroyChildren()
      for (const guide of guides) {
        layer.add(
          new Konva.Line({
            points:
              guide.axis === 'vertical'
                ? [guide.position, 0, guide.position, doc.canvas.h]
                : [0, guide.position, doc.canvas.w, guide.position],
            stroke: CHROME_DANGER,
            // Divided by the view scale so guides stay hairline at every zoom.
            strokeWidth: 1 / scale,
            dash: [4 / scale, 4 / scale],
            listening: false,
          })
        )
      }
      layer.batchDraw()
    },
    [doc.canvas, scale]
  )

  useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current
    if (!transformer || !stage) return
    // Match by predicate, never by '#id' selector: Konva compares selector strings verbatim (no
    // CSS unescaping), so an escaped uuid that starts with a digit silently matches nothing and
    // the selected node loses its Transformer frame.
    // Handles stay out of every non-edit mode: the eraser keeps its selection to brush on, and a
    // transform mid-stroke would desync the strokes from the element they were painted onto.
    // Locked ids are filtered here rather than left to the node's own flags: Konva's Transformer
    // moves and resizes whatever is attached to it, bypassing the node's `draggable`. Derived from
    // doc.nodes inside the effect so this does not re-run on every render over a fresh Set.
    const locked = new Set(doc.nodes.filter(isLocked).map((node) => node.id))
    const attachable =
      mode === 'edit'
        ? selection.ids
            .filter((id) => id !== editingId && !locked.has(id))
            .map((id) => stage.findOne((candidate: Konva.Node) => candidate.id() === id))
            .filter((node): node is Konva.Node => Boolean(node))
        : []
    transformer.nodes(attachable)
  }, [mode, selection.ids, editingId, doc.nodes, nodesReady])

  // Outline the node whose panel row the pointer is over, so a list of "Image / Image / Image"
  // still tells you which one is which.
  useEffect(() => {
    const layer = guidesRef.current
    const stage = stageRef.current
    const existing = layer?.findOne('.hover-outline')
    existing?.destroy()
    if (!layer || !stage || !hoveredId) {
      layer?.batchDraw()
      return
    }
    const node = stage.findOne((candidate: Konva.Node) => candidate.id() === hoveredId)
    // Redraw on the way out too: destroy() alone does not repaint, so bailing here without it
    // leaves the previous row's outline painted over a node the pointer has already left. Now that
    // every layers row hovers — not just the asset rows — this is reachable by moving the pointer
    // onto a hidden node's row, which has no Konva node to find.
    if (!node) {
      layer.batchDraw()
      return
    }
    const rect = node.getClientRect({ relativeTo: contentRef.current ?? undefined, ...MEASURE_BOX })
    layer.add(
      new Konva.Rect({
        ...rect,
        name: 'hover-outline',
        stroke: CHROME_SPRING,
        strokeWidth: 2 / scale,
        listening: false,
      })
    )
    layer.batchDraw()
  }, [hoveredId, scale, doc.nodes, nodesReady])

  // Shift is read live so the aspect lock can be released mid-resize.
  useEffect(() => {
    const track = (event: KeyboardEvent) => setUnlockRatio(event.shiftKey)
    window.addEventListener('keydown', track)
    window.addEventListener('keyup', track)
    return () => {
      window.removeEventListener('keydown', track)
      window.removeEventListener('keyup', track)
    }
  }, [])

  const scrim = scrimNodeAttrs(doc.scrim, doc.canvas)
  const src = naturalSize(backgroundImage)
  const primary = doc.nodes.find((node) => node.id === selection.primaryId)
  // Exhaustive on purpose: a kind that falls through here silently takes the TEXT transformer —
  // width-only anchors and an 80px floor — which the compiler cannot warn about.
  const selectedKind = selection.isMultiple
    ? 'multiple'
    : primary && isTextNode(primary)
      ? 'text'
      : primary && isShapeNode(primary) && primary.kind === 'line'
        ? 'line'
        : 'element'
  // The node the arc handle attaches to: one selected text layer, in plain editing, that fits on a
  // single line. `isSingleLine` measures, so it is gated behind the cheap checks.
  const arcTarget =
    mode === 'edit' && selectedKind === 'text' && primary && isTextNode(primary) && !isLocked(primary)
      ? isSingleLine(primary)
        ? primary
        : null
      : null

  // What a canvas gesture may touch. Hidden nodes are not on screen and locked ones are pinned, so
  // neither may be swept into a marquee, offer a snap edge, or be carried by a drag — but both stay
  // selectable from the layers list, which is what makes locking different from hiding.
  const grabbable = grabbableIds(doc)
  const docNodes = (layer: Konva.Layer) =>
    layer.find((candidate: Konva.Node) => grabbable.has(candidate.id()))

  const finishMarquee = useCallback(
    (additive: boolean) => {
      const marquee = marqueeRef.current
      const layer = contentRef.current
      if (!marquee) return
      const band = { ...marquee.rect.getAttrs() } as ReturnType<typeof rectFromPoints>
      marquee.rect.destroy()
      guidesRef.current?.batchDraw()
      marqueeRef.current = null
      if (!layer || band.width < 2 || band.height < 2) return
      const caught = idsIntersectingRect(
        layer
          .find((candidate: Konva.Node) => marquee.ids.has(candidate.id()))
          .map((node: Konva.Node) => ({
            id: node.id(),
            rect: node.getClientRect({ relativeTo: layer, ...MEASURE_BOX }),
          })),
        band
      )
      if (caught.length === 0) return
      onSelect(caught[0]!, additive)
      for (const id of caught.slice(1)) onSelect(id, true)
    },
    [onSelect]
  )

  const beginMarquee = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // A Space-drag across empty canvas is a pan, not a "click away" — it must not clear the work.
    if (viewport.panning || mode !== 'edit') return
    if (event.target !== event.target.getStage()) return
    if (!event.evt.shiftKey) onSelect(null)
    const layer = guidesRef.current
    const start = layer?.getRelativePointerPosition()
    if (!layer || !start) return
    const rect = new Konva.Rect({
      x: start.x,
      y: start.y,
      width: 0,
      height: 0,
      fill: CHROME_MARQUEE_FILL,
      stroke: CHROME_MARQUEE_STROKE,
      strokeWidth: 1 / scale,
      listening: false,
    })
    layer.add(rect)
    marqueeRef.current = { start, rect, ids: grabbable }
    // Konva only delivers pointer events over its own container, so a release anywhere else — the
    // properties panel, the top bar, outside the window — would leave the band stuck to the cursor.
    const release = (native: MouseEvent) => {
      window.removeEventListener('mouseup', release)
      marqueeReleaseRef.current = null
      finishMarquee(native.shiftKey)
    }
    marqueeReleaseRef.current = release
    window.addEventListener('mouseup', release)
  }

  const updateMarquee = () => {
    const marquee = marqueeRef.current
    const layer = guidesRef.current
    const point = layer?.getRelativePointerPosition()
    if (!marquee || !point) return
    marquee.rect.setAttrs(rectFromPoints(marquee.start, point))
    layer?.batchDraw()
  }

  // Snapping and persistence run here rather than inside each node: drag events bubble, so one
  // handler covers every kind of node and can see all of its siblings.
  const handleDragStart = (event: Konva.KonvaEventObject<DragEvent>) => {
    const node = event.target
    const layer = contentRef.current
    if (!layer || !grabbable.has(node.id())) return
    // Konva's Transformer drags a multi-selection by calling startDrag on every other attached
    // node, and each of those bubbles a dragstart back here. Only the first one is a new gesture.
    if (dragGestureRef.current) return

    // Dragging a node outside the selection takes the selection with it; dragging one already in
    // it moves the whole group — Konva's Transformer carries the peers.
    const withinSelection = selection.has(node.id())
    if (!withinSelection) onSelect(node.id(), event.evt.shiftKey)
    // Only the grabbable part of the selection travels: a locked node in a mixed selection must
    // stay put, and leaving it in would also cost the drag its snapping (groups do not snap).
    const moving = withinSelection ? selection.ids.filter((id) => grabbable.has(id)) : [node.id()]
    dragGestureRef.current = { leader: node, ids: moving }

    // Stops come only from nodes that are NOT moving: a node carried along by this gesture would
    // otherwise offer its own starting edges as a target and pin the group to where it began.
    const staying = new Set(moving)
    const siblings = docNodes(layer)
      .filter((candidate: Konva.Node) => !staying.has(candidate.id()))
      .map((candidate: Konva.Node) => candidate.getClientRect({ relativeTo: layer, ...MEASURE_BOX }))
    snapStopsRef.current = collectSnapStops(siblings, doc.canvas)
  }

  const handleDragMove = (event: Konva.KonvaEventObject<DragEvent>) => {
    const gesture = dragGestureRef.current
    const layer = contentRef.current
    const stops = snapStopsRef.current
    if (!gesture || !layer || !stops) return
    // The peers and the Transformer itself emit dragmove too; only the node under the pointer
    // drives the gesture.
    if (event.target !== gesture.leader) return
    // A group moves through Konva's own drag proxy, which reads the leader's position once at the
    // start — nudging the leader afterwards would shear the group, so groups do not snap.
    // Holding ⌘/Ctrl suspends snapping for a single node, the usual escape hatch.
    if (gesture.ids.length > 1 || event.evt.metaKey || event.evt.ctrlKey) {
      drawGuides([])
      return
    }
    const rect = gesture.leader.getClientRect({ relativeTo: layer, ...MEASURE_BOX })
    const { dx, dy, guides } = snapRect(rect, stops, SNAP_TOLERANCE / scale)
    if (dx !== 0 || dy !== 0) {
      gesture.leader.position({ x: gesture.leader.x() + dx, y: gesture.leader.y() + dy })
    }
    drawGuides(guides)
  }

  const handleDragEnd = () => {
    const gesture = dragGestureRef.current
    const layer = contentRef.current
    if (!gesture) return
    // Every node in the gesture fires its own dragend; the first one ends it for all of them.
    dragGestureRef.current = null
    snapStopsRef.current = null
    drawGuides([])
    if (!layer) return
    const placements = gesture.ids
      .map((id) => layer.findOne((candidate: Konva.Node) => candidate.id() === id))
      .filter((node): node is Konva.Node => Boolean(node))
      .map((node) => ({ id: node.id(), x: node.x(), y: node.y() }))
    if (placements.length > 0) onPlaceNodes(placements)
  }

  return (
    <Stage
      ref={stageRef}
      width={viewport.container.width}
      height={viewport.container.height}
      scaleX={scale}
      scaleY={scale}
      x={viewport.x}
      y={viewport.y}
      // Space-drag pans the whole view; the committed position is read back at drag end.
      draggable={viewport.panning}
      onMouseDown={beginMarquee}
      onTouchStart={beginMarquee}
      onMouseMove={updateMarquee}
      onTouchMove={updateMarquee}
      onTouchEnd={(event) => finishMarquee(event.evt.shiftKey)}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={(event) => {
        if (event.target === event.target.getStage()) {
          viewport.setPan(event.target.x(), event.target.y())
          return
        }
        handleDragEnd()
      }}
      onWheel={(event) => {
        // Reposition mode owns the wheel — there it crops the background rather than moving the view.
        if (mode === 'reposition') return
        // The inline-edit textarea is a DOM overlay placed once, so the view must hold still
        // underneath it until the edit is committed.
        if (editingId) return
        event.evt.preventDefault()
        const pointer = event.target.getStage()?.getPointerPosition()
        if (!pointer) return
        if (event.evt.ctrlKey || event.evt.metaKey) viewport.zoomByWheel(pointer, event.evt.deltaY)
        else viewport.panBy(-event.evt.deltaX, -event.evt.deltaY)
      }}
    >
      <Layer ref={contentRef}>
        {/* The sheet the composition sits on, so the canvas edge reads against the workspace —
            and so a background with alpha reads the same here as it bakes. */}
        <Rect
          x={0}
          y={0}
          width={doc.canvas.w}
          height={doc.canvas.h}
          fill={CANVAS_PAPER}
          listening={false}
        />
        <KonvaImage
          ref={backgroundRef}
          image={backgroundImage}
          listening={false}
          {...backgroundNodeAttrs(src, doc.canvas, doc.backgroundTransform)}
        />
        {/* Dim + lock the composition during background modes; the eraser needs full visibility.
            While Space is held the whole composition stops listening, so the drag pans the view
            instead of grabbing whichever node happens to be under the cursor. */}
        <Group
          opacity={mode === 'edit' || mode === 'erase' ? 1 : 0.35}
          listening={mode === 'edit' && !viewport.panning}
        >
          {scrim && <Rect listening={false} {...scrim} />}
          {/* One pass in doc order — the list IS the z-order, so a picture can sit between two
              text layers. v1 could only put the whole asset band above or below the whole text.
              Hidden nodes are dropped from the tree rather than rendered with visible={false}: an
              invisible Konva node still answers findOne, so the Transformer would happily attach a
              frame to something nobody can see. The cost is that unhiding re-mounts the node and
              re-requests its asset — served from cache, and worth it for the simpler invariant. */}
          {visibleNodes(doc).map((node) =>
            isTextNode(node) ? (
              <TextNode
                key={node.id}
                node={node}
                editing={editingId === node.id}
                locked={isLocked(node)}
                onSelect={(additive) => onSelect(node.id, additive)}
                onChange={(patch) => onNodeChange(node.id, patch)}
                onStartEdit={(text) => onStartEdit(node, text)}
              />
            ) : isShapeNode(node) ? (
              <ShapeNode
                key={node.id}
                node={node}
                locked={isLocked(node)}
                onSelect={(additive) => onSelect(node.id, additive)}
                onChange={(patch) => onNodeChange(node.id, patch)}
              />
            ) : (
              <ImageNode
                key={node.id}
                node={node}
                locked={isLocked(node)}
                onSelect={(additive) => onSelect(node.id, additive)}
                onChange={(patch) => onNodeChange(node.id, patch)}
                onNodeReady={handleNodeReady}
              />
            )
          )}
        </Group>
        <Transformer
          ref={transformerRef}
          // A multi-selection moves as a group but does not resize or rotate yet: each kind folds
          // a transform differently, and one gesture must not become one undo step per node.
          rotateEnabled={!selection.isMultiple}
          resizeEnabled={!selection.isMultiple}
          rotationSnaps={[-90, -45, 0, 45, 90, 180]}
          rotationSnapTolerance={6}
          {...transformerConfigFor(selectedKind, scale, unlockRatio)}
        />
        {/* Only for a single selected text node that can actually take an arc — a wrapped one
            cannot, and the toolbar slider says so in words. */}
        {arcTarget && (
          <ArcHandle
            node={arcTarget}
            scale={scale}
            onCommit={(bend) =>
              onNodeChange<CanvasTextNode>(arcTarget.id, {
                arcBend: bend === 0 ? undefined : bend,
                // Same exclusion the toolbar enforces: a marker band is a straight pill and cannot
                // sit under a curve.
                ...(bend === 0 ? {} : { highlight: undefined }),
              })
            }
          />
        )}
        {mode === 'reposition' && (
          <RepositionSurface
            interactive={!viewport.panning}
            transform={doc.backgroundTransform}
            src={src}
            canvas={doc.canvas}
            backgroundRef={backgroundRef}
            onCommit={onBackgroundTransform}
          />
        )}
        {(mode === 'inpaint' || mode === 'erase') && (
          <BrushSurface
            canvas={doc.canvas}
            interactive={!viewport.panning}
            brushSize={brushSize}
            strokes={strokes}
            strokeColor={mode === 'inpaint' ? INPAINT_STROKE_COLOR : ERASE_STROKE_COLOR}
            onStrokeEnd={onStrokeEnd}
          />
        )}
        {mode === 'lasso' && (
          <BrushSurface
            canvas={doc.canvas}
            interactive={!viewport.panning}
            brushSize={LASSO_PREVIEW_WIDTH}
            strokes={[]}
            strokeColor={LASSO_STROKE_COLOR}
            closedPreview
            onStrokeEnd={onStrokeEnd}
          />
        )}
      </Layer>
      {/* Alignment guides live above the composition and never take a click. */}
      <Layer ref={guidesRef} listening={false} />
    </Stage>
  )
}

interface RepositionSurfaceProps {
  /** False while Space is held, so the drag pans the view instead of the crop. */
  interactive: boolean
  transform: CanvasBackgroundTransform | undefined
  src: { width: number; height: number }
  canvas: { w: number; h: number }
  backgroundRef: React.RefObject<Konva.Image | null>
  onCommit: (transform: CanvasBackgroundTransform) => void
}

/**
 * The full-canvas gesture surface of reposition mode: drag pans, wheel zooms toward the pointer.
 * Previews mutate the background node's crop attrs directly (never per-frame React state); the
 * doc gets ONE commit per gesture — drag end, or a settled wheel burst — so undo steps stay sane.
 */
function RepositionSurface({
  interactive,
  transform,
  src,
  canvas,
  backgroundRef,
  onCommit,
}: RepositionSurfaceProps) {
  const rectRef = useRef<Konva.Rect>(null)
  const gestureRef = useRef<{
    startX: number
    startY: number
    base: CanvasBackgroundTransform
  } | null>(null)
  const pendingRef = useRef<CanvasBackgroundTransform | null>(null)
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const propsRef = useRef({ transform, onCommit })
  useEffect(() => {
    propsRef.current = { transform, onCommit }
  })

  // Reads refs only, so the first render's closure stays valid for the unmount cleanup.
  const flushPending = () => {
    if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
    if (!pendingRef.current) return
    propsRef.current.onCommit(pendingRef.current)
    pendingRef.current = null
  }

  // Leaving reposition mode unmounts this surface: flush a pending wheel commit, restore cursor.
  useEffect(() => {
    const container = rectRef.current?.getStage()?.container()
    if (container) container.style.cursor = 'grab'
    return () => {
      flushPending()
      if (container) container.style.cursor = ''
    }
  }, [])

  const current = () =>
    pendingRef.current ?? propsRef.current.transform ?? DEFAULT_BACKGROUND_TRANSFORM

  const preview = (next: CanvasBackgroundTransform) => {
    pendingRef.current = next
    const node = backgroundRef.current
    if (!node) return
    const crop = coverCrop(src.width, src.height, canvas.w, canvas.h, next)
    node.cropX(crop.cropX)
    node.cropY(crop.cropY)
    node.cropWidth(crop.cropWidth)
    node.cropHeight(crop.cropHeight)
  }

  return (
    <Rect
      ref={rectRef}
      x={0}
      y={0}
      width={canvas.w}
      height={canvas.h}
      listening={interactive}
      draggable={interactive}
      // Pinned drag: the surface never moves, we only read the pointer to pan the crop window.
      // dragBoundFunc returns an ABSOLUTE position, and the stage carries the view transform, so
      // the canvas origin sits at the stage's own position — not at (0, 0).
      dragBoundFunc={() => rectRef.current?.getStage()?.position() ?? { x: 0, y: 0 }}
      onDragStart={(event) => {
        // Pointer positions here are relative to this surface, so they are already canvas-space
        // whatever the view is zoomed or panned to.
        const pointer = event.target.getRelativePointerPosition()
        if (!pointer) return
        gestureRef.current = { startX: pointer.x, startY: pointer.y, base: current() }
      }}
      onDragMove={(event) => {
        const gesture = gestureRef.current
        const pointer = event.target.getRelativePointerPosition()
        if (!gesture || !pointer) return
        preview(
          panBackground(
            gesture.base,
            { dx: pointer.x - gesture.startX, dy: pointer.y - gesture.startY },
            src,
            canvas
          )
        )
      }}
      onDragEnd={() => {
        gestureRef.current = null
        flushPending()
      }}
      onWheel={(event) => {
        event.evt.preventDefault()
        const pointer = event.target.getRelativePointerPosition()
        if (!pointer) return
        const base = current()
        const target = base.zoom * Math.exp(-event.evt.deltaY * WHEEL_ZOOM_RATE)
        preview(zoomBackgroundTo(base, target, pointer, src, canvas))
        if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
        wheelTimerRef.current = setTimeout(flushPending, WHEEL_COMMIT_DELAY_MS)
      }}
    />
  )
}
