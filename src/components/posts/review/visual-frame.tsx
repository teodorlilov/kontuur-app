'use client'

import Image from 'next/image'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { DraftVisual } from '@/lib/visual/draft-visuals'

type FrameSize = 'cover' | 'panel' | 'strip' | 'thumb'

/**
 * Everything this frame actually reads. Declared structurally rather than as `DraftVisual` so any
 * producer of "an image that may still be arriving" can render through it — the canvas editor's
 * generated candidates are not draft visuals, but they are exactly this shape.
 */
export interface FramedVisual {
  status: DraftVisual['status']
  publicUrl?: string
}

interface VisualFrameProps {
  visual: FramedVisual | undefined
  size: FrameSize
  alt: string
  /** "2/6" — rendered at cover size only. */
  pager?: string
  className?: string
}

const SIZE_CLASS: Record<FrameSize, string> = {
  cover: 'rounded-panel',
  panel: 'rounded-sm',
  strip: 'rounded-sm',
  thumb: 'rounded-sm',
}

/**
 * What each size actually occupies, for the srcset. These are layout facts, not preferences: a
 * `panel` tile serving the `strip` hint gets an 80px source upscaled into a ~124px box, which is
 * visibly soft on exactly the thing the user is being asked to judge.
 */
const SIZE_HINT: Record<FrameSize, string> = {
  cover: '(max-width: 768px) 100vw, 360px',
  panel: '160px',
  strip: '80px',
  thumb: '80px',
}

/**
 * The one renderer for a DraftVisual, at every scale the review step shows one:
 * grid cover and big slide (cover), filmstrip tile (strip), rail thumb (thumb).
 * A visual that has not composed yet is an absence, and hatching is how this
 * system says absence — it never renders louder than a finished one.
 */
export function VisualFrame({ visual, size, alt, pager, className }: VisualFrameProps) {
  const base = cn('relative aspect-[4/5] w-full overflow-hidden', SIZE_CLASS[size], className)

  if (visual?.status === 'error') {
    return (
      <div className={cn(base, 'grid place-items-center bg-danger-bg text-danger')}>
        <span className="flex flex-col items-center gap-1.5 text-center">
          <AlertCircle aria-hidden className={size === 'cover' ? 'size-5' : 'size-3.5'} strokeWidth={1.6} />
          {size === 'cover' && <span className="text-micro font-medium">Visual failed</span>}
        </span>
      </div>
    )
  }

  if (!visual?.publicUrl) {
    return (
      <div className={cn(base, 'slot-open grid place-items-center bg-sunken')}>
        {/* Only an active job earns the live chip — a slot with no visual at
            all is plain absence, and hatching alone already says that. This
            phase is the image model painting (~1 min); "Composing…" was a lie
            here — text composition is the later, fast step. */}
        {size === 'cover' && visual?.status === 'generating' && (
          <span className="flex items-center gap-1.5 rounded-chip bg-surface/[0.92] px-2 py-1 text-micro font-medium text-text2">
            <span aria-hidden className="live-dot size-1.5 flex-none rounded-full bg-spring" />
            Generating image…
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={base}>
      <Image
        src={visual.publicUrl}
        alt={alt}
        fill
        sizes={SIZE_HINT[size]}
        className="object-cover"
      />
      {visual.status === 'generating' && (
        // Mid-compose: the clean image is up while text bakes in — say so quietly.
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 rounded-chip bg-surface/90 px-1.5 py-0.5 text-micro text-text2">
          <span aria-hidden className="live-dot size-1.5 flex-none rounded-full bg-spring" />
          Composing…
        </span>
      )}
      {pager && size === 'cover' && (
        <span className="absolute right-2.5 top-2.5 rounded-chip bg-surface/[0.92] px-2 py-0.5 text-micro font-medium tabular-nums text-ink">
          {pager}
        </span>
      )}
    </div>
  )
}
