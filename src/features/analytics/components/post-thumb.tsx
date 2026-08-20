'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/utils/cn'
import { TYPE_META } from '../lib/post-display'

/**
 * The post's own image, with the lettered badge as its fallback.
 *
 * Instagram signs these CDN urls with an expiry, so a stored one outlives its
 * row by days, not months. The nightly re-sync refreshes them for thirty days
 * after publish, which covers everything this table normally shows — but an
 * older window WILL hold dead links, and a broken-image glyph in a client
 * report is worse than no image at all. So a failed load falls back to the
 * badge the table used before, and nothing announces the difference.
 */
export function PostThumb({
  thumbnailUrl,
  mediaType,
}: {
  thumbnailUrl: string | null
  mediaType: string | null
}) {
  const [failed, setFailed] = useState(false)
  const type = TYPE_META[mediaType ?? ''] ?? TYPE_META.IMAGE!

  if (!thumbnailUrl || failed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'grid size-10 flex-none place-items-center rounded-panel text-label tracking-normal text-forest',
          type.tone === 'marker' ? 'bg-marker' : 'bg-sage'
        )}
      >
        {type.letter}
      </span>
    )
  }
  return (
    <span className="relative size-10 flex-none overflow-hidden rounded-panel bg-sunken">
      <Image
        src={thumbnailUrl}
        alt=""
        fill
        sizes="40px"
        className="object-cover"
        onError={() => setFailed(true)}
        unoptimized
      />
    </span>
  )
}
