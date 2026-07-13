import { describe, expect, it } from 'vitest'
import { feedSystemPack } from '@/lib/renderer/feed-system-compositions'
import { promptHash, seedFromClient } from '../hash'
import { hasPlateLayer, plateRole } from '../generate-plates'

describe('hash', () => {
  it('promptHash is stable for equal inputs regardless of key order', () => {
    expect(promptHash({ a: 1, b: 2 })).toBe(promptHash({ b: 2, a: 1 }))
  })

  it('promptHash differs when the copy differs', () => {
    expect(promptHash({ headline: 'A' })).not.toBe(promptHash({ headline: 'B' }))
  })

  it('seedFromClient is deterministic and non-negative', () => {
    const s = seedFromClient('client-123')
    expect(s).toBe(seedFromClient('client-123'))
    expect(s).not.toBe(seedFromClient('client-456'))
    expect(s).toBeGreaterThanOrEqual(0)
  })
})

describe('plateRole', () => {
  it('cover is first, the rest interior', () => {
    expect(plateRole(0)).toBe('cover')
    expect(plateRole(1)).toBe('interior')
    expect(plateRole(5)).toBe('interior')
  })
})

describe('hasPlateLayer', () => {
  const editorial = feedSystemPack('editorial')
  it('true for plate-bearing roles (cover), false for solid designs (list)', () => {
    expect(hasPlateLayer(editorial.cover)).toBe(true) // plate background
    expect(hasPlateLayer(editorial.list)).toBe(false) // solid surface, no photo
  })

  it('quiet-grid never takes a photo', () => {
    const quiet = feedSystemPack('quiet-grid')
    expect(hasPlateLayer(quiet.cover)).toBe(false)
  })
})
