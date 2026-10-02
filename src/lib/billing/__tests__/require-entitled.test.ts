import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getCachedEntitlement: vi.fn() }))
vi.mock('@/lib/queries/cache', () => ({
  getCachedEntitlement: (...args: unknown[]) => mocks.getCachedEntitlement(...args),
}))

import { requireEntitledAction, requireEntitledRoute } from '../require-entitled'
import { WORKSPACE_LOCKED, shellNotice } from '../copy'
import { entitlementFor } from '../entitlement'
import { paidRow, trialRow } from './fixtures'

const NOW = new Date('2026-09-14T12:00:00Z')
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000).toISOString()

const TRIAL = entitlementFor(trialRow(NOW), NOW)
const GRACE = entitlementFor(trialRow(NOW, { trial_ends_at: day(-2) }), NOW)
const PAUSED = entitlementFor(trialRow(NOW, { trial_ends_at: day(-30) }), NOW)
const FAILED_RENEWAL = entitlementFor(
  paidRow(NOW, { subscription_status: 'past_due', past_due_since: day(-9) }),
  NOW
)

describe('the gate pair', () => {
  beforeEach(() => mocks.getCachedEntitlement.mockReset())

  it('lets an entitled workspace through with nothing to return', async () => {
    mocks.getCachedEntitlement.mockResolvedValue(TRIAL)
    expect(await requireEntitledRoute('a1', 'spend')).toBeNull()
    expect(await requireEntitledAction('a1', 'publish')).toBeNull()
    expect(mocks.getCachedEntitlement).toHaveBeenCalledWith('a1')
  })

  it('answers a 402 in the trial’s grace with the banner’s own sentence', async () => {
    mocks.getCachedEntitlement.mockResolvedValue(GRACE)
    const refused = await requireEntitledRoute('a1', 'spend')
    expect(refused?.status).toBe(402)
    expect(await refused?.json()).toEqual({
      error: shellNotice(GRACE, NOW)?.text,
    })
    expect(await requireEntitledRoute('a1', 'publish')).toBeNull()
  })

  it('asks for the card when a failed renewal has paused the workspace', async () => {
    mocks.getCachedEntitlement.mockResolvedValue(FAILED_RENEWAL)
    const refused = await requireEntitledRoute('a1', 'publish')
    expect(await refused?.json()).toEqual({
      error:
        'Your workspace is paused because your last payment failed. Update your card in Plan & billing to continue.',
    })
  })

  it('shapes the paused refusal as an action result', async () => {
    mocks.getCachedEntitlement.mockResolvedValue(PAUSED)
    expect(await requireEntitledAction('a1', 'spend')).toEqual({
      ok: false,
      error: WORKSPACE_LOCKED,
    })
  })
})
