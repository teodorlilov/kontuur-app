import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtractionResult } from '@/types/visual'
import { buildDefaultIdentity } from '@/lib/visual/identity'

const mocks = vi.hoisted(() => ({
  writeExtraction:
    vi.fn<
      (admin: unknown, session: string, patch: { status: string }) => Promise<{ error?: string }>
    >(),
  extractIdentity: vi.fn(),
  afterWork: new Array<Promise<unknown>>(),
  aiRateLimitResponse: vi.fn(),
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (work: () => Promise<unknown>) => {
    mocks.afterWork.push(work())
  },
}))
vi.mock('@/lib/auth/resolve-auth', () => ({
  resolveAuth: () => Promise.resolve({ ok: true, userId: 'u1', agencyId: 'a1', supabase: {} }),
}))
vi.mock('@/lib/auth/rate-limit', () => ({
  aiRateLimitResponse: (...args: unknown[]) => mocks.aiRateLimitResponse(...args),
}))
vi.mock('@/lib/billing/require-entitled', () => ({
  requireEntitledRoute: () => Promise.resolve(null),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({}) }))
vi.mock('@/lib/visual/queries', () => ({
  writeExtraction: mocks.writeExtraction,
}))
vi.mock('@/lib/visual/extract-identity', () => ({
  extractIdentity: (...args: unknown[]) => mocks.extractIdentity(...args),
}))

import { POST } from '../start/route'

function request(body: unknown): Request {
  return new Request('https://kontuur.app/api/extract/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Answers each extraction write by its status: `{}` lands, `{ error }` is a failed upsert. */
function writesAnswer(byStatus: Partial<Record<string, { error?: string }>>) {
  mocks.writeExtraction.mockImplementation(
    async (_admin, _session, patch) => byStatus[patch.status] ?? {}
  )
}

/** The statuses written, in order. */
function writtenStatuses(): string[] {
  return mocks.writeExtraction.mock.calls.map(([, , patch]) => patch.status)
}

const MEASURED: ExtractionResult = {
  identity: { ...buildDefaultIdentity(), palette_description: 'Dominant background: white' },
  report: { source: 'website' },
}

const error = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
  mocks.aiRateLimitResponse.mockReset().mockReturnValue(null)
  mocks.afterWork.length = 0
  mocks.writeExtraction.mockReset()
  mocks.extractIdentity.mockReset().mockResolvedValue(MEASURED)
  writesAnswer({})
  error.mockClear()
})

describe('POST /api/extract/start — before the response', () => {
  it('with no website, stores the default palette as fallback and answers 202', async () => {
    const response = await POST(request({ onboardingSessionId: 's1' }))
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'fallback' })
    expect(mocks.writeExtraction).toHaveBeenCalledWith({}, 's1', {
      status: 'fallback',
      agencyId: 'a1',
      identity: buildDefaultIdentity(),
      report: { source: 'fallback', fallback: { reason: 'no website provided' } },
    })
    expect(mocks.extractIdentity).not.toHaveBeenCalled()
    expect(mocks.afterWork).toHaveLength(0)
  })

  it('a failed no-website write answers 503 and is logged', async () => {
    writesAnswer({ fallback: { error: 'db down' } })
    const response = await POST(request({ onboardingSessionId: 's1' }))
    expect(response.status).toBe(503)
    expect(error).toHaveBeenCalledWith(
      '[extract:start] session s1: fallback write failed:',
      'db down'
    )
  })

  it('a failed pending write answers 503 and schedules no capture', async () => {
    writesAnswer({ pending: { error: 'db down' } })
    const response = await POST(
      request({ onboardingSessionId: 's1', websiteUrl: 'https://example.com' })
    )
    expect(response.status).toBe(503)
    expect(mocks.afterWork).toHaveLength(0)
    expect(error).toHaveBeenCalledWith(
      '[extract:start] session s1: pending write failed:',
      'db down'
    )
  })
})

describe('POST /api/extract/start — inside after()', () => {
  it('answers 202 pending, then lands the measured identity as ready', async () => {
    const response = await POST(
      request({ onboardingSessionId: 's1', websiteUrl: 'https://example.com' })
    )
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'pending' })
    await Promise.all(mocks.afterWork)
    expect(mocks.extractIdentity).toHaveBeenCalledWith({ url: 'https://example.com' })
    expect(writtenStatuses()).toEqual(['pending', 'ready'])
    expect(error).not.toHaveBeenCalled()
  })

  it('a failed ready write is logged', async () => {
    writesAnswer({ ready: { error: 'db down' } })
    await POST(request({ onboardingSessionId: 's1', websiteUrl: 'https://example.com' }))
    await Promise.all(mocks.afterWork)
    expect(writtenStatuses()).toEqual(['pending', 'ready'])
    expect(error).toHaveBeenCalledWith('[extract:start] session s1: ready write failed:', 'db down')
  })

  it('an extraction that throws lands the default palette as fallback', async () => {
    mocks.extractIdentity.mockRejectedValue(new Error('browser died'))
    await POST(request({ onboardingSessionId: 's1', websiteUrl: 'https://example.com' }))
    await Promise.all(mocks.afterWork)
    expect(writtenStatuses()).toEqual(['pending', 'fallback'])
    expect(mocks.writeExtraction).toHaveBeenLastCalledWith({}, 's1', {
      status: 'fallback',
      agencyId: 'a1',
      identity: buildDefaultIdentity(),
      report: { source: 'fallback', fallback: { reason: 'extraction error' } },
    })
    expect(error).toHaveBeenCalledWith(
      '[extract:start] session s1: extraction failed:',
      expect.any(Error)
    )
  })

  it('a failed fallback write after a thrown extraction is logged', async () => {
    mocks.extractIdentity.mockRejectedValue(new Error('browser died'))
    writesAnswer({ fallback: { error: 'db down' } })
    await POST(request({ onboardingSessionId: 's1', websiteUrl: 'https://example.com' }))
    await Promise.all(mocks.afterWork)
    expect(error).toHaveBeenCalledWith(
      '[extract:start] session s1: fallback write failed:',
      'db down'
    )
  })
})

describe('POST /api/extract/start — the site read’s rate limit', () => {
  it('answers the limiter’s refusal before any write or capture', async () => {
    const limited = Response.json({ error: 'Too many requests' }, { status: 429 })
    mocks.aiRateLimitResponse.mockReturnValue(limited)
    const response = await POST(
      request({ onboardingSessionId: 's1', websiteUrl: 'https://example.com' })
    )
    expect(response).toBe(limited)
    expect(mocks.aiRateLimitResponse).toHaveBeenCalledWith('analyze-url', 'u1')
    expect(mocks.writeExtraction).not.toHaveBeenCalled()
    expect(mocks.extractIdentity).not.toHaveBeenCalled()
  })
})
