import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatDate, formatRelativeTime, truncateText } from '../format'

describe('formatDate', () => {
  it('formats a date in en-GB style', () => {
    const date = new Date('2026-03-22T12:00:00Z')
    const result = formatDate(date)
    // en-GB: "22 Mar 2026"
    expect(result).toContain('22')
    expect(result).toContain('Mar')
    expect(result).toContain('2026')
  })

  it('formats a different date correctly', () => {
    const date = new Date('2025-12-01T00:00:00Z')
    const result = formatDate(date)
    expect(result).toContain('Dec')
    expect(result).toContain('2025')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-22T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for less than 60 seconds ago', () => {
    const date = new Date('2026-03-22T11:59:30Z') // 30s ago
    expect(formatRelativeTime(date)).toBe('just now')
  })

  it('returns minutes ago for less than 60 minutes', () => {
    const date = new Date('2026-03-22T11:55:00Z') // 5 min ago
    expect(formatRelativeTime(date)).toBe('5m ago')
  })

  it('returns hours ago for less than 24 hours', () => {
    const date = new Date('2026-03-22T09:00:00Z') // 3 hours ago
    expect(formatRelativeTime(date)).toBe('3h ago')
  })

  it('returns days ago for less than 7 days', () => {
    const date = new Date('2026-03-20T12:00:00Z') // 2 days ago
    expect(formatRelativeTime(date)).toBe('2d ago')
  })

  it('falls back to formatDate for 7+ days ago', () => {
    const date = new Date('2026-03-14T12:00:00Z') // 8 days ago
    const result = formatRelativeTime(date)
    expect(result).toContain('Mar')
    expect(result).toContain('2026')
  })

  it('returns "just now" for exactly 0 seconds ago', () => {
    const date = new Date('2026-03-22T12:00:00Z')
    expect(formatRelativeTime(date)).toBe('just now')
  })

  it('returns "1m ago" at exactly 60 seconds', () => {
    const date = new Date('2026-03-22T11:59:00Z') // exactly 60s ago
    expect(formatRelativeTime(date)).toBe('1m ago')
  })
})

describe('truncateText', () => {
  it('returns unchanged text when under limit', () => {
    expect(truncateText('hello', 10)).toBe('hello')
  })

  it('returns unchanged text when exactly at limit', () => {
    expect(truncateText('hello', 5)).toBe('hello')
  })

  it('truncates text over limit with ellipsis', () => {
    const result = truncateText('hello world this is a long text', 11)
    expect(result).toBe('hello world…')
  })

  it('trims trailing whitespace before ellipsis', () => {
    const result = truncateText('hello world foo', 6)
    // Slices to "hello " then trims → "hello" + "…"
    expect(result).toBe('hello…')
  })

  it('handles empty string', () => {
    expect(truncateText('', 5)).toBe('')
  })

  it('handles maxLength of 0', () => {
    expect(truncateText('hello', 0)).toBe('…')
  })
})
