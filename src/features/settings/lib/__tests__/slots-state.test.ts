import { describe, expect, it } from 'vitest'
import { entitlementFor } from '@/lib/billing/entitlement'
import { paidRow, trialRow } from '@/lib/billing/__tests__/fixtures'
import { slotsStateOf } from '../slots-state'

const NOW = new Date('2026-09-14T12:00:00Z')

describe('slotsStateOf', () => {
  it('sells Checkout the client count while no subscription is open', () => {
    const row = trialRow(NOW)
    expect(slotsStateOf(entitlementFor(row, NOW), row, 2, NOW)).toEqual({
      phase: 'checkout',
      clientCount: 2,
    })
  })

  it('gives a solo workspace its one business, buyable only while no plan is open', () => {
    const trial = trialRow(NOW, { mode: 'solo' })
    expect(slotsStateOf(entitlementFor(trial, NOW), trial, 1, NOW)).toEqual({
      phase: 'solo',
      checkout: true,
    })
    const paid = paidRow(NOW, { mode: 'solo' })
    expect(slotsStateOf(entitlementFor(paid, NOW), paid, 1, NOW)).toEqual({
      phase: 'solo',
      checkout: false,
    })
  })

  it('offers the ordered and paid slots of a running plan, with its period and zone', () => {
    const row = paidRow(NOW, { subscription_quantity: 4, client_slots: 3 })
    expect(slotsStateOf(entitlementFor(row, NOW), row, 2, NOW)).toEqual({
      phase: 'change',
      clientCount: 2,
      ordered: 3,
      paid: 4,
      period: { start: '2026-09-01T00:00:00Z', end: '2026-10-01T00:00:00Z' },
      timezone: 'Europe/Sofia',
    })
  })

  it('says why a running plan cannot change, and the renewal once its period has run out', () => {
    const ending = paidRow(NOW, { cancel_at_period_end: true })
    expect(slotsStateOf(entitlementFor(ending, NOW), ending, 1, NOW)).toMatchObject({
      phase: 'unavailable',
      sentence: 'Your plan ends on 1 October 2026. Keep your plan to change its client slots.',
    })
    const late = new Date('2026-10-01T00:05:00Z')
    const running = paidRow(late)
    expect(slotsStateOf(entitlementFor(running, late), running, 1, late)).toMatchObject({
      phase: 'unavailable',
      sentence:
        'Your plan is renewing, and its payment is taken within about an hour. Reload this page after that to change your client slots.',
    })
  })

  it('has nothing for the Internal plan', () => {
    const row = trialRow(NOW, { plan: 'house' })
    expect(slotsStateOf(entitlementFor(row, NOW), row, 7, NOW)).toBeNull()
  })
})
