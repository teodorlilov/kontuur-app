import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

import { requireBusinessSetup } from '../require-business-setup'

describe('requireBusinessSetup', () => {
  beforeEach(() => {
    mocks.redirect.mockReset()
  })

  it('sends a solo workspace with no client to /clients/new', () => {
    requireBusinessSetup('solo', 0)
    expect(mocks.redirect).toHaveBeenCalledTimes(1)
    expect(mocks.redirect).toHaveBeenCalledWith('/clients/new')
  })

  it('leaves a solo workspace alone once it has a client', () => {
    requireBusinessSetup('solo', 1)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('never redirects an agency workspace, even with no clients', () => {
    requireBusinessSetup('agency', 0)
    requireBusinessSetup('agency', 3)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('treats a missing mode as agency', () => {
    requireBusinessSetup(null, 0)
    requireBusinessSetup(undefined, 0)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
