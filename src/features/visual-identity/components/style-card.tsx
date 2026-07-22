'use client'

import Image from 'next/image'
import { Check, ZoomIn } from 'lucide-react'
import type { BrandStyle } from '@/lib/visual/brand-styles'

/** Selectable brand-style card: portrait preview, name, one-liner, selected ring, zoom-to-lightbox. */
export function StyleCard({
  style,
  selected,
  onSelect,
  onPreview,
}: {
  style: BrandStyle
  selected: boolean
  onSelect: () => void
  onPreview: () => void
}) {
  return (
    <div
      onClick={onSelect}
      role="button"
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        border: selected ? '2px solid var(--color-terracotta)' : '0.5px solid var(--color-border-1)',
        background: 'var(--color-surface)',
        cursor: 'pointer',
        boxShadow: selected ? '0 2px 10px rgba(192,123,85,0.18)' : '0 1px 4px rgba(44,62,80,0.05)',
        transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '3 / 4', background: 'rgba(44,62,80,0.04)' }}>
        <Image
          src={style.previewSrc}
          alt={`${style.name} preview`}
          fill
          sizes="220px"
          style={{ objectFit: 'cover' }}
        />
        <button
          type="button"
          title="Preview full size"
          onClick={(e) => {
            e.stopPropagation()
            onPreview()
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 26,
            height: 26,
            borderRadius: 7,
            border: 'none',
            background: 'rgba(255,255,255,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-in',
            color: '#3A4A54',
          }}
        >
          <ZoomIn style={{ width: 14, height: 14 }} />
        </button>
        {selected && (
          <span
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'var(--color-terracotta)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check style={{ width: 13, height: 13, color: '#fff' }} />
          </span>
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-1)' }}>{style.name}</div>
        <div style={{ fontSize: 10.5, color: 'var(--color-muted)', lineHeight: 1.45, marginTop: 3 }}>
          {style.description}
        </div>
      </div>
    </div>
  )
}
