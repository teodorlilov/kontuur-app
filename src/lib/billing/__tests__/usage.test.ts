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
      select: () => ({ eq: () => ({ eq: () => mocks.rows() }) }),
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
  readUsage,
  reserveUsage,
  runMetered,
  settleUsage,
  spendFailureResponse,
} from '../usage'
import { currentSpender } from '../spend-context'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

const ENTITLEMENT = {
  limits: { draft: 40, image: 120, rewrite: 30 },
  periodKey: '2026-09-01',
  resetsOn: new Date('2026-10-01T00:00:00Z'),
  timezone: 'Europe/Sofia',
} as unknown as Entitlement

const ARGS = { p_agency_id: 'a1', p_period: '2026-09-01', p_kind: 'image' }

function spender(): Spender {
  return { agencyId: 'a1', clientId: 'c1', flow: 'editor' }
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
      expect(currentSpender()).toBe(who)
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
      ['settle_usage', { ...ARGS, p_kind: 'rewrite', p_reserved: 1, p_landed: 1 }],
      ['settle_usage', { ...ARGS, p_kind: 'image', p_reserved: 2, p_landed: 2 }],
    ])
  })

  it('a refused reservation is the AllowanceError itself, thrown before any provider call', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ allowed: false, used: 120 }], error: null })
    const who = spender()
    await expect(
      runMetered(who, async () => {
        await reserveUsage(who, 'image', 1)
        return 'never'
      })
    ).rejects.toBeInstanceOf(AllowanceError)
    // Nothing was held, so nothing is settled.
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
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
  it('reserves through the compare-and-set and reports what is committed', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: true, used: 97 }], error: null })
    expect(await consumeUsage(ENTITLEMENT, 'a1', 'image', 1)).toEqual({
      allowed: true,
      used: 97,
      quota: 120,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('consume_usage', { ...ARGS, p_cost: 1, p_quota: 120 })
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it('refuses a zero quota without asking the database, with the refusal ready to throw', async () => {
    const paused = { ...ENTITLEMENT, limits: { draft: 0, image: 0, rewrite: 0 } } as Entitlement
    const outcome = await consumeUsage(paused, 'a1', 'image', 1)
    expect(outcome.allowed).toBe(false)
    expect(!outcome.allowed && outcome.refused).toMatchObject({ kind: 'image', used: 0, quota: 0 })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('never counts more than was reserved', async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null })
    await settleUsage(ENTITLEMENT, 'a1', 'draft', 3, 5)
    expect(mocks.rpc).toHaveBeenCalledWith('settle_usage', {
      ...ARGS,
      p_kind: 'draft',
      p_reserved: 3,
      p_landed: 3,
    })
  })

  it('rings the 80 % bell on the settle that carries the landed count across the line', async () => {
    mocks.rpc.mockResolvedValue({ data: 96, error: null })
    await settleUsage(ENTITLEMENT, 'a1', 'image', 1, 1)
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ agencyId: 'a1', type: 'allowance_warning', cooldownDays: 31 })
    )

    mocks.notify.mockClear()
    mocks.rpc.mockResolvedValue({ data: 97, error: null })
    await settleUsage(ENTITLEMENT, 'a1', 'image', 1, 1)
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it('a settle with nothing landed never rings, and a lost settle is logged rather than thrown', async () => {
    mocks.rpc.mockResolvedValue({ data: 96, error: null })
    await settleUsage(ENTITLEMENT, 'a1', 'image', 1, 0)
    expect(mocks.notify).not.toHaveBeenCalled()

    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    await expect(settleUsage(ENTITLEMENT, 'a1', 'image', 1, 1)).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('readUsage — landed apart from committed', () => {
  it('reports what landed for the meter and landed plus in flight for the cap', async () => {
    mocks.rows.mockResolvedValue({
      data: [
        { kind: 'image', count: 15, pending: 1 },
        { kind: 'draft', count: 3, pending: 0 },
      ],
      error: null,
    })
    expect(await readUsage('a1', '2026-09-01')).toEqual({
      landed: { draft: 3, image: 15, rewrite: 0 },
      committed: { draft: 3, image: 16, rewrite: 0 },
    })
  })
})

describe('spendFailureResponse — the one answer to a failed spend', () => {
  it('answers a refused allowance with the 402, anything else with its own words', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const refused = spendFailureResponse(
      new AllowanceError('image', 120, 120, 1, ENTITLEMENT),
      'generate-visual',
      'Visual generation failed',
      502
    )
    expect(refused.status).toBe(402)
    expect(error).not.toHaveBeenCalled()

    const upstream = spendFailureResponse(
      new Error('fal-ai/gpt-image-2: Forbidden — balance exhausted'),
      'generate-visual',
      'Visual generation failed',
      502
    )
    expect(upstream.status).toBe(502)
    expect(await upstream.json()).toEqual({
      error: 'fal-ai/gpt-image-2: Forbidden — balance exhausted',
    })

    const unknown = spendFailureResponse('boom', 'inpaint', 'Inpainting failed', 500)
    expect(unknown.status).toBe(500)
    expect(await unknown.json()).toEqual({ error: 'Inpainting failed' })
    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
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
