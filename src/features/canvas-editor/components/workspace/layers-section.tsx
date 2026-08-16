'use client'

import { useRef, useState } from 'react'
import { Eye, EyeOff, Lock, Trash2, Type, Unlock } from 'lucide-react'
import { cn } from '@/utils/cn'
import { focusableItems, rovingFocus } from '@/components/ui/roving-focus'
import { isHidden, isLocked, isShapeNode, isTextNode } from '@/lib/canvas/doc-nodes'
import type { CanvasDoc, CanvasNode } from '@/types/canvas'
import { docIndexForRow, layerRows, slotForRowStep } from '../../lib/layer-rows'
import { EDITOR_ICON_BUTTON, EDITOR_PRESSED } from './chrome'
import { NODE_KIND_META, nodeLabel } from './node-kinds'

interface LayersSectionProps {
  doc: CanvasDoc
  /** Every selected id, not just the primary — the canvas supports multi-select, so this must too. */
  selectedIds: string[]
  /** `additive` is Shift-click: extend the selection rather than replace it, as on the canvas. */
  onSelect: (id: string, additive: boolean) => void
  /** Pointer entered/left a row — the stage outlines the matching node. */
  onHover: (id: string | null) => void
  onToggleHidden: (node: CanvasNode) => void
  onToggleLocked: (node: CanvasNode) => void
  onRemove: (id: string) => void
  /** Drop a node at an exact doc index (post-removal, as `reorderNodeInDoc` expects). */
  onReorder: (id: string, toIndex: number) => void
}

/**
 * Every node on the slide in one list, topmost first — text and pictures together, because in v2
 * they share a single stacking order and a panel that split them could not express "this logo sits
 * between these two headlines".
 *
 * Reordering is a drag, ⌥↑/⌥↓ on a focused row, or ⌘]/⌘[ on the canvas selection — three routes to
 * the same operation, because a layers panel that only restacks by dragging is unusable without a
 * pointer.
 */
export function LayersSection(props: LayersSectionProps) {
  const { doc, selectedIds } = props
  const rows = layerRows(doc)
  const selected = new Set(selectedIds)
  const listRef = useRef<HTMLUListElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Which gap the pointer is currently over, 0..rows.length. Held by the list, not the row, so only
  // one indicator can ever be lit.
  const [overSlot, setOverSlot] = useState<number | null>(null)

  if (rows.length === 0) {
    return (
      <p className="m-0 text-micro text-text2">
        Nothing on this slide yet — add text, upload a picture, or paste one onto the canvas.
      </p>
    )
  }

  const endDrag = () => {
    setDraggingId(null)
    setOverSlot(null)
  }

  const dropInto = (slot: number) => {
    if (draggingId) props.onReorder(draggingId, docIndexForRow(doc, draggingId, slot))
    endDrag()
  }

  return (
    // role="list" is explicit: Tailwind's Preflight strips list semantics from every ul.
    // NOT a listbox — `option` is children-presentational, which would hide each row's own
    // eye, lock and delete buttons from assistive tech.
    <ul
      ref={listRef}
      role="list"
      aria-label="Layers, topmost first"
      className="m-0 flex list-none flex-col p-0"
      onKeyDown={(event) => {
        const items = focusableItems(listRef.current, '[data-layer-row]')
        // ⌥↑/⌥↓ reorders the focused row; the bare arrows move focus. Without this the panel is
        // pointer-only, since a drag is the only other way to restack.
        if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault()
          // The window-level editor shortcuts also answer to the arrows (1px nudge), and a focused
          // row is not an input, so they would fire too.
          event.stopPropagation()
          const index = items.indexOf(document.activeElement as HTMLElement)
          const node = rows[index]
          if (!node) return
          const direction = event.key === 'ArrowUp' ? 'up' : 'down'
          props.onReorder(node.id, docIndexForRow(doc, node.id, slotForRowStep(index, direction)))
          // The row moves under the focus ring, so follow it to its new place.
          requestAnimationFrame(() =>
            focusableItems(listRef.current, '[data-layer-row]')[
              direction === 'up' ? Math.max(0, index - 1) : Math.min(rows.length - 1, index + 1)
            ]?.focus()
          )
          return
        }
        rovingFocus(event, items)
      }}
      onDragOver={(event) => {
        // preventDefault unconditionally, even for a payload we will ignore: without it a file
        // dragged from the desktop onto the rail navigates the tab away from unsaved work.
        event.preventDefault()
        if (draggingId) event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        // relatedTarget, not a bare leave: crossing a row inside the list fires dragleave on the
        // list and would flicker the indicator off on every row boundary.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverSlot(null)
      }}
    >
      {rows.map((node, index) => (
        <li key={node.id} className="relative">
          <DropLine active={overSlot === index} />
          <LayerRow
            node={node}
            selected={selected.has(node.id)}
            // A roving list needs exactly one tabbable row. Keying that on selection alone left the
            // whole panel unreachable by keyboard whenever nothing was selected — which is the
            // state you are in when you first Tab towards it.
            tabbable={selected.size === 0 ? index === 0 : selected.has(node.id)}
            dragging={draggingId === node.id}
            onDragStart={() => setDraggingId(node.id)}
            onDragEnd={endDrag}
            // Above the row's midpoint targets the gap before it, below targets the gap after.
            onDragOverRow={(before) => setOverSlot(before ? index : index + 1)}
            onDropRow={(before) => dropInto(before ? index : index + 1)}
            {...props}
          />
        </li>
      ))}
      {/* The gap below the last row, so a node can be sent to the very back. */}
      <li
        className="relative h-2"
        onDragOver={(event) => {
          event.preventDefault()
          setOverSlot(rows.length)
        }}
        onDrop={(event) => {
          event.preventDefault()
          dropInto(rows.length)
        }}
      >
        <DropLine active={overSlot === rows.length} />
      </li>
    </ul>
  )
}

