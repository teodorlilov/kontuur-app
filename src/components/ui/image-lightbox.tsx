'use client'

import Image from 'next/image'
import { Download } from 'lucide-react'
import { downloadImageFile } from '@/lib/download-image'

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
        background: 'rgba(15,21,18,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        cursor: 'zoom-out',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div style={{ position: 'relative' }}>
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            style={{ width: '100%', height: 'auto', borderRadius: 12, display: 'block' }}
          />
          <button
            type="button"
            title="Download image"
            onClick={(e) => {
              e.stopPropagation()
              void downloadImageFile(src)
            }}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 8,
              border: 'none',
              background: 'rgba(255,255,255,0.88)',
              boxShadow: '0 1px 4px rgba(15,21,18,0.18)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              color: 'var(--text2)',
            }}
            className="text-micro font-medium"
          >
            <Download style={{ width: 13, height: 13 }} />
            Download
          </button>
        </div>
        {caption && (
          <p
            className="text-body font-medium"
            style={{ color: '#fff', textAlign: 'center', marginTop: 10 }}
          >
            {caption}
          </p>
        )}
      </div>
    </div>
  )
}
