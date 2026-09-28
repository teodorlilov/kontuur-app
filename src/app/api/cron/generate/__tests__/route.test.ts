import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { RecentRun } from '@/lib/generation/runs'

const mocks = vi.hoisted(() => ({
  fetchRecentRuns: vi.fn(),
  closeAbandonedRuns: vi.fn(),
  runScheduledBatch: vi.fn(),
  fetchScheduleContext: vi.fn(),
  fetchOwedByAgency: vi.fn(),
}))
const NOW = Date.parse('2026-09-26T09:30:00Z')
const SLOT = new Date('2026-09-26T09:00:00Z')

vi.mock('@/lib/cron/authorize-cron', () => ({ unauthorizedCron: () => null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              { id: 's1', client_id: 'c1', frequency_value: 2 },
              { id: 's2', client_id: 'c2', frequency_value: 2 },
            ],
            error: null,
          }),
      }),
    }),
  }),
}))
vi.mock('@/features/dashboard/lib/write-briefing', () => ({
  writeWeeklyBriefing: () => Promise.resolve({ written: false }),
}))
vi.mock('@/lib/billing/spend-context', () => ({
  runAsSpender: (_spender: unknown, fn: () => Promise<unknown>) => fn(),
}))
vi.mock('@/lib/generation/runs', async (importActual) => ({
  lastCronRunAt: (await importActual<typeof import('@/lib/generation/runs')>()).lastCronRunAt,
  fetchRecentRuns: (...args: unknown[]) => mocks.fetchRecentRuns(...args),
  closeAbandonedRuns: (...args: unknown[]) => mocks.closeAbandonedRuns(...args),
}))
vi.mock('@/lib/generation/scheduled-run', () => ({
  runScheduledBatch: (...args: unknown[]) => mocks.runScheduledBatch(...args),
}))
vi.mock('../helpers', () => ({
  fetchScheduleContext: (...args: unknown[]) => mocks.fetchScheduleContext(...args),
  fetchOwedByAgency: (...args: unknown[]) => mocks.fetchOwedByAgency(...args),
  getScheduleDue: () => ({ due: true, scheduledAt: SLOT, localHour: 12 }),
}))

import { GET } from '../route'

const ENTITLEMENT = {
  limits: { draft: 40, image: 120, rewrite: 30 },
  periodKey: '2026-09-01',
}

/** A cron run for c1 its invocation never closed: at NOW it is 25 minutes old, past the 15-minute abandoned-run cutoff. */
const STALE: RecentRun = {
  id: 'run-1',
  clientId: 'c1',
  agencyId: 'a1',
  kind: 'cron',
  status: 'running',
  createdAt: '2026-09-26T09:05:00Z',
  targetCount: 2,
  periodKey: '2026-09-01',
}

function claimedClients(): string[] {
  return mocks.runScheduledBatch.mock.calls.map(([, input]) => input.client.id)
}

describe('GET /api/cron/generate — runs a killed invocation left open', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    mocks.fetchRecentRuns.mockReset().mockResolvedValue([STALE])
    mocks.closeAbandonedRuns.mockReset()
    mocks.runScheduledBatch.mockReset().mockResolvedValue({ kind: 'slot_taken' })
    mocks.fetchOwedByAgency.mockReset().mockResolvedValue(new Map())
    mocks.fetchScheduleContext.mockReset().mockResolvedValue({
      clients: new Map([
        ['c1', { id: 'c1', agency_id: 'a1', name: 'One' }],
        ['c2', { id: 'c2', agency_id: 'a1', name: 'Two' }],
      ]),
      brandProfiles: new Map(),
      agencyTimezones: new Map([['a1', 'UTC']]),
      entitlements: new Map([['a1', ENTITLEMENT]]),
      committed: new Map([['a1', { draft: 0, image: 0, rewrite: 0 }]]),
    })
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    return () => vi.useRealTimers()
  })

  it('reads the runs once and closes before the dedup, so a slot that produced nothing is due again', async () => {
    mocks.closeAbandonedRuns.mockResolvedValue([{ ...STALE, status: 'failed' }])
    await GET(new NextRequest('https://kontuur.app/api/cron/generate'))
    expect(mocks.fetchRecentRuns).toHaveBeenCalledTimes(1)
    expect(mocks.closeAbandonedRuns).toHaveBeenCalledWith(expect.anything(), [STALE])
    expect(claimedClients()).toEqual(['c1', 'c2'])
  })

  it('keeps the slot of a closed run whose drafts landed', async () => {
    mocks.closeAbandonedRuns.mockResolvedValue([{ ...STALE, status: 'complete' }])
    await GET(new NextRequest('https://kontuur.app/api/cron/generate'))
    expect(claimedClients()).toEqual(['c2'])
  })

  it('goes on with the runs as read when the sweep throws', async () => {
    mocks.closeAbandonedRuns.mockRejectedValue(new Error('posts count failed'))
    const response = await GET(new NextRequest('https://kontuur.app/api/cron/generate'))
    expect(response.status).toBe(200)
    expect(console.error).toHaveBeenCalledWith(
      '[cron:generate] abandoned run sweep failed:',
      expect.any(Error)
    )
    expect(claimedClients()).toEqual(['c2'])
  })

  it('answers 500 when the runs cannot be read, rather than regenerating every batch', async () => {
    mocks.fetchRecentRuns.mockRejectedValue(new Error('recent run query failed: down'))
    const response = await GET(new NextRequest('https://kontuur.app/api/cron/generate'))
    expect(response.status).toBe(500)
    expect(mocks.runScheduledBatch).not.toHaveBeenCalled()
  })

  it('reads owed pictures once for the due workspaces, and fails the tick when it cannot: an unknown figure is not zero', async () => {
    mocks.closeAbandonedRuns.mockResolvedValue([])
    await GET(new NextRequest('https://kontuur.app/api/cron/generate'))
    expect(mocks.fetchOwedByAgency).toHaveBeenCalledTimes(1)
    expect(mocks.fetchOwedByAgency).toHaveBeenCalledWith(expect.anything(), ['a1'])

    mocks.runScheduledBatch.mockClear()
    mocks.fetchOwedByAgency.mockRejectedValue(new Error('down'))
    const response = await GET(new NextRequest('https://kontuur.app/api/cron/generate'))
    expect(response.status).toBe(500)
    expect(mocks.runScheduledBatch).not.toHaveBeenCalled()
  })
})
