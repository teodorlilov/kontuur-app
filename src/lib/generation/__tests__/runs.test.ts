import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { startGenerationRun } from '../runs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Entitlement } from '@/lib/billing/entitlement'

const consumeUsage = vi.fn()
const refundUsage = vi.fn()
vi.mock('@/lib/billing/usage', () => ({
  consumeUsage: (...args: unknown[]) => consumeUsage(...args),
  refundUsage: (...args: unknown[]) => refundUsage(...args),
  AllowanceError: class AllowanceError extends Error {
    constructor(
      readonly kind: string,
      readonly used: number,
      readonly quota: number,
      readonly resetsOn: Date | null
    ) {
      super('allowance')
    }
  },
}))

type InsertResult = {
  data: { id: string } | null
  error: { code?: string; message: string } | null
}

/** Captures the inserted row so the slot key can be asserted, and replays one canned result. */
function makeSupabase(result: InsertResult) {
  const inserted: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row)
        return {
          select: () => ({ single: () => Promise.resolve(result) }),
        }
      },
    }),
  } as unknown as SupabaseClient
  return { supabase, inserted }
}

const ENTITLEMENT = {
  state: 'active',
  limits: { draft: 40, image: 120, rewrite: 30 },
  periodKey: '2026-09-01',
  resetsOn: new Date('2026-10-01T00:00:00Z'),
} as unknown as Entitlement

const INPUT = {
  clientId: 'c1',
  agencyId: 'a1',
  entitlement: ENTITLEMENT,
  targetCount: 3,
  kind: 'cron' as const,
}

beforeEach(() => {
  consumeUsage.mockReset().mockResolvedValue({ allowed: true, used: 3, quota: 40 })
  refundUsage.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('startGenerationRun', () => {
  it('stamps the slot it was given, so both racers compute the same key', async () => {
    const slotKey = new Date('2026-08-24T06:00:00Z')
    const { supabase, inserted } = makeSupabase({ data: { id: 'run-1' }, error: null })

    expect(await startGenerationRun(supabase, { ...INPUT, slotKey })).toEqual({ runId: 'run-1' })
    expect(inserted[0]).toMatchObject({
      client_id: 'c1',
      kind: 'cron',
      status: 'running',
      slot_key: '2026-08-24T06:00:00.000Z',
    })
  })

  it('a manual run carries no slot, so two of them never collide', async () => {
    const { supabase, inserted } = makeSupabase({ data: { id: 'run-2' }, error: null })
    await startGenerationRun(supabase, { ...INPUT, kind: 'manual' })
    // Explicitly null rather than absent: NULLs do not conflict in a unique index, which
    // is what keeps the constraint off every wizard run.
    expect(inserted[0]?.slot_key).toBeNull()
  })

  it('reports a lost race as slotTaken, not as a failure', async () => {
    // 23505 here means another invocation of the same tick already claimed this slot —
    // the constraint working. Logging it as an error would make every at-least-once
    // redelivery from Vercel cron look like a broken run.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = makeSupabase({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })

    expect(await startGenerationRun(supabase, { ...INPUT, slotKey: new Date() })).toEqual({
      runId: null,
      slotTaken: true,
    })
    expect(error).not.toHaveBeenCalled()
    // The winner holds the reservation; the loser's must not stay charged.
    expect(refundUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', 3)
  })

  it('reserves the whole batch before the insert and refuses without inserting', async () => {
    consumeUsage.mockResolvedValue({ allowed: false, used: 39, quota: 40 })
    const { supabase, inserted } = makeSupabase({ data: { id: 'run-9' }, error: null })

    const claim = await startGenerationRun(supabase, INPUT)
    expect(consumeUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', 3)
    expect(claim.runId).toBeNull()
    expect('refused' in claim && claim.refused.used).toBe(39)
    expect(inserted).toHaveLength(0)
    expect(refundUsage).not.toHaveBeenCalled()
  })

  it('a real insert failure is logged and is not a lost race', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = makeSupabase({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })

    expect(await startGenerationRun(supabase, INPUT)).toEqual({ runId: null, slotTaken: false })
    // The cron defers the client on this branch, so losing the reason would make a
    // stalled schedule undiagnosable — and the drafts it reserved go back.
    expect(error).toHaveBeenCalled()
    expect(refundUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', 3)
  })
})
