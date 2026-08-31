'use client'

import Image from 'next/image'
import type { PostImage } from '@/types/api'

/** Read-only visual preview for the client approval page — display only, no upload/AI affordances. */
export function PostImagePreview({ image, altText }: { image: PostImage | null; altText: string }) {
  if (!image) return null
  return (
    <div className="overflow-hidden rounded-md border border-ink/10">
      <Image
        className="block h-auto w-full"
        src={image.publicUrl}
        alt={altText}
        width={512}
        height={512}
      />
    </div>
  )
}
