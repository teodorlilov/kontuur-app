import { describe, expect, it } from 'vitest'
import { createApprovalBatch } from '../approval-batch'
import { getWeekRange } from '@/utils/date-helpers'

/**
 * The window this batch queries decides which posts a *client* receives by email, so it
 * is the one place in the calendar rebuild where a mistake leaves the building.
 *
 * It used to be built as `new Date(weekStart)` + 6 days + `setHours(23,59,59,999)`,
 * which resolved in the server's zone — UTC on Vercel — while the calendar that
 * labelled the button resolved in the agency's. For Europe/Sofia that is a three-hour
 * shift at both ends, so the token covered a different set of posts than the button
 * promised. These tests pin the bounds to `getWeekRange`, the same helper the client
 * filter now reads.
 */

/** Records the range predicates the batch applies, and returns no posts. */
function recordingSupabase() {
  const calls: Record<string, string> = {}
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    gte: (_col: string, value: string) => {
      calls.gte = value
      return chain
    },
    lt: (_col: string, value: string) => {
      calls.lt = value
      return chain
    },
    lte: (_col: string, value: string) => {
      calls.lte = value
      return chain
    },
    order: () => Promise.resolve({ data: [], error: null }),
  }
  return { client: { from: () => chain } as never, calls }
}

describe('createApprovalBatch week window', () => {
  it('queries the agency zone week, not the server zone one', async () => {
    const { client, calls } = recordingSupabase()

    await createApprovalBatch(client, 'client-1', '2026-08-03', 'Europe/Sofia')

    const expected = getWeekRange('2026-08-03', 'Europe/Sofia')
    expect(calls.gte).toBe(expected.from)
    expect(calls.lt).toBe(expected.to)
    // Sofia is UTC+3 in August: the week opens at 21:00Z on the previous day.
    expect(calls.gte).toBe('2026-08-02T21:00:00.000Z')
  })

  it('is half-open, so the following Monday belongs to the next batch', async () => {
    const { client, calls } = recordingSupabase()

    await createApprovalBatch(client, 'client-1', '2026-08-03', 'Europe/Sofia')

    // The old inclusive end was 23:59:59.999 local on Sunday; anything in the final
    // millisecond fell into both weeks or neither depending on the server's zone.
    expect(calls.lte).toBeUndefined()
    expect(calls.lt).toBe(getWeekRange('2026-08-10', 'Europe/Sofia').from)
  })

  it('rejects an unparseable weekStart before querying', async () => {
    const { client, calls } = recordingSupabase()

    const result = await createApprovalBatch(client, 'client-1', 'not-a-date', 'Europe/Sofia')

    expect(result).toEqual({
      ok: false,
      error: 'weekStart must be a valid ISO date',
      status: 400,
    })
    expect(calls.gte).toBeUndefined()
  })
})
