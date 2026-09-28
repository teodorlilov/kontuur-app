import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn(),
  provisionUserRecord: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({ getAuthUserId: () => mocks.getAuthUserId() }))
vi.mock('@/lib/auth/provision-user-record', () => ({
  provisionUserRecord: (id: string) => mocks.provisionUserRecord(id),
}))
vi.mock('@/features/auth/components/setup-password-form', () => ({
  SetupPasswordForm: () => null,
}))

import SetupPasswordPage from '../page'
import { SetupPasswordForm } from '@/features/auth/components/setup-password-form'

/** Setting the password comes first: provisioning here is best effort, and the form always renders. */
describe('SetupPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provisions a signed-in invitee before the form', async () => {
    mocks.getAuthUserId.mockResolvedValue('user-1')
    mocks.provisionUserRecord.mockResolvedValue({ isSignedIn: true, record: null })
    const page: ReactElement = await SetupPasswordPage()
    expect(mocks.provisionUserRecord).toHaveBeenCalledWith('user-1')
    expect(page.type).toBe(SetupPasswordForm)
  })

  it('still renders the form when provisioning fails, and logs it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getAuthUserId.mockResolvedValue('user-1')
    mocks.provisionUserRecord.mockRejectedValue(new Error('no business name'))
    const page: ReactElement = await SetupPasswordPage()
    expect(page.type).toBe(SetupPasswordForm)
    expect(error).toHaveBeenCalledTimes(1)
    error.mockRestore()
  })

  it('does nothing without a session', async () => {
    mocks.getAuthUserId.mockResolvedValue(null)
    const page: ReactElement = await SetupPasswordPage()
    expect(mocks.provisionUserRecord).not.toHaveBeenCalled()
    expect(page.type).toBe(SetupPasswordForm)
  })
})
