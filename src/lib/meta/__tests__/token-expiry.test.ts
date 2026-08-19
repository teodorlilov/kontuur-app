import { describe, expect, it } from 'vitest'
import {
  REFRESH_WINDOW_DAYS,
  daysUntilExpiry,
  isTokenExpired,
  isTokenExpiring,
} from '../token-expiry'

const NOW = new Date('2026-07-31T12:00:00Z')
const MS_PER_DAY = 86_400_000

/** An ISO timestamp `days` from NOW — negative for the past. */
function offset(days: number): string {
  return new Date(NOW.getTime() + days * MS_PER_DAY).toISOString()
}

describe('isTokenExpired', () => {
  it('treats a null expiry as NOT expired', () => {
    // NULL means "never expires": older connect flows stored no expiry, and
    // inverting this marks every such healthy connection as broken.
    expect(isTokenExpired(null, NOW)).toBe(false)
  })

  it('reports a past expiry as expired', () => {
    expect(isTokenExpired(offset(-1), NOW)).toBe(true)
  })

  it('reports a future expiry as not expired', () => {
    expect(isTokenExpired(offset(1), NOW)).toBe(false)
  })

  it('is exclusive at the exact boundary — expiring now is not yet expired', () => {
    expect(isTokenExpired(NOW.toISOString(), NOW)).toBe(false)
  })

  it('reads an unparseable timestamp as not expired rather than tearing down the connection', () => {
    expect(isTokenExpired('not-a-date', NOW)).toBe(false)
  })
})

describe('isTokenExpiring', () => {
  it('treats a null expiry as NOT expiring', () => {
    expect(isTokenExpiring(null, NOW)).toBe(false)
  })

  it('flags a token inside the refresh window', () => {
    expect(isTokenExpiring(offset(6), NOW)).toBe(true)
  })

  it('ignores a token beyond the refresh window', () => {
    expect(isTokenExpiring(offset(REFRESH_WINDOW_DAYS + 1), NOW)).toBe(false)
  })

  it('includes the exact window boundary', () => {
    expect(isTokenExpiring(offset(REFRESH_WINDOW_DAYS), NOW)).toBe(true)
  })

  it('is strictly forward-looking — an already-expired token is not "expiring"', () => {
    // The two states rank differently on the roster, so they must not overlap.
    const past = offset(-1)
    expect(isTokenExpiring(past, NOW)).toBe(false)
    expect(isTokenExpired(past, NOW)).toBe(true)
  })
})

describe('daysUntilExpiry', () => {
  it('returns null when there is no expiry to count down to', () => {
    expect(daysUntilExpiry(null, NOW)).toBeNull()
  })

  it('rounds up so any time left today reads as a day, not zero', () => {
    expect(daysUntilExpiry(offset(0.4), NOW)).toBe(1)
  })

  it('counts whole days for the "expires in N days" copy', () => {
    expect(daysUntilExpiry(offset(6), NOW)).toBe(6)
  })

  it('goes negative once the token has lapsed', () => {
    expect(daysUntilExpiry(offset(-2), NOW)).toBe(-2)
  })

  it('returns null for an unparseable timestamp', () => {
    expect(daysUntilExpiry('not-a-date', NOW)).toBeNull()
  })
})
