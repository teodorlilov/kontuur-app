import type { Palette, VisualIdentity } from '@/types/visual'

/** Neutral fallback palette when a site can't be measured (no website, capture failed). The user edits it. */
export const DEFAULT_PALETTE: Palette = {
  surface: '#FFFFFF',
  ink: '#1A1A1A',
  accent: '#2563EB',
  'accent-deep': '#1E3A8A',
  line: '#E5E5E5',
}

/** A valid identity from the neutral default palette — the starting point when nothing was measured. */
export function buildDefaultIdentity(): VisualIdentity {
  return { palette: DEFAULT_PALETTE }
}
