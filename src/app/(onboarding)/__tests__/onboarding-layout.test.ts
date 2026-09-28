import { beforeEach, describe, expect, it, vi } from 'vitest'
import { entitlementFor } from '@/lib/billing/entitlement'
import { trialRow } from '@/lib/billing/__tests__/fixtures'

const mocks = vi.hoisted(() => ({
  getCachedUserRecord: vi.fn(),
  getCachedEntitlement: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))
vi.mock('@/lib/auth/session', () => ({
  requireAuthUserId: async () => 'u1',
  getCachedUserRecord: mocks.getCachedUserRecord,
}))
/**
 * No client count on offer: the layout must never read one, or the save that puts a solo trial at
 * its cap would redirect it out of setup (`OnboardingLayout`'s doc). So one render stands for both
 * sides of that save, and a cap check added to the layout fails it.
 */
vi.mock('@/lib/queries/cache', () => ({
  getCachedEntitlement: mocks.getCachedEntitlement,
}))
vi.mock('@/components/providers/auth-provider', () => ({ AuthProvider: () => null }))

import OnboardingLayout from '../layout'

const NOW = new Date('2026-09-14T12:00:00Z')

/** Where onboarding sends a workspace before rendering the form: nowhere, or Plan & billing. */
async function destination(): Promise<string> {
  try {
    await OnboardingLayout({ children: null })
    return 'the form'
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

describe('OnboardingLayout', () => {
  beforeEach(() => {
    mocks.getCachedUserRecord.mockResolvedValue({ agency_id: 'a1' })
  })

  it('sends a workspace that may not create a brand to Plan & billing', async () => {
    mocks.getCachedEntitlement.mockResolvedValue(
      entitlementFor(trialRow(NOW, { trial_ends_at: '2026-08-01T00:00:00Z' }), NOW)
    )
    expect(await destination()).toBe('redirect:/settings?tab=account')
  })

  it('keeps a solo trial on the form, before and after the save that reaches its cap, so the sources stepper stays mounted', async () => {
    mocks.getCachedEntitlement.mockResolvedValue(
      entitlementFor(trialRow(NOW, { mode: 'solo' }), NOW)
    )
    expect(await destination()).toBe('the form')
  })
})
