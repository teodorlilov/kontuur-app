import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as Dialog from '@radix-ui/react-dialog'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SignInView } from '../components/sign-in-view'

/**
 * Sign-in — the other half of "a bug here is a security bug", and `features/auth` had no
 * tests at all (TECH-DEBT §9).
 *
 * What is worth pinning is not the layout but the failure paths, because those are where
 * an auth form does damage quietly: a rejected credential that leaves the button spinning
 * looks like a slow network and invites a retry; a client-side validation gap sends a
 * blank password to the provider and turns a typo into a rate-limit strike.
 *
 * The Supabase browser client is mocked at the module boundary. Everything above it —
 * validation, error routing, the submitting flag — is the component's own.
 */
const signInWithPassword = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ auth: { signInWithPassword } }),
}))

const openDialog = vi.fn()
vi.mock('../components/auth-dialog-provider', () => ({
  useAuthDialog: () => ({ open: openDialog, close: vi.fn() }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  signInWithPassword.mockResolvedValue({ error: null })
  // jsdom has no navigation; assigning href otherwise logs "Not implemented".
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { href: '' },
  })
})

/**
 * `AuthPanel asDialog` renders Radix `Dialog.Title`/`Dialog.Description`, which read
 * dialog context and throw outside a `Dialog.Root` — the panel's own comment says so.
 * The real mount is `auth-dialog.tsx`; this is the smallest wrapper that satisfies it
 * without pulling in the whole dialog shell.
 */
function renderSignIn(props: { initialError?: string } = {}) {
  return render(
    <Dialog.Root open>
      <Dialog.Content>
        <SignInView {...props} />
      </Dialog.Content>
    </Dialog.Root>
  )
}

const emailField = () => screen.getByLabelText('Email')
const passwordField = () => screen.getByLabelText('Password')
const submit = () => screen.getByRole('button', { name: 'Sign in' })

describe('SignInView', () => {
  it('does not call the provider with a malformed address', async () => {
    const user = userEvent.setup()
    renderSignIn()

    await user.type(emailField(), 'not-an-email')
    await user.type(passwordField(), 'hunter2')
    await user.click(submit())

    // Stopped BEFORE handleSubmit runs: the field is `type="email"` inside a real
    // <form>, so native constraint validation fails and the browser blocks the submit
    // event entirely. The app's own "Enter a valid email" is unreachable on this path
    // and the visitor sees the browser's bubble instead.
    //
    // Contrast `invite-form`, whose button is an onClick rather than a form submit —
    // there no constraint validation runs and the app's message is the only one.
    expect((emailField() as HTMLInputElement).checkValidity()).toBe(false)
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('requires a password before reaching the provider', async () => {
    const user = userEvent.setup()
    renderSignIn()

    await user.type(emailField(), 'someone@agency.com')
    await user.click(submit())

    // A blank password sent upstream is a wasted round trip that counts against the
    // address's rate limit — the visitor's own typo, charged to their account.
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(await screen.findByText('Password is required')).toBeInTheDocument()
  })

  it('reports both field errors at once when the form is empty', async () => {
    const user = userEvent.setup()
    renderSignIn()

    // An EMPTY type="email" is natively valid (it is not `required`), so the submit
    // event does fire and the app's own validation is what answers.
    await user.click(submit())

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('signs in with exactly what was typed', async () => {
    const user = userEvent.setup()
    renderSignIn()

    await user.type(emailField(), 'someone@agency.com')
    await user.type(passwordField(), 'hunter2')
    await user.click(submit())

    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'someone@agency.com',
        password: 'hunter2',
      })
    )
  })

  it('sends the visitor to the dashboard on success', async () => {
    const user = userEvent.setup()
    renderSignIn()

    await user.type(emailField(), 'someone@agency.com')
    await user.type(passwordField(), 'hunter2')
    await user.click(submit())

    // A full load, not a router push: the session cookie was just set and every server
    // component on the far side has to render against it.
    await waitFor(() => expect(window.location.href).toBe('/dashboard'))
  })

  it('surfaces a rejected credential and re-enables the form', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const user = userEvent.setup()
    renderSignIn()

    await user.type(emailField(), 'someone@agency.com')
    await user.type(passwordField(), 'wrong')
    await user.click(submit())

    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument()
    // `rejectWith` clears `submitting`. Left set, the button stays disabled and a failed
    // sign-in reads as a hung page rather than a wrong password.
    await waitFor(() => expect(submit()).toBeEnabled())
    expect(window.location.href).toBe('')
  })

  it('shows a message carried in from the auth callback', () => {
    // How an expired confirmation link reaches the dialog it redirected into.
    renderSignIn({ initialError: 'That confirmation link has expired' })
    expect(screen.getByText('That confirmation link has expired')).toBeInTheDocument()
  })

  it('offers the reset and signup routes out', async () => {
    const user = userEvent.setup()
    renderSignIn()

    await user.click(screen.getByRole('button', { name: /forgot your password/i }))
    expect(openDialog).toHaveBeenCalledWith('reset')

    await user.click(screen.getByRole('button', { name: /sign up/i }))
    expect(openDialog).toHaveBeenCalledWith('signup')
  })
})
