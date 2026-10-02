import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardHeader } from '../components/dashboard-header'
import { CLIENTS_ADMINS_ONLY, OWED_IMAGES_UNKNOWN, addBrandGate } from '@/lib/billing/copy'
import type { PlanGate } from '@/lib/billing/copy'
import { entitlementFor } from '@/lib/billing/entitlement'
import { trialRow } from '@/lib/billing/__tests__/fixtures'
import { PLAN_AND_BILLING_PATH } from '@/utils/constants'

/**
 * The dashboard's "Add client": refused where it stands, with Plan & billing offered as the way
 * past only when the refusal is the plan's — never for a member, whose refusal no plan changes.
 *
 * PageHeader's rail reads the shell. Mocked rather than wrapped in a real ShellProvider, which
 * would pull in the notifications channel and a Supabase client for a rail this test never
 * asserts on.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/components/layout/shell-context', () => ({
  useShell: () => ({
    agencyName: 'Acme',
    todayLabel: '27 September 2026',
    userInitials: 'AC',
    openPalette: () => {},
    timezone: 'Europe/Sofia',
    clientName: () => 'Acme',
    notifications: {
      items: [],
      loading: false,
      unreadCount: 0,
      hasFeedback: false,
      refetch: () => {},
      markAllRead: () => {},
      markOneRead: () => {},
    },
    pendingCount: null,
  }),
}))

const NOW = new Date('2026-09-14T12:00:00Z')
const TRIAL = entitlementFor(trialRow(NOW), NOW)

function renderHeader(
  addClient: ReturnType<typeof addBrandGate>,
  generate: PlanGate = { refusal: null, wayOut: true }
) {
  render(
    <DashboardHeader
      agencyName="Acme"
      clientCount={3}
      isSolo={false}
      timezone="Europe/Sofia"
      pendingCount={0}
      oldestPendingAt={null}
      failedCount={0}
      generate={generate}
      addClient={addClient}
    />
  )
}

describe('DashboardHeader — Add client', () => {
  it('refuses a member with the sentence alone, and no way through Plan & billing', () => {
    renderHeader(addBrandGate(TRIAL, 0, 'member'))
    const button = screen.getByRole('button', { name: 'Add client' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(CLIENTS_ADMINS_ONLY)
    expect(screen.queryByRole('link', { name: 'Plan & billing' })).toBeNull()
  })

  it('sends an admin refused by the plan to Plan & billing', () => {
    renderHeader(addBrandGate(TRIAL, 3, 'admin'))
    const button = screen.getByRole('button', { name: 'Add client' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(
      /^Trial includes 3 clients\. Choose a plan to add more\./
    )
    expect(screen.getByRole('link', { name: 'Plan & billing' })).toHaveAttribute(
      'href',
      PLAN_AND_BILLING_PATH
    )
  })
})

describe('DashboardHeader — Generate posts', () => {
  it('refuses with the sentence alone when the owed pictures could not be read', () => {
    renderHeader(addBrandGate(TRIAL, 0, 'admin'), { refusal: OWED_IMAGES_UNKNOWN, wayOut: false })
    const button = screen.getByRole('button', { name: 'Generate posts' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(OWED_IMAGES_UNKNOWN)
    expect(screen.queryByRole('link', { name: 'Plan & billing' })).toBeNull()
  })
})
