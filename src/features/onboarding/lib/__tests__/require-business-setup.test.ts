import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

import { requireBusinessSetup } from '../require-business-setup'

describe('requireBusinessSetup', () => {
  beforeEach(() => {
    mocks.redirect.mockReset()
  })

  it('sends a solo workspace with no client to /clients/new', () => {
    requireBusinessSetup('solo', 0, true)
    expect(mocks.redirect).toHaveBeenCalledTimes(1)
    expect(mocks.redirect).toHaveBeenCalledWith('/clients/new')
  })

  it('leaves a solo workspace alone once it has a client', () => {
    requireBusinessSetup('solo', 1, true)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('never redirects an agency workspace, even with no clients', () => {
    requireBusinessSetup('agency', 0, true)
    requireBusinessSetup('agency', 3, true)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('treats a missing mode as agency', () => {
    requireBusinessSetup(null, 0, true)
    requireBusinessSetup(undefined, 0, true)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('leaves a lapsed solo workspace where it is — onboarding would send it straight back', () => {
    requireBusinessSetup('solo', 0, false)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
