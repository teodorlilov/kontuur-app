import type { Palette, VisualIdentity } from '@/types/visual'
import { DEFAULT_BRAND_STYLE_ID } from './brand-styles'

/** Neutral fallback palette when a site can't be measured (no website, capture failed). The user edits it. */
export const DEFAULT_PALETTE: Palette = {
  surface: '#FFFFFF',
  ink: '#1A1A1A',
  accent: '#2563EB',
  'accent-deep': '#1E3A8A',
  line: '#E5E5E5',
}

/** A valid identity from the neutral default palette + default style — the starting point when nothing was measured. */
export function buildDefaultIdentity(): VisualIdentity {
  return { palette: DEFAULT_PALETTE, style: DEFAULT_BRAND_STYLE_ID }
}

/**
 * Swap a client's brand colours, dropping `palette_description` along with the colours it described.
 *
 * That description is a cached English rendering of the *old* hexes — and it, not the palette, is
 * what image prompts read under COLOR PALETTE. Carrying it across a colour change makes generation
 * follow the palette the user just rejected; dropping it lets `generateVisual` write a matching one
 * on the next run.
 *
 * Every palette editor goes through here so the rule cannot be half-applied. It used to be a comment
 * inside the settings panel, which meant the onboarding sheet's own `{ ...identity, palette }` was
 * free to keep the stale description — and it shipped a client whose palette was tan three blue
 * carousels. Written as spread-then-drop rather than rebuilt field by field, so a field added to
 * `VisualIdentity` later survives a colour edit instead of vanishing silently.
 */
export function withPalette(identity: VisualIdentity, palette: Palette): VisualIdentity {
  const next = { ...identity, palette }
  delete next.palette_description
  return next
}
