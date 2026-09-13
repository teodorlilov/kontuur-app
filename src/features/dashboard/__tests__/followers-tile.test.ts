import { describe, expect, it } from 'vitest'
import { followersTile } from '../lib/followers-tile'

const IG = { network: 'instagram' as const, total: 1240, reach: 3410, engagements: null }

describe('followersTile', () => {
  it('states a real gain in green with its count and the reach beside it', () => {
    expect(followersTile({ ...IG, net: 120 })).toEqual({
      value: 1240,
      pill: { text: '▲ +120 · last 7 days', tone: 'positive' },
      footer: 'Reach 3,410 · last 7 days',
    })
  })

  it('states a real loss in clay', () => {
    expect(followersTile({ ...IG, net: -150 })?.pill).toEqual({
      text: '▼ −150 · last 7 days',
      tone: 'danger',
    })
  })

  it('keeps the number when the change is inside the noise band', () => {
    expect(followersTile({ ...IG, net: 3 })?.pill).toEqual({
      text: '+3 · last 7 days',
      tone: 'muted',
    })
  })

  it('renders no pill when there is nothing to compare against', () => {
    const tile = followersTile({ ...IG, net: null })
    expect(tile?.value).toBe(1240)
    expect(tile?.pill).toBeUndefined()
  })

  it('is null without a follower total', () => {
    expect(followersTile({ ...IG, total: null, net: 5 })).toBeNull()
  })

  it('speaks in engagements for a Facebook page and drops a missing fact', () => {
    expect(
      followersTile({ network: 'facebook', total: 800, net: 0, reach: null, engagements: 96 })
        ?.footer
    ).toBe('96 engagements · last 7 days')
    const flat = followersTile({ ...IG, net: 0, reach: null })
    expect(flat?.footer).toBe('last 7 days')
    expect(flat?.pill).toEqual({ text: 'No change · last 7 days', tone: 'muted' })
  })
})
