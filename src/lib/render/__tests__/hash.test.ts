import { describe, expect, it } from 'vitest'
import { canonicalize } from '../hash'

describe('canonicalize', () => {
  it('sorts object keys recursively so reordered-but-equal graphs stringify identically', () => {
    const a = { b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } }
    const b = { a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }
    expect(canonicalize(a)).toBe(canonicalize(b))
  })

  it('does not reorder arrays (paint order is significant)', () => {
    expect(canonicalize([1, 2, 3])).not.toBe(canonicalize([3, 2, 1]))
  })
})
