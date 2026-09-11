import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/features/clients/actions/connection-actions', () => ({
  disconnectConnection: vi.fn(),
  connectFacebookPage: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/clients/c1/edit',
  useSearchParams: () => new URLSearchParams('tab=accounts'),
}))

import { ConnectedAccountsTab } from '../connected-accounts-tab'
import type { MetaConnection } from '@/types/api'

function connection(over: Partial<MetaConnection> = {}): MetaConnection {
  return {
    id: 'conn-1',
    platform: 'instagram',
    account_id: 'acct',
    account_name: 'about.social.media',
    token_expires_at: '2026-11-07T06:16:45Z',
    retired_at: null,
    created_at: '2026-09-08T06:16:45Z',
    ...over,
  }
}

describe('ConnectedAccountsTab', () => {
  it('says the network disconnected a retired account and offers Reconnect, not Disconnect', () => {
    render(
      <ConnectedAccountsTab
        clientId="c1"
        connections={[connection({ retired_at: '2026-09-11T03:30:00Z' })]}
        facebookPages={null}
      />
    )

    expect(screen.getByText('Disconnected by Instagram')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reconnect' })).toHaveAttribute(
      'href',
      '/api/meta/connect?platform=instagram&client_id=c1'
    )
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument()
  })

  it('still reads a live account as connected, with Disconnect', () => {
    render(<ConnectedAccountsTab clientId="c1" connections={[connection()]} facebookPages={null} />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
  })
})
