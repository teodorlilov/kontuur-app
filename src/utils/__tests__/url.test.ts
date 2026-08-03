import { describe, expect, it } from 'vitest'
import { toHostLabel, toWebsiteUrl } from '../url'

describe('toWebsiteUrl', () => {
  it('adds a scheme to the bare host people actually type', () => {
    expect(toWebsiteUrl('haelan.bg')).toBe('https://haelan.bg')
    expect(toWebsiteUrl('www.haelan.bg')).toBe('https://www.haelan.bg')
  })

  it('keeps an existing scheme rather than doubling it', () => {
    expect(toWebsiteUrl('https://haelan.bg')).toBe('https://haelan.bg')
    expect(toWebsiteUrl('HTTPS://haelan.bg')).toBe('HTTPS://haelan.bg')
  })

  it('does not silently upgrade http to https', () => {
    expect(toWebsiteUrl('http://haelan.bg')).toBe('http://haelan.bg')
  })

  it('trims, and stays empty when there is nothing to normalise', () => {
    expect(toWebsiteUrl('  haelan.bg  ')).toBe('https://haelan.bg')
    expect(toWebsiteUrl('   ')).toBe('')
    expect(toWebsiteUrl('')).toBe('')
  })

  it('produces something the platform actually accepts', () => {
    expect(() => new URL(toWebsiteUrl('haelan.bg'))).not.toThrow()
    expect(new URL(toWebsiteUrl('haelan.bg')).protocol).toBe('https:')
  })
})

describe('toHostLabel', () => {
  it('strips the scheme and any trailing slash for display', () => {
    expect(toHostLabel('https://www.haelan.bg/')).toBe('www.haelan.bg')
    expect(toHostLabel('http://haelan.bg')).toBe('haelan.bg')
    expect(toHostLabel('haelan.bg')).toBe('haelan.bg')
  })
})
