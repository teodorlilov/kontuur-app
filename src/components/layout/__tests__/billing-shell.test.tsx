import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const nav = vi.hoisted(() => ({ pathname: '/calendar' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

import { pausedNotice } from '@/lib/billing/copy'
import { entitlementFor } from '@/lib/billing/entitlement'
import { trialRow } from '@/lib/billing/__tests__/fixtures'
import { BillingBanner } from '../billing-banner'
import { BillingWall } from '../billing-wall'

const PAUSED = { text: 'Your workspace is paused. Choose a plan.', cta: 'Choose a plan' }
const CARD_FAILED = {
  text: 'Your workspace is paused because your last payment failed. Update your card in Plan & billing to continue.',
  cta: 'Update your card',
}

describe('BillingBanner', () => {
  it('is a status line with the sentence and one way to the plan page', () => {
    render(<BillingBanner tone="warn" text="Your trial ends on 27 September — choose a plan." />)

    expect(screen.getByRole('status')).toHaveTextContent('Your trial ends on 27 September')
    expect(screen.getByRole('link', { name: 'Plan & billing' })).toHaveAttribute(
      'href',
      '/settings?tab=account'
    )
  })
})

describe('BillingWall', () => {
  it('renders the page untouched while the workspace is not paused', () => {
    render(
      <BillingWall paused={null}>
        <p>the calendar</p>
      </BillingWall>
    )
    expect(screen.getByText('the calendar')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Workspace paused' })).not.toBeInTheDocument()
  })

  it('replaces the page with one card, its reason and one action when paused', () => {
    render(
      <BillingWall paused={PAUSED}>
        <p>the calendar</p>
      </BillingWall>
    )
    expect(screen.getByRole('heading', { name: 'Workspace paused' })).toBeInTheDocument()
    expect(screen.getByText(PAUSED.text)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose a plan' })).toHaveAttribute(
      'href',
      '/settings?tab=account'
    )
    expect(screen.queryByText('the calendar')).not.toBeInTheDocument()
  })

  it('asks for the card when the pause is a failed payment — the plan is still open, so a new one would be refused', () => {
    render(
      <BillingWall paused={CARD_FAILED}>
        <p>the calendar</p>
      </BillingWall>
    )
    expect(screen.getByText(CARD_FAILED.text)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Update your card' })).toHaveAttribute(
      'href',
      '/settings?tab=account'
    )
    expect(screen.queryByRole('link', { name: 'Choose a plan' })).not.toBeInTheDocument()
  })

  it('keeps the pages of a workspace in its trial’s grace — it cannot spend, but its posts still go out', () => {
    const now = new Date('2026-09-14T12:00:00Z')
    const grace = entitlementFor(
      trialRow(now, { trial_ends_at: new Date(now.getTime() - 2 * 86_400_000).toISOString() }),
      now
    )
    render(
      <BillingWall paused={pausedNotice(grace)}>
        <p>the calendar</p>
      </BillingWall>
    )
    expect(screen.getByText('the calendar')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Workspace paused' })).not.toBeInTheDocument()
  })

  it('lets a paused workspace through to Settings, where the plan is chosen', () => {
    nav.pathname = '/settings'
    render(
      <BillingWall paused={PAUSED}>
        <p>plan and billing</p>
      </BillingWall>
    )
    expect(screen.getByText('plan and billing')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Workspace paused' })).not.toBeInTheDocument()
  })
})
