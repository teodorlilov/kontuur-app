import type { CSSProperties } from 'react'
import type { BrandTokens, Composition as CompositionType } from '@/lib/scene-graph'
import { Composition, SLIDE_H, SLIDE_W, tokenVars } from '@/lib/renderer'
import { REFERENCE_MARKS } from '@/lib/renderer/reference-compositions'

/**
 * One reference composition rendered at the given tokens, scaled to `width`. Reuses the Phase-0
 * `<Composition/>` so the preview is the same tree the render service screenshots. Colours are CSS
 * variables, so re-rendering with new tokens recolours instantly, client-side, with no request.
 * Fonts are assumed loaded by an ancestor (PreviewGrid / the tab injects the `<link>`).
 */
export function PreviewCell({
  composition,
  tokens,
  width,
  lang = 'bg',
}: {
  composition: CompositionType
  tokens: BrandTokens
  width: number
  lang?: string
}) {
  const scale = width / SLIDE_W
  const stageStyle = {
    width: SLIDE_W,
    height: SLIDE_H,
    position: 'relative',
    overflow: 'hidden',
    background: 'var(--role-surface)',
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    ...tokenVars(tokens),
  } as CSSProperties

  return (
    <div
      style={{
        width,
        height: SLIDE_H * scale,
        borderRadius: 8,
        overflow: 'hidden',
        border: '0.5px solid var(--color-border-1)',
        flexShrink: 0,
      }}
    >
      <div lang={lang} style={stageStyle}>
        <Composition composition={composition} tokens={tokens} marks={REFERENCE_MARKS} />
      </div>
    </div>
  )
}
