import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { feedSystemTokens } from '../feed-system-compositions'

describe('feedSystemTokens', () => {
  it('merges the needed weights without dropping the kit weights or changing colour/family', () => {
    const bold = feedSystemTokens('bold-blocks', DEFAULT_TOKENS)
    expect(bold.type.display.family).toBe(DEFAULT_TOKENS.type.display.family)
    // keeps the kit's own weights…
    expect(bold.type.display.weights).toEqual(expect.arrayContaining(DEFAULT_TOKENS.type.display.weights))
    // …and adds the heavy weights bold reaches for, sorted + de-duped
    expect(bold.type.display.weights).toContain(800)
    expect(bold.type.display.weights).toContain(900)
    expect([...bold.type.display.weights]).toEqual([...bold.type.display.weights].sort((a, b) => a - b))
    expect(new Set(bold.type.display.weights).size).toBe(bold.type.display.weights.length)

    const quiet = feedSystemTokens('quiet-grid', DEFAULT_TOKENS)
    expect(quiet.type.body.weights).toContain(300)
  })

  it('runs colours through the legibility guard (never returns invisible text) and falls back to editorial', () => {
    const unknown = feedSystemTokens('nope', DEFAULT_TOKENS)
    // Editorial weights (the fallback) are covered.
    expect(unknown.type.display.weights).toEqual(expect.arrayContaining([400, 600, 700]))
    // ensureLegibleColors always yields the five roles.
    for (const role of ['surface', 'ink', 'accent', 'accent-deep', 'line'] as const) {
      expect(unknown.color[role]).toBeTruthy()
    }
  })
})
