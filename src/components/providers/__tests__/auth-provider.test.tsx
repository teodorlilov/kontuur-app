import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SIGN_IN_PATH } from '@/utils/constants'
import { AuthProvider } from '../auth-provider'

/**
 * The listener is the one navigation after a sign-out, and the only client-side reaction to a
 * session ending. Pinned here so no button grows a second navigation beside it, and so the
 * destination stays the constant every other sender uses.
 */
type Listener = (event: string, session: object | null) => void
let listener: Listener | null = null
const unsubscribe = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      onAuthStateChange: (callback: Listener) => {
        listener = callback
        return { data: { subscription: { unsubscribe } } }
      },
    },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  listener = null
  // jsdom has no navigation; assigning href otherwise logs "Not implemented".
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { href: '' },
  })
})

describe('AuthProvider', () => {
  it('renders its children and subscribes once', () => {
    render(
      <AuthProvider>
        <p>inside</p>
      </AuthProvider>
    )
    expect(screen.getByText('inside')).toBeInTheDocument()
    expect(listener).not.toBeNull()
  })

  it('sends a signed-out browser to the sign-in dialog', () => {
    render(<AuthProvider>x</AuthProvider>)
    listener?.('SIGNED_OUT', null)
    expect(window.location.href).toBe(SIGN_IN_PATH)
  })

  it('leaves a live session where it is', () => {
    render(<AuthProvider>x</AuthProvider>)
    listener?.('INITIAL_SESSION', { access_token: 'token' })
    expect(window.location.href).toBe('')
  })

  it('drops the subscription on unmount', () => {
    const { unmount } = render(<AuthProvider>x</AuthProvider>)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
