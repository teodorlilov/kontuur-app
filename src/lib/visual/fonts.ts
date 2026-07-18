/**
 * Minimal font registry (Phase 1). The ~7 Google-Fonts families the four vibe presets pair, each with
 * enough metadata to load, validate, and preview. Vibe-preset `fontPairing` values are `FontKey`s into
 * this registry — the single source of truth for the fonts the product ships. No font-matching or
 * renderer glyph loading here; that grows into the renderer's font library in a later phase.
 */

/** Broad display-type category (also used by the extractor's `familyCategory` heuristic). */
export type FontCategory = 'serif' | 'slab' | 'sans' | 'geometric' | 'grotesk' | 'humanist' | 'mono'

export type FontEntry = {
  family: string
  /** Family name as it appears in a Google Fonts `css2?family=` request. */
  googleFontsName: string
  category: FontCategory
  weights: number[]
  /** CSS fallback stack rendered until (or if) the web font loads. */
  fallback: string
}

export const FONT_REGISTRY = {
  'cormorant-garamond': {
    family: 'Cormorant Garamond',
    googleFontsName: 'Cormorant Garamond',
    category: 'serif',
    weights: [500, 600, 700],
    fallback: 'Georgia, "Times New Roman", serif',
  },
  montserrat: {
    family: 'Montserrat',
    googleFontsName: 'Montserrat',
    category: 'geometric',
    weights: [400, 500, 600, 700],
    fallback: 'Helvetica, Arial, sans-serif',
  },
  'space-grotesk': {
    family: 'Space Grotesk',
    googleFontsName: 'Space Grotesk',
    category: 'grotesk',
    weights: [400, 500, 700],
    fallback: 'Arial, sans-serif',
  },
  inter: {
    family: 'Inter',
    googleFontsName: 'Inter',
    category: 'sans',
    weights: [400, 500, 600, 700],
    fallback: 'system-ui, -apple-system, sans-serif',
  },
  'archivo-black': {
    family: 'Archivo Black',
    googleFontsName: 'Archivo Black',
    category: 'grotesk',
    weights: [400],
    fallback: '"Arial Black", Arial, sans-serif',
  },
  fraunces: {
    family: 'Fraunces',
    googleFontsName: 'Fraunces',
    category: 'serif',
    weights: [400, 500, 600],
    fallback: 'Georgia, serif',
  },
  'libre-franklin': {
    family: 'Libre Franklin',
    googleFontsName: 'Libre Franklin',
    category: 'sans',
    weights: [400, 500, 600],
    fallback: 'Helvetica, Arial, sans-serif',
  },
} as const satisfies Record<string, FontEntry>

export type FontKey = keyof typeof FONT_REGISTRY

/** Look up a font entry by its registry key. */
export function getFont(key: FontKey): FontEntry {
  return FONT_REGISTRY[key]
}

/** The full CSS `font-family` value (family + fallback) for a registry key. */
export function fontFamilyStack(key: FontKey): string {
  const font = FONT_REGISTRY[key]
  return `"${font.family}", ${font.fallback}`
}

/** Build a Google Fonts `css2` stylesheet href covering the given registry keys, for UI previews. */
export function googleFontsHref(keys: FontKey[]): string {
  const families = [...new Set(keys)].map((key) => {
    const font = FONT_REGISTRY[key]
    const weights = font.weights.join(';')
    return `family=${encodeURIComponent(font.googleFontsName)}:wght@${weights}`
  })
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
}
