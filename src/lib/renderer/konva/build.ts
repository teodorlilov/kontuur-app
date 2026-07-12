import Konva from 'konva'
import type {
  Binding,
  BrandTokens,
  ChromeLayer,
  Clip,
  Composition,
  Layer,
  MarkLayer,
  PlateLayer,
  ShapeLayer,
  TextLayer,
  Treatment,
} from '@/lib/scene-graph'
import { resolve } from '@/lib/scene-graph'
import { roleColor } from './colors'
import { fittedFontSize, textContent, textStyle } from './measure-text'

export type BuildContext = { tokens: BrandTokens; images: Map<string, HTMLImageElement> }

// mixBlendMode (DOM) → canvas globalCompositeOperation (Konva).
const BLEND: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  'soft-light': 'soft-light',
  luminosity: 'luminosity',
}

function paramNum(binding: Binding<unknown> | undefined, tokens: BrandTokens, fallback: number): number {
  if (!binding) return fallback
  const v = resolve<unknown>(binding, tokens)
  return typeof v === 'number' ? v : fallback
}
function paramString(binding: Binding<unknown> | undefined, tokens: BrandTokens, fallback: string): string {
  if (!binding) return fallback
  const v = resolve<unknown>(binding, tokens)
  return typeof v === 'string' ? v : fallback
}

/** Rounded-rect path for a clip function (the clip context exposes the 2D path API). */
function roundRectPath(ctx: CanvasRenderingContext2D, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.arcTo(w, 0, w, h, radius)
  ctx.arcTo(w, h, 0, h, radius)
  ctx.arcTo(0, h, 0, 0, radius)
  ctx.arcTo(0, 0, w, 0, radius)
  ctx.closePath()
}

function applyClip(group: Konva.Group, clip: Clip, w: number, h: number): void {
  if (clip.kind === 'rect' && clip.radius) {
    group.clipFunc((ctx) => roundRectPath(ctx, w, h, clip.radius))
  } else if (clip.kind === 'ellipse') {
    group.clipFunc((ctx) => {
      ctx.beginPath()
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2, false)
      ctx.closePath()
    })
  }
  // clip.kind === 'mark' is Phase 5 (per-path SVG clip).
}

/** The per-layer group: positioned box, rotation around centre (matching CSS `rotate` origin), opacity,
 *  blend, and clip. Children draw in local coords 0..w, 0..h. */
function layerGroup(layer: Layer, tokens: BrandTokens): Konva.Group {
  const { x, y, w, h, rotate } = layer.rect
  const group = new Konva.Group({
    x: x + w / 2,
    y: y + h / 2,
    offsetX: w / 2,
    offsetY: h / 2,
    rotation: rotate ?? 0,
    opacity: resolve<number>(layer.opacity, tokens),
    globalCompositeOperation: BLEND[resolve(layer.blendMode, tokens)] ?? 'source-over',
  })
  applyClip(group, layer.clip, w, h)
  return group
}

// CSS `linear-gradient(160deg, …)` start/end points across the box (0deg = to top, clockwise).
function gradientPoints(angleDeg: number, w: number, h: number) {
  const a = (angleDeg * Math.PI) / 180
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  const cx = w / 2
  const cy = h / 2
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2
  return { start: { x: cx - dx * half, y: cy - dy * half }, end: { x: cx + dx * half, y: cy + dy * half } }
}

// Cover-fit crop rect (source pixels) so an image fills w×h without distortion, centred.
function coverCrop(iw: number, ih: number, w: number, h: number) {
  const scale = Math.max(w / iw, h / ih)
  const cw = w / scale
  const ch = h / scale
  return { x: (iw - cw) / 2, y: (ih - ch) / 2, width: cw, height: ch }
}

function applyTreatment(node: Konva.Image, treatment: Treatment): void {
  // Grayscale covers mono/duotone (cached so the filter runs once). Richer grades (duotone tinting,
  // tint) land with the editor in Phase 5; previews use gradient plates and never hit this path.
  if (treatment === 'mono' || treatment === 'duotone') {
    node.filters([Konva.Filters.Grayscale])
    node.cache()
  }
}

function buildPlate(layer: PlateLayer, ctx: BuildContext, w: number, h: number): (Konva.Group | Konva.Shape)[] {
  if (!layer.src) {
    const { start, end } = gradientPoints(160, w, h)
    return [
      new Konva.Rect({
        width: w,
        height: h,
        fillLinearGradientStartPoint: start,
        fillLinearGradientEndPoint: end,
        fillLinearGradientColorStops: [0, roleColor(ctx.tokens, 'accent'), 1, roleColor(ctx.tokens, 'accent-deep')],
      }),
    ]
  }
  const img = ctx.images.get(layer.id)
  if (!img) return []
  const node = new Konva.Image({ image: img, width: w, height: h, crop: coverCrop(img.width, img.height, w, h) })
  applyTreatment(node, resolve(layer.treatment, ctx.tokens))
  return [node]
}

