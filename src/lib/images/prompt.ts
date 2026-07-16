import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import { parseHex, toHsl } from '@/lib/brand-kit/extract/color'
import type { BrandTokens } from '@/lib/scene-graph'
import { capitalize } from '@/utils/format'

/**
 * Design-prompt construction. A slide's visual is a rich, *text-free* design rendered by the design model; we
 * composite the exact brand text on top (Cyrillic-safe, brand fonts, editable). The prompt combines four
 * ingredients kept separate so a carousel stays consistent while each slide relates to its message: the
 * per-slide scene (`images/scene.ts`), the style scaffold (`renderer/styles.ts`), the brand palette, and a
 * negative-space + no-text directive. Pure string/colour maths → fully unit-tested without an API.
 */

// ── Colour words ────────────────────────────────────────────────────────────
// Models take colour as words + hex — map each palette hex to a plain-language name.
// Hue buckets by upper bound (degrees) → colour word.
const HUE_NAMES: readonly [number, string][] = [
  [15, 'red'], [45, 'orange'], [65, 'amber'], [80, 'yellow'], [160, 'green'],
  [195, 'teal'], [255, 'blue'], [280, 'indigo'], [320, 'violet'], [345, 'magenta'], [361, 'red'],
]

/** A plain-language name for a hex colour — e.g. `#5B7BFB` → "blue", `#1E3A8A` → "deep blue",
 *  `#F4EFE6` → "off-white". Near-neutral colours resolve to a greyscale word. */
export function hexToColorName(hex: string): string {
  const rgb = parseHex(hex)
  if (!rgb) return 'neutral'
  const { h, s, l } = toHsl(rgb)
  if (s < 0.12) {
    if (l > 0.92) return 'white'
    if (l > 0.82) return 'off-white'
    if (l > 0.62) return 'light grey'
    if (l > 0.4) return 'grey'
    if (l > 0.16) return 'charcoal'
    return 'black'
  }
  const hue = HUE_NAMES.find(([max]) => h <= max)?.[1] ?? 'red'
  const lightness = l > 0.78 ? 'pale ' : l < 0.35 ? 'deep ' : ''
  const muted = s < 0.35 ? 'muted ' : ''
  return `${lightness}${muted}${hue}`.trim()
}

/** The brand's imagery colours — accent, its deep sibling, and the surface (ink is text, not imagery). The
 *  single source both palette phrasings draw from. */
const brandPaletteHexes = (colors: BrandTokens['color']): string[] => [colors.accent, colors['accent-deep'], colors.surface]

/** The brand's colour direction as a short phrase — the palette colours as words, deduped by name. */
export function paletteWords(colors: BrandTokens['color']): string {
  return [...new Set(brandPaletteHexes(colors).map(hexToColorName))].join(', ')
}

/** The palette as name + hex pairs (deduped by hex) — the precise brand direction a design model honours best. */
function paletteDetail(colors: BrandTokens['color']): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const hex of brandPaletteHexes(colors)) {
    const key = hex.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(`${hexToColorName(hex)} (${hex})`)
  }
  return parts.join(', ')
}

// ── Design roles + negative space ───────────────────────────────────────────

export type PlateRole = 'cover' | 'interior'

const ROLE_DIRECTIVE: Record<PlateRole, string> = {
  cover: 'This is the cover slide — a striking, establishing hero composition that sets the theme.',
  interior: 'This is an interior slide — a supporting composition that continues the same visual world.',
}

/** Where to reserve open space for the composited text — callers map their style's text zone to one of these. */
export type NegativeSpace = 'bottom' | 'center' | 'top'

const NEGATIVE_SPACE_DIRECTIVE: Record<NegativeSpace, string> = {
  bottom: 'Keep the lower third calm, open and uncluttered — plain negative space for large overlaid text.',
  center: 'Keep the central band calm and open, with the visual interest pushed to the edges — negative space for centred overlaid text.',
  top: 'Keep the upper third calm, open and uncluttered — plain negative space for large overlaid text.',
}

