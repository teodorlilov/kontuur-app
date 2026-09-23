import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  claimVisualJob,
  clearStaleVisualJobs,
  fetchVisualJobs,
  releaseVisualJob,
} from '../visual-jobs'

vi.mock('server-only', () => ({}))

/**
 * The claim is what stops one slide being generated — and paid for — twice, so what matters is
 * exactly when it says no: a live claim, and nothing else. A lost race is the only false.
 */

const UNIQUE_VIOLATION = { code: '23505', message: 'duplicate key' }

type Canned = {
  insert?: { error: { code: string; message: string } | null }
  takeover?: { data: { post_id: string } | null }
  // The sweep selects only `post_id` (it counts rows); the read selects the position too.
  select?: {
    data: Array<{ post_id: string; position?: number }> | null
    error: { message: string } | null
  }
}

/** Records the filters each call was built with, and replays one canned answer per verb. */
function makeSupabase(canned: Canned) {
  const filters: Array<[string, unknown]> = []
  const deleted: Array<Record<string, unknown>> = []
  const chain = (result: unknown) => {
    const node: Record<string, unknown> = {}
    for (const verb of ['eq', 'lt', 'gte', 'in']) {
      node[verb] = (column: string, value: unknown) => {
        filters.push([column, value])
        return node
      }
    }
    node.select = () => node
    node.maybeSingle = () => Promise.resolve(result)
    node.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return node
  }
  const supabase = {
    from: () => ({
      insert: () => Promise.resolve(canned.insert ?? { error: null }),
      update: (row: Record<string, unknown>) => {
        deleted.push(row)
        return chain(canned.takeover ?? { data: null })
      },
      delete: () => chain(canned.select ?? { data: [], error: null }),
      select: () => chain(canned.select ?? { data: [], error: null }),
    }),
  } as unknown as SupabaseClient
  return { supabase, filters }
}

beforeEach(() => vi.restoreAllMocks())

describe('claimVisualJob', () => {
  it('takes a free position', async () => {
    const { supabase } = makeSupabase({})
    expect(await claimVisualJob(supabase, 'p1', 2)).toBe(true)
  })

  it('refuses a position somebody is generating right now', async () => {
    const { supabase } = makeSupabase({
      insert: { error: UNIQUE_VIOLATION },
      takeover: { data: null },
    })
    expect(await claimVisualJob(supabase, 'p1', 2)).toBe(false)
  })

  it('takes over a claim left by an invocation that was killed', async () => {
    const { supabase, filters } = makeSupabase({
      insert: { error: UNIQUE_VIOLATION },
      takeover: { data: { post_id: 'p1' } },
    })
    expect(await claimVisualJob(supabase, 'p1', 2)).toBe(true)
    // The takeover is a compare-and-swap on age: only a claim older than the window matches.
    expect(filters.some(([column]) => column === 'started_at')).toBe(true)
  })

  it('never blocks a picture on its own bookkeeping', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = makeSupabase({ insert: { error: { code: '42P01', message: 'no table' } } })
    expect(await claimVisualJob(supabase, 'p1', 2)).toBe(true)
    expect(error).toHaveBeenCalled()
  })
})

describe('fetchVisualJobs', () => {
  it('groups live claims by post and asks only for recent ones', async () => {
    const { supabase, filters } = makeSupabase({
      select: {
        data: [
          { post_id: 'p1', position: 0 },
          { post_id: 'p1', position: 2 },
          { post_id: 'p2', position: 1 },
        ],
        error: null,
      },
    })

    const jobs = await fetchVisualJobs(supabase, ['p1', 'p2'])
    expect(jobs.get('p1')).toEqual([0, 2])
    expect(jobs.get('p2')).toEqual([1])
    expect(filters.map(([column]) => column)).toContain('started_at')
  })

  it('reads nothing for no posts', async () => {
    const { supabase, filters } = makeSupabase({})
    expect(await fetchVisualJobs(supabase, [])).toEqual(new Map())
    expect(filters).toEqual([])
  })

  it('throws rather than reporting every in-flight position as missing', async () => {
    const { supabase } = makeSupabase({ select: { data: null, error: { message: 'timeout' } } })
    await expect(fetchVisualJobs(supabase, ['p1'])).rejects.toThrow(
      'visual job query failed: timeout'
    )
  })
})

describe('clearStaleVisualJobs', () => {
  it('deletes only the claims past the window, and says how many', async () => {
    const { supabase, filters } = makeSupabase({
      select: { data: [{ post_id: 'p1' }], error: null },
    })

    expect(await clearStaleVisualJobs(supabase)).toBe(1)
    // One predicate and one only: age. A claim inside the window may still be generating.
    expect(filters).toEqual([['started_at', expect.any(String)]])
  })

  it('throws rather than reporting a failed sweep as an empty one', async () => {
    const { supabase } = makeSupabase({ select: { data: null, error: { message: 'timeout' } } })
    await expect(clearStaleVisualJobs(supabase)).rejects.toThrow(
      'stale visual job sweep failed: timeout'
    )
  })
})

describe('releaseVisualJob', () => {
  it('gives the position back by post and position', async () => {
    const { supabase, filters } = makeSupabase({})
    await releaseVisualJob(supabase, 'p1', 2)
    expect(filters).toEqual([
      ['post_id', 'p1'],
      ['position', 2],
    ])
  })
})
