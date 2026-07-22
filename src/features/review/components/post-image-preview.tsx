'use client'

import Image from 'next/image'
import type { PostImage } from '@/types/api'

/** Read-only visual preview for the client approval page — display only, no upload/AI affordances. */
export function PostImagePreview({ image, altText }: { image: PostImage | null; altText: string }) {
  if (!image) return null
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '0.5px solid rgba(44,62,80,0.10)' }}>
      <Image
        src={image.publicUrl}
        alt={altText}
        width={512}
        height={512}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
    </div>
  )
}
