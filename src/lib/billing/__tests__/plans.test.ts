import { describe, expect, it } from 'vitest'
import {
  MAX_CLIENT_SLOTS,
  PRO_PLAN,
  billableQuantity,
  chargesToday,
  monthlyCents,
  proRataCents,
  slotChange,
} from '../plans'

const PERIOD = {
  start: new Date('2026-09-29T00:00:00Z'),
  end: new Date('2026-10-29T00:00:00Z'),
}

describe('slotChange', () => {
  it('is nothing when the count does not move', () => {
    expect(slotChange(3, 3, 3)).toEqual({ kind: 'same', charged: 0 })
  })

  it('charges every slot above both the ordered and the paid count', () => {
    expect(slotChange(3, 4, 3)).toEqual({ kind: 'raise', charged: 1 })
    expect(slotChange(3, 6, 3)).toEqual({ kind: 'raise', charged: 3 })
  })

  it('restores up to the paid count for nothing', () => {
    expect(slotChange(2, 3, 3)).toEqual({ kind: 'restore', charged: 0 })
    expect(slotChange(1, 3, 3)).toEqual({ kind: 'restore', charged: 0 })
  })

  it('charges only the part of a raise above the paid count', () => {
    expect(slotChange(2, 5, 3)).toEqual({ kind: 'raise', charged: 2 })
  })

  it('never charges above an ordered count higher than the paid one twice', () => {
    expect(slotChange(4, 5, 3)).toEqual({ kind: 'raise', charged: 1 })
  })

  it('lowers without a charge or a credit', () => {
    expect(slotChange(3, 2, 3)).toEqual({ kind: 'lower', charged: 0 })
    expect(slotChange(5, 1, 5)).toEqual({ kind: 'lower', charged: 0 })
  })
})

describe('proRataCents', () => {
  it('prices the slots over the share of the period that is left', () => {
    const now = new Date('2026-09-30T12:00:00Z')
    expect(proRataCents(1, PERIOD, now)).toBe(Math.round(PRO_PLAN.priceCents * 0.95))
    expect(proRataCents(2, PERIOD, now)).toBe(Math.round(PRO_PLAN.priceCents * 2 * 0.95))
  })

  it('is the whole month at the start of a period and nothing at its end', () => {
    expect(proRataCents(1, PERIOD, PERIOD.start)).toBe(PRO_PLAN.priceCents)
    expect(proRataCents(1, PERIOD, PERIOD.end)).toBe(0)
    expect(proRataCents(1, PERIOD, new Date('2026-11-01T00:00:00Z'))).toBe(0)
  })

  it('is nothing for an empty period', () => {
    expect(proRataCents(1, { start: PERIOD.end, end: PERIOD.end }, PERIOD.start)).toBe(0)
  })
})

describe('chargesToday', () => {
  const at = (share: number) =>
    new Date(PERIOD.end.getTime() - share * (PERIOD.end.getTime() - PERIOD.start.getTime()))

  it('charges a raise at once when it clears the minimum with room for Stripe’s rounding', () => {
    expect(chargesToday(1, PERIOD, at(0.5))).toBe(true)
    expect(chargesToday(1, PERIOD, at(52 / 2900))).toBe(true)
  })

  it('leaves a raise at or just above the minimum on the renewal invoice', () => {
    expect(chargesToday(1, PERIOD, at(50 / 2900))).toBe(false)
    expect(chargesToday(1, PERIOD, at(51.5 / 2900))).toBe(false)
    expect(chargesToday(1, PERIOD, PERIOD.end)).toBe(false)
  })
})

describe('monthlyCents and billableQuantity', () => {
  it('prices a month of slots at the plan price', () => {
    expect(monthlyCents(3)).toBe(PRO_PLAN.priceCents * 3)
  })

  it('never lets a workspace pay for fewer slots than it has clients, or fewer than one', () => {
    expect(billableQuantity(0)).toBe(1)
    expect(billableQuantity(4)).toBe(4)
  })

  it('caps a purchase at fifty slots', () => {
    expect(MAX_CLIENT_SLOTS).toBe(50)
  })
})
