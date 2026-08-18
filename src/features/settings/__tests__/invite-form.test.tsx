import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InviteForm } from '../components/invite-form'

/**
 * Team invites — one of the two places in `settings` where a defect is a security
 * defect, and the feature had no tests at all (TECH-DEBT §9).
 *
 * What matters here is not the markup but the shape of what leaves the browser: the role
 * that gets sent, that a failed request does not read as success, and that an in-flight
 * submit cannot be fired twice. An invite sent twice is two join links for one seat; an
 * invite that silently fails is a colleague waiting for an email that never comes.
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
    // Guarded by `disabled={!email}` — a submit with no address would 400 at the route
    // and surface as a toast, which is a worse way to learn the field is required.
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeDisabled()
  })

  it('rejects a malformed address before any request goes out', async () => {
    const fetchMock = mockFetch({ ok: true, body: { success: true } })
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
  })

  it('clears the error as soon as the address is edited', async () => {
    mockFetch({ ok: true, body: { success: true } })
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), 'nope')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Email'), '@agency.com')
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument()
  })

  it('sends the trimmed address and the default role', async () => {
    const fetchMock = mockFetch({ ok: true, body: { success: true } })
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), '  colleague@agency.com  ')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0]!
    // Default is `member`, deliberately — a form that defaulted to admin would hand out
    // workspace-settings access to anyone invited in a hurry.
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'colleague@agency.com',
      role: 'member',
    })
  })

  it('sends admin when admin is chosen', async () => {
    const fetchMock = mockFetch({ ok: true, body: { success: true } })
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
    mockFetch({ ok: true, body: { success: true } })
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), 'colleague@agency.com')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(screen.getByLabelText('Email')).toHaveValue('')
    // Without the refresh the new member does not appear in the list until a hard load,
    // and the obvious next move is to invite them again.
    expect(refresh).toHaveBeenCalled()
  })

  it('surfaces the server error and does NOT report success', async () => {
    mockFetch({ ok: false, body: { error: 'That person is already on the team' } })
    const user = userEvent.setup()
    render(<InviteForm />)

    await user.type(screen.getByLabelText('Email'), 'colleague@agency.com')
    await user.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('That person is already on the team')
    )
    expect(toastSuccess).not.toHaveBeenCalled()
    // The address stays, so a genuine retry does not mean retyping it.
    expect(screen.getByLabelText('Email')).toHaveValue('colleague@agency.com')
  })

  it('cannot double-send while a request is in flight', async () => {
    let release: (v: unknown) => void = () => {}
    const pending = new Promise((resolve) => {
      release = resolve
    })
    const fetchMock = vi
      .fn()
      .mockReturnValue(pending.then(() => ({ ok: true, json: async () => ({ success: true }) })))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<InviteForm />)
    await user.type(screen.getByLabelText('Email'), 'colleague@agency.com')

    const button = screen.getByRole('button', { name: 'Send invite' })
    await user.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    await user.click(button)

    // Two invites for one seat is the failure. `loading` disables through Button's
    // `disabled={disabled || loading}` — the same coupling ConfirmDialog relies on.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(null)
  })
})
