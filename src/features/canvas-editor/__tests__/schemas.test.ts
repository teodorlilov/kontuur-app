import { describe, expect, it } from 'vitest'
import { generateBackgroundSchema } from '../schemas'

describe('generateBackgroundSchema', () => {
  it('accepts either target id set and passes them through untouched', () => {
    expect(generateBackgroundSchema.parse({ postId: 'p1' })).toEqual({ postId: 'p1' })
    expect(generateBackgroundSchema.parse({ clientId: 'c1', draftId: 'd1' })).toEqual({
      clientId: 'c1',
      draftId: 'd1',
    })
  })

  it('does not decide which id set is valid — resolveAssetDestination owns that', () => {
    // A second validator here would be a second place for the ownership rule to drift, so an empty
    // body parses and the route's destination resolver emits the canonical 400.
    expect(generateBackgroundSchema.safeParse({}).success).toBe(true)
  })

  it('treats an absent direction as "same copy, roll the dice again"', () => {
    expect(generateBackgroundSchema.parse({ postId: 'p1' }).direction).toBeUndefined()
    expect(generateBackgroundSchema.parse({ postId: 'p1', direction: '  bolder  ' }).direction).toBe(
      'bolder'
    )
  })

  it('caps the direction so a pasted essay cannot reach the model', () => {
    expect(
      generateBackgroundSchema.safeParse({ postId: 'p1', direction: 'x'.repeat(501) }).success
    ).toBe(false)
    expect(
      generateBackgroundSchema.safeParse({ postId: 'p1', direction: 'x'.repeat(500) }).success
    ).toBe(true)
  })

  it('takes slide copy in both shapes, and null for a slide that has none', () => {
    const slide = generateBackgroundSchema.parse({
      postId: 'p1',
      slideCopy: { kind: 'slide', headline: 'Head', body: 'Body' },
    })
    expect(slide.slideCopy).toEqual({ kind: 'slide', headline: 'Head', body: 'Body' })

    const caption = generateBackgroundSchema.parse({
      postId: 'p1',
      slideCopy: { kind: 'caption', caption: null },
    })
    expect(caption.slideCopy).toEqual({ kind: 'caption', caption: null })

    expect(generateBackgroundSchema.parse({ postId: 'p1', slideCopy: null }).slideCopy).toBeNull()
  })

  it('rejects a slide copy that is neither shape', () => {
    expect(
      generateBackgroundSchema.safeParse({ postId: 'p1', slideCopy: { kind: 'headline' } }).success
    ).toBe(false)
  })
})
