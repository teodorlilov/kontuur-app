'use client'

import { useRef } from 'react'
import type { CanvasBackgroundTransform } from '@/types/canvas'
import { cn } from '@/utils/cn'
import { MAX_BACKGROUND_ZOOM } from '@/lib/canvas/constants'
import { PanelSlider } from './panel-slider'
import { EDITOR_CONTROL, EDITOR_LABEL } from './workspace/chrome'

interface BackgroundControlsProps {
  transform: CanvasBackgroundTransform | undefined
  replacing: boolean
  onReplace: (file: File) => void
  onZoom: (zoom: number) => void
  onReset: () => void
}

/** The slide's picture: swap it, zoom the crop, or reset to the plain cover fit. */
export function BackgroundControls({
  transform,
  replacing,
  onReplace,
  onZoom,
  onReset,
}: BackgroundControlsProps) {
  const zoom = transform?.zoom ?? 1
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className={EDITOR_LABEL}>Background</div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={replacing}
          title="Swap the slide's image — your text and elements stay exactly where they are"
          className={cn(EDITOR_CONTROL, 'mb-2', replacing ? 'cursor-default' : 'cursor-pointer')}
        >
          {replacing ? 'Replacing…' : 'Replace image…'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onReplace(file)
            event.target.value = ''
          }}
        />
      </div>
      <PanelSlider
        label={`Zoom · ${zoom.toFixed(2)}×`}
        min={1}
        max={MAX_BACKGROUND_ZOOM}
        step={0.05}
        value={zoom}
        onChange={onZoom}
      />
      {transform && (
        <button type="button" onClick={onReset} className={cn(EDITOR_CONTROL, 'cursor-pointer')}>
          Reset crop
        </button>
      )}
    </div>
  )
}
