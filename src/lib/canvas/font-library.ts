/**
 * The curated editor font menu. Families are chosen on merit; Cyrillic coverage is RECORDED per
 * family rather than required of it, so the menu is not capped by what Google subsets for Cyrillic.
 * The picker (and anything else deciding what to offer) narrows to the Cyrillic tier only when the
 * text in hand actually needs it. This module is the single owner of family names, categories and
 * weights — brand-style pairings and the font picker both read from here.
 *
 * Every flag below is verified against the live css2 endpoint before it lands. That is not
 * ceremony: css2 answers 200 and SILENTLY DROPS a weight or an italic axis it cannot serve, so a
 * wrong flag produces browser-synthesized fake-bold or a smeared oblique — which then bakes into
 * the exported JPEG — with no error anywhere.
 *
 * Last audited 2026-08-24, against `css2?family=F:wght@W` and `:ital,wght@1,W` for every family and
 * every weight in the 500–900 range: 30 families were listing fewer weights than Google serves, so
 * the heaviest type the editor could set was a 700 on a face that had a 900 sitting unused. The
 * ones that stop where they stop are genuine ceilings — Oswald really does end at 700.
 *
 * Widening these costs nothing in bytes. The families that gained weights are variable fonts, where
 * Google serves ONE binary per subset covering the whole axis, so `ensureFontsReady` resolves the
 * extra weights against a face it was already downloading. A family served as separate static
 * files gains nothing here because its list was already complete.
 */

export type FontCategory = 'display' | 'serif' | 'sans' | 'script'

interface FontFaceSpec {
  category: FontCategory
  /** False = Google Fonts serves no Cyrillic subset; Bulgarian text would fall back to a system face. */
  cyrillic: boolean
  /** Weights actually hosted by Google Fonts for this family (many display faces are 400-only). */
  weights: readonly number[]
  /** True = Google hosts an italic face at every listed weight (never synthesize obliques). */
  italic: boolean
}

