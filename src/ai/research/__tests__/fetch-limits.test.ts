import { describe, it, expect } from 'vitest'
import { computeFetchLimits } from '../fetch-limits'

describe('computeFetchLimits', () => {
  it('produces minimal limits for count=1', () => {
    const limits = computeFetchLimits(1, true)
    expect(limits.websiteMaxPages).toBe(1)
    expect(limits.rssItemsPerSource).toBe(1)
    expect(limits.rssGlobalCap).toBe(4)
  })

  it('matches current defaults at count=5 with JINA key', () => {
    const limits = computeFetchLimits(5, true)
    expect(limits.websiteMaxPages).toBe(5)
    expect(limits.rssItemsPerSource).toBe(4)
    expect(limits.rssGlobalCap).toBe(20)
    expect(limits.rssBudget).toBe(4000)
    expect(limits.webBudget).toBe(8000)
    expect(limits.fileBudget).toBe(6000)
  })

  it('does not exceed current maximums at count=14', () => {
    const limits = computeFetchLimits(14, true)
    expect(limits.websiteMaxPages).toBe(5)
    expect(limits.rssItemsPerSource).toBe(4)
    expect(limits.rssGlobalCap).toBe(20)
    expect(limits.rssBudget).toBe(4000)
    expect(limits.webBudget).toBe(8000)
    expect(limits.fileBudget).toBe(6000)
  })

  it('produces intermediate values at count=3', () => {
    const limits = computeFetchLimits(3, true)
    expect(limits.websiteMaxPages).toBe(3)
    expect(limits.rssItemsPerSource).toBe(2)
    expect(limits.rssGlobalCap).toBe(12)
  })

  it('enforces minimum 40% token budgets at count=1', () => {
    const limits = computeFetchLimits(1, true)
    expect(limits.rssBudget).toBe(1600)
    expect(limits.webBudget).toBe(3200)
    expect(limits.fileBudget).toBe(2400)
  })

  it('caps websiteMaxPages at 2 without JINA key', () => {
    const limits = computeFetchLimits(5, false)
    expect(limits.websiteMaxPages).toBe(2)
  })

  it('scales websiteMaxPages without JINA key for low counts', () => {
    const limits = computeFetchLimits(1, false)
    expect(limits.websiteMaxPages).toBe(1)

    const limits3 = computeFetchLimits(3, false)
    expect(limits3.websiteMaxPages).toBe(1)
  })

  it('handles count=0 gracefully (treated as 1)', () => {
    const limits = computeFetchLimits(0, true)
    expect(limits.websiteMaxPages).toBe(1)
    expect(limits.rssItemsPerSource).toBe(1)
    expect(limits.rssGlobalCap).toBe(4)
  })

  it('produces consistent values at count=2', () => {
    const limits = computeFetchLimits(2, true)
    expect(limits.websiteMaxPages).toBe(2)
    expect(limits.rssItemsPerSource).toBe(2)
    expect(limits.rssGlobalCap).toBe(8)
  })
})
