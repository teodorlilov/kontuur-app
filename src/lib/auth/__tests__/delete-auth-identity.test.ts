import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAuthIdentity } from '../delete-auth-identity'

/** An auth admin error as auth-js hands it back: GoTrue's message, HTTP status and error code. */
type AuthAdminError = { message: string; status?: number; code?: string }

/**
 * The shared identity delete never throws: a surviving identity is a log line under the caller's
 * context and a `false`, and each caller decides what that means. WHY as: only
 * `auth.admin.deleteUser` exists on the stand-in client.
 */
function adminAnswering(error: AuthAdminError | null) {
  const deleteUser = vi.fn(async () => ({ data: {}, error }))
  const admin = { auth: { admin: { deleteUser } } }
  return { admin: admin as never, deleteUser }
}

describe('deleteAuthIdentity', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('deletes the auth user and reports it gone', async () => {
    const { admin, deleteUser } = adminAnswering(null)
    expect(await deleteAuthIdentity(admin, 'user-1', 'team:remove')).toBe(true)
    expect(deleteUser).toHaveBeenCalledWith('user-1')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('logs a survivor under the caller’s context and returns false rather than throwing', async () => {
    const { admin } = adminAnswering({ message: 'auth unreachable' })
    expect(await deleteAuthIdentity(admin, 'user-2', 'workspace:delete')).toBe(false)
    expect(console.error).toHaveBeenCalledWith(
      '[workspace:delete] could not delete the auth account user-2:',
      'auth unreachable'
    )
  })

  it('counts a login already gone — GoTrue’s 404 user_not_found — as deleted, logging nothing', async () => {
    const { admin } = adminAnswering({
      message: 'User not found',
      status: 404,
      code: 'user_not_found',
    })
    expect(await deleteAuthIdentity(admin, 'user-3', 'team:invite')).toBe(true)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('reads the code, not the status: another 404 is still a failure', async () => {
    const { admin } = adminAnswering({
      message: 'user_id must be an UUID',
      status: 404,
      code: 'validation_failed',
    })
    expect(await deleteAuthIdentity(admin, 'user-4', 'team:invite')).toBe(false)
    expect(console.error).toHaveBeenCalledOnce()
  })
})