/** Where the dragged row will land. Always present so rows do not jump as it appears. */
function DropLine({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded-full transition-opacity duration-150 ease-contour',
        active ? 'bg-forest opacity-100' : 'opacity-0'
      )}
    />
  )
}

interface LayerRowProps extends LayersSectionProps {
  node: CanvasNode
  selected: boolean
  /** The one row in the list that Tab reaches; the arrows move focus from there. */
  tabbable: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOverRow: (before: boolean) => void
  onDropRow: (before: boolean) => void
}

function LayerRow({ node, selected, tabbable, dragging, ...props }: LayerRowProps) {
  const hidden = isHidden(node)
  const locked = isLocked(node)
  // Above the midpoint means "insert before this row".
  const isBefore = (event: React.DragEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    return event.clientY < box.top + box.height / 2
  }

  return (
    <div
      // text/plain and effectAllowed 'move', matching the calendar's drag protocol: Safari drops
      // payloads on unregistered MIME types, and this is one id rather than a document.
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', node.id)
        event.dataTransfer.effectAllowed = 'move'
        props.onDragStart()
      }}
      onDragEnd={props.onDragEnd}
      onDragOver={(event) => {
        event.preventDefault()
        props.onDragOverRow(isBefore(event))
      }}
      onDrop={(event) => {
        event.preventDefault()
        props.onDropRow(isBefore(event))
      }}
      onMouseEnter={() => props.onHover(node.id)}
      onMouseLeave={() => props.onHover(null)}
      className={cn(
        'flex items-center gap-1.5 rounded-sm border px-1.5 py-1',
        selected ? 'border-line2 bg-ink/[0.04]' : 'border-transparent hover:bg-ink/[0.02]',
        dragging && 'opacity-40'
      )}
    >
      <button
        type="button"
        data-layer-row
        tabIndex={tabbable ? 0 : -1}
        aria-pressed={selected}
        onClick={(event) => props.onSelect(node.id, event.shiftKey)}
        className={cn(
          'flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xs text-left',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring',
          hidden && 'opacity-40'
        )}
      >
        <Thumbnail node={node} />
        <span className="min-w-0 flex-1 truncate text-caption text-ink">{nodeLabel(node)}</span>
        {/* opacity-40 is a visual-only signal; the state has to be spoken too. */}
        {hidden && <span className="sr-only">, hidden</span>}
        {locked && <span className="sr-only">, locked</span>}
      </button>

      <RowToggle
        on={hidden}
        onLabel="Show this layer"
        offLabel="Hide this layer"
        onIcon={<EyeOff size={13} aria-hidden />}
        offIcon={<Eye size={13} aria-hidden />}
        onClick={() => props.onToggleHidden(node)}
      />
      <RowToggle
        on={locked}
        onLabel="Unlock this layer"
        offLabel="Lock this layer"
        onIcon={<Lock size={13} aria-hidden />}
        offIcon={<Unlock size={13} aria-hidden />}
        onClick={() => props.onToggleLocked(node)}
      />
      <button
        type="button"
        title="Delete this layer"
        aria-label="Delete this layer"
        disabled={locked}
        onClick={() => props.onRemove(node.id)}
        className={cn(EDITOR_ICON_BUTTON, 'size-6')}
      >
        <Trash2 size={13} aria-hidden />
      </button>
    </div>
  )
}

