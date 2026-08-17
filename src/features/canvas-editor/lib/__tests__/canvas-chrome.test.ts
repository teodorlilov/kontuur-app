import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHROME_DANGER,
  CHROME_MARQUEE_FILL,
  CHROME_MARQUEE_STROKE,
  CHROME_SPRING,
} from '../canvas-chrome'
import { CANVAS_PAPER } from '@/lib/canvas/constants'

/**
 * The canvas cannot read a CSS variable, so these colours are literals — which makes them the one
 * place in the app where a token can be changed and something still paints the old value. Nothing
 * in the toolchain notices; this does.
 */
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`))
  if (!match?.[1]) throw new Error(`globals.css declares no --${name}`)
  return match[1].toLowerCase()
}

describe('on-canvas chrome tracks its tokens', () => {
  it('paints the hover outline and handle in --spring', () => {
    expect(CHROME_SPRING.toLowerCase()).toBe(token('spring'))
  })

  it('paints alignment guides in --danger', () => {
    expect(CHROME_DANGER.toLowerCase()).toBe(token('danger'))
  })

  it('builds the marquee from the same green it names', () => {
    const spring = token('spring')
    const rgb = [1, 3, 5].map((at) => parseInt(spring.slice(at, at + 2), 16))
    for (const value of [CHROME_MARQUEE_STROKE, CHROME_MARQUEE_FILL]) {
      const parts = value.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/)
      expect(parts, value).not.toBeNull()
      expect([Number(parts![1]), Number(parts![2]), Number(parts![3])]).toEqual(rgb)
    }
  })

  it('keeps the exported sheet white, whatever the editor theme does', () => {
    // Not a token deliberately: this one is BAKED, and a jpeg cannot carry a theme.
    expect(CANVAS_PAPER).toBe('#FFFFFF')
  })
})
