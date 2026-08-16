'use client'

import {
  ArrowDownToLine,
  ArrowUpToLine,
  Crop,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  ImageDown,
  Layers,
  Minus,
  Move3d,
  SprayCan,
  Squircle,
  Trash2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { isImageNode, isShapeNode, isTextNode } from '@/lib/canvas/doc-nodes'
import type {
  CanvasDoc,
  CanvasImageNode,
  CanvasScrim,
  CanvasShapeNode,
  CanvasTextNode,
} from '@/types/canvas'
import type { Palette } from '@/types/visual'
import { EDITOR_BUTTON, EDITOR_ICON_BUTTON, EDITOR_PRESSED, TOOLBAR_DIVIDER } from './chrome'

/** What an outline starts at when a shape is first given one. */
const DEFAULT_STROKE_WIDTH = 4
import { TextToolbar } from './text-toolbar'
import { NODE_KIND_META } from './node-kinds'
import { ColorPopover, SliderPopover } from './toolbar-controls'

interface SelectionToolbarProps {
  doc: CanvasDoc
  palette: Palette
  /** The whole selection, in the order it was built. The last entry drives the single-node bars. */
  selectedIds: string[]
  busy: { removingBackground: boolean }
  onTextChange: (id: string, patch: Partial<CanvasTextNode>) => void
  onAssetChange: (id: string, patch: Partial<CanvasImageNode>) => void
  onShapeChange: (id: string, patch: Partial<CanvasShapeNode>) => void
  onMoveNode: (id: string, direction: 'up' | 'down', toEdge?: boolean) => void
  onRemoveNodes: (ids: string[]) => void
  onSetNodeAsBackground: () => void
  onRemoveNodeBackground: () => void
  onEraseSelected: () => void
  onToggleReposition: () => void
  onScrimChange: (patch: Partial<CanvasScrim>) => void
}

/**
 * The bar above the canvas, showing the controls for whatever is selected: a text layer, a placed
 * element, several things at once, or — with nothing selected — the slide itself.
 */
export function SelectionToolbar(props: SelectionToolbarProps) {
  const { doc, selectedIds } = props
  const primaryId = selectedIds.at(-1) ?? null
  const selected = doc.nodes.find((node) => node.id === primaryId) ?? null

  return (
    <div className="flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-paper px-3">
      {selectedIds.length > 1 ? (
        <MultiToolbar {...props} />
      ) : selected && isTextNode(selected) ? (
        <>
          <TextToolbar
            node={selected}
            palette={props.palette}
            onChange={(patch) => props.onTextChange(selected.id, patch)}
          />
          <span className={TOOLBAR_DIVIDER} aria-hidden />
          <OrderControls id={selected.id} {...props} />
        </>
      ) : selected && isImageNode(selected) ? (
        <AssetToolbar node={selected} {...props} />
      ) : selected && isShapeNode(selected) ? (
        <ShapeToolbar node={selected} {...props} />
      ) : (
        // Nothing selected — the slide itself. A NODE reaching this branch would silently show
        // slide-level controls for something the user has selected, so every kind is named above.
        <CanvasToolbar {...props} />
      )}
    </div>
  )
}

function MultiToolbar({ selectedIds, ...props }: SelectionToolbarProps) {
  return (
    <>
      <span className="inline-flex items-center gap-1.5 font-sans text-caption text-text2">
        <Layers size={14} aria-hidden /> Several objects selected
      </span>
      <span className={TOOLBAR_DIVIDER} aria-hidden />
      <span className="font-sans text-micro text-text3">
        Drag to move them together · Delete removes them all
      </span>
      <span className="flex-1" />
      {/* The whole selection, which is what the hint beside it promises — this used to delete only
          the primary node while claiming to remove them all. */}
      <IconAction
        label={`Delete ${selectedIds.length} objects`}
        icon={<Trash2 size={15} aria-hidden />}
        onClick={() => props.onRemoveNodes(selectedIds)}
      />
    </>
  )
}

function AssetToolbar({ node, ...props }: SelectionToolbarProps & { node: CanvasImageNode }) {
  return (
    <>
      <SliderPopover
        label="Opacity"
        icon={<Move3d size={15} aria-hidden />}
        readout={`${Math.round((node.opacity ?? 1) * 100)}%`}
        min={0.1}
        max={1}
        step={0.05}
        value={node.opacity ?? 1}
        onChange={(opacity) => props.onAssetChange(node.id, { opacity })}
      />

      <IconAction
        label="Flip horizontally"
        pressed={node.flipX === true}
        icon={<FlipHorizontal2 size={15} aria-hidden />}
        onClick={() => props.onAssetChange(node.id, { flipX: !node.flipX || undefined })}
      />
      <IconAction
        label="Flip vertically"
        pressed={node.flipY === true}
        icon={<FlipVertical2 size={15} aria-hidden />}
        onClick={() => props.onAssetChange(node.id, { flipY: !node.flipY || undefined })}
      />

      <span className={TOOLBAR_DIVIDER} aria-hidden />

      <button
        type="button"
        className={EDITOR_BUTTON}
        disabled={props.busy.removingBackground}
        title="Drop a flat background colour out of this picture"
        onClick={props.onRemoveNodeBackground}
      >
        <SprayCan size={14} aria-hidden /> Remove background
      </button>
      <button
        type="button"
        className={EDITOR_BUTTON}
        title="Rub parts of this picture away by hand"
        onClick={props.onEraseSelected}
      >
        <Eraser size={14} aria-hidden /> Erase
      </button>
      <button
        type="button"
        className={EDITOR_BUTTON}
        title="Make this the slide's background image"
        onClick={props.onSetNodeAsBackground}
      >
        <ImageDown size={14} aria-hidden /> Set as background
      </button>

      <span className="flex-1" />
      {/* Stacking replaces v1's "in front of text" toggle: the node list holds every kind, so a
          picture moves past the text the same way it moves past another picture. */}
      <OrderControls id={node.id} {...props} />
      <IconAction
        label="Delete this picture"
        icon={<Trash2 size={15} aria-hidden />}
        onClick={() => props.onRemoveNodes([node.id])}
      />
    </>
  )
}

function ShapeToolbar({ node, ...props }: SelectionToolbarProps & { node: CanvasShapeNode }) {
  const change = (patch: Partial<CanvasShapeNode>) => props.onShapeChange(node.id, patch)
  return (
    <>
      <span className="inline-flex shrink-0 items-center gap-1.5 font-sans text-caption text-text2">
        {NODE_KIND_META[node.kind].label}
      </span>
      <span className={TOOLBAR_DIVIDER} aria-hidden />

      {/* A line has no interior, so it is offered a stroke colour and nothing else. */}
      {node.kind !== 'line' && (
        <ColorPopover
          label="Fill"
          palette={props.palette}
          value={node.fill ?? props.palette.accent}
          onChange={(fill) => change({ fill })}
        />
      )}
      <ColorPopover
        label={node.kind === 'line' ? 'Colour' : 'Outline'}
        palette={props.palette}
        value={node.stroke ?? props.palette.ink}
        onChange={(stroke) => change({ stroke, strokeWidth: node.strokeWidth ?? DEFAULT_STROKE_WIDTH })}
      />
      <SliderPopover
        label={node.kind === 'line' ? 'Thickness' : 'Outline width'}
        icon={<Minus size={15} aria-hidden />}
        readout={`${node.strokeWidth ?? 0}px`}
        min={node.kind === 'line' ? 1 : 0}
        max={40}
        step={1}
        value={node.strokeWidth ?? 0}
        onChange={(strokeWidth) => change({ strokeWidth })}
      />
      {node.kind === 'rect' && (
        <SliderPopover
          label="Corner radius"
          icon={<Squircle size={15} aria-hidden />}
          readout={`${node.cornerRadius ?? 0}px`}
          min={0}
          max={200}
          step={2}
          value={node.cornerRadius ?? 0}
          onChange={(cornerRadius) => change({ cornerRadius })}
        />
      )}
      <SliderPopover
        label="Opacity"
        icon={<Move3d size={15} aria-hidden />}
        readout={`${Math.round((node.opacity ?? 1) * 100)}%`}
        min={0.1}
        max={1}
        step={0.05}
        value={node.opacity ?? 1}
        onChange={(opacity) => change({ opacity })}
      />

      <span className="flex-1" />
      <OrderControls id={node.id} {...props} />
      <IconAction
        label="Delete this shape"
        icon={<Trash2 size={15} aria-hidden />}
        onClick={() => props.onRemoveNodes([node.id])}
      />
    </>
  )
}

function CanvasToolbar(props: SelectionToolbarProps) {
  const { scrim } = props.doc
  return (
    <>
      {/* Only the instant slide controls live here. Everything that calls a model — repair, cut
          out, lasso, expand — is in the AI panel instead: each takes about a minute and needs a
          sentence explaining it, and a toolbar can give it neither. */}
      {/* No pressed state: entering the mode swaps this whole bar for the ModeBar. */}
      <button
        type="button"
        className={EDITOR_BUTTON}
        title="Pan and zoom the background inside the frame"
        onClick={props.onToggleReposition}
      >
        <Crop size={14} aria-hidden /> Reposition
      </button>

      <span className={TOOLBAR_DIVIDER} aria-hidden />

      <button
        type="button"
        aria-pressed={scrim.enabled}
        title="Darken the image behind the text so it stays readable"
        onClick={() => props.onScrimChange({ enabled: !scrim.enabled })}
        className={cn(EDITOR_BUTTON, scrim.enabled && EDITOR_PRESSED)}
      >
        Contrast scrim
      </button>
      {scrim.enabled && (
        <>
          <select
            aria-label="Scrim coverage"
            title="Scrim coverage"
            value={scrim.mode}
            onChange={(event) =>
              props.onScrimChange({ mode: event.target.value as CanvasScrim['mode'] })
            }
            className={cn(EDITOR_BUTTON, 'cursor-pointer')}
          >
            <option value="bottom">Bottom band</option>
            <option value="full">Full canvas</option>
          </select>
          <ColorPopover
            label="Scrim colour"
            palette={props.palette}
            value={scrim.color}
            onChange={(color) => props.onScrimChange({ color })}
          />
          <SliderPopover
            label="Scrim strength"
            icon={<Move3d size={15} aria-hidden />}
            readout={`${Math.round(scrim.opacity * 100)}%`}
            min={0}
            max={1}
            step={0.05}
            value={scrim.opacity}
            onChange={(opacity) => props.onScrimChange({ opacity })}
          />
        </>
      )}
    </>
  )
}

/** Stacking controls, shared by the text and element bars. */
function OrderControls({
  id,
  onMoveNode,
}: {
  id: string
  onMoveNode: SelectionToolbarProps['onMoveNode']
}) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Stacking order">
      <IconAction
        label="Bring forward (⌘])"
        icon={<ArrowUpToLine size={15} aria-hidden />}
        onClick={() => onMoveNode(id, 'up')}
      />
      <IconAction
        label="Send backward (⌘[)"
        icon={<ArrowDownToLine size={15} aria-hidden />}
        onClick={() => onMoveNode(id, 'down')}
      />
    </div>
  )
}

function IconAction({
  label,
  icon,
  pressed,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  /** Present only for toggles; omitted for one-shot actions, which have no on-state. */
  pressed?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(EDITOR_ICON_BUTTON, pressed && EDITOR_PRESSED)}
    >
      {icon}
    </button>
  )
}
