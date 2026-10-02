import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { performRewrite } from '@/ai/rewrite/rewrite-post'

const mocks = vi.hoisted(() => ({
  fetchClientData: vi.fn(),
  performRewrite: vi.fn(),
  reserveUsage: vi.fn(),
}))
vi.mock('@/lib/auth/resolve-auth', () => ({
  resolveAuth: () => Promise.resolve({ ok: true, userId: 'u1', agencyId: 'a1', supabase: {} }),
}))
vi.mock('@/lib/auth/rate-limit', () => ({ aiRateLimitResponse: () => null }))
vi.mock('@/lib/billing/require-entitled', () => ({
  requireEntitledRoute: () => Promise.resolve(null),
}))
vi.mock('@/lib/clients/fetch-client-data', () => ({
  fetchClientData: (...args: unknown[]) => mocks.fetchClientData(...args),
}))
vi.mock('@/ai/rewrite/rewrite-post', () => ({
  performRewrite: (...args: unknown[]) => mocks.performRewrite(...args),
}))
vi.mock('@/lib/billing/usage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/usage')>()),
  runMetered: (await import('./metered-stand-in')).metered,
  reserveUsage: (...args: unknown[]) => mocks.reserveUsage(...args),
}))

import { POST } from '../rewrite/route'
import { AllowanceError, allowanceResponse } from '@/lib/billing/usage'
import { outcomes } from './metered-stand-in'

const CLIENT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const BODY = { clientId: CLIENT_ID, caption: 'Old caption', postType: 'single' }

function request(body: unknown): Request {
  return new Request('https://kontuur.app/api/ai/rewrite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const REWRITTEN: Awaited<ReturnType<typeof performRewrite>> = {
  caption: 'A calmer caption.',
  slides_json: null,
  quality_score_avg: 8,
  language: { passes: true, language_score: 9, issues: [], corrected_text: null },
  slop: {
    reads_as_human: true,
    ai_tells_found: [],
    worst_offending_phrase: null,
    human_authenticity_score: 8,
  },
  sourceGrounding: null,
  criteria: {
    ai_tells: [],
    worst_offending_phrase: null,
    structure_followed: null,
    source_claims: null,
    health_compliant: null,
    issues: [],
  },
  scores: { overall_score: 8, human_score: 8, language_score: 9, source_score: null },
}

const REFUSED = new AllowanceError('rewrite', 40, 40, 1, {
  resetsOn: new Date('2026-10-01T00:00:00Z'),
  timezone: 'Europe/Sofia',
  paymentFailed: false,
})

describe('POST /api/ai/rewrite — one rewrite is counted only once the model has answered', () => {
  beforeEach(() => {
    outcomes.length = 0
    mocks.fetchClientData.mockReset().mockResolvedValue({ data: { id: CLIENT_ID, name: 'Acme' } })
    mocks.performRewrite.mockReset().mockResolvedValue(REWRITTEN)
    mocks.reserveUsage.mockReset().mockResolvedValue(undefined)
  })

  it('reserves one rewrite and answers the fresh draft from inside the landing', async () => {
    const response = await POST(request(BODY))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(REWRITTEN)
    expect(outcomes).toEqual(['landed'])
    expect(mocks.reserveUsage).toHaveBeenCalledWith(
      { agencyId: 'a1', flow: 'rewrite' },
      'rewrite',
      1
    )
    expect(mocks.performRewrite).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'Old caption', aiTells: [], rewriteReason: 'manual' })
    )
  })

  it('a failed model call is thrown inside the landing and answered as a 502 in the provider’s words', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.performRewrite.mockRejectedValue(new Error('Anthropic API overloaded'))

    const response = await POST(request(BODY))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Anthropic API overloaded' })
    expect(outcomes).toEqual(['thrown'])
    error.mockRestore()
  })

  it('a refused allowance answers the one 402, and the model is never asked', async () => {
    mocks.reserveUsage.mockRejectedValue(REFUSED)

    const response = await POST(request(BODY))
    expect(response.status).toBe(402)
    expect(await response.json()).toEqual(await allowanceResponse(REFUSED).json())
    expect(outcomes).toEqual(['thrown'])
    expect(mocks.performRewrite).not.toHaveBeenCalled()
  })

  it('hands a carousel’s slides on with their number and role, so the merge saves them whole', async () => {
    const slides = [
      { headline: 'H1', body: 'B1', slide_number: 1, slide_role: 'cover' },
      { headline: 'H2', body: 'B2', slide_number: 2, slide_role: 'content' },
    ]
    await POST(request({ ...BODY, postType: 'carousel', slidesJson: slides }))
    expect(mocks.performRewrite).toHaveBeenCalledWith(
      expect.objectContaining({ slidesJson: slides })
    )
  })

  it('a body that fails the schema answers 400 before anything is reserved', async () => {
    const response = await POST(
      request({ clientId: 'not-a-uuid', caption: '', postType: 'single' })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'clientId and caption are required' })
    expect(mocks.reserveUsage).not.toHaveBeenCalled()
    expect(outcomes).toEqual([])
  })
})
