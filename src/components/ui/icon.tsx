import type { Icon as Glyph } from '@solar-icons/react/lib/types'
import { cn } from '@/utils/cn'

const ICON_SIZE = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, hero: 28 } as const

interface IconProps {
  glyph: Glyph
  size?: keyof typeof ICON_SIZE
  className?: string
}

/**
 * The one way an icon is drawn: a Solar glyph at a step of the closed size ramp, stroke 1.5.
 * A `line-duotone` glyph takes its second stroke from `--icon-secondary` — Living Green unless a
 * parent retints it with `.icon-quiet` or `.icon-on-dark` (globals.css § Icons). Decorative by
 * default: the glyph is `aria-hidden` and the adjacent text or the control's label carries meaning.
 */
export function Icon({ glyph: GlyphComponent, size = 'md', className }: IconProps) {
  return <GlyphComponent size={ICON_SIZE[size]} className={cn('icon', className)} />
}
