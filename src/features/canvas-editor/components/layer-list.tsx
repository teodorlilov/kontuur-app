'use client'

import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CanvasTextLayer } from '@/types/canvas'
import { PANEL_LABEL } from './panel-styles'

const ROLE_LABELS: Record<CanvasTextLayer['role'], string> = {
  headline: 'Headline',
  body: 'Body',
  custom: 'Text',
}

interface LayerListProps {
  layers: CanvasTextLayer[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
}

/** Text-layer list: select, delete, add. */
export function LayerList({ layers, selectedId, onSelect, onAdd, onRemove }: LayerListProps) {
  return (
    <div>
      <div className={cn(PANEL_LABEL, 'flex items-center justify-between')}>
        <span>Text layers</span>
        <button
          type="button"
          onClick={onAdd}
          title="Add text"
          className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-label text-text2"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {layers.length === 0 && (
          <p className="m-0 text-micro text-text2">
            No text yet — add a layer.
          </p>
        )}
        {layers.map((layer) => (
          <div
            key={layer.id}
            onClick={() => onSelect(layer.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              background: selectedId === layer.id ? 'rgba(15,21,18,0.04)' : 'transparent',
              border: selectedId === layer.id ? '1px solid var(--line2)' : '1px solid transparent',
            }}
          >
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-caption text-ink">
              <span style={{ color: 'var(--text2)', marginRight: 6 }}>
                {ROLE_LABELS[layer.role]}
              </span>
              {layer.text || '—'}
            </span>
            <button
              type="button"
              title="Delete layer"
              onClick={(event) => {
                event.stopPropagation()
                onRemove(layer.id)
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
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
