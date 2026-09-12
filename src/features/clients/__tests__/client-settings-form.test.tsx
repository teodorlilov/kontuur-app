import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ClientRow } from '@/types'
import { ClientSettingsForm } from '../components/settings/client-settings-form'

/**
 * The client settings form in its two voices.
 *
 * Agency cases pin today's surface word for word — the roster crumb and back link, the tab
 * rail, "Who this client is", the delete rail, the toasts — so the solo variant cannot move any
 * of it. Solo cases pin what makes the form a business page: no way back to a roster that does
 * not exist for it, no delete, no idea link, and copy that speaks to the owner.
 */
const searchParams = vi.hoisted(() => ({ current: new URLSearchParams() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/clients/c1/edit',
  useSearchParams: () => searchParams.current,
}))

vi.mock('@/components/layout/shell-context', () => ({
  useShell: () => ({
    timezone: 'Europe/Sofia',
    agencyName: 'Acme',
    clientName: () => 'Acme',
    notifications: { items: [], unreadCount: 0 },
    pendingCount: null,
    setPendingCount: vi.fn(),
    openPalette: vi.fn(),
  }),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/components/ui/toast', () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}))

const updateClient = vi.fn()
vi.mock('@/features/clients/actions/client-actions', () => ({
  updateClient: (id: string, input: unknown) => updateClient(id, input),
  deleteClient: vi.fn(),
}))
vi.mock('@/features/clients/actions/connection-actions', () => ({
  chooseFacebookPage: vi.fn(),
  disconnectPlatform: vi.fn(),
  listFacebookPages: vi.fn(),
}))
vi.mock('@/features/clients/actions/style-memo-actions', () => ({
  refreshStyleMemo: vi.fn(),
  clearStyleMemo: vi.fn(),
}))
vi.mock('@/features/ideas/actions/token-actions', () => ({
  createIdeaToken: vi.fn(),
  revokeIdeaToken: vi.fn(),
}))

const CLIENT: Omit<ClientRow, 'agency_id'> = {
  id: 'c1',
  name: 'Acme',
  niche: 'Branding',
  posts_per_week: 3,
  language: 'English',
  created_at: '2026-09-01T00:00:00Z',
  website_url: null,
  contact_email: null,
}

function setup(isSolo: boolean) {
  render(
    <ClientSettingsForm
      clientId="c1"
      isSolo={isSolo}
      sourceCount={0}
      unrestrictedSourceCount={0}
      restrictedSourcePillarIds={[]}
      styleMemo={null}
      client={CLIENT}
      profile={null}
      schedule={null}
      insights={null}
      publishedCount={0}
      pendingCount={0}
      scheduledCount={0}
      approvedUnpublishedCount={0}
      lastGeneratedAt={null}
      visualIdentity={null}
      connections={[]}
      facebookPages={null}
      ideaToken={null}
      ideaNewCount={0}
      ideaUsedCount={0}
      ideaTotalCount={0}
      recentIdeas={[]}
    />
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  searchParams.current = new URLSearchParams()
  updateClient.mockResolvedValue({ ok: true })
})

describe('ClientSettingsForm — agency', () => {
  it('sits under the roster and speaks about a client', () => {
    setup(false)

    expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute('href', '/clients')
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/clients')
    const rail = screen.getByRole('navigation', { name: 'Client settings' })
    expect(within(rail).getByRole('button', { name: 'Idea link' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Who this client is' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Client name/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete client' })).toBeInTheDocument()
    expect(screen.getByText('Client status')).toBeInTheDocument()
  })

  it('saves a client', async () => {
    const user = setup(false)

    await user.clear(screen.getByRole('textbox', { name: /Client name/ }))
    await user.click(screen.getByRole('button', { name: /Save/ }))
    expect(toastError).toHaveBeenCalledWith('Client name is required')

    await user.type(screen.getByRole('textbox', { name: /Client name/ }), 'Acme Studio')
    await user.click(screen.getByRole('button', { name: /Save/ }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Client updated'))
    expect(updateClient).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ name: 'Acme Studio' })
    )
  })
})

describe('ClientSettingsForm — solo', () => {
  it('is the business page: no roster, no delete, no idea link', () => {
    setup(true)

    expect(screen.queryByRole('link', { name: 'Clients' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument()
    expect(screen.getByText('My business')).toBeInTheDocument()
    const rail = screen.getByRole('navigation', { name: 'Business settings' })
    expect(within(rail).queryByRole('button', { name: 'Idea link' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Who you are' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Business name/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete client' })).not.toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('refuses a deep link to the hidden idea-link tab', () => {
    searchParams.current = new URLSearchParams('tab=ideas')
    setup(true)

    const rail = screen.getByRole('navigation', { name: 'Business settings' })
    expect(
      within(rail).getByRole('button', { name: 'Basic info', pressed: true })
    ).toBeInTheDocument()
  })

  it('saves a profile', async () => {
    const user = setup(true)

    await user.clear(screen.getByRole('textbox', { name: /Business name/ }))
    await user.click(screen.getByRole('button', { name: /Save/ }))
    expect(toastError).toHaveBeenCalledWith('Business name is required')

    await user.type(screen.getByRole('textbox', { name: /Business name/ }), 'Acme Studio')
    await user.click(screen.getByRole('button', { name: /Save/ }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Profile updated'))
  })
})
