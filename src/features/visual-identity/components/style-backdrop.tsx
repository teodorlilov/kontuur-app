'use client'

import type { Palette } from '@/types/visual'

/**
 * The reserved backdrop area for a style preview — the seam for the future fal.ai imagery. Until an
 * `imageUrl` is provided (Phase 1), it renders a soft brand-coloured gradient so it reads as an
 * intentional surface, not an empty box. When the fal.ai phase lands, pass the generated image and the
 * gradient becomes its loading/placeholder state — no other UI change.
 */
export function StyleBackdrop({
  palette,
  imageUrl,
  aspectRatio = 4 / 5,
  children,
}: {
  palette: Palette
  imageUrl?: string
  /** Defaults to the 4:5 Instagram carousel feed ratio; can mirror the post's output ratio later. */
  aspectRatio?: number
  children?: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: String(aspectRatio),
        borderRadius: '12px',
        overflow: 'hidden',
        border: '0.5px solid rgba(0,0,0,0.08)',
        background: imageUrl
          ? `center / cover no-repeat url(${JSON.stringify(imageUrl)})`
          : `linear-gradient(150deg, ${palette.surface} 0%, ${palette.surface} 45%, ${palette.accent} 160%)`,
      }}
    >
      {children}
    </div>
  )
}
