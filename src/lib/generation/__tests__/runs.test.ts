import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { finishGenerationRun, startGenerationRun } from '../runs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Entitlement } from '@/lib/billing/entitlement'

const consumeUsage = vi.fn()
const settleUsage = vi.fn()
vi.mock('@/lib/billing/usage', () => ({
  consumeUsage: (...args: unknown[]) => consumeUsage(...args),
  settleUsage: (...args: unknown[]) => settleUsage(...args),
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
  settleUsage.mockReset().mockResolvedValue(undefined)
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
    // The winner holds the reservation; the loser's is settled with nothing landed.
    expect(settleUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', 3, 0)
  })

  it('reserves the whole batch before the insert and refuses without inserting', async () => {
    const refused = Object.assign(new Error('used up'), { name: 'AllowanceError', used: 39 })
    consumeUsage.mockResolvedValue({ allowed: false, refused })
    const { supabase, inserted } = makeSupabase({ data: { id: 'run-9' }, error: null })

    const claim = await startGenerationRun(supabase, INPUT)
    expect(consumeUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', 3)
    expect(claim.runId).toBeNull()
    expect('refused' in claim && claim.refused).toBe(refused)
    expect(inserted).toHaveLength(0)
    expect(settleUsage).not.toHaveBeenCalled()
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
    expect(settleUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', 3, 0)
  })
})

describe('finishGenerationRun', () => {
  function closing() {
    const updates: Array<Record<string, unknown>> = []
    const supabase = {
      from: () => ({
        update: (row: Record<string, unknown>) => {
          updates.push(row)
          return { eq: () => Promise.resolve({ error: null }) }
        },
      }),
    } as unknown as SupabaseClient
    return { supabase, updates }
  }

  it('counts the drafts that landed and gives the rest of the reservation back', async () => {
    const { supabase, updates } = closing()
    await finishGenerationRun(supabase, 'run-1', {
      status: 'complete',
      agencyId: 'a1',
      entitlement: ENTITLEMENT,
      reserved: 3,
      landed: 2,
      skipped: { names: ['Behind the scenes'], cost: 1 },
    })
    expect(settleUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', 3, 2)
    // The pillars are stored with the close: a draft read back tomorrow has no stream to say it.
    expect(updates[0]).toMatchObject({
      status: 'complete',
      skipped_pillars: { names: ['Behind the scenes'], cost: 1 },
    })
  })

  it('a failed run lands nothing, so nothing of it is on the meter', async () => {
    const { supabase, updates } = closing()
    await finishGenerationRun(supabase, 'run-1', {
      status: 'failed',
      agencyId: 'a1',
      entitlement: ENTITLEMENT,
      reserved: 3,
      landed: 0,
      skipped: null,
    })
    expect(settleUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', 3, 0)
    expect(updates[0]).toMatchObject({ status: 'failed', skipped_pillars: null })
  })
})
