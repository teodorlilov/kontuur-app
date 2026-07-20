import type { Palette } from '@/types/visual'
import { parseHex, toHsl } from '@/lib/visual/extract/color'
import { TEXT_ZONES, type BackdropRole, type NegativeSpace } from './text-zones'

/**
 * Backdrop-prompt construction. A slide's visual is a rich, *text-free* image; we composite the exact brand
 * text on top (editable, brand fonts). Anchors (cover/CTA) use a copy-derived scene; interiors use an
 * abstract brand texture. The negative-space directive comes from the shared `TEXT_ZONES`, so the clean
 * region the model leaves is exactly where the renderer places text. Pure string/colour maths — unit-tested.
 */

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

// Hue buckets by upper bound (degrees) → colour word.
const HUE_NAMES: readonly [number, string][] = [
  [15, 'red'], [45, 'orange'], [65, 'amber'], [80, 'yellow'], [160, 'green'],
  [195, 'teal'], [255, 'blue'], [280, 'indigo'], [320, 'violet'], [345, 'magenta'], [361, 'red'],
]

/** A plain-language name for a hex colour (models take colour as words + hex). Near-neutrals → greyscale. */
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

// The brand's imagery colours — accent, its deep sibling, and the surface (ink is text, not imagery).
const brandPaletteHexes = (p: Palette): string[] => [p.accent, p['accent-deep'], p.surface]

/** The palette as name + hex pairs (deduped by hex) — the precise brand direction a model honours best. */
function paletteDetail(p: Palette): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const hex of brandPaletteHexes(p)) {
    const key = hex.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(`${hexToColorName(hex)} (${hex})`)
  }
  return parts.join(', ')
}

/** The brand's colour direction as a short phrase — palette colours as words, deduped. */
export function paletteWords(p: Palette): string {
  return [...new Set(brandPaletteHexes(p).map(hexToColorName))].join(', ')
}

const ROLE_DIRECTIVE: Record<BackdropRole, string> = {
  cover: 'Cover slide: a striking hero composition that sets the theme.',
  interior: 'Interior slide: a calm, supporting background in the same visual world.',
  cta: 'Closing call-to-action slide: a confident, framed composition.',
}

const NEGATIVE_SPACE_DIRECTIVE: Record<NegativeSpace, string> = {
  bottom: 'Keep the lower third open and uncluttered for large overlaid text.',
  center: 'Keep the central band open with interest at the edges, for centred overlaid text.',
  top: 'Keep the upper third open and uncluttered for large overlaid text.',
}

const NO_TEXT = 'No text, letters, numbers, logos, or watermarks anywhere — entirely text-free.'

/** fal rejects prompts over 1000 chars; keep well under with headroom, and cap the variable scene/mood. */
export const MAX_PROMPT_CHARS = 1000
const SCENE_MAX = 240
const MOOD_MAX = 60

/** Trim to `max` chars on a word boundary and strip trailing punctuation (also collapses a scene's own
 *  trailing period so we never emit "..."). */
function truncateWords(s: string, max: number): string {
  let t = s.trim()
  if (t.length > max) {
    const cut = t.slice(0, max)
    const sp = cut.lastIndexOf(' ')
    t = sp > max * 0.6 ? cut.slice(0, sp) : cut
  }
  return t.replace(/[\s,.;:—-]+$/, '')
}

export type BackdropPromptInput = {
  role: BackdropRole
  /** For cover/CTA: the copy-derived, text-free scene (null → abstract fallback). Ignored for interiors. */
  scene: string | null
  palette: Palette
  mood: string
  /** Preset style modifiers (the aesthetic scaffold) + the preset's negative/avoid list. */
  promptModifiers: string
  negativePrompt: string
}

/** Assemble the backdrop prompt: preset style + role + subject/texture + palette + reserved negative space +
 *  a folded-in no-text/avoid clause. Interiors are brand-level (no copy → per-carousel reuse). */
export function buildBackdropPrompt(input: BackdropPromptInput): string {
  const { negativeSpace } = TEXT_ZONES[input.role]
  const mood = truncateWords(input.mood, MOOD_MAX)
  const avoid = input.negativePrompt.trim()
  const scene = truncateWords(input.scene ?? '', SCENE_MAX)
  const subject =
    input.role === 'interior'
      ? 'Abstract, textured brand background — soft shapes and material, no central subject.'
      : `Subject: ${scene || 'an original, on-brand editorial composition'}.`

  const prompt = [
    'Original, art-directed, text-free social-media slide backdrop.',
    `${input.promptModifiers.trim()}.`,
    ROLE_DIRECTIVE[input.role],
    subject,
    mood ? `Mood: ${mood}.` : '',
    `Colour palette: ${paletteDetail(input.palette)} — use these brand colours throughout.`,
    NEGATIVE_SPACE_DIRECTIVE[negativeSpace],
    NO_TEXT,
    avoid ? `Avoid: ${avoid}.` : '',
  ]
    .filter(Boolean)
    .map((s) => capitalize(s))
    .join(' ')

  // Guarantee we never exceed fal's hard limit, even with an unusually long scene/mood/palette.
  return prompt.length <= MAX_PROMPT_CHARS ? prompt : truncateWords(prompt, MAX_PROMPT_CHARS)
}
