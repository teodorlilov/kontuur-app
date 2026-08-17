import { parseHex, relativeLuminance } from '@/lib/visual/extract/color'
import type { CanvasTextNode } from '@/types/canvas'

/**
 * Every field any preset may write. See `TEXT_EFFECT_EXCLUSIVE_FIELDS` for the ones this layer owns
 * outright and therefore clears on every press — the two differ by exactly `letterSpacing`.
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

/**
 * The fields this layer owns OUTRIGHT, and may therefore clear without asking.
 *
 * `letterSpacing` is the one field that is not on this list although `spaced` writes it, because
 * `LOCKUP_FIELDS` claims it too: `trackingFor` derives a lockup's tracking from its own size and
 * case, so tracking is typography the layout chose rather than a decoration laid over it. Clearing
 * it from the shared base meant pressing Shadow — which has nothing to say about tracking — silently
 * undid the lockup's spacing, and with it the slide's claim to be wearing that lockup at all.
 *
 * `none` still clears it, so choosing `spaced` stays undoable by the control that set it. The trade
 * that leaves, stated because it is a decision and not an oversight: pressing None on a slide
 * wearing a lockup zeroes the lockup's tracking rather than restoring it. Restoring would mean
 * remembering the value from before the preset, which is a field this model does not have — ⌘Z is
 * the way back today.
 */
export const TEXT_EFFECT_EXCLUSIVE_FIELDS: readonly TextEffectField[] = TEXT_EFFECT_FIELDS.filter(
  (field) => field !== 'letterSpacing'
)

/**
 * Every field this layer owns outright, cleared — the base the decorating presets build on.
 *
 * Built FROM the list rather than restating it: a field added to one and forgotten in the other is a
 * knob that survives a preset change, which is the single failure this whole layer exists to prevent.
 * The cast is the shape `Object.fromEntries` cannot express — keys drawn from a literal union.
 */
function cleared(): Partial<CanvasTextNode> {
  return Object.fromEntries(
    TEXT_EFFECT_EXCLUSIVE_FIELDS.map((field) => [field, undefined])
  ) as Partial<CanvasTextNode>
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
    // The one preset that also clears `letterSpacing`, so the control that set wide tracking is the
    // control that takes it away again. See EXCLUSIVE_FIELDS for why the others leave it alone.
    fields: () => ({ ...cleared(), letterSpacing: undefined }),
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
    // Matched on the fields the preset DECLARES, not on every field the layer knows about. A preset
    // that deliberately leaves `letterSpacing` alone must not be judged on it, or a lockup's own
    // tracking would stop every effect from reporting as applied — the same way it once stopped
    // every lockup from reporting as worn.
    const declared = Object.keys(fields) as TextEffectField[]
    if (declared.every((field) => node[field] === fields[field])) return preset.id
  }
  return null
}
