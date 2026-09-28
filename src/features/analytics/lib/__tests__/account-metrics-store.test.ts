import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toReachRows, upsertAccountMetricDays } from '../instagram/account-metrics-store'

/**
 * The one writer of `ig_account_metrics`. Its conflict target and `ignoreDuplicates` pass-through
 * are invisible to every other gate: a change to either type-checks, lints and passes the rest of
 * the suite, then surfaces as wrong numbers on a client's page days later.
 */

function fakeAdmin(error: { message: string } | null = null) {
  const upsert = vi.fn(async (_rows: unknown, _options: unknown) => ({ error }))
  const client = { from: vi.fn(() => ({ upsert })) } as unknown as SupabaseClient
  return { client, upsert }
}

describe('upsertAccountMetricDays', () => {
  it('resolves every write against the same day key, so partial rows from separate passes land on one row', async () => {
    const { client, upsert } = fakeAdmin()

    await upsertAccountMetricDays(
      client,
      [{ client_id: 'c', ig_account_id: 'a', metric_date: '2026-08-01' }],
      'day totals'
    )

    expect(upsert).toHaveBeenCalledWith(expect.anything(), {
      onConflict: 'client_id,ig_account_id,metric_date',
      ignoreDuplicates: undefined,
    })
  })

  it('passes ignoreDuplicates through, so the first-sync backfill never overwrites a day another pass captured in full', async () => {
    const { client, upsert } = fakeAdmin()

    await upsertAccountMetricDays(
      client,
      [{ client_id: 'c', ig_account_id: 'a', metric_date: '2026-08-01' }],
      'backfill',
      { ignoreDuplicates: true }
    )

    expect(upsert.mock.calls[0]?.[1]).toEqual({
      onConflict: 'client_id,ig_account_id,metric_date',
      ignoreDuplicates: true,
    })
  })

  it('names the failing pass, because six call sites used to do that themselves', async () => {
    const { client } = fakeAdmin({ message: 'deadlock detected' })

    await expect(
      upsertAccountMetricDays(
        client,
        [{ client_id: 'c', ig_account_id: 'a', metric_date: '2026-08-01' }],
        'window refresh reach'
      )
    ).rejects.toThrow('window refresh reach upsert failed: deadlock detected')
  })

  it('issues no statement for an empty batch', async () => {
    const { client, upsert } = fakeAdmin()

    await upsertAccountMetricDays(client, [], 'day totals')

    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('toReachRows', () => {
  it('drops days past the span end, since the window refill fetches whole chunks but must not write past its period', async () => {
    const rows = toReachRows(
      'c',
      'a',
      [
        { date: '2026-08-01', reach: 10 },
        { date: '2026-08-02', reach: 20 },
        { date: '2026-08-03', reach: 30 },
      ],
      '2026-08-02'
    )

    expect(rows.map((r) => r.metric_date)).toEqual(['2026-08-01', '2026-08-02'])
  })

  it('keeps the whole series when no end is given', () => {
    const rows = toReachRows('c', 'a', [{ date: '2026-08-01', reach: 10 }])

    expect(rows).toEqual([
      { client_id: 'c', ig_account_id: 'a', metric_date: '2026-08-01', reach: 10 },
    ])
  })

  it('writes only reach, so a pass cannot null a column it does not own, such as the nightly followers_count', () => {
    const [row] = toReachRows('c', 'a', [{ date: '2026-08-01', reach: 0 }])

    expect(Object.keys(row!).sort()).toEqual(['client_id', 'ig_account_id', 'metric_date', 'reach'])
  })
})
