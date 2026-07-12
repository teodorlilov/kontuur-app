/**
 * Scene graph — the declarative, diffable description of one slide.
 * Ported verbatim from COMPOSITION-ENGINE-TECHNICAL.md §5 (layers) and §4 (tokens).
 * Array order is paint order; index 0 is the bottom layer. There is no z-index field.
 */

/** A visual property is either bound to a design token or overridden with a literal value. */
export type Binding<T> =
  | { mode: 'bound'; token: string }
  | { mode: 'literal'; value: T }

export type Rect = { x: number; y: number; w: number; h: number; rotate: number }

export type Clip =
  | { kind: 'none' }
  | { kind: 'rect'; radius: number }
  | { kind: 'ellipse' }
  | { kind: 'mark'; packElementId: string }

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'luminosity'

export type Treatment = 'none' | 'duotone' | 'tint' | 'grain' | 'mono'

/**
 * How a layer repositions when the canvas height changes across aspect ratios. Instagram sizes are all
 * 1080 wide, so only the height varies (4:5 = 1350, 1:1 = 1080, 4:3 = 810) — a layer keeps its distance
 * from the `top` (default), from the `bottom`, stays `center`ed, `fill`s the whole canvas
 * (backgrounds/plates), or `stretch`es keeping both insets (an inset frame). Resolved by
 * `resolveComposition` (renderer/layout/anchor.ts).
 */
export type VAnchor = 'top' | 'bottom' | 'center' | 'fill' | 'stretch'

export type LayerBase = {
  id: string
  name: string
  locked: boolean
  hidden: boolean
  rect: Rect
  vAnchor?: VAnchor // default 'top'
  opacity: Binding<number>
  blendMode: Binding<BlendMode>
  clip: Clip
}

export type PlateLayer = LayerBase & {
  type: 'plate'
  source: 'generated' | 'uploaded'
  editHeadId: string | null
  src: string
  treatment: Binding<Treatment>
  focalZone?: Rect
}

export type MarkLayer = LayerBase & {
  type: 'mark'
  packElementId: string
  roleOverrides: Record<string, { fill?: Binding<string>; stroke?: Binding<string> }>
}

/** kicker/headline drive the display family; body/caption/label drive the body family. */
export type TextSlot = 'kicker' | 'headline' | 'body' | 'cta' | 'caption' | 'label' | 'free'

export type TextLayer = LayerBase & {
  type: 'text'
  slot: TextSlot
  content: string
  lang: string // BCP-47; drives OpenType `locl`
  family: Binding<string>
  size: Binding<number>
  weight: Binding<number>
  color: Binding<string>
  align: Binding<'left' | 'center' | 'right'>
  autoFit: { min: number; max: number } | null
}

/** Declared by a composition template; resolved to a concrete MarkLayer at generation. */
export type MarkSlot = { markSource: 'style' | 'motif' }

export type ChromeComponent =
  | 'rule'
  | 'corner-frame'
  | 'dot-grid'
  | 'arc'
  | 'badge'
  | 'numeral'
  | 'index-dots'

export type ChromeLayer = LayerBase & {
  type: 'chrome'
  component: ChromeComponent
  params: Record<string, Binding<unknown>>
}

export type ShapeLayer = LayerBase & {
  type: 'shape'
  shape: 'rect' | 'ellipse'
  fill: Binding<string>
}

export type GroupLayer = LayerBase & { type: 'group'; children: Layer[] }

export type Layer = PlateLayer | MarkLayer | TextLayer | ChromeLayer | ShapeLayer | GroupLayer

export type CompositionRole = 'cover' | 'statement' | 'list' | 'quote' | 'cta' | 'single'

export type Composition = {
  id: string
  feedSystemId: string
  brandKitVersion: number
  size: { w: number; h: number } // 1080-wide; height per aspect ratio (4:5 = 1350, 1:1 = 1080, 4:3 = 810)
  layers: Layer[]
}

/* ── Brand tokens (§4) — five element-linked colour roles, two families, spacing, grid ── */

export type ColorRole = 'surface' | 'ink' | 'accent' | 'accent-deep' | 'line'

export type DisplayType = {
  family: string
  weights: number[]
  tracking: number
  case: 'none' | 'upper'
  lineHeight: number
}

export type BodyType = {
  family: string
  weights: number[]
  tracking: number
  lineHeight: number
}

export type BrandTokens = {
  color: Record<ColorRole, string>
  type: {
    display: DisplayType
    body: BodyType
    scale: number // ratio, e.g. 1.25
    baseSize: number // px at 1080×1350
  }
  space: { steps: number[]; radius: number; hairline: number }
  grid: { marginX: number; marginY: number; baseline: number }
}
