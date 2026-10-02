import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entitlement } from '../entitlement'
import type { Spender } from '../spend-context'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  rows: vi.fn(),
  updated: vi.fn(),
  getCachedEntitlement: vi.fn(),
  notify: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    from: () => ({
      select: () => {
        const read = {
          in: () => read,
          order: () => read,
          range: (from: number, to: number) => mocks.rows(from, to),
        }
        return read
      },
      update: () => ({
        gt: () => ({ lt: (...args: unknown[]) => ({ select: () => mocks.updated(...args) }) }),
      }),
    }),
  }),
}))
vi.mock('@/lib/queries/cache', () => ({
  getCachedEntitlement: (...args: unknown[]) => mocks.getCachedEntitlement(...args),
}))
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => mocks.notify(...args),
}))

import {
  AllowanceError,
  clearStaleReservations,
  consumeUsage,
  lastDailyResetAt,
  readUsage,
  readUsageByAgency,
  reserveUsage,
  runMetered,
  settleUsage,
  spendFailureResponse,
} from '../usage'
import { requireSpender } from '../spend-context'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

const ENTITLEMENT = {
  limits: { draft: 40, image: 120, rewrite: 30 },
  periodKey: '2026-09-01',
  resetsOn: new Date('2026-10-01T00:00:00Z'),
  timezone: 'Europe/Sofia',
} as unknown as Entitlement

const ARGS = { p_agency_id: 'a1', p_period: '2026-09-01', p_kind: 'image' }

function spender(): Spender {
  return { agencyId: 'a1', flow: 'editor' }
}

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: 1, error: null })
  mocks.rows.mockReset()
  mocks.updated.mockReset()
  mocks.getCachedEntitlement.mockReset().mockResolvedValue(ENTITLEMENT)
  mocks.notify.mockReset().mockResolvedValue('written')
})

