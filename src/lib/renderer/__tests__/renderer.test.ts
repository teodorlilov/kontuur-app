import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import type { TextLayer } from '@/lib/scene-graph'
import { baseLayerStyle } from '../layer-style'
import { tokenVars } from '../token-vars'

describe('tokenVars', () => {
  it('maps the five colour roles to --role-* custom properties', () => {
    const vars = tokenVars(DEFAULT_TOKENS)
    expect(vars['--role-accent']).toBe('#2563EB')
    expect(vars['--role-accent-deep']).toBe('#1E3A8A')
    expect(vars['--role-surface']).toBe('#FFFFFF')
    expect(Object.keys(vars)).toHaveLength(5)
  })
})

describe('baseLayerStyle', () => {
  const layer: TextLayer = {
    id: 't1',
    name: 'Headline',
    locked: false,
    hidden: false,
    rect: { x: 120, y: 900, w: 840, h: 300, rotate: 0 },
    opacity: { mode: 'literal', value: 0.9 },
    blendMode: { mode: 'literal', value: 'multiply' },
    clip: { kind: 'rect', radius: 12 },
    type: 'text',
    slot: 'headline',
    content: 'Слънцето не чака',
    lang: 'bg',
    family: { mode: 'bound', token: 'type.display.family' },
    size: { mode: 'bound', token: 'type.baseSize' },
    weight: { mode: 'literal', value: 700 },
    color: { mode: 'bound', token: 'color.ink' },
    align: { mode: 'literal', value: 'left' },
    autoFit: { min: 24, max: 64 },
  }

  it('positions the layer absolutely at its rect and resolves opacity/blend/clip', () => {
    const style = baseLayerStyle(layer, DEFAULT_TOKENS)
    expect(style.position).toBe('absolute')
    expect(style.left).toBe(120)
    expect(style.top).toBe(900)
    expect(style.width).toBe(840)
    expect(style.opacity).toBe(0.9)
    expect(style.mixBlendMode).toBe('multiply')
    expect(style.clipPath).toBe('inset(0 round 12px)')
  })
})
