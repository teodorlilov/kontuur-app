import Image from 'next/image'
import { hasCyrillic } from '@/lib/canvas/font-library'
import { cn } from '@/utils/cn'

interface PostThumbnailProps {
  src: string | null
  /** Whose post it is; the first glyph stands in when there is no image. */
  name: string
  /** Size and shape from the call site — the drafts list is a 44px square, My week a 4:5 cell. */
  className: string
}

/**
 * A post's first image, or the owner's initial in the serif where there is none.
 *
 * The initial is taken by spreading the name, not `slice(0, 1)`: an emoji or any astral character
 * is two code units, and slicing one of them yields a broken glyph. Instrument Serif ships no
 * Cyrillic, so a Cyrillic initial stays in the sans face rather than silently falling back to a
 * mismatched system one. Promoted out of the drafts list when My week became its second consumer.
 */
export function PostThumbnail({ src, name, className }: PostThumbnailProps) {
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?'

  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={44}
        height={44}
        className={cn('shrink-0 object-cover', className)}
      />
    )
  }
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center bg-wash text-display text-forest',
        hasCyrillic(initial) ? 'font-sans font-medium not-italic' : 'font-display italic',
        className
      )}
    >
      {initial}
    </span>
  )
}
