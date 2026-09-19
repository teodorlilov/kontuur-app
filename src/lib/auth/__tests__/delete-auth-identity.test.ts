import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAuthIdentity } from '../delete-auth-identity'

/**
 * The shared identity delete never fails its caller: by the time it runs, the person's `users`
 * row is gone and access with it, so an orphaned identity is a log line, not a refusal.
 */
function adminAnswering(error: { message: string } | null) {
  const deleteUser = vi.fn(async () => ({ data: {}, error }))
  const admin = { auth: { admin: { deleteUser } } }
  return { admin: admin as never, deleteUser }
}

describe('deleteAuthIdentity', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined))

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
      '[workspace:delete] user row deleted but auth account remains for user-2:',
      'auth unreachable'
    )
  })
})
