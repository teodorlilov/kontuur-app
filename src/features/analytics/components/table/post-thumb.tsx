'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/utils/cn'
import { postTypeMeta } from '../../lib/compute/post-display'

/**
 * The post's own image, with the lettered badge as its fallback.
 *
 * Meta signs these CDN urls with an expiry, and the nightly re-sync only refreshes them for
 * `MEDIA_LOOKBACK_DAYS` (30) after publish — so any older window WILL hold dead links. The
 * onError fallback is not defensive padding: without it a client report renders broken-image
 * glyphs, which is worse than no image at all.
 */
export function PostThumb({
  thumbnailUrl,
  mediaType,
}: {
  thumbnailUrl: string | null
  mediaType: string | null
}) {
  const [failed, setFailed] = useState(false)
  const type = postTypeMeta(mediaType)

  if (!thumbnailUrl || failed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'grid size-10 flex-none place-items-center rounded-panel text-label tracking-normal text-forest',
          type?.tone === 'marker' ? 'bg-marker' : 'bg-sage'
        )}
      >
        {/* No letter when the type is unknown: the badge still stands in for the image,
            it just does not claim to know what kind of post this is. */}
        {type?.letter ?? '·'}
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
