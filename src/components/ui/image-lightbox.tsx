'use client'

import Image from 'next/image'

/** Fullscreen click-to-close overlay for inspecting an image at large size. */
export function ImageLightbox({
  src,
  alt,
  caption,
  width = 1024,
  height = 1024,
  onClose,
}: {
  src: string
  alt: string
  caption?: string
  /** Intrinsic dimensions for next/image; display is responsive. */
  width?: number
  height?: number
  onClose: () => void
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(20,28,34,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        cursor: 'zoom-out',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%' }}>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          style={{ width: '100%', height: 'auto', borderRadius: 12, display: 'block' }}
        />
        {caption && (
          <p style={{ fontSize: 13, fontWeight: 500, color: '#fff', textAlign: 'center', marginTop: 10 }}>
            {caption}
          </p>
        )}
      </div>
    </div>
  )
}
