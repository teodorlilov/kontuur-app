import type { ReactNode } from 'react'
import type { Binding, BrandTokens, ChromeLayer } from '@/lib/scene-graph'
import { resolve } from '@/lib/scene-graph'
import { baseLayerStyle } from './layer-style'

/** The seven parametric chrome components, drawn as token-bound SVG (colours via `var(--role-*)`). */
export function ChromeView({ layer, tokens }: { layer: ChromeLayer; tokens: BrandTokens }) {
  const { w, h } = layer.rect
  return (
    <div style={baseLayerStyle(layer, tokens)}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }} aria-hidden="true">
        {renderChrome(layer, w, h, tokens)}
      </svg>
    </div>
  )
}

function renderChrome(layer: ChromeLayer, w: number, h: number, tokens: BrandTokens): ReactNode {
  const line = 'var(--role-line)'
  const accent = 'var(--role-accent)'
  const ink = 'var(--role-ink)'
  const sw = paramNum(layer.params.strokeWidth, tokens, 2)

  switch (layer.component) {
    case 'rule':
      return <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={line} strokeWidth={sw} />

    case 'corner-frame': {
      const s = Math.min(w, h) * 0.18
      return (
        <g stroke={line} strokeWidth={sw} fill="none">
          <path d={`M0 ${s} V0 H${s}`} />
          <path d={`M${w - s} 0 H${w} V${s}`} />
          <path d={`M${w} ${h - s} V${h} H${w - s}`} />
          <path d={`M${s} ${h} H0 V${h - s}`} />
        </g>
      )
    }

    case 'dot-grid': {
      const cols = paramNum(layer.params.cols, tokens, 6)
      const rows = paramNum(layer.params.rows, tokens, 6)
      const dots: ReactNode[] = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          dots.push(
            <circle key={`${r}-${c}`} cx={((c + 0.5) / cols) * w} cy={((r + 0.5) / rows) * h} r={sw} fill={line} />
          )
        }
      }
      return <g>{dots}</g>
    }

    case 'arc':
      return <path d={`M0 ${h} A ${w} ${h} 0 0 1 ${w} 0`} stroke={accent} strokeWidth={sw} fill="none" />

    case 'badge':
      return <rect x={0} y={0} width={w} height={h} rx={paramNum(layer.params.radius, tokens, 6)} fill={accent} />

    case 'numeral':
      return (
        <text x={0} y={h * 0.82} fontSize={h * 0.9} fontWeight={700} fill={ink}>
          {paramString(layer.params.value, tokens, '01')}
        </text>
      )

    case 'index-dots': {
      const count = paramNum(layer.params.count, tokens, 5)
      const active = paramNum(layer.params.active, tokens, 0)
      const gap = w / count
      const dots: ReactNode[] = []
      for (let i = 0; i < count; i++) {
        dots.push(
          <circle key={i} cx={gap * (i + 0.5)} cy={h / 2} r={Math.min(gap, h) * 0.15} fill={i === active ? accent : line} />
        )
      }
      return <g>{dots}</g>
    }

    default:
      return null
  }
}

function paramNum(binding: Binding<unknown> | undefined, tokens: BrandTokens, fallback: number): number {
  if (!binding) return fallback
  const value = resolve<unknown>(binding, tokens)
  return typeof value === 'number' ? value : fallback
}

function paramString(binding: Binding<unknown> | undefined, tokens: BrandTokens, fallback: string): string {
  if (!binding) return fallback
  const value = resolve<unknown>(binding, tokens)
  return typeof value === 'string' ? value : fallback
}
