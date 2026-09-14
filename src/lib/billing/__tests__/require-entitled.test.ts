import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entitlement } from '../entitlement'

const mocks = vi.hoisted(() => ({ getCachedEntitlement: vi.fn() }))
vi.mock('@/lib/queries/cache', () => ({
  getCachedEntitlement: (...args: unknown[]) => mocks.getCachedEntitlement(...args),
}))

import { requireEntitledAction, requireEntitledRoute } from '../require-entitled'
import { WORKSPACE_LOCKED } from '../copy'

function entitlement(overrides: Partial<Entitlement>): Entitlement {
  return {
    state: 'active',
    canSpend: true,
    canPublish: true,
    canCreate: true,
    ...overrides,
  } as Entitlement
}

describe('the gate pair', () => {
  beforeEach(() => mocks.getCachedEntitlement.mockReset())

  it('lets an entitled workspace through with nothing to return', async () => {
    mocks.getCachedEntitlement.mockResolvedValue(entitlement({}))
    expect(await requireEntitledRoute('a1', 'spend')).toBeNull()
    expect(await requireEntitledAction('a1', 'publish')).toBeNull()
    expect(mocks.getCachedEntitlement).toHaveBeenCalledWith('a1')
  })

  it('answers a 402 with the state as the reason, in the one locked shape', async () => {
    mocks.getCachedEntitlement.mockResolvedValue(
      entitlement({ state: 'trial_grace', canSpend: false, canCreate: false })
    )
    const refused = await requireEntitledRoute('a1', 'spend')
    expect(refused?.status).toBe(402)
    expect(await refused?.json()).toEqual({
      error: WORKSPACE_LOCKED,
      code: 'locked',
      reason: 'trial_ended',
    })
    expect(await requireEntitledRoute('a1', 'publish')).toBeNull()
  })

  it('shapes the same refusal as an action result', async () => {
    mocks.getCachedEntitlement.mockResolvedValue(
      entitlement({ state: 'locked', canSpend: false, canPublish: false, canCreate: false })
    )
    expect(await requireEntitledAction('a1', 'create')).toEqual({
      ok: false,
      error: WORKSPACE_LOCKED,
    })
  })
})
