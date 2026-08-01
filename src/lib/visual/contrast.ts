import { contrastRatio, parseHex } from './extract/color'
import type { Palette } from '@/types/visual'

/** WCAG AA for body text. Below this, generated visuals are hard to read. */
const AA_NORMAL = 4.5

export interface ContrastCheck {
  ratio: number
  passes: boolean
  ink: string
  surface: string
}

/**
 * Checks a brand palette's `ink` against its `surface`, or null if either is not a plain hex colour.
 *
 * Worth surfacing because these two roles are what every generated visual sets type in: a palette
 * measured off a website can easily pair a pale grey on off-white, which looks fine as a swatch
 * pair and is unreadable once it carries a caption.
 */
export function checkPaletteContrast(palette: Palette): ContrastCheck | null {
  const ink = parseHex(palette.ink)
  const surface = parseHex(palette.surface)
  // No ratio rather than a ratio measured off a colour we failed to read: an unparseable palette
  // is a bug to find elsewhere, not a contrast warning to show the user.
  if (!ink || !surface) return null

  const ratio = contrastRatio(ink, surface)
  return {
    ratio: Math.round(ratio * 10) / 10,
    passes: ratio >= AA_NORMAL,
    ink: palette.ink,
    surface: palette.surface,
  }
}
