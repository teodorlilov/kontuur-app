'use client'

import Image from 'next/image'
import { Sparkles, RefreshCw } from 'lucide-react'
import type { DraftVisual } from '@/features/generate/lib/draft-visuals'

/**
 * Per-slide visual slot for in-memory wizard drafts: spinner while generating, preview when done,
 * retry on error. Uploads/deletes don't exist here — the post_images row is created on approve.
 */
export function DraftVisualSlot({
  visual,
  altText,
  onRegenerate,
}: {
  visual: DraftVisual | undefined
  /** Slide headline (or caption excerpt) used as the preview's alt text. */
  altText: string
  onRegenerate: () => void
}) {
  if (!visual) {
    return (
      <ActionPanel onClick={onRegenerate} icon={<Sparkles style={{ width: 12, height: 12 }} />} label="Generate visual" />
    )
  }

  if (visual.status === 'generating') {
    return (
      <div style={panelStyle('rgba(192,123,85,0.45)', 'rgba(192,123,85,0.04)')}>
        <Sparkles style={{ width: 14, height: 14, color: '#C07B55' }} className="animate-pulse" />
        <span style={{ fontSize: 11, color: '#C07B55' }}>Generating visual…</span>
      </div>
    )
  }

  if (visual.status === 'error' || !visual.publicUrl) {
    return (
      <ActionPanel
        onClick={onRegenerate}
        icon={<RefreshCw style={{ width: 12, height: 12 }} />}
        label="Visual failed — retry"
        tone="error"
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ borderRadius: 10, overflow: 'hidden', border: '0.5px solid var(--color-border-1)' }}>
        <Image
          src={visual.publicUrl}
          alt={altText}
          width={512}
          height={512}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>
      <button
        type="button"
        onClick={onRegenerate}
        style={{
          alignSelf: 'flex-end',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 8px',
          border: 'none',
          borderRadius: 6,
          background: 'rgba(192,123,85,0.08)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 10,
          fontWeight: 500,
          color: '#C07B55',
        }}
      >
        <Sparkles style={{ width: 11, height: 11 }} />
        Regenerate
      </button>
    </div>
  )
}

function panelStyle(borderColor: string, background: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '16px 12px',
    border: `1.5px dashed ${borderColor}`,
    borderRadius: 10,
    background,
    width: '100%',
    fontFamily: 'inherit',
  }
}

function ActionPanel({
  onClick,
  icon,
  label,
  tone,
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
  tone?: 'error'
}) {
  const color = tone === 'error' ? '#A32D2D' : '#C07B55'
  const border = tone === 'error' ? 'rgba(163,45,45,0.35)' : 'rgba(192,123,85,0.45)'
  const background = tone === 'error' ? 'rgba(163,45,45,0.04)' : 'rgba(192,123,85,0.04)'
  return (
    <button type="button" onClick={onClick} style={{ ...panelStyle(border, background), cursor: 'pointer', color }}>
      {icon}
      <span style={{ fontSize: 11, color }}>{label}</span>
    </button>
  )
}
