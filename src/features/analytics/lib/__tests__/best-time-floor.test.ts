import { describe, expect, it, vi } from 'vitest'
import { MIN_BEST_TIME_DAYS } from '@/utils/constants'

vi.mock('@/lib/queries/db', () => ({
  fetchIgConnectionState: async () => ({
    accountId: 'ig-1',
    lastSyncAt: null,
    lastSyncError: null,
  }),
}))

import { deriveObservedBestTime } from '../derive-best-time'

/**
 * How much history a posting-time recommendation requires before it will answer.
 *
 * The floor used to be five days, which is not a pattern — it is one Tuesday. A weekday-by-hour
 * grid built from five samples has a single observation in most cells, and the calendar published
 * against it as confidently as it would against a month.
 *
 * Guarded here rather than trusted because the check is one comparison in a function that otherwise
 * returns a rich object: lose it and every test above still passes, while the product starts making
 * recommendations from a long weekend.
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
function dbWith(rows: ReturnType<typeof daysOfHistory>) {
  return {
    from(table: string) {
      if (table === 'clients') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: { agencies: { timezone: 'Europe/Sofia' } } }),
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

  it('still refuses at the old five-day floor', async () => {
    // The number this replaced. Named explicitly so lowering it back fails loudly rather than
    // quietly restoring recommendations built on a handful of samples.
    expect(await deriveObservedBestTime(dbWith(daysOfHistory(5)), 'c1')).toBeNull()
  })

  it('reports the sample size it actually used', async () => {
    const result = await deriveObservedBestTime(dbWith(daysOfHistory(20)), 'c1')
    // The reasoning is shown to a user as the justification, so it has to name the real number
    // rather than the window that was asked for.
    expect(result!.platforms[0]!.reasoning_summary).toContain('20 days')
  })
})
