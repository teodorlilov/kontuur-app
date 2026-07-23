'use client'

import { Plus, Trash2 } from 'lucide-react'
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
      <div style={{ ...PANEL_LABEL, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Text layers</span>
        <button
          type="button"
          onClick={onAdd}
          title="Add text"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: 'var(--color-text-2)', fontSize: '10px', cursor: 'pointer', padding: 0 }}
        >
          <Plus size={12} /> Add
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {layers.length === 0 && (
          <p style={{ fontSize: '11px', color: 'var(--color-muted)', margin: 0 }}>No text yet — add a layer.</p>
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
              background: selectedId === layer.id ? 'var(--color-overlay)' : 'transparent',
              border: selectedId === layer.id ? '0.5px solid var(--color-border-2)' : '0.5px solid transparent',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--color-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--color-muted)', marginRight: 6 }}>{ROLE_LABELS[layer.role]}</span>
              {layer.text || '—'}
            </span>
            <button
              type="button"
              title="Delete layer"
              onClick={(event) => {
                event.stopPropagation()
                onRemove(layer.id)
              }}
              style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', cursor: 'pointer', padding: 2, display: 'inline-flex' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