function buildShape(layer: ShapeLayer, ctx: BuildContext, w: number, h: number): (Konva.Group | Konva.Shape)[] {
  const fill = resolve<string>(layer.fill, ctx.tokens)
  if (layer.shape === 'ellipse') return [new Konva.Ellipse({ x: w / 2, y: h / 2, radiusX: w / 2, radiusY: h / 2, fill })]
  return [new Konva.Rect({ width: w, height: h, fill })]
}

function buildText(layer: TextLayer, ctx: BuildContext, w: number): (Konva.Group | Konva.Shape)[] {
  const style = textStyle(layer, ctx.tokens)
  const size = fittedFontSize(layer, ctx.tokens)
  return [
    new Konva.Text({
      width: w,
      text: textContent(layer, ctx.tokens),
      fontFamily: style.fontFamily,
      fontStyle: style.fontStyle,
      fontSize: size,
      fill: style.fill,
      align: style.align,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacingEm * size,
      wrap: 'word',
      padding: 0,
    }),
  ]
}

function buildChrome(layer: ChromeLayer, ctx: BuildContext, w: number, h: number): (Konva.Group | Konva.Shape)[] {
  const line = roleColor(ctx.tokens, 'line')
  const accent = roleColor(ctx.tokens, 'accent')
  const ink = roleColor(ctx.tokens, 'ink')
  const sw = paramNum(layer.params.strokeWidth, ctx.tokens, 2)

  switch (layer.component) {
    case 'rule':
      return [new Konva.Line({ points: [0, h / 2, w, h / 2], stroke: line, strokeWidth: sw })]
    case 'corner-frame': {
      const s = Math.min(w, h) * 0.18
      const opts = { stroke: line, strokeWidth: sw }
      return [
        new Konva.Line({ points: [0, s, 0, 0, s, 0], ...opts }),
        new Konva.Line({ points: [w - s, 0, w, 0, w, s], ...opts }),
        new Konva.Line({ points: [w, h - s, w, h, w - s, h], ...opts }),
        new Konva.Line({ points: [s, h, 0, h, 0, h - s], ...opts }),
      ]
    }
    case 'dot-grid': {
      const cols = paramNum(layer.params.cols, ctx.tokens, 6)
      const rows = paramNum(layer.params.rows, ctx.tokens, 6)
      const dots: (Konva.Group | Konva.Shape)[] = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          dots.push(new Konva.Circle({ x: ((c + 0.5) / cols) * w, y: ((r + 0.5) / rows) * h, radius: sw, fill: line }))
        }
      }
      return dots
    }
    case 'arc':
      return [new Konva.Path({ data: `M0 ${h} A ${w} ${h} 0 0 1 ${w} 0`, stroke: accent, strokeWidth: sw })]
    case 'badge':
      return [new Konva.Rect({ width: w, height: h, cornerRadius: paramNum(layer.params.radius, ctx.tokens, 6), fill: accent })]
    case 'numeral':
      return [new Konva.Text({ text: paramString(layer.params.value, ctx.tokens, '01'), fontSize: h * 0.9, fontStyle: '700', fill: ink })]
    case 'index-dots': {
      const count = paramNum(layer.params.count, ctx.tokens, 5)
      const active = paramNum(layer.params.active, ctx.tokens, 0)
      const gap = w / count
      const dots: (Konva.Group | Konva.Shape)[] = []
      for (let i = 0; i < count; i++) {
        dots.push(new Konva.Circle({ x: gap * (i + 0.5), y: h / 2, radius: Math.min(gap, h) * 0.15, fill: i === active ? accent : line }))
      }
      return dots
    }
    default:
      return []
  }
}

function buildMark(layer: MarkLayer, ctx: BuildContext, w: number, h: number): (Konva.Group | Konva.Shape)[] {
  const img = ctx.images.get(layer.id)
  return img ? [new Konva.Image({ image: img, width: w, height: h })] : []
}

function buildChildren(layer: Layer, ctx: BuildContext): (Konva.Group | Konva.Shape)[] {
  const { w, h } = layer.rect
  switch (layer.type) {
    case 'plate':
      return buildPlate(layer, ctx, w, h)
    case 'shape':
      return buildShape(layer, ctx, w, h)
    case 'text':
      return buildText(layer, ctx, w)
    case 'chrome':
      return buildChrome(layer, ctx, w, h)
    case 'mark':
      return buildMark(layer, ctx, w, h)
    case 'group':
      // Nested groups aren't used by the current packs; full support lands with the editor (Phase 5).
      return layer.children.flatMap((child) => {
        const g = layerGroup(child, ctx.tokens)
        buildChildren(child, ctx).forEach((n) => g.add(n))
        return [g]
      })
    default:
      return []
  }
}

/** Build a composition's layers into one Konva.Group (paint order = array order). Colours/fonts are
 *  resolved to concrete values here — the canvas has no CSS variables. */
export function buildComposition(composition: Composition, tokens: BrandTokens, images: Map<string, HTMLImageElement>): Konva.Group {
  const root = new Konva.Group({ listening: false })
  const ctx: BuildContext = { tokens, images }
  for (const layer of composition.layers) {
    if (layer.hidden) continue
    const group = layerGroup(layer, tokens)
    buildChildren(layer, ctx).forEach((node) => group.add(node))
    root.add(group)
  }
  return root
}
