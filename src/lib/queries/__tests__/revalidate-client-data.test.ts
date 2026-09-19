import { describe, expect, it, vi } from 'vitest'

const revalidateTag = vi.fn()
// unstable_cache is required, not incidental: cache.ts and the report-data module it imports
// both call it at module scope, so without it the file throws on import.
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...(args as [])),
  unstable_cache: (fn: unknown) => fn,
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({}) }))

import { revalidateClientData } from '../cache'

describe('revalidateClientData', () => {
  it('busts every cache a client’s rows feed, with the stale-while-revalidate profile', () => {
    revalidateClientData()
    expect(revalidateTag.mock.calls).toEqual([
      ['agency-clients', 'max'],
      ['client-post-stats', 'max'],
      ['client-ideas', 'max'],
      ['ig-metrics', 'max'],
    ])
  })
})
