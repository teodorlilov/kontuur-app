import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  clearStaleReservations: vi.fn(),
  remindTrialWorkspaces: vi.fn(),
  retryUndeliveredDocuments: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({ admin: true }) }))
vi.mock('@/lib/cron/authorize-cron', () => ({ unauthorizedCron: () => null }))
vi.mock('@/lib/billing/usage', () => ({ clearStaleReservations: mocks.clearStaleReservations }))
vi.mock('@/lib/billing/reminders', () => ({ remindTrialWorkspaces: mocks.remindTrialWorkspaces }))
vi.mock('@/lib/billing/documents', () => ({
  retryUndeliveredDocuments: mocks.retryUndeliveredDocuments,
}))

import { GET } from '../route'

const REMINDED = {
  checked: 2,
  notified: { trial_ending: 1, trial_ended: 0, workspace_paused: 0 },
  emailed: 1,
  errors: [],
}

function tick() {
  return GET(new NextRequest('https://kontuur.app/api/cron/billing'))
}

describe('GET /api/cron/billing', () => {
  beforeEach(() => {
    mocks.clearStaleReservations.mockReset().mockResolvedValue(3)
    mocks.remindTrialWorkspaces.mockReset().mockResolvedValue(REMINDED)
    mocks.retryUndeliveredDocuments.mockReset().mockResolvedValue({ retried: 1, delivered: 1 })
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('releases stranded reservations before anything else', async () => {
    const response = await tick()
    expect(response.status).toBe(200)
    const [release] = mocks.clearStaleReservations.mock.invocationCallOrder
    expect(release).toBeLessThan(mocks.remindTrialWorkspaces.mock.invocationCallOrder[0]!)
    expect(release).toBeLessThan(mocks.retryUndeliveredDocuments.mock.invocationCallOrder[0]!)
  })

  it('gives the document retry a deadline 40 s in, leaving the delivery in flight 20 s of maxDuration', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-26T08:00:00Z'), toFake: ['Date'] })
    await tick()
    expect(mocks.retryUndeliveredDocuments).toHaveBeenCalledWith(
      { admin: true },
      Date.parse('2026-09-26T08:00:40Z')
    )
    vi.useRealTimers()
  })

  it('runs each job whatever the others did, logs each failure by name, and answers 500', async () => {
    mocks.remindTrialWorkspaces.mockRejectedValue(new Error('resend down'))
    mocks.retryUndeliveredDocuments.mockRejectedValue(new Error('storage down'))
    const response = await tick()
    expect(mocks.clearStaleReservations).toHaveBeenCalled()
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      reservationsCleared: 3,
      reminders: null,
      documents: null,
    })
    expect(console.error).toHaveBeenCalledWith(
      '[cron:billing] reminders failed:',
      expect.any(Error)
    )
    expect(console.error).toHaveBeenCalledWith(
      '[cron:billing] document retry failed:',
      expect.any(Error)
    )

    mocks.clearStaleReservations.mockRejectedValue(new Error('db down'))
    mocks.remindTrialWorkspaces.mockResolvedValue(REMINDED)
    mocks.retryUndeliveredDocuments.mockResolvedValue({ retried: 0, delivered: 0 })
    expect((await tick()).status).toBe(500)
    expect(mocks.remindTrialWorkspaces).toHaveBeenCalledTimes(2)
    expect(mocks.retryUndeliveredDocuments).toHaveBeenCalledTimes(2)
  })
})
