import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  aiRateLimitResponse: vi.fn(),
  requireEntitledRoute: vi.fn(),
  resolveClientWebsite: vi.fn(),
  extractIdentity: vi.fn(),
}))
vi.mock('@/lib/auth/resolve-auth', () => ({
  resolveAuth: () => Promise.resolve({ ok: true, userId: 'u1', agencyId: 'a1', supabase: {} }),
}))
vi.mock('@/lib/auth/rate-limit', () => ({
  aiRateLimitResponse: (...args: unknown[]) => mocks.aiRateLimitResponse(...args),
}))
vi.mock('@/lib/billing/require-entitled', () => ({
  requireEntitledRoute: (...args: unknown[]) => mocks.requireEntitledRoute(...args),
}))
vi.mock('@/lib/clients/resolve-client-website', () => ({
  resolveClientWebsite: (...args: unknown[]) => mocks.resolveClientWebsite(...args),
}))
vi.mock('@/lib/visual/extract-identity', () => ({
  extractIdentity: (...args: unknown[]) => mocks.extractIdentity(...args),
}))
vi.mock('@/lib/visual/queries', () => ({
  fetchVisualIdentity: vi.fn(),
  upsertVisualIdentity: vi.fn(),
}))

import { POST } from '../route'

const PARAMS = { params: Promise.resolve({ id: 'c1' }) }

describe('POST /api/clients/[id]/visual-identity/reanalyze — the site read’s rate limit', () => {
  beforeEach(() => {
    mocks.aiRateLimitResponse.mockReset()
    mocks.requireEntitledRoute.mockReset().mockResolvedValue(null)
    mocks.resolveClientWebsite.mockReset()
    mocks.extractIdentity.mockReset()
  })

  it('answers the limiter’s refusal before the entitlement, the client or a capture', async () => {
    const limited = Response.json({ error: 'Too many requests' }, { status: 429 })
    mocks.aiRateLimitResponse.mockReturnValue(limited)
    const response = await POST(new Request('https://kontuur.app/api'), PARAMS)
    expect(response).toBe(limited)
    expect(mocks.aiRateLimitResponse).toHaveBeenCalledWith('analyze-url', 'u1')
    expect(mocks.requireEntitledRoute).not.toHaveBeenCalled()
    expect(mocks.resolveClientWebsite).not.toHaveBeenCalled()
    expect(mocks.extractIdentity).not.toHaveBeenCalled()
  })
})