/** A concrete subject when no per-slide scene was composed — the strongest brief subject + motif. */
function fallbackScene(brief: BrandBrief | null): string {
  const subject = brief?.photographicSubjects?.[0]?.trim()
  const motif = brief?.motifs?.[0]?.trim()
  if (subject && motif) return `${subject}, with ${motif}`
  return subject || motif || 'an abstract, minimal branded composition'
}

export type DesignPromptInput = {
  role: PlateRole
  /** The LLM-composed, text-free scene for this slide; null → the deterministic brief fallback. */
  scene: string | null
  /** The style's aesthetic directives (from `renderer/styles.ts`). */
  scaffold: string
  colors: BrandTokens['color']
  brief: BrandBrief | null
  /** Where to reserve open space for the composited text. */
  negativeSpace: NegativeSpace
  /** The art-direction conditioning phrase (formality / density / palette discipline / ornament). */
  conditioning?: string
}

/** Assemble the design-model prompt: scaffold + slide subject + palette + conditioning + reserved negative
 *  space + an emphatic no-text rule (we composite type). Reference images go to `generateDesign` alongside. */
export function buildDesignPrompt(input: DesignPromptInput): string {
  const scene = input.scene?.trim() || fallbackScene(input.brief)
  const mood = input.brief?.mood?.trim()
  const conditioning = input.conditioning?.trim()
  return [
    'A sophisticated, original social-media carousel slide design — a finished, art-directed visual.',
    `${input.scaffold.trim()}.`,
    `${ROLE_DIRECTIVE[input.role]}`,
    `Subject: ${scene}.`,
    mood ? `Mood: ${mood}.` : '',
    `Colour palette: ${paletteDetail(input.colors)} — use these brand colours throughout.`,
    conditioning ? `${capitalize(conditioning)}.` : '',
    NEGATIVE_SPACE_DIRECTIVE[input.negativeSpace],
    'Absolutely no text, letters, numbers, words, captions, labels, logos, or watermarks anywhere in the image — the design must be entirely text-free (typography is composited separately).',
  ]
    .filter(Boolean)
    .join(' ')
}

// ── Vector prompts (Recraft text-to-vector) ────────────────────────────────────
// A flat, iconic, on-brand mark — never a photo, never text. Used by the onboarding starter set + the
// editor's "add an element" tool.

const VECTOR_STYLE: Record<string, string> = {
  editorial: 'refined minimal line-art, elegant and restrained',
  'bold-blocks': 'bold geometric high-contrast flat shapes',
  'quiet-grid': 'delicate precise thin-line',
  illustrative: 'characterful flat illustration, expressive and modern',
}
const DEFAULT_VECTOR_STYLE = VECTOR_STYLE.editorial!

/** A Recraft prompt for one brand mark from motif + palette + style. `ornament` folds in the brand's ornament
 *  character (decoration is generated, not enumerated). */
export function buildVectorPrompt(input: {
  motif: string
  colors: BrandTokens['color']
  feedSystemSlug: string | null
  ornament?: string
}): string {
  const style = VECTOR_STYLE[input.feedSystemSlug ?? ''] ?? DEFAULT_VECTOR_STYLE
  const motif = input.motif.trim() || 'an abstract geometric brand mark'
  const character = input.ornament?.trim() ? ` The mark's character: ${input.ornament.trim()}.` : ''
  return (
    `A single ${style} vector graphic of ${motif}. Flat solid shapes in a colour palette of ` +
    `${paletteWords(input.colors)}, centred on a transparent background. Simple and iconic — ` +
    `no text, no words, no lettering, no photorealism, no gradients.${character}`
  )
}

/** An on-brand prompt from operator free-text (editor regenerate/reference) — keeps palette + negative-space
 *  + no-text so a hand-typed prompt still fits the composite. Empty → an abstract branded background. */
export function buildOperatorPrompt(text: string, colors: BrandTokens['color']): string {
  const subject = text.trim() || 'an abstract, minimal branded composition'
  return (
    `${capitalize(subject)}. Colour palette of ${paletteDetail(colors)}. Generous calm negative space for ` +
    'overlaid text. Absolutely no text, letters, or logos anywhere in the image.'
  )
}
