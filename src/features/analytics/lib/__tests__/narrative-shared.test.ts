import { beforeEach, describe, expect, it, vi } from 'vitest'
import { noEntitlement, type Entitlement } from '@/lib/billing/entitlement'
import type { AnalyticsPeriod } from '../compute/period'
import type { NarrativeResult, NarrativeSpec } from '../shared/narrative-shared'

/**
 * The narrative's spend gate. `run` stands for the cached read and the model call together, and
 * it drives the real `resolveNarrative`, so the model mock is the proof of what a refused
 * workspace never reaches.
 */

const mocks = vi.hoisted(() => ({
  getCachedEntitlement: vi.fn<(agencyId: string) => Promise<Entitlement>>(),
  generateAnalyticsSummary: vi.fn<() => Promise<string>>(),
}))

vi.mock(import('@/lib/queries/cache'), () => ({
  getCachedEntitlement: mocks.getCachedEntitlement,
}))
vi.mock(import('@/ai/analytics/generate-summary'), () => ({
  generateAnalyticsSummary: mocks.generateAnalyticsSummary,
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn() }))
vi.mock('@/lib/queries/db', () => ({ fetchConnectionSyncState: vi.fn() }))

const { guardNarrative, resolveNarrative } = await import('../shared/narrative-shared')

const PERIOD: AnalyticsPeriod = {
  preset: '30d',
  start: '2026-07-20',
  end: '2026-08-18',
  prevStart: '2026-06-20',
  prevEnd: '2026-07-19',
  days: 30,
}

const SPEC: NarrativeSpec<{ hasHistory: boolean }> = {
  platform: 'instagram',
  platformName: 'Instagram',
  getReport() {
    return Promise.resolve({ hasHistory: true })
  },
  isSilent() {
    return false
  },
  facts() {
    return { reach: { now: 120, previous: 60 } }
  },
}

/** A `run` that goes all the way to the (mocked) model, as the cached callbacks do on a miss. */
function modelRun() {
  return vi.fn(
    (): Promise<NarrativeResult | null> =>
      resolveNarrative(SPEC, {
        clientId: 'client-1',
        clientName: 'Acme',
        period: PERIOD,
        timezone: 'UTC',
      })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generateAnalyticsSummary.mockResolvedValue('Reach doubled on the back of two reels.')
})

describe('guardNarrative', () => {
  it('never runs the cache or the model for a workspace that cannot spend', async () => {
    mocks.getCachedEntitlement.mockResolvedValue(noEntitlement())
    const run = modelRun()

    await expect(guardNarrative('agency-1', 'client-1', 'Instagram', run)).resolves.toBeNull()

    expect(mocks.getCachedEntitlement).toHaveBeenCalledWith('agency-1')
    expect(run).not.toHaveBeenCalled()
    expect(mocks.generateAnalyticsSummary).not.toHaveBeenCalled()
  })

  it('runs them for a workspace that can', async () => {
    mocks.getCachedEntitlement.mockResolvedValue({
      ...noEntitlement(),
      state: 'active',
      canSpend: true,
    })
    const run = modelRun()

    await expect(guardNarrative('agency-1', 'client-1', 'Instagram', run)).resolves.toEqual({
      text: 'Reach doubled on the back of two reels.',
      archived: false,
    })

    expect(run).toHaveBeenCalledOnce()
    expect(mocks.generateAnalyticsSummary).toHaveBeenCalledOnce()
  })

  it('answers a failed entitlement read with null, never a throw', async () => {
    mocks.getCachedEntitlement.mockRejectedValue(new Error('agency read failed'))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const run = modelRun()

    await expect(guardNarrative('agency-1', 'client-1', 'Instagram', run)).resolves.toBeNull()

    expect(run).not.toHaveBeenCalled()
    expect(logged).toHaveBeenCalledOnce()
    logged.mockRestore()
  })
})
