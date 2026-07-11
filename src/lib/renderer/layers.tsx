import type { CSSProperties } from 'react'
import type {
  BrandTokens,
  MarkLayer,
  PlateLayer,
  ShapeLayer,
  TextLayer,
  TextSlot,
  Treatment,
} from '@/lib/scene-graph'
import { resolve } from '@/lib/scene-graph'
import { baseLayerStyle } from './layer-style'

/** A plate is the photographic layer; with no `src` it renders the free token gradient. */
export function PlateView({ layer, tokens }: { layer: PlateLayer; tokens: BrandTokens }) {
  const base = baseLayerStyle(layer, tokens)
  if (!layer.src) {
    return (
      <div
        style={{
          ...base,
          background: 'linear-gradient(160deg, var(--role-accent), var(--role-accent-deep))',
        }}
      />
    )
  }
  return (
    <div style={{ ...base, overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered inside Chromium, not the app UI */}
      <img
        src={layer.src}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', ...treatmentStyle(resolve(layer.treatment, tokens)) }}
      />
    </div>
  )
}

/** Minimal Phase-0 approximations; full treatment compositing lands with plates in Phase 4. */
function treatmentStyle(treatment: Treatment): CSSProperties {
  switch (treatment) {
    case 'mono':
      return { filter: 'grayscale(1)' }
    case 'duotone':
      return { filter: 'grayscale(1) contrast(1.1)' }
    case 'tint':
      return { filter: 'saturate(0.6)' }
    case 'grain':
    case 'none':
    default:
      return {}
  }
}

const DISPLAY_SLOTS: readonly TextSlot[] = ['kicker', 'headline', 'cta']

function typeRoleForSlot(slot: TextSlot): 'display' | 'body' {
  return DISPLAY_SLOTS.includes(slot) ? 'display' : 'body'
}

/** Live text — always a real DOM node, never drawn into anything. `lang` drives OpenType `locl`. */
export function TextView({ layer, tokens }: { layer: TextLayer; tokens: BrandTokens }) {
  const role = typeRoleForSlot(layer.slot)
  const typeToken = tokens.type[role]
  const style: CSSProperties = {
    ...baseLayerStyle(layer, tokens),
    fontFamily: resolve<string>(layer.family, tokens),
    fontSize: resolve<number>(layer.size, tokens),
    fontWeight: resolve<number>(layer.weight, tokens),
    color: resolve<string>(layer.color, tokens),
    textAlign: resolve(layer.align, tokens),
    letterSpacing: `${typeToken.tracking}em`,
    lineHeight: typeToken.lineHeight,
    textTransform: role === 'display' && tokens.type.display.case === 'upper' ? 'uppercase' : undefined,
    whiteSpace: 'pre-wrap',
  }
  // autoFit is measured in the browser by <Stage>'s pass (§2.4): elements marked `data-autofit`
  // are shrunk to fit their box before `__stageReady`. `data-fit` starts "ok" and is overwritten
  // with the outcome (`shrunk:N` | `overflow`); non-autoFit layers stay "ok".
  const autoFitProps = layer.autoFit
    ? { 'data-autofit': '', 'data-fit-min': layer.autoFit.min }
    : undefined
  return (
    <div lang={layer.lang} data-slot={layer.slot} data-fit="ok" {...autoFitProps} style={style}>
      {layer.content}
    </div>
  )
}

/** A filled primitive — rect or ellipse — in a token colour. */
export function ShapeView({ layer, tokens }: { layer: ShapeLayer; tokens: BrandTokens }) {
  return (
    <div
      style={{
        ...baseLayerStyle(layer, tokens),
        background: resolve<string>(layer.fill, tokens),
        borderRadius: layer.shape === 'ellipse' ? '50%' : undefined,
      }}
    />
  )
}

/**
 * A sanitised SVG mark. Its inline `style="fill:var(--role-accent)"` resolves against the
 * Stage variables, so one stored mark recolours per client. In Phase 0 the SVG comes from a
 * hand-authored fixture (`marks`); real packs arrive in Phase 2. `roleOverrides` (scoped
 * per-path variables) are wired in Phase 5.
 */
export function MarkView({
  layer,
  tokens,
  marks,
}: {
  layer: MarkLayer
  tokens: BrandTokens
  marks?: Record<string, string>
}) {
  const base = baseLayerStyle(layer, tokens)
  const svg = marks?.[layer.packElementId]
  if (!svg) return <div data-mark={layer.packElementId} style={base} />
  return <div data-mark={layer.packElementId} style={base} dangerouslySetInnerHTML={{ __html: svg }} />
}