function RowToggle({
  on,
  onLabel,
  offLabel,
  onIcon,
  offIcon,
  onClick,
}: {
  on: boolean
  onLabel: string
  offLabel: string
  onIcon: React.ReactNode
  offIcon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={on ? onLabel : offLabel}
      aria-label={on ? onLabel : offLabel}
      aria-pressed={on}
      onClick={onClick}
      className={cn(EDITOR_ICON_BUTTON, 'size-6', on && EDITOR_PRESSED)}
    >
      {on ? onIcon : offIcon}
    </button>
  )
}

/** A 32px chip that says which node this row is, without making the reader parse the name. */
function Thumbnail({ node }: { node: CanvasNode }) {
  if (isTextNode(node)) {
    const glyphs = node.text.trim().slice(0, 2)
    return (
      <span
        aria-hidden
        className={cn(
          'grid size-8 shrink-0 place-items-center overflow-hidden rounded-xs border border-line bg-sunken text-title text-ink',
          node.italic && 'italic',
          // The utility, not a .toUpperCase()'d string: capitals are a render flag on the node, so
          // the DOM text stays in its stored casing for screen readers — the same split
          // use-inline-text-edit makes for the textarea overlay.
          node.uppercase && 'uppercase'
        )}
        // The family is the one thing here that is genuinely per-node data.
        style={{ fontFamily: `"${node.fontFamily}", sans-serif` }}
      >
        {glyphs || <Type size={13} className="text-text3" />}
      </span>
    )
  }
  const { Icon } = NODE_KIND_META[node.kind]
  if (isShapeNode(node)) {
    // A shape has no bitmap to show, so the chip IS the shape's own colour.
    return (
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-xs border border-line bg-sunken"
        style={{ color: node.fill ?? node.stroke ?? 'var(--text3)' }}
      >
        <Icon size={16} strokeWidth={node.kind === 'line' ? 2.5 : 1.8} />
      </span>
    )
  }
  return (
    <span className="relative size-8 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- a stored canvas asset; next/image
          would round-trip it through the optimizer for a 32px chip. crossOrigin matches the entry
          the stage's loader already populated, so this reuses that fetch rather than issuing a
          second one under different CORS settings. */}
      <img
        src={node.src.publicUrl}
        alt=""
        crossOrigin="anonymous"
        draggable={false}
        width={32}
        height={32}
        className={cn(
          'size-8 rounded-xs border border-line bg-sunken object-contain',
          // The chip mirrors what the canvas shows, or the row lies about the layer.
          node.flipX && '-scale-x-100',
          node.flipY && '-scale-y-100'
        )}
      />
      <Icon
        size={11}
        aria-hidden
        className="absolute -bottom-0.5 -right-0.5 rounded-xs bg-paper text-text3"
      />
    </span>
  )
}

