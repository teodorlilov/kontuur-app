import { cn } from '@/utils/cn'
import { getClientTone } from '@/components/ui/colors/identity-colors'

type AvatarSize = 'sm' | 'md' | 'lg'

interface AvatarProps {
  name: string
  size?: AvatarSize
  /** Forces the Deep Pine mark instead of hashing — for the workspace itself, not a person. */
  color?: 'brand'
  className?: string
}

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: 'size-6 text-label',
  md: 'size-8 text-caption',
  lg: 'size-11 text-body',
}

/**
 * Initials in a coloured disc.
 *
 * Hashes onto `CLIENT_COLORS` rather than carrying its own palette: that constant already exists
 * for exactly this job — telling people and clients apart — and documents why a pure green ramp
 * failed there.
 */
export function Avatar({ name, size = 'md', color, className }: AvatarProps) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')

  const tone = color === 'brand' ? null : getClientTone(name)

  return (
    <div
      className={cn(
        'flex flex-none select-none items-center justify-center rounded-full font-sans font-medium',
        SIZE_CLASS[size],
        color === 'brand' && 'bg-forest-deep text-surface',
        className
      )}
      // Computed from the hash — the palette is a token list, not a fixed pair of classes.
      style={tone ? { background: tone.bg, color: tone.text } : undefined}
    >
      {initials}
    </div>
  )
}
