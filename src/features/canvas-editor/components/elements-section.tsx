'use client'

import { useRef, useState } from 'react'
import { cn } from '@/utils/cn'
import {
  ChevronDown,
  ChevronUp,
  Eraser,
  Image as ImageIcon,
  Lasso,
  Scissors,
  Shapes,
  Sparkles,
  Trash2,
  Upload,
  Wallpaper,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import type { CanvasElement } from '@/types/canvas'
import { PanelButton } from './panel-button'
import { PanelCheckbox } from './panel-checkbox'
import { PanelSlider } from './panel-slider'
import { PANEL_CONTROL, PANEL_LABEL } from './panel-styles'

const KIND_ICONS = { image: ImageIcon, svg: Shapes } as const

interface ElementsSectionProps {
  elements: CanvasElement[]
  selectedId: string | null
  uploading: boolean
  isolating: boolean
  onSelect: (id: string) => void
  onMove: (id: string, direction: 'up' | 'down') => void
  onRemove: (id: string) => void
  onOpacityChange: (id: string, opacity: number) => void
  onAboveTextChange: (id: string, aboveText: boolean) => void
  generatingSvg: boolean
  removingBackground: boolean
  onUpload: (file: File) => void
  onIsolate: () => void
  onLassoCut: () => void
  onEraseSelected: () => void
  onGenerateSvg: (prompt: string) => void
  onRemoveBackground: () => void
  onSetAsBackground: () => void
}

/** Element band controls: list (z-order = list order, topmost first), opacity, asset actions. */
export function ElementsSection(props: ElementsSectionProps) {
  const {
    elements,
    selectedId,
    uploading,
    isolating,
    onSelect,
    onMove,
    onRemove,
    onOpacityChange,
    onUpload,
    onIsolate,
  } = props
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [svgPrompt, setSvgPrompt] = useState('')
  const selected = elements.find((element) => element.id === selectedId) ?? null
  // Topmost element first in the list — matches how designers read layer panels.
  const ordered = [...elements].reverse()

  return (
    <div>
      <div className={cn(PANEL_LABEL, 'flex items-center justify-between')}>
        <span>Elements</span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Upload an image element (logo, graphic)"
          disabled={uploading}
          className={cn(
            'inline-flex items-center gap-1 border-none bg-transparent p-0 text-label text-text2',
            uploading ? 'cursor-default' : 'cursor-pointer'
          )}
        >
          {uploading ? <Spinner size="sm" /> : <Upload size={12} />} Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onUpload(file)
            event.target.value = ''
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {elements.length === 0 && (
          <p className="m-0 text-micro text-text2">
            No elements yet — upload a logo or graphic.
          </p>
        )}
        {ordered.map((element) => (
          <ElementRow
            key={element.id}
            element={element}
            selected={selectedId === element.id}
            onSelect={() => onSelect(element.id)}
            onMove={(direction) => onMove(element.id, direction)}
            onRemove={() => onRemove(element.id)}
          />
        ))}
      </div>
      <PanelButton
        onClick={onIsolate}
        busy={isolating}
        icon={<Scissors size={12} />}
        title="Cut the main subject out as a movable element — the background stays intact underneath"
        className="mt-2"
      >
        Cut out subject
      </PanelButton>
      <PanelButton
        onClick={props.onLassoCut}
        icon={<Lasso size={12} />}
        title="Draw a loop around anything to cut it out — no AI, instant"
        className="mt-2"
      >
        Lasso cut
      </PanelButton>
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
        <input
          type="text"
          value={svgPrompt}
          placeholder="e.g. hand-drawn arrow"
          onChange={(event) => setSvgPrompt(event.target.value)}
          className={cn(PANEL_CONTROL, 'flex-1')}
        />
        <PanelButton
          onClick={() => {
            const prompt = svgPrompt.trim()
            if (prompt) props.onGenerateSvg(prompt)
          }}
          busy={props.generatingSvg}
          disabled={!svgPrompt.trim()}
          icon={<Sparkles size={12} />}
          title="Generate a vector graphic in the client's brand palette (~10s)"
          className="w-auto"
        />
      </div>
      {selected && (
        <div className="mt-2.5">
          <PanelSlider
            label={`Opacity · ${Math.round((selected.opacity ?? 1) * 100)}%`}
            min={0.05}
            max={1}
            step={0.05}
            value={selected.opacity ?? 1}
            onChange={(opacity) => onOpacityChange(selected.id, opacity)}
          />
          <div className="mt-2">
            <PanelCheckbox
              label="In front of text"
              checked={selected.aboveText ?? false}
              onChange={(checked) => props.onAboveTextChange(selected.id, checked)}
            />
          </div>
          {selected.kind === 'image' && (
            <PanelButton
              onClick={props.onSetAsBackground}
              icon={<Wallpaper size={12} />}
              title="Fill the whole slide with this image (replaces the background and removes it as an element)"
              className="mt-2"
            >
              Set as background
            </PanelButton>
          )}
          <PanelButton
            onClick={props.onRemoveBackground}
            busy={props.removingBackground}
            icon={<ImageIcon size={12} />}
            title="Key out the element's flat background colour (border colours go transparent)"
            className="mt-2"
          >
            Remove background
          </PanelButton>
          {selected.kind === 'image' && (
            <PanelButton
              onClick={props.onEraseSelected}
              icon={<Eraser size={12} />}
              title="Brush away parts of this element"
              className="mt-2"
            >
              Erase parts
            </PanelButton>
          )}
        </div>
      )}
    </div>
  )
}

function ElementRow({
  element,
  selected,
  onSelect,
  onMove,
  onRemove,
}: {
  element: CanvasElement
  selected: boolean
  onSelect: () => void
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
}) {
  const Icon = KIND_ICONS[element.kind]
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 8px',
        borderRadius: '6px',
        cursor: 'pointer',
        background: selected ? 'rgba(15,21,18,0.04)' : 'transparent',
        border: selected ? '1px solid var(--line2)' : '1px solid transparent',
      }}
    >
      <Icon size={13} style={{ color: 'var(--text2)', flexShrink: 0 }} />
      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-caption text-ink">
        {element.kind === 'svg' ? 'Vector' : 'Image'}
      </span>
      <RowButton title="Bring forward" onClick={() => onMove('up')}>
        <ChevronUp size={13} />
      </RowButton>
      <RowButton title="Send backward" onClick={() => onMove('down')}>
        <ChevronDown size={13} />
      </RowButton>
      <RowButton title="Delete element" onClick={onRemove}>
        <Trash2 size={13} />
      </RowButton>
    </div>
  )
}

function RowButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      style={{
        border: 'none',
        background: 'transparent',
        color: 'var(--text2)',
        cursor: 'pointer',
        padding: 2,
        display: 'inline-flex',
      }}
    >
      {children}
    </button>
  )
}
