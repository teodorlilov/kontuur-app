import { afterEach, describe, expect, it, vi } from 'vitest'
import { unauthorizedCron } from '../authorize-cron'

function request(authorization?: string): Request {
  return new Request('https://kontuur.app/api/cron/billing', {
    headers: authorization ? { authorization } : {},
  })
}

describe('unauthorizedCron', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('lets the bearer Vercel sends through', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    expect(unauthorizedCron(request('Bearer s3cret'))).toBeNull()
  })

  it('answers 401 to a wrong or missing bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const wrong = unauthorizedCron(request('Bearer guess'))
    expect(wrong?.status).toBe(401)
    expect(await wrong?.json()).toEqual({ error: 'Unauthorized' })
    expect(unauthorizedCron(request())?.status).toBe(401)
  })

  it('refuses everything while the secret is unset, rather than letting everything in', () => {
    vi.stubEnv('CRON_SECRET', '')
    expect(unauthorizedCron(request('Bearer '))?.status).toBe(401)
    expect(unauthorizedCron(request())?.status).toBe(401)
  })
})
