/**
 * The approved font library — the menu the visual-system picker offers (Phase 1) and the source of
 * truth for which families the renderer knows. Every entry covers Latin + Bulgarian Cyrillic. `baked`
 * families are self-hosted WOFF2 (see baked-fonts.css) and skip the Google fetch; the rest load via a
 * `latin,cyrillic` Google Fonts subset on demand. `bulgarian` flags `locl` confidence: 'strong' =
 * known Bulgarian localised forms; 'verify' = has Cyrillic but confirm the forms against a specimen.
 */
export type FontCategory = 'serif' | 'slab' | 'sans' | 'geometric' | 'grotesk' | 'humanist' | 'mono'
export type BulgarianSupport = 'strong' | 'verify'

export type FontEntry = {
  family: string
  category: FontCategory
  bulgarian: BulgarianSupport
  baked: boolean
}

export const FONT_LIBRARY: readonly FontEntry[] = [
  // Serif — editorial
  { family: 'Playfair Display', category: 'serif', bulgarian: 'strong', baked: false },
  { family: 'Cormorant Garamond', category: 'serif', bulgarian: 'verify', baked: false },
  { family: 'Source Serif 4', category: 'serif', bulgarian: 'strong', baked: true },
  { family: 'Lora', category: 'serif', bulgarian: 'verify', baked: false },
  { family: 'Alegreya', category: 'serif', bulgarian: 'strong', baked: false },
  // Slab
  { family: 'Bitter', category: 'slab', bulgarian: 'strong', baked: false },
  { family: 'Roboto Slab', category: 'slab', bulgarian: 'strong', baked: false },
  // Sans — neutral
  { family: 'Source Sans 3', category: 'sans', bulgarian: 'strong', baked: true },
  { family: 'PT Sans', category: 'sans', bulgarian: 'strong', baked: false },
  { family: 'Roboto', category: 'sans', bulgarian: 'strong', baked: false },
  { family: 'IBM Plex Sans', category: 'sans', bulgarian: 'verify', baked: false },
  // Sans — geometric / modern
  { family: 'Montserrat', category: 'geometric', bulgarian: 'verify', baked: false },
  { family: 'Manrope', category: 'geometric', bulgarian: 'verify', baked: false },
  { family: 'Commissioner', category: 'geometric', bulgarian: 'strong', baked: false },
  // Grotesk / display
  { family: 'Golos Text', category: 'grotesk', bulgarian: 'strong', baked: false },
  { family: 'Onest', category: 'grotesk', bulgarian: 'strong', baked: false },
  { family: 'Oswald', category: 'grotesk', bulgarian: 'verify', baked: false },
  { family: 'Unbounded', category: 'grotesk', bulgarian: 'verify', baked: false },
  // Humanist & mono
  { family: 'Ysabeau', category: 'humanist', bulgarian: 'strong', baked: false },
  { family: 'JetBrains Mono', category: 'mono', bulgarian: 'verify', baked: false },
]

const BAKED_FAMILIES = new Set(FONT_LIBRARY.filter((f) => f.baked).map((f) => f.family))
const LIBRARY_FAMILIES = new Set(FONT_LIBRARY.map((f) => f.family))

/** True when a family is self-hosted — the render page loads it from baked-fonts.css, not Google. */
export function isBakedFamily(family: string): boolean {
  return BAKED_FAMILIES.has(family)
}

/** True when a family is in the approved library (Latin + Bulgarian Cyrillic guaranteed). */
export function isLibraryFamily(family: string): boolean {
  return LIBRARY_FAMILIES.has(family)
}
