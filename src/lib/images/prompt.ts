import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import { parseHex, toHsl } from '@/lib/brand-kit/extract/color'
import type { BrandTokens } from '@/lib/scene-graph'
import { capitalize } from '@/utils/format'

/**
 * Image-prompt construction for the generative design pipeline. A slide's visual is a full, rich, *text-free*
 * design rendered by a capable design model; we composite the exact brand text on top (Cyrillic-safe, brand
 * fonts, editable). This module builds the design brief from four ingredients, kept separate so the look
 * stays consistent across a carousel while each slide still relates to its message:
 *
 *  1. **Scene** — one concrete, text-free subject for this slide (composed from the copy by a cheap LLM in
 *     `images/scene.ts`); arrives here as `scene`, with a deterministic fallback to a brief subject.
 *  2. **Style scaffold** — the aesthetic directives that distinguish the look (editorial / bold / illustrative),
 *     passed in by the caller from the active style (`renderer/styles.ts`).
 *  3. **Brand palette** — the exact colours as words + hex, so the design comes out on-brand.
 *  4. **Negative space + no-text** — reserve open space where the text zone will sit, and forbid any drawn
 *     letters (we render type ourselves).
 *
 * Pure and dependency-free (colour maths + string assembly) so it is fully unit-tested without any API.
 */

// ── Colour words ────────────────────────────────────────────────────────────
// Models take colour direction as words + hex — map each palette hex to a plain-language name.
// (`toHsl` is the shared implementation in extract/color.ts.)

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

/** Where on the slide open space must be reserved for the composited text — the biggest lever on whether the
 *  generated negative space and our text zone agree. Callers map their style's text zone to one of these. */
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

/**
 * Assemble the full design-model prompt: the style scaffold + this slide's subject + the exact palette +
 * the art-direction conditioning + the reserved negative space + an emphatic no-text rule (we composite the
 * brand type separately). One prompt string; reference images are passed to `generateDesign` alongside.
 */
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
// A brand vector is a flat, iconic, on-brand mark — never a photo and never text (we set our own type). Used
// by the onboarding starter set and the editor's on-demand "add an element" tool.

const VECTOR_STYLE: Record<string, string> = {
  editorial: 'refined minimal line-art, elegant and restrained',
  'bold-blocks': 'bold geometric high-contrast flat shapes',
  'quiet-grid': 'delicate precise thin-line',
  illustrative: 'characterful flat illustration, expressive and modern',
}
const DEFAULT_VECTOR_STYLE = VECTOR_STYLE.editorial!

/** A Recraft text-to-vector prompt for one brand mark from a motif + palette + style. An optional `ornament`
 *  directive (the art director's `ornamentBrief`) folds the brand's ornament character in, so generated marks
 *  reflect that brand — the "decoration is generated, not enumerated" path. */
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

/**
 * An on-brand design prompt from an operator's free-text description (editor "regenerate/reference"). Keeps
 * the palette + negative-space + no-text directives so a hand-typed prompt still fits the composite. Falls
 * back to an abstract branded background when the text is empty.
 */
export function buildOperatorPrompt(text: string, colors: BrandTokens['color']): string {
  const subject = text.trim() || 'an abstract, minimal branded composition'
  return (
    `${capitalize(subject)}. Colour palette of ${paletteDetail(colors)}. Generous calm negative space for ` +
    'overlaid text. Absolutely no text, letters, or logos anywhere in the image.'
  )
}