describe('reserveUsage and runMetered — the meter moves only when the thing landed', () => {
  it('reserves through the compare-and-set inside the boundary and settles it as landed on resolve', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ allowed: true, used: 16 }], error: null })
    const who = spender()
    const result = await runMetered(who, async () => {
      expect(requireSpender()).toBe(who)
      await reserveUsage(who, 'image', 1)
      expect(who.reserved).toEqual({ image: 1 })
      return 'stored'
    })

    expect(result).toBe('stored')
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'consume_usage', {
      ...ARGS,
      p_cost: 1,
      p_quota: 120,
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'settle_usage', {
      ...ARGS,
      p_reserved: 1,
      p_landed: 1,
    })
    expect(who.reserved).toEqual({})
  })

  it('gives everything back when the callback throws after reserving, and rethrows', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ allowed: true, used: 16 }], error: null })
    const who = spender()
    await expect(
      runMetered(who, async () => {
        await reserveUsage(who, 'image', 1)
        throw new Error('download failed')
      })
    ).rejects.toThrow('download failed')

    expect(mocks.rpc).toHaveBeenLastCalledWith('settle_usage', {
      ...ARGS,
      p_reserved: 1,
      p_landed: 0,
    })
  })

  it('settles every kind the boundary reserved, each against its own counter', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: true, used: 1 }], error: null })
    const who = spender()
    await runMetered(who, async () => {
      await reserveUsage(who, 'rewrite', 1)
      await reserveUsage(who, 'image', 2)
    })
    const settles = mocks.rpc.mock.calls.filter(([name]) => name === 'settle_usage')
    expect(settles).toEqual([
      ['settle_usage', { ...ARGS, p_kind: 'image', p_reserved: 2, p_landed: 2 }],
      ['settle_usage', { ...ARGS, p_kind: 'rewrite', p_reserved: 1, p_landed: 1 }],
    ])
  })

  it('a refused reservation is the AllowanceError itself, thrown before any provider call, with nothing to settle', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ allowed: false, used: 120 }], error: null })
    const who = spender()
    await expect(
      runMetered(who, async () => {
        await reserveUsage(who, 'image', 1)
        return 'never'
      })
    ).rejects.toBeInstanceOf(AllowanceError)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('settles against the entitlement it reserved with, read once, even when the period rolls in between', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: true, used: 1 }], error: null })
    const who = spender()
    await runMetered(who, async () => {
      await reserveUsage(who, 'image', 1)
      mocks.getCachedEntitlement.mockResolvedValue({ ...ENTITLEMENT, periodKey: '2026-10-01' })
      await reserveUsage(who, 'image', 1)
    })
    expect(mocks.getCachedEntitlement).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenLastCalledWith('settle_usage', {
      ...ARGS,
      p_reserved: 2,
      p_landed: 2,
    })
  })

  it('uses the entitlement a spender brings rather than reading one', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: true, used: 1 }], error: null })
    const who = { ...spender(), entitlement: ENTITLEMENT }
    await runMetered(who, async () => reserveUsage(who, 'image', 1))
    expect(mocks.getCachedEntitlement).not.toHaveBeenCalled()
  })

  it('refuses a spender no runMetered is watching — a reservation nobody would settle', async () => {
    await expect(reserveUsage(spender(), 'image', 1)).rejects.toThrow(/outside runMetered/)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('touches the ledger only when something was reserved', async () => {
    await runMetered(spender(), async () => 'no paid call')
    await expect(
      runMetered(spender(), async () => {
        throw new Error('refused before any call')
      })
    ).rejects.toThrow()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('consumeUsage and settleUsage', () => {
  it('reserves through the compare-and-set, answering only whether it was allowed', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: true, used: 97 }], error: null })
    expect(await consumeUsage(ENTITLEMENT, 'a1', 'image', 1)).toEqual({ allowed: true })
    expect(mocks.rpc).toHaveBeenCalledWith('consume_usage', { ...ARGS, p_cost: 1, p_quota: 120 })
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it('never counts more than was reserved', async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null })
    await settleUsage(ENTITLEMENT, 'a1', 'draft', { reserved: 3, landed: 5 })
    expect(mocks.rpc).toHaveBeenCalledWith('settle_usage', {
      ...ARGS,
      p_kind: 'draft',
      p_reserved: 3,
      p_landed: 3,
    })
  })

  it('counts without releasing on release: 0, leaving pending to the daily reset, and skips a settle that does neither', async () => {
    mocks.rpc.mockResolvedValue({ data: 2, error: null })
    await settleUsage(ENTITLEMENT, 'a1', 'draft', { reserved: 5, landed: 2, release: 0 })
    expect(mocks.rpc).toHaveBeenCalledWith('settle_usage', {
      ...ARGS,
      p_kind: 'draft',
      p_reserved: 0,
      p_landed: 2,
    })

    mocks.rpc.mockClear()
    await settleUsage(ENTITLEMENT, 'a1', 'draft', { reserved: 5, landed: 0, release: 0 })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rings the 80 % bell on the settle that carries the landed count across the line', async () => {
    mocks.rpc.mockResolvedValue({ data: 96, error: null })
    await settleUsage(ENTITLEMENT, 'a1', 'image', { reserved: 1, landed: 1 })
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        agencyId: 'a1',
        type: 'allowance_warning',
        dedupKey: 'allowance_warning:2026-09-01:image:120',
      })
    )

    mocks.notify.mockClear()
    mocks.rpc.mockResolvedValue({ data: 97, error: null })
    await settleUsage(ENTITLEMENT, 'a1', 'image', { reserved: 1, landed: 1 })
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it('a settle with nothing landed never rings, and a lost settle is logged rather than thrown', async () => {
    mocks.rpc.mockResolvedValue({ data: 96, error: null })
    await settleUsage(ENTITLEMENT, 'a1', 'image', { reserved: 1, landed: 0 })
    expect(mocks.notify).not.toHaveBeenCalled()

    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    await expect(
      settleUsage(ENTITLEMENT, 'a1', 'image', { reserved: 1, landed: 1 })
    ).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('readUsage — landed apart from committed', () => {
  it('reports what landed for the meter and landed plus in flight for the cap', async () => {
    mocks.rows.mockResolvedValue({
      data: [
        { agency_id: 'a1', period: '2026-09-01', kind: 'image', count: 15, pending: 1 },
        { agency_id: 'a1', period: '2026-09-01', kind: 'draft', count: 3, pending: 0 },
      ],
      error: null,
    })
    expect(await readUsage('a1', '2026-09-01')).toEqual({
      landed: { draft: 3, image: 15, rewrite: 0 },
      committed: { draft: 3, image: 16, rewrite: 0 },
    })
  })

  it('reads many workspaces in one query, each in its own period', async () => {
    mocks.rows.mockResolvedValue({
      data: [
        { agency_id: 'a1', period: '2026-09-01', kind: 'image', count: 15, pending: 1 },
        { agency_id: 'a1', period: '2026-09-14', kind: 'image', count: 99, pending: 0 },
        { agency_id: 'a2', period: '2026-09-14', kind: 'draft', count: 4, pending: 2 },
      ],
      error: null,
    })
    const usage = await readUsageByAgency([
      { agencyId: 'a1', periodKey: '2026-09-01' },
      { agencyId: 'a2', periodKey: '2026-09-14' },
      { agencyId: 'a3', periodKey: 'trial' },
    ])
    expect(mocks.rows).toHaveBeenCalledTimes(1)
    expect(usage.get('a1')?.committed).toEqual({ draft: 0, image: 16, rewrite: 0 })
    expect(usage.get('a2')?.committed).toEqual({ draft: 6, image: 0, rewrite: 0 })
    expect(usage.get('a3')?.committed).toEqual({ draft: 0, image: 0, rewrite: 0 })
  })

  it("reads a roster whole past PostgREST's silent 1000-row cut, a page at a time", async () => {
    const agencies = Array.from({ length: 400 }, (_, i) => `a${String(i).padStart(3, '0')}`)
    const rows = agencies.flatMap((agencyId) =>
      ['draft', 'image', 'rewrite'].map((kind) => ({
        agency_id: agencyId,
        period: 'trial',
        kind,
        count: 2,
        pending: 1,
      }))
    )
    mocks.rows.mockImplementation((from: number, to: number) =>
      Promise.resolve({ data: rows.slice(from, to + 1), error: null })
    )
    const usage = await readUsageByAgency(
      agencies.map((agencyId) => ({ agencyId, periodKey: 'trial' }))
    )
    expect(mocks.rows.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(usage.get('a399')?.committed).toEqual({ draft: 3, image: 3, rewrite: 3 })
  })

  it('skips a row whose kind is no allowance pool, and fails on a failed page', async () => {
    mocks.rows.mockResolvedValue({
      data: [{ agency_id: 'a1', period: 'trial', kind: 'video', count: 9, pending: 0 }],
      error: null,
    })
    expect((await readUsage('a1', 'trial')).landed).toEqual({ draft: 0, image: 0, rewrite: 0 })

    mocks.rows.mockResolvedValue({ data: null, error: { message: 'down' } })
    await expect(readUsage('a1', 'trial')).rejects.toThrow('usage_counters read failed: down')
  })
})

describe('spendFailureResponse — the one answer to a failed spend', () => {
  it('answers a refused allowance with the 402, anything else with its own words', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const refused = spendFailureResponse(
      new AllowanceError('image', 120, 120, 1, ENTITLEMENT),
      'generate-visual',
      'Visual generation failed'
    )
    expect(refused.status).toBe(402)
    expect(error).not.toHaveBeenCalled()

    const upstream = spendFailureResponse(
      new Error('fal-ai/gpt-image-2: Forbidden — balance exhausted'),
      'generate-visual',
      'Visual generation failed'
    )
    expect(upstream.status).toBe(502)
    expect(await upstream.json()).toEqual({
      error: 'fal-ai/gpt-image-2: Forbidden — balance exhausted',
    })

    const unknown = spendFailureResponse('boom', 'inpaint', 'Inpainting failed')
    expect(unknown.status).toBe(502)
    expect(await unknown.json()).toEqual({ error: 'Inpainting failed' })
    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })
})

describe('lastDailyResetAt', () => {
  it('names the hour vercel.json runs the billing cron at, so the two cannot drift apart', async () => {
    const { readFile } = await import('node:fs/promises')
    const { z } = await import('zod')
    const config = z
      .object({ crons: z.array(z.object({ path: z.string(), schedule: z.string() })) })
      .parse(JSON.parse(await readFile('vercel.json', 'utf8')))
    const billing = config.crons.find((cron) => cron.path === '/api/cron/billing')
    const [minute, hour] = billing!.schedule.split(' ')
    const reset = lastDailyResetAt(new Date('2026-09-26T23:59:00Z'))
    expect([reset.getUTCMinutes(), reset.getUTCHours()]).toEqual([Number(minute), Number(hour)])
  })

  it('is today’s 08:00 UTC once it has passed, yesterday’s before', () => {
    expect(lastDailyResetAt(new Date('2026-09-26T09:15:00Z'))).toEqual(
      new Date('2026-09-26T08:00:00Z')
    )
    expect(lastDailyResetAt(new Date('2026-09-26T07:59:00Z'))).toEqual(
      new Date('2026-09-25T08:00:00Z')
    )
  })
})

describe('clearStaleReservations — the daily reset', () => {
  it('releases only rows nothing has reserved on for ten minutes, and says how many', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-20T08:00:05Z') })
    mocks.updated.mockResolvedValue({
      data: [{ agency_id: 'a1' }, { agency_id: 'a2' }],
      error: null,
    })
    expect(await clearStaleReservations(createAdminSupabaseClient())).toBe(2)
    expect(mocks.updated).toHaveBeenCalledWith('reserved_at', '2026-09-20T07:50:05.000Z')
    vi.useRealTimers()
  })
})
