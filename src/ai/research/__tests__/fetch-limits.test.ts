import { describe, it, expect } from 'vitest'
import { computeFetchLimits } from '../fetch-limits'

describe('computeFetchLimits', () => {
  it('produces minimal limits for count=1', () => {
    const limits = computeFetchLimits(1)
    expect(limits.websiteMaxPages).toBe(1) // min(1, 10)
    expect(limits.rssItemsPerSource).toBe(1)
    expect(limits.rssGlobalCap).toBe(4)
  })

  it('matches defaults at count=5', () => {
    const limits = computeFetchLimits(5)
    expect(limits.websiteMaxPages).toBe(5) // min(5, 10)
    expect(limits.rssItemsPerSource).toBe(4)
    expect(limits.rssGlobalCap).toBe(20)
    expect(limits.rssBudget).toBe(4000)
    expect(limits.webBudget).toBe(8000)
    expect(limits.fileBudget).toBe(6000)
  })

  it('does not exceed maximums at count=14', () => {
    const limits = computeFetchLimits(14)
    expect(limits.websiteMaxPages).toBe(10) // capped at 10
    expect(limits.rssItemsPerSource).toBe(4)
    expect(limits.rssGlobalCap).toBe(20)
    expect(limits.rssBudget).toBe(4000)
    expect(limits.webBudget).toBe(8000)
    expect(limits.fileBudget).toBe(6000)
  })

  it('produces intermediate values at count=3', () => {
    const limits = computeFetchLimits(3)
    expect(limits.websiteMaxPages).toBe(3) // min(3, 10)
    expect(limits.rssItemsPerSource).toBe(2)
    expect(limits.rssGlobalCap).toBe(12)
  })

  it('enforces minimum 40% token budgets at count=1', () => {
    const limits = computeFetchLimits(1)
    expect(limits.rssBudget).toBe(1600)
    expect(limits.webBudget).toBe(3200)
    expect(limits.fileBudget).toBe(2400)
  })

  it('handles count=0 gracefully (treated as 1)', () => {
    const limits = computeFetchLimits(0)
    expect(limits.websiteMaxPages).toBe(0) // min(0, 10)
    expect(limits.rssItemsPerSource).toBe(1)
    expect(limits.rssGlobalCap).toBe(4)
  })

  it('produces consistent values at count=2', () => {
    const limits = computeFetchLimits(2)
    expect(limits.websiteMaxPages).toBe(2) // min(2, 10)
    expect(limits.rssItemsPerSource).toBe(2)
    expect(limits.rssGlobalCap).toBe(8)
  })
})
