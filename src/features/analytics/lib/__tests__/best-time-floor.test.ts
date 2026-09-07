import { describe, expect, it, vi } from 'vitest'
import { MIN_BEST_TIME_DAYS } from '@/utils/constants'

vi.mock('@/lib/queries/db', () => ({
  fetchIgConnectionState: async () => ({
    accountId: 'ig-1',
    lastSyncAt: null,
    lastSyncError: null,
  }),
}))

import { deriveObservedBestTime } from '../instagram/derive-best-time'

/**
 * How much history a posting-time recommendation requires before it will answer.
 *
 * A weekday-by-hour grid needs samples per cell: at five days most cells hold one observation,
 * and the calendar publishes against it as confidently as against a month. Guarded here because
 * the floor is a single comparison inside a function that otherwise returns a rich object — lose
 * it and everything else about the derivation still passes.
 */

/** A day of hourly counts, in the shape `ig_account_metrics` stores. */
function day(date: string) {
  return { metric_date: date, online_followers_by_hour: { '20': 120, '21': 300 } }
}

/** `metric_date` descending from a fixed recent-enough date, so the 28-day read includes them. */
function daysOfHistory(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.now() - (i + 1) * 86_400_000).toISOString().slice(0, 10)
    return day(d)
  })
}

/** Just enough Supabase to answer the two reads `deriveObservedBestTime` makes. */
function dbWith(rows: ReturnType<typeof daysOfHistory>, options: { timezoneError?: boolean } = {}) {
  return {
    from(table: string) {
      if (table === 'clients') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () =>
            options.timezoneError
              ? { data: null, error: { message: 'connection reset' } }
              : { data: { agencies: { timezone: 'Europe/Sofia' } }, error: null },
        }
        return builder
      }
      const metrics = {
        select: () => metrics,
        eq: () => metrics,
        gte: () => metrics,
        not: async () => ({ data: rows, error: null }),
      }
      return metrics
    },
  } as never
}

describe('deriveObservedBestTime — the evidence floor', () => {
  it(`refuses below ${MIN_BEST_TIME_DAYS} days of history`, async () => {
    const result = await deriveObservedBestTime(dbWith(daysOfHistory(MIN_BEST_TIME_DAYS - 1)), 'c1')
    expect(result).toBeNull()
  })

  it(`answers at exactly ${MIN_BEST_TIME_DAYS} days`, async () => {
    const result = await deriveObservedBestTime(dbWith(daysOfHistory(MIN_BEST_TIME_DAYS)), 'c1')
    expect(result).not.toBeNull()
    expect(result!.platforms[0]!.confidence).toBe('observed')
  })

  /**
   * A hard 5 rather than an expression on MIN_BEST_TIME_DAYS: lowering the constant back to five
   * would leave the two cases above passing, and only this one would object.
   */
  it('still refuses at the old five-day floor', async () => {
    expect(await deriveObservedBestTime(dbWith(daysOfHistory(5)), 'c1')).toBeNull()
  })

  /**
   * A user reads the reasoning as the justification, so it names the days actually found — not
   * OBSERVED_LOOKBACK_DAYS (28), the window that was asked for.
   */
  it('reports the sample size it actually used', async () => {
    const result = await deriveObservedBestTime(dbWith(daysOfHistory(20)), 'c1')
    expect(result!.platforms[0]!.reasoning_summary).toContain('20 days')
  })

  /**
   * The timezone buckets every hourly map into the weekday × hour grid. Defaulting a FAILED read
   * to UTC rotates the whole grid and produces a wrong answer indistinguishable from a right
   * one — which then gets written to best_time_json.
   */
  it('abandons the derivation when the timezone read fails, rather than assuming UTC', async () => {
    const result = await deriveObservedBestTime(
      dbWith(daysOfHistory(20), { timezoneError: true }),
      'c1'
    )
    expect(result).toBeNull()
  })
})
