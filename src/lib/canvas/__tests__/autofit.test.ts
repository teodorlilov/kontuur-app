import { describe, expect, it } from 'vitest'
import { computeFit } from '../autofit'

describe('computeFit', () => {
  it('reports ok when the start size already fits', () => {
    expect(computeFit(() => true, { startSize: 88, min: 32, scale: 1.2 })).toEqual({
      size: 88,
      steps: 0,
      fit: 'ok',
    })
  })

  it('steps down the scale until it fits', () => {
    const outcome = computeFit((size) => size <= 60, { startSize: 88, min: 32, scale: 1.2 })
    expect(outcome.fit).toBe(`shrunk:${outcome.steps}`)
    expect(outcome.size).toBeLessThanOrEqual(60)
    expect(outcome.size).toBeGreaterThanOrEqual(32)
  })

  it('reports overflow at the floor when nothing fits', () => {
    const outcome = computeFit(() => false, { startSize: 88, min: 32, scale: 1.2 })
    expect(outcome.fit).toBe('overflow')
    expect(outcome.size).toBe(32)
  })
})
