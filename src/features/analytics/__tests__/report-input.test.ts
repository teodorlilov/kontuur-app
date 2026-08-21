import { describe, expect, it } from 'vitest'
import { archiveReportInputSchema } from '../schemas'
import { CUSTOM_MAX_DAYS } from '../lib/period'

const BASE = { clientId: '3f1e4d2c-9a7b-4c1d-8e2f-5a6b7c8d9e0f', preset: '30d' as const }

/**
 * The action boundary has to be at least as strict as the URL one. resolvePeriod
 * clamps a custom range to a year; fillPeriodData walks its period day by day
 * against the Graph API, so a wider window reaching the action directly spends
 * the agency's quota on a range no UI can produce.
 */
describe('archiveReportInputSchema', () => {
  it('accepts a window inside the clamp', () => {
    expect(
      archiveReportInputSchema.safeParse({ ...BASE, start: '2026-07-01', end: '2026-07-30' })
        .success
    ).toBe(true)
  })

  it('accepts exactly the clamp, inclusive', () => {
    // 2026-01-01 + 365 days = 2026-12-31, which is 365 inclusive days.
    expect(
      archiveReportInputSchema.safeParse({ ...BASE, start: '2026-01-01', end: '2026-12-31' })
        .success
    ).toBe(true)
    expect(CUSTOM_MAX_DAYS).toBe(366)
  })

  it('rejects a decade — the quota-burn shape', () => {
    const parsed = archiveReportInputSchema.safeParse({
      ...BASE,
      start: '2016-01-01',
      end: '2026-01-01',
    })
    expect(parsed.success).toBe(false)
  })

  it('still rejects a reversed window', () => {
    expect(
      archiveReportInputSchema.safeParse({ ...BASE, start: '2026-07-30', end: '2026-07-01' })
        .success
    ).toBe(false)
  })
})
