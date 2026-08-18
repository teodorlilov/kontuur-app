import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteClientDialog } from '../components/settings/delete-client-dialog'

/**
 * The most destructive action in the product: ~18 tables and two storage buckets, no undo.
 *
 * Everything asserted here is a way that action could fire when it should not, or report
 * success when it did not. The typed-name gate is the whole safety mechanism — if it stops
 * being wired to the confirm button, nothing visible changes and the dialog quietly becomes a
 * one-click delete. A failed action that still navigates away is the other direction: the
 * client is still there and the user has been told it is gone.
 */
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/components/ui/toast', () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}))

const deleteClient = vi.fn()
// Wrapped rather than passed by reference: vi.mock is hoisted above the const, so the factory
// has to reach the binding lazily — the same shape the toast mock above relies on.
vi.mock('@/features/clients/actions/client-actions', () => ({
  deleteClient: (clientId: string) => deleteClient(clientId),
}))

const COUNTS = {
  publishedCount: 12,
  pendingCount: 3,
  scheduledCount: 0,
  sourceCount: 5,
  connectionCount: 1,
  ideaCount: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  deleteClient.mockResolvedValue({ ok: true })
})

function setup(props: Partial<Parameters<typeof DeleteClientDialog>[0]> = {}) {
  const onClose = vi.fn()
  render(
    <DeleteClientDialog
      open
      onClose={onClose}
      clientId="client-1"
      clientName="Acme Dental"
      counts={COUNTS}
      {...props}
    />
  )
  return { onClose, user: userEvent.setup() }
}

/** Types the exact stored name into the confirm field. */
async function typeName(user: ReturnType<typeof userEvent.setup>, name = 'Acme Dental') {
  await user.type(screen.getByRole('textbox'), name)
}

describe('DeleteClientDialog', () => {
  it('names what is lost, counting only what exists', () => {
    setup()
    expect(screen.getByText('12 published posts')).toBeInTheDocument()
    expect(screen.getByText('3 posts awaiting review')).toBeInTheDocument()
    expect(screen.getByText('5 sources')).toBeInTheDocument()
    // scheduledCount and ideaCount are 0 — listing them would pad the list with non-losses.
    expect(screen.queryByText(/scheduled post/)).not.toBeInTheDocument()
    expect(screen.queryByText(/client idea/)).not.toBeInTheDocument()
  })

  it('will not delete until the name is typed', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(deleteClient).not.toHaveBeenCalled()

    await user.type(screen.getByRole('textbox'), 'Acme')
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    // A prefix is not the name. This is the assertion that keeps the gate a gate.
    expect(deleteClient).not.toHaveBeenCalled()
  })

  it('accepts the name regardless of case or surrounding space', async () => {
    const { user } = setup()
    // The gate exists to make the reader look at which client this is, not to test typing.
    await typeName(user, '  acme dental ')
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(deleteClient).toHaveBeenCalledWith('client-1'))
  })

  it('deletes, reports it, and leaves for the roster', async () => {
    const { user } = setup()
    await typeName(user)
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))

    await waitFor(() => expect(deleteClient).toHaveBeenCalledWith('client-1'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Acme Dental deleted'))
    expect(push).toHaveBeenCalledWith('/clients')
    expect(toastError).not.toHaveBeenCalled()
  })

  it('surfaces a refusal without claiming success or navigating away', async () => {
    deleteClient.mockResolvedValue({ ok: false, error: 'Not found' })
    const { user } = setup()
    await typeName(user)
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Not found'))
    expect(toastSuccess).not.toHaveBeenCalled()
    // Navigating on failure would tell the user the client is gone while it is still there.
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('recovers when the action throws rather than returning', async () => {
    deleteClient.mockRejectedValue(new Error('network'))
    const { user } = setup()
    await typeName(user)
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))

    // Without the catch the spinner never clears and the dialog is stuck busy forever.
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(push).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete permanently' })).not.toBeDisabled()
    )
  })

  it('cannot be double-submitted while the delete is in flight', async () => {
    let release: (value: { ok: true }) => void = () => {}
    deleteClient.mockReturnValue(new Promise<{ ok: true }>((resolve) => (release = resolve)))
    const { user } = setup()
    await typeName(user)

    const confirm = screen.getByRole('button', { name: 'Delete permanently' })
    await user.click(confirm)
    await waitFor(() => expect(confirm).toBeDisabled())
    await user.click(confirm)

    expect(deleteClient).toHaveBeenCalledTimes(1)
    release({ ok: true })
  })
})
