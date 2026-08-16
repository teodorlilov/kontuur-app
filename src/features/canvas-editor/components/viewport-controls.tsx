'use client'

import { Maximize2, Minus, Plus } from 'lucide-react'
import { cn } from '@/utils/cn'
import { TOOL_ROW } from '@/components/layout/page-header/shared'
import type { ViewportControls as Viewport } from '../hooks/use-stage-viewport'

interface ViewportControlsProps {
  viewport: Viewport
}

/** Floating zoom cluster: out · current zoom (click for 1:1) · in · fit. */
export function ViewportControls({ viewport }: ViewportControlsProps) {
  const atActualSize = Math.round(viewport.scale * 100) === 100
  return (
    <div className="pointer-events-auto absolute right-4 bottom-4 flex items-center gap-1 rounded-chip border border-line bg-surface p-1 shadow-pop">
      <button type="button" className={TOOL_ROW} title="Zoom out (⌘−)" onClick={viewport.zoomOut}>
        <Minus size={14} aria-hidden />
      </button>
      <button
        type="button"
        onClick={viewport.actualSize}
        title="Actual size (⇧0)"
        aria-pressed={atActualSize}
        className={cn(
          'rounded-xs px-2 py-1 font-sans text-caption tabular-nums text-text2 hover:text-ink',
          atActualSize && 'text-ink'
        )}
      >
        {Math.round(viewport.scale * 100)}%
      </button>
      <button type="button" className={TOOL_ROW} title="Zoom in (⌘+)" onClick={viewport.zoomIn}>
        <Plus size={14} aria-hidden />
      </button>
      <button
        type="button"
        onClick={viewport.fit}
        title="Fit to screen (⇧1)"
        aria-pressed={viewport.isFit}
        className={cn(TOOL_ROW, viewport.isFit && 'text-ink')}
      >
        <Maximize2 size={14} aria-hidden />
      </button>
    </div>
  )
}