const FONT_FAMILIES = {
  // display — Cyrillic-capable first, because that tier is the scarce one and the one Bulgarian
  // copy is confined to. Every entry below was cmap-verified against the full Bulgarian alphabet.
  'Sofia Sans Extra Condensed': {
    category: 'display',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  // The wide fat grotesque the Graphic Editorial reference is set in, and the only Cyrillic one.
  // Measured against Archivo Black (the Latin-only face that look actually comes from): 104% of its
  // cap-relative width and 99% of its stem weight — wider and equally black, with Cyrillic. Weight
  // 400 is the whole family; it is black by design, so `nearestWeight` clamps a lockup's 700/900
  // request down to it and the face still reads as heavy as the request intended.
  'Dela Gothic One': { category: 'display', cyrillic: true, weights: [400], italic: false },
  Oi: { category: 'display', cyrillic: true, weights: [400], italic: false },
  'Stalinist One': { category: 'display', cyrillic: true, weights: [400], italic: false },
  'Alumni Sans': {
    category: 'display',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  Forum: { category: 'display', cyrillic: true, weights: [400], italic: false },
  'Orelega One': { category: 'display', cyrillic: true, weights: [400], italic: false },
  'Poiret One': { category: 'display', cyrillic: true, weights: [400], italic: false },
  'Ruslan Display': { category: 'display', cyrillic: true, weights: [400], italic: false },
  Unbounded: {
    category: 'display',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: false,
  },
  'Sofia Sans Condensed': {
    category: 'display',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  Oswald: { category: 'display', cyrillic: true, weights: [400, 500, 600, 700], italic: false },
  'Russo One': { category: 'display', cyrillic: true, weights: [400], italic: false },
  'Yeseva One': { category: 'display', cyrillic: true, weights: [400], italic: false },
  'Kelly Slab': { category: 'display', cyrillic: true, weights: [400], italic: false },
  'Rubik Mono One': { category: 'display', cyrillic: true, weights: [400], italic: false },
  'Bebas Neue': { category: 'display', cyrillic: false, weights: [400], italic: false },
  Anton: { category: 'display', cyrillic: false, weights: [400], italic: false },
  'Abril Fatface': { category: 'display', cyrillic: false, weights: [400], italic: false },
  'Archivo Black': { category: 'display', cyrillic: false, weights: [400], italic: false },
  'Alfa Slab One': { category: 'display', cyrillic: false, weights: [400], italic: false },
  Staatliches: { category: 'display', cyrillic: false, weights: [400], italic: false },
  // Latin-only display. Curated on merit and flagged, not excluded: most of the personality in
  // this category has no Cyrillic subset, and an English campaign line is entitled to it.
  Shrikhand: { category: 'display', cyrillic: false, weights: [400], italic: false },
  Bungee: { category: 'display', cyrillic: false, weights: [400], italic: false },
  'Passion One': { category: 'display', cyrillic: false, weights: [400, 700, 900], italic: false },
  'Big Shoulders Display': {
    category: 'display',
    cyrillic: false,
    weights: [400, 500, 600, 700, 800, 900],
    italic: false,
  },
  'Lilita One': { category: 'display', cyrillic: false, weights: [400], italic: false },
  Monoton: { category: 'display', cyrillic: false, weights: [400], italic: false },
  Orbitron: {
    category: 'display',
    cyrillic: false,
    weights: [400, 500, 600, 700, 800, 900],
    italic: false,
  },
  'Titan One': { category: 'display', cyrillic: false, weights: [400], italic: false },
  // serif
  // The variable superfamily, not just `Playfair Display`: it carries an optical-size axis and a
  // real 900, which is what a didone needs to read as display rather than as a large book face.
  Playfair: {
    category: 'serif',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  'Playfair Display': {
    category: 'serif',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  Prata: { category: 'serif', cyrillic: true, weights: [400], italic: false },
  'Cormorant Garamond': {
    category: 'serif',
    cyrillic: true,
    weights: [400, 500, 600, 700],
    italic: true,
  },
  Lora: { category: 'serif', cyrillic: true, weights: [400, 500, 600, 700], italic: true },
  // The library's only slab: Google serves it 100–900 with a true italic at every weight, but the
  // menu lists two — each listed weight is a face `ensureFontsReady` preloads.
  Bitter: {
    category: 'serif',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  Merriweather: {
    category: 'serif',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  'Bodoni Moda': {
    category: 'serif',
    cyrillic: false,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  'DM Serif Display': { category: 'serif', cyrillic: false, weights: [400], italic: true },
  Cinzel: {
    category: 'serif',
    cyrillic: false,
    weights: [400, 500, 600, 700, 800, 900],
    italic: false,
  },
  // sans
  // Sofia Sans puts BULGARIAN letterforms in the default Cyrillic positions — it was made with
  // Sofia Municipality — rather than hiding them behind a `locl` feature. For a product whose copy
  // is largely Bulgarian that is the correct default, not a nicety.
  'Sofia Sans': {
    category: 'sans',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  'Fira Sans': {
    category: 'sans',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  Manrope: { category: 'sans', cyrillic: true, weights: [400, 500, 600, 700, 800], italic: false },
  Commissioner: {
    category: 'sans',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: false,
  },
  'Source Sans 3': {
    category: 'sans',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  'Golos Text': {
    category: 'sans',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: false,
  },
  Montserrat: {
    category: 'sans',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  Inter: {
    category: 'sans',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  Raleway: {
    category: 'sans',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  'Nunito Sans': {
    category: 'sans',
    cyrillic: true,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  'IBM Plex Sans': {
    category: 'sans',
    cyrillic: true,
    weights: [400, 500, 600, 700],
    italic: true,
  },
  // The Cyrillic answer to Poppins — a geometric sans Bulgarian copy can actually use.
  Jost: { category: 'sans', cyrillic: true, weights: [400, 500, 600, 700, 800, 900], italic: true },
  Poppins: {
    category: 'sans',
    cyrillic: false,
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
  },
  'Space Grotesk': {
    category: 'sans',
    cyrillic: false,
    weights: [400, 500, 600, 700],
    italic: false,
  },
  Fredoka: { category: 'sans', cyrillic: false, weights: [400, 500, 600, 700], italic: false },
  // script
  Caveat: { category: 'script', cyrillic: true, weights: [400, 500, 600, 700], italic: false },
  'Marck Script': { category: 'script', cyrillic: true, weights: [400], italic: false },
  'Permanent Marker': { category: 'script', cyrillic: false, weights: [400], italic: false },
} as const satisfies Record<string, FontFaceSpec>

export type FontFamilyName = keyof typeof FONT_FAMILIES

/** The family names as a runtime tuple, so a zod boundary can constrain to the library. */
export const FONT_FAMILY_NAMES = Object.keys(FONT_FAMILIES) as [FontFamilyName, ...FontFamilyName[]]

export interface FontEntry extends FontFaceSpec {
  family: FontFamilyName
}

export const FONT_LIBRARY: readonly FontEntry[] = (
  Object.keys(FONT_FAMILIES) as FontFamilyName[]
).map((family) => ({ family, ...FONT_FAMILIES[family] }))

const CYRILLIC_PATTERN = /[Ѐ-ӿ]/

/** True when the text contains any Cyrillic character (drives the Latin-only tier filter). */
export function hasCyrillic(text: string): boolean {
  return CYRILLIC_PATTERN.test(text)
}

/**
 * Whether a client writing in this language needs a Cyrillic face.
 *
 * The product offers two content languages — Bulgarian and English — and only Bulgarian is written
 * in Cyrillic, so this is the whole question today.
 *
 * It will not stay that way. Adding a language means asking what script it needs, and the library
 * answers only for Cyrillic: it records `cyrillic` per family and nothing about Greek, so Greek
 * would need all 56 families audited against the live css2 endpoint for a `greek` subset, the way
 * the Cyrillic flags were established. A Latin-script addition needs nothing — Google serves
 * `latin-ext` for effectively every family here, so accented characters are already covered.
 */
export function languageNeedsCyrillic(language: string | undefined): boolean {
  return language === 'Bulgarian'
}

/**
 * The families a picker may offer.
 *
 * ONE definition because two pickers ask, and they were answering separately: the editor's layer
 * dropdown narrowed to the Cyrillic tier through `availableFonts`, and the brand-type picker
 * rewrote the same filter inline because it also wanted a category tier. Two copies of "which faces
 * can set this script" is two chances for one of them to start offering a face that renders the
 * client's copy in whatever the viewer's OS substitutes.
 *
 * `keep` is not a nicety. A `<select>` whose value matches no option silently displays the first
 * one instead, so filtering out a stored choice makes the control claim a face the posts are not
 * using, and fire no change to correct it. The stored family stays offered and the caller marks it.
 *
 * Order is the caller's: the brand picker lists alphabetically, the editor groups by category.
 */
export function fontOptions(input: {
  /** True when the text in hand — or the client's language — needs Cyrillic letters. */
  requiresCyrillic: boolean
  /** Narrow to these tiers; omit for the whole library. */
  categories?: readonly FontCategory[]
  /** A family to offer whatever the filters say, because it is already selected. */
  keep?: string
}): FontEntry[] {
  const { requiresCyrillic, categories, keep } = input
  return FONT_LIBRARY.filter(
    (entry) =>
      (!categories || categories.includes(entry.category)) &&
      (!requiresCyrillic || entry.cyrillic || entry.family === keep)
  )
}

/** Library entry for a doc's (free-string) family, or null when the doc references an unknown font. */
export function getFontEntry(family: string): FontEntry | null {
  return FONT_LIBRARY.find((entry) => entry.family === family) ?? null
}

/**
 * The heaviest weight `family` actually serves at or below `desired`, falling back to its lightest.
 *
 * Needed because lockups no longer pin their own faces: a layout asking for 900 was safe when it
 * also chose the family, and is not now that the family is the client's. Oswald stops at 700, so
 * `headliner` requesting 900 would have Google silently serve 700 and the browser synthesize the
 * difference — fake bold, baked into the exported JPEG, with no error anywhere. See the note at the
 * top of this file: css2 answers 200 and drops what it cannot serve.
 */
export function nearestWeight(family: string, desired: number): number {
  const weights = getFontEntry(family)?.weights
  if (!weights || weights.length === 0) return desired
  const under = weights.filter((w) => w <= desired)
  return under.length > 0 ? Math.max(...under) : Math.min(...weights)
}
