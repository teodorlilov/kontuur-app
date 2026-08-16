import { parseHex, relativeLuminance } from '@/lib/visual/extract/color'
import type { CanvasTextNode } from '@/types/canvas'

/**
 * The fields a preset owns. Every preset writes ALL of them, so switching between two presets can
 * never leave a knob from the one you left behind.
 */
export type TextEffectField =
  | 'letterSpacing'
  | 'shadowColor'
  | 'shadowOpacity'
  | 'shadowBlur'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
  | 'stroke'
  | 'strokeWidth'

export const TEXT_EFFECT_FIELDS: readonly TextEffectField[] = [
  'letterSpacing',
  'shadowColor',
  'shadowOpacity',
  'shadowBlur',
  'shadowOffsetX',
  'shadowOffsetY',
  'stroke',
  'strokeWidth',
]

export type TextEffectId = 'none' | 'shadow' | 'lift' | 'outline' | 'spaced'

/**
 * How thick an outline may get, as a share of the font size.
 *
 * Deliberately modest. When `letterSpacing` is non-zero Konva strokes and fills each glyph in turn
 * rather than the line as a whole, so a later glyph's stroke paints over an earlier glyph's
 * finished fill — a heavy outline eats its neighbour. At this ratio the overlap stays inside the
 * spacing on every pairing the app's font library can produce.
 */
const MAX_STROKE_RATIO = 0.12

/** The widest outline this node may carry, given its size. */
export function maxStrokeWidth(fontSize: number): number {
  return Math.round(fontSize * MAX_STROKE_RATIO)
}

/**
 * The halo colour that separates text of this colour from whatever is behind it — white behind
 * dark type, black behind light. Uses the app's one luminance function rather than a fresh
 * brightness heuristic; an unparseable colour falls back to the commoner case, dark type.
 */
function haloFor(fill: string): string {
  const rgb = parseHex(fill)
  return rgb && relativeLuminance(rgb) < 0.5 ? '#FFFFFF' : '#000000'
}

export interface TextEffectPreset {
  id: TextEffectId
  label: string
  /** One line for the tile's title attribute — what it does, not what it is called. */
  description: string
  /** Given the node's own size and colour, the fields this preset sets. */
  fields: (node: Pick<CanvasTextNode, 'fontSize' | 'fill'>) => Partial<CanvasTextNode>
}

/** Every field a preset owns, cleared. The base every preset builds on, and the 'none' preset. */
function cleared(): Partial<CanvasTextNode> {
  return {
    letterSpacing: undefined,
    shadowColor: undefined,
    shadowOpacity: undefined,
    shadowBlur: undefined,
    shadowOffsetX: undefined,
    shadowOffsetY: undefined,
    stroke: undefined,
    strokeWidth: undefined,
  }
}

/**
 * The five looks the toolbar offers, as presets rather than eight knobs.
 *
 * Sizes are all relative to `fontSize`, so a preset reads the same on a 96px headline and a 28px
 * body — an absolute 6px blur is a soft shadow on one and a smudge on the other.
 */
export const TEXT_EFFECT_PRESETS: readonly TextEffectPreset[] = [
  {
    id: 'none',
    label: 'None',
    description: 'Plain type, no shadow or outline',
    fields: cleared,
  },
  {
    id: 'shadow',
    label: 'Shadow',
    description: 'A soft shadow below the text, for readability over a busy picture',
    fields: ({ fontSize }) => ({
      ...cleared(),
      shadowColor: '#000000',
      shadowOpacity: 0.45,
      shadowBlur: Math.round(fontSize * 0.25),
      shadowOffsetY: Math.round(fontSize * 0.06),
    }),
  },
  {
    id: 'lift',
    label: 'Lift',
    description: 'A wide, faint shadow that lifts the text off the picture without reading as one',
    fields: ({ fontSize }) => ({
      ...cleared(),
      shadowColor: '#000000',
      shadowOpacity: 0.28,
      shadowBlur: Math.round(fontSize * 0.7),
    }),
  },
  {
    id: 'outline',
    label: 'Outline',
    description: 'A ring around each letter, so the text holds up on any background',
    fields: ({ fontSize, fill }) => ({
      ...cleared(),
      // CONTRASTING with the text, not matching it. An outline in the text's own colour is not an
      // outline — it just fattens the letterform, and the preset would look broken while appearing
      // to work. Black or white is the choice a halo actually needs, and it is derived rather than
      // asked for, so the preset stays one press.
      stroke: haloFor(fill),
      strokeWidth: Math.max(1, maxStrokeWidth(fontSize)),
    }),
  },
  {
    id: 'spaced',
    label: 'Spaced',
    description: 'Wide tracking — the editorial label look, best in capitals',
    fields: ({ fontSize }) => ({
      ...cleared(),
      letterSpacing: Math.round(fontSize * 0.18),
    }),
  },
]

/** The patch that puts a node into a preset. Pure — the caller owns committing it. */
export function applyTextEffect(
  node: Pick<CanvasTextNode, 'fontSize' | 'fill'>,
  presetId: TextEffectId
): Partial<CanvasTextNode> {
  const preset = TEXT_EFFECT_PRESETS.find((candidate) => candidate.id === presetId)
  return preset ? preset.fields(node) : cleared()
}

/**
 * Which preset a node is currently wearing, or null if its knobs have been moved off one.
 *
 * Matched on the fields a preset OWNS, so an unrelated edit — a colour change, a resize — never
 * knocks the toolbar off its highlighted tile.
 */
export function activeTextEffect(node: CanvasTextNode): TextEffectId | null {
  for (const preset of TEXT_EFFECT_PRESETS) {
    const fields = preset.fields(node)
    if (TEXT_EFFECT_FIELDS.every((field) => node[field] === fields[field])) return preset.id
  }
  return null
}
