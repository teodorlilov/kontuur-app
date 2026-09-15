import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchEntitledClients: vi.fn(),
  queries: [] as Array<{ table: string; in: Array<[string, unknown]> }>,
}))

vi.mock('@/lib/billing/entitled-clients', () => ({
  fetchEntitledClients: (...args: unknown[]) => mocks.fetchEntitledClients(...args),
}))
// The chain recorder stands in for the admin client: every builder method returns itself and the
// query resolves empty, so what is asserted is the filters the scheduler applied, nothing else.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    from(table: string) {
      const record = { table, in: [] as Array<[string, unknown]> }
      mocks.queries.push(record)
      const query: Record<string, unknown> = {
        then(resolve: (value: { data: unknown[]; error: null }) => void) {
          resolve({ data: [], error: null })
        },
      }
      for (const method of ['select', 'or', 'lt', 'lte', 'gte', 'order', 'limit']) {
        query[method] = () => query
      }
      query.in = (column: string, values: unknown) => {
        record.in.push([column, values])
        return query
      }
      return query
    },
  }),
}))
vi.mock('./publish-post', () => ({
  failPublication: vi.fn(),
  publishOnePublication: vi.fn(),
  PUBLISHABLE_POST_COLUMNS: 'id, client_id',
}))
vi.mock('@/lib/queries/db', () => ({ fetchConnection: vi.fn() }))
vi.mock('@/lib/meta/networks', () => ({ resolveNetwork: () => null }))

import { publishDuePosts } from '../scheduler'

describe('publishDuePosts — the entitled filter sits inside both queries, ahead of the limit', () => {
  beforeEach(() => {
    mocks.queries.length = 0
    mocks.fetchEntitledClients.mockReset()
  })

  it('filters the missed-window sweep and the due read by the entitled clients', async () => {
    mocks.fetchEntitledClients.mockResolvedValue(
      new Map([
        ['c1', { agencyId: 'a1', entitlement: {} }],
        ['c2', { agencyId: 'a1', entitlement: {} }],
      ])
    )
    const result = await publishDuePosts()

    expect(mocks.fetchEntitledClients).toHaveBeenCalledWith(expect.anything(), 'publish')
    expect(mocks.queries.map((q) => q.table)).toEqual(['post_publications', 'post_publications'])
    for (const query of mocks.queries) {
      expect(query.in).toEqual([['posts.client_id', ['c1', 'c2']]])
    }
    expect(result.processed).toBe(0)
  })

  it('touches no row at all when nobody may publish', async () => {
    mocks.fetchEntitledClients.mockResolvedValue(new Map())
    const result = await publishDuePosts()
    expect(mocks.queries).toEqual([])
    expect(result).toEqual({
      processed: 0,
      published: 0,
      failed: 0,
      pending: 0,
      unreconciled: [],
      writeErrors: [],
    })
  })
})
