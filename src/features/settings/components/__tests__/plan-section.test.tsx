import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlanSection } from '../plan-section'
import { noEntitlement, type Entitlement } from '@/lib/billing/entitlement'
import { UNMETERED } from '@/lib/billing/plans'

const USAGE = { draft: 12, image: 40, rewrite: 3 }

function entitlement(overrides: Partial<Entitlement>): Entitlement {
  return {
    ...noEntitlement(),
    timezone: 'Europe/Sofia',
    canSpend: true,
    canPublish: true,
    canCreate: true,
    brands: 3,
    limits: { draft: 60, image: 150, rewrite: 45 },
    ...overrides,
  }
}

describe('PlanSection', () => {
  it('a trial shows when it ends, and its meters against the trial allowance', () => {
    render(
      <PlanSection
        entitlement={entitlement({
          state: 'trial',
          trialEndsAt: new Date('2026-09-27T22:30:00Z'),
        })}
        usage={USAGE}
        brandCount={2}
      />
    )
    expect(screen.getByText('Trial ends')).toBeInTheDocument()
    expect(screen.getByText('28 September 2026')).toBeInTheDocument()
    expect(screen.getByText('Clients')).toBeInTheDocument()
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    expect(screen.getByText('12 of 60')).toBeInTheDocument()
  })

  it('a failed renewal says by when the card must be updated', () => {
    render(
      <PlanSection
        entitlement={entitlement({
          state: 'past_due',
          plan: 'agency',
          graceEndsAt: new Date('2026-10-08T00:00:00Z'),
          resetsOn: new Date('2026-11-01T00:00:00Z'),
        })}
        usage={USAGE}
        brandCount={3}
      />
    )
    expect(screen.getByText('Payment failed')).toBeInTheDocument()
    expect(screen.getByText('Update your card by')).toBeInTheDocument()
    expect(screen.getByText('8 October 2026')).toBeInTheDocument()
    expect(screen.queryByText('Renews on')).not.toBeInTheDocument()
  })

  it('an active plan renews on the period end', () => {
    render(
      <PlanSection
        entitlement={entitlement({
          state: 'active',
          plan: 'starter',
          resetsOn: new Date('2026-10-01T00:00:00Z'),
        })}
        usage={USAGE}
        brandCount={1}
      />
    )
    expect(screen.getByText('Renews on')).toBeInTheDocument()
    expect(screen.getByText('1 October 2026')).toBeInTheDocument()
  })

  it('a paused workspace has no next date, and a solo one counts a business', () => {
    render(
      <PlanSection
        entitlement={entitlement({ state: 'locked', mode: 'solo', canSpend: false })}
        usage={USAGE}
        brandCount={1}
      />
    )
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.getByText('Business')).toBeInTheDocument()
    expect(screen.queryByText('Trial ends')).not.toBeInTheDocument()
    expect(screen.queryByText('Renews on')).not.toBeInTheDocument()
  })

  it('a house workspace shows plain counts with no ceiling', () => {
    render(
      <PlanSection
        entitlement={entitlement({
          state: 'active',
          plan: 'house',
          brandsUnlimited: true,
          limits: { draft: UNMETERED, image: UNMETERED, rewrite: UNMETERED },
        })}
        usage={USAGE}
        brandCount={7}
      />
    )
    expect(screen.getByText('Internal')).toBeInTheDocument()
    expect(screen.getByText('7 clients')).toBeInTheDocument()
    expect(screen.getByText('12 AI drafts')).toBeInTheDocument()
    expect(screen.queryByText(/^\d+ of \d+$/)).not.toBeInTheDocument()
  })
})
