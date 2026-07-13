import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import { parseHex, toHsl } from '@/lib/brand-kit/extract/color'
import type { AspectRatio } from '@/lib/renderer/layout/anchor'
import type { BrandTokens } from '@/lib/scene-graph'

/**
 * Image-prompt construction (Phase 4). Two parts, kept separate so the look stays consistent across a
 * feed while each slide's image still relates to its content:
 *
 *  1. **Scene** — a concrete, *text-free* description of what to photograph. Composed per slide by a
 *     cheap LLM call from the slide copy + the brand's subjects (that call lives in the generate layer);
 *     here it arrives as `scene`, with a deterministic fallback to a brief subject.
 *  2. **Brand style scaffold** — deterministic, per brand + feed system: the palette as colour words,
 *     the mood, the feed-system art direction, and a ratio/negative-space directive. This is what locks
 *     the look across the carousel.
 *
 * A **negative prompt** is essential: we composite our own typography, so the model must never render
 * text. `formatForModel` adapts the same structured brief to the target model's prompt style.
 *
 * Pure and dependency-free (colour maths + string assembly) so it is fully unit-tested without any API.
 */

// ── Colour words ────────────────────────────────────────────────────────────
// Models take colour direction as words, not hex — so map each palette hex to a plain-language name.
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

/** The brand's colour direction as a short phrase — accent, its deep sibling, and the surface, deduped
 *  (ink is text, not imagery). */
export function paletteWords(colors: BrandTokens['color']): string {
  const names = [colors.accent, colors['accent-deep'], colors.surface].map(hexToColorName)
  return [...new Set(names)].join(', ')
}

// ── Art direction ─────────────────────────────────────────────────────────────

// Each feed system's photographic look — the deterministic anchor that keeps a carousel coherent.
const FEED_SYSTEM_ART_DIRECTION: Record<string, string> = {
  editorial: 'muted editorial photography, generous negative space, soft natural light, understated and premium',
  'bold-blocks': 'a single bold high-contrast subject, graphic and saturated, dramatic directional light',
  'quiet-grid': 'minimal and airy with abundant negative space, soft diffused light, calm and precise',
}
const DEFAULT_ART_DIRECTION = FEED_SYSTEM_ART_DIRECTION.editorial!

const ROLE_DIRECTIVE: Record<PlateRole, string> = {
  cover: 'a striking hero image',
  interior: 'a subtle, textural background image',
}

// The ratio directive keeps space clear for the overlaid type (we always composite text on top).
const RATIO_DIRECTIVE: Record<AspectRatio, string> = {
  '4:5': 'vertical 4:5 portrait framing, with the upper third kept clear and unobtrusive for overlaid text',
  '1:1': 'square framing, with calm negative space near the edges for overlaid text',
}

/** Essential — we composite our own typography, so the model must never draw text or marks. */
export const NEGATIVE_PROMPT =
  'text, letters, words, typography, captions, watermark, logo, signature, ui, low quality, blurry, ' +
  'distorted, deformed, extra limbs, oversaturated, jpeg artifacts, frame, border'

// ── Assembly ──────────────────────────────────────────────────────────────────

export type PlateRole = 'cover' | 'interior'
export type ImageModel = 'flux' | 'sdxl'

export type ImagePromptInput = {
  role: PlateRole
  brief: BrandBrief | null
  colors: BrandTokens['color']
  feedSystemSlug: string | null
  ratio: AspectRatio
  /** The LLM-composed, text-free scene for this slide. Falls back to a brief subject when absent. */
  scene?: string | null
}

export type StructuredPrompt = {
  subject: string
  style: string
  palette: string
  framing: string
  negative: string
}

/** A concrete subject when no per-slide scene was composed — the strongest brief subject + motif. */
function fallbackScene(brief: BrandBrief | null): string {
  const subject = brief?.photographicSubjects?.[0]?.trim()
  const motif = brief?.motifs?.[0]?.trim()
  if (subject && motif) return `${subject}, with ${motif}`
  return subject || motif || 'an abstract, minimal branded background'
}

/** Assemble the structured prompt from the per-slide scene and the deterministic brand scaffold. */
export function buildImagePrompt(input: ImagePromptInput): StructuredPrompt {
  const { role, brief, colors, feedSystemSlug, ratio } = input
  const scene = input.scene?.trim() || fallbackScene(brief)
  const art = FEED_SYSTEM_ART_DIRECTION[feedSystemSlug ?? ''] ?? DEFAULT_ART_DIRECTION
  const mood = brief?.mood?.trim()
  return {
    subject: `${ROLE_DIRECTIVE[role]}: ${scene}`,
    style: mood ? `${art}, ${mood}` : art,
    palette: `colour palette of ${paletteWords(colors)}`,
    framing: RATIO_DIRECTIVE[ratio],
    negative: NEGATIVE_PROMPT,
  }
}

const capitalize = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

/**
 * Render the structured prompt for a target model: Flux wants natural-language prose, SDXL wants a
 * weighted comma-separated tag list. The negative prompt is returned alongside (both models take one).
 */
export function formatForModel(
  p: StructuredPrompt,
  model: ImageModel = 'flux'
): { prompt: string; negativePrompt: string } {
  if (model === 'sdxl') {
    const prompt = [p.subject, p.style, p.palette, p.framing, 'no text, no logos'].join(', ')
    return { prompt, negativePrompt: p.negative }
  }
  const prompt =
    `${capitalize(p.subject)}. ${capitalize(p.style)}. ${capitalize(p.palette)}. ${capitalize(p.framing)}. ` +
    'Absolutely no text, letters, or logos anywhere in the image.'
  return { prompt, negativePrompt: p.negative }
}
