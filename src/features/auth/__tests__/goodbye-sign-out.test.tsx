import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const signOut = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ auth: { signOut } }),
}))

import { GoodbyeSignOut } from '../components/goodbye-sign-out'

describe('GoodbyeSignOut', () => {
  it('ends the session once on arrival and renders nothing', () => {
    const { container } = render(<GoodbyeSignOut />)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
  })
})
