/**
 * The approved font library — the menu the visual-system picker offers (Phase 1) and the source of
 * truth for which families the renderer knows. Every entry covers Latin + Bulgarian Cyrillic and loads
 * via a `latin,cyrillic` Google Fonts subset on demand. `bulgarian` flags `locl` confidence: 'strong' =
 * known Bulgarian localised forms; 'verify' = has Cyrillic but confirm the forms against a specimen.
 */
export type FontCategory = 'serif' | 'slab' | 'sans' | 'geometric' | 'grotesk' | 'humanist' | 'mono'
type BulgarianSupport = 'strong' | 'verify'
export type Subset = 'latin' | 'latin-ext' | 'cyrillic' | 'greek' | 'vietnamese'

export type FontEntry = {
  family: string
  category: FontCategory
  bulgarian: BulgarianSupport
  subsets: Subset[]
}

// Every current family covers Latin + Cyrillic by design (the library was curated for Bulgarian). The
// `subsets` field is what lets the language filter (§3.2) exclude a Latin-only face once one is added.
const LATIN_CYRILLIC: Subset[] = ['latin', 'cyrillic']

export const FONT_LIBRARY: readonly FontEntry[] = [
  // Serif — editorial
  { family: 'Playfair Display', category: 'serif', bulgarian: 'strong', subsets: LATIN_CYRILLIC },
  { family: 'Cormorant Garamond', category: 'serif', bulgarian: 'verify', subsets: LATIN_CYRILLIC },
  { family: 'Source Serif 4', category: 'serif', bulgarian: 'strong', subsets: LATIN_CYRILLIC },
  { family: 'Lora', category: 'serif', bulgarian: 'verify', subsets: LATIN_CYRILLIC },
  { family: 'Alegreya', category: 'serif', bulgarian: 'strong', subsets: LATIN_CYRILLIC },
  // Slab
  { family: 'Bitter', category: 'slab', bulgarian: 'strong', subsets: LATIN_CYRILLIC },
  { family: 'Roboto Slab', category: 'slab', bulgarian: 'strong', subsets: LATIN_CYRILLIC },
  // Sans — neutral
  { family: 'Source Sans 3', category: 'sans', bulgarian: 'strong', subsets: LATIN_CYRILLIC },
  { family: 'PT Sans', category: 'sans', bulgarian: 'strong', subsets: LATIN_CYRILLIC },
  { family: 'Roboto', category: 'sans', bulgarian: 'strong', subsets: LATIN_CYRILLIC },
  { family: 'IBM Plex Sans', category: 'sans', bulgarian: 'verify', subsets: LATIN_CYRILLIC },
  // Sans — geometric / modern
  { family: 'Montserrat', category: 'geometric', bulgarian: 'verify', subsets: LATIN_CYRILLIC },
  { family: 'Manrope', category: 'geometric', bulgarian: 'verify', subsets: LATIN_CYRILLIC },
  { family: 'Commissioner', category: 'geometric', bulgarian: 'strong', subsets: LATIN_CYRILLIC },
  // Grotesk / display
  { family: 'Golos Text', category: 'grotesk', bulgarian: 'strong', subsets: LATIN_CYRILLIC },
  { family: 'Onest', category: 'grotesk', bulgarian: 'strong', subsets: LATIN_CYRILLIC },
  { family: 'Oswald', category: 'grotesk', bulgarian: 'verify', subsets: LATIN_CYRILLIC },
  { family: 'Unbounded', category: 'grotesk', bulgarian: 'verify', subsets: LATIN_CYRILLIC },
  // Humanist & mono
  { family: 'Ysabeau', category: 'humanist', bulgarian: 'strong', subsets: LATIN_CYRILLIC },
  { family: 'JetBrains Mono', category: 'mono', bulgarian: 'verify', subsets: LATIN_CYRILLIC },
]

const LIBRARY_FAMILIES = new Set(FONT_LIBRARY.map((f) => f.family))

/** True when a family is in the approved library (Latin + Bulgarian Cyrillic guaranteed). */
export function isLibraryFamily(family: string): boolean {
  return LIBRARY_FAMILIES.has(family)
}
