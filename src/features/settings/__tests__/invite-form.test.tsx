import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InviteForm } from '../components/invite-form'

/**
 * Team invites: a defect here is a security defect, not a cosmetic one.
 *
 * What matters here is not the markup but the shape of what leaves the browser: the role
 * that gets sent, that a failed request does not read as success, and that an in-flight
 * submit cannot be fired twice. An invite sent twice is two join links for one seat; an
 * invite that silently fails is a colleague waiting for an email that never comes. The role
 * defaults to member because an admin default hands workspace settings to anyone invited in a
 * hurry. The in-flight guard is two: Button's own `disabled={disabled || loading}`
 * (src/components/ui/button.tsx:67), which holds only while the form passes `loading`, and the
 * form's submit returning at once while sending, since Enter in the address field is not disabled.
 */
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/components/ui/toast', () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}))

function mockFetch(response: { ok: boolean; body: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    json: async () => response.body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('InviteForm', () => {
  it('cannot be submitted with an empty email', () => {
    render(<InviteForm />)
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeDisabled()
  })

  it('rejects a malformed address before any request goes out', async () => {
    const fetchMock = mockFetch({ ok: true, body: { success: true, notice: null } })
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
  })

  it('clears the error as soon as the address is edited', async () => {
    mockFetch({ ok: true, body: { success: true, notice: null } })
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), 'nope')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Email'), '@agency.com')
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument()
  })

  it('sends the trimmed address and defaults the role to member', async () => {
    const fetchMock = mockFetch({ ok: true, body: { success: true, notice: null } })
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), '  colleague@agency.com  ')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'colleague@agency.com',
      role: 'member',
    })
  })

  it('sends admin when admin is chosen', async () => {
    const fetchMock = mockFetch({ ok: true, body: { success: true, notice: null } })
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), 'boss@agency.com')
    await user.click(screen.getByRole('button', { name: 'Role' }))
    await user.click(await screen.findByRole('option', { name: /Admin/ }))
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse(init.body as string).role).toBe('admin')
  })

  it('resets the form and refreshes on success', async () => {
    mockFetch({ ok: true, body: { success: true, notice: null } })
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), 'colleague@agency.com')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(toastError).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(refresh).toHaveBeenCalled()
  })

  it('says what was not finished instead of the success toast when the answer carries a notice', async () => {
    const notice =
      'The invite was sent, but the new role could not be saved. Send it again to change the role.'
    mockFetch({ ok: true, body: { success: true, notice } })
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), 'colleague@agency.com')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(notice))
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(refresh).toHaveBeenCalled()
  })

  it('surfaces the server error, does NOT report success, and keeps the address for a retry', async () => {
    mockFetch({ ok: false, body: { error: 'That person is already on the team' } })
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), 'colleague@agency.com')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('That person is already on the team')
    )
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Email')).toHaveValue('colleague@agency.com')
  })

  it('cannot double-send while a request is in flight', async () => {
    let release: (v: unknown) => void = () => {}
    const pending = new Promise((resolve) => {
      release = resolve
    })
    const fetchMock = vi
      .fn()
      .mockReturnValue(
        pending.then(() => ({ ok: true, json: async () => ({ success: true, notice: null }) }))
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<InviteForm />)
    await user.type(screen.getByLabelText('Email'), 'colleague@agency.com')

    const button = screen.getByRole('button', { name: 'Send invite' })
    await user.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    await user.click(button)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(null)
  })

  it('posts once when Enter is pressed twice while sending', async () => {
    let release: (v: unknown) => void = () => {}
    const pending = new Promise((resolve) => {
      release = resolve
    })
    const fetchMock = vi
      .fn()
      .mockReturnValue(
        pending.then(() => ({ ok: true, json: async () => ({ success: true, notice: null }) }))
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<InviteForm />)
    await user.type(screen.getByLabelText('Email'), 'colleague@agency.com')
    await user.keyboard('{Enter}{Enter}')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(null)
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1))
  })

  it('falls back to its own sentence when the failure carries none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new SyntaxError('Unexpected token <')
        },
      })
    )
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), 'colleague@agency.com')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to send invite'))
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('treats a sent invite whose answer is not the expected shape as sent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input')
        },
      })
    )
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), 'colleague@agency.com')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(toastError).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Email')).toHaveValue('')
  })
})
