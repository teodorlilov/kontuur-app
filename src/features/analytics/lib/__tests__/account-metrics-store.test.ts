import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toReachRows, upsertAccountMetricDays } from '../account-metrics-store'

/**
 * The one writer of `ig_account_metrics`.
 *
 * There were six inline upserts across three files. Nothing in the repo wrote to this table under
 * test, so a divergence — a changed conflict target, a lost `ignoreDuplicates` — would have passed
 * the whole suite green and surfaced as wrong numbers on a client's analytics page days later.
 * These pin the two properties that were only ever guaranteed by six copies agreeing.
 */

function fakeAdmin(error: { message: string } | null = null) {
  const upsert = vi.fn(async (_rows: unknown, _options: unknown) => ({ error }))
  const client = { from: vi.fn(() => ({ upsert })) } as unknown as SupabaseClient
  return { client, upsert }
}

describe('upsertAccountMetricDays', () => {
  it('resolves every write against the same day key', async () => {
    const { client, upsert } = fakeAdmin()

    await upsertAccountMetricDays(
      client,
      [{ client_id: 'c', ig_account_id: 'a', metric_date: '2026-08-01' }],
      'day totals'
    )

    // Per-column batching only works if partial rows land on the SAME row. A different conflict
    // target here creates a second row per pass instead, and every read silently halves.
    expect(upsert).toHaveBeenCalledWith(expect.anything(), {
      onConflict: 'client_id,ig_account_id,metric_date',
      ignoreDuplicates: undefined,
    })
  })

  it('passes ignoreDuplicates through for the first-sync backfill', async () => {
    const { client, upsert } = fakeAdmin()

    await upsertAccountMetricDays(
      client,
      [{ client_id: 'c', ig_account_id: 'a', metric_date: '2026-08-01' }],
      'backfill',
      { ignoreDuplicates: true }
    )

    // Without this the 30-day seed becomes replace-mode and overwrites a day another pass
    // already captured in full with the 4 columns history can still serve.
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
  it('drops days past the span end', async () => {
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

    // The window refill fetches whole chunks but must not write past the period it refreshed.
    expect(rows.map((r) => r.metric_date)).toEqual(['2026-08-01', '2026-08-02'])
  })

  it('keeps the whole series when no end is given', () => {
    const rows = toReachRows('c', 'a', [{ date: '2026-08-01', reach: 10 }])

    expect(rows).toEqual([
      { client_id: 'c', ig_account_id: 'a', metric_date: '2026-08-01', reach: 10 },
    ])
  })

  it('writes only reach, so a pass cannot null a column it does not own', () => {
    const [row] = toReachRows('c', 'a', [{ date: '2026-08-01', reach: 0 }])

    // A reach row carrying `followers_count: null` would erase the nightly snapshot on every
    // window refill. The key set IS the contract.
    expect(Object.keys(row!).sort()).toEqual(['client_id', 'ig_account_id', 'metric_date', 'reach'])
  })
})
