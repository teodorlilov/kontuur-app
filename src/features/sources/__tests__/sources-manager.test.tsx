import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SourcesManager } from '../components/sources-manager'

/**
 * The sources page's header and empty states in its two voices.
 *
 * Agency pins the three-crumb trail through the roster and the client-worded empty states;
 * solo pins the trail that starts at "My business" and copy that speaks to the owner. The
 * back link is the same in both: sources is a detail of the settings page either way.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
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

vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/features/sources/actions/source-actions', () => ({
  createSource: vi.fn(),
  uploadSource: vi.fn(),
  updateSource: vi.fn(),
  deleteSource: vi.fn(),
  setWebResearch: vi.fn(),
}))

function setup(isSolo: boolean) {
  render(
    <SourcesManager
      clientId="c1"
      isSolo={isSolo}
      clientName="Haelan"
      niche="Branding"
      initialSources={[]}
      pillars={[]}
      usageStats={[]}
      postsPerWeek={3}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SourcesManager — agency', () => {
  it('sits under the roster and the client', () => {
    setup(false)

    expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute('href', '/clients')
    expect(screen.getByRole('link', { name: 'Haelan' })).toHaveAttribute('href', '/clients/c1/edit')
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/clients/c1/edit')
    expect(screen.getByText(/Add your client's website URL/)).toBeInTheDocument()
    expect(screen.getByText(/text files with client info/)).toBeInTheDocument()
    expect(screen.getByText(/Sized to this client’s weekly pace/)).toBeInTheDocument()
  })
})

describe('SourcesManager — solo', () => {
  it('sits under My business and speaks to the owner', () => {
    setup(true)

    expect(screen.queryByRole('link', { name: 'Clients' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My business' })).toHaveAttribute(
      'href',
      '/clients/c1/edit'
    )
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/clients/c1/edit')
    expect(screen.getByText(/Add your website URL/)).toBeInTheDocument()
    expect(screen.getByText(/text files with business info/)).toBeInTheDocument()
    expect(screen.getByText(/Sized to your weekly pace/)).toBeInTheDocument()
  })
})
