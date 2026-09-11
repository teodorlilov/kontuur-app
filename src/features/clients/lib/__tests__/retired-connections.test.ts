import { describe, expect, it } from 'vitest'
import { buildRetiredConnectionCards } from '../retired-connections'
import type { RosterClientRow } from '../roster'
import type { UpcomingPost } from '@/lib/queries/cache'

const RETIRED_AT = '2026-09-10T03:30:00Z'

function client(over: Partial<RosterClientRow> = {}): RosterClientRow {
  return {
    id: 'c1',
    name: 'About Social Media',
    niche: null,
    social_connections: [
      {
        platform: 'instagram',
        account_name: '@about.social.media',
        token_expires_at: '2026-11-07T06:16:45Z',
        retired_at: RETIRED_AT,
      },
    ],
    ...over,
  }
}

function upcoming(clientId: string, scheduledAt: string, platforms: string[]): UpcomingPost {
  return {
    id: `post-${scheduledAt}`,
    client_id: clientId,
    scheduled_at: scheduledAt,
    pendingPlatforms: platforms,
  }
}

describe('buildRetiredConnectionCards', () => {
  it('builds one card per retired connection, with the copy already formatted for the zone', () => {
    const cards = buildRetiredConnectionCards(
      [client()],
      [
        upcoming('c1', '2026-09-13T07:00:00Z', ['instagram', 'facebook']),
        upcoming('c1', '2026-09-15T07:00:00Z', ['instagram']),
      ],
      'Europe/Sofia'
    )

    expect(cards).toEqual([
      {
        clientId: 'c1',
        clientName: 'About Social Media',
        platform: 'instagram',
        networkLabel: 'Instagram',
        accountName: 'about.social.media',
        retiredAt: RETIRED_AT,
        retiredOnLabel: 'Thursday 10 September',
        scheduledCount: 2,
        nextSlotLabel: 'Sunday 13 September, 10:00',
        reconnectHref: '/api/meta/connect?platform=instagram&client_id=c1',
      },
    ])
  })

  it('counts only the posts still going out on the dead network, in slot order', () => {
    const cards = buildRetiredConnectionCards(
      [client()],
      [
        upcoming('c1', '2026-09-12T07:00:00Z', ['facebook']),
        upcoming('c1', '2026-09-14T07:00:00Z', ['instagram']),
        upcoming('c2', '2026-09-13T07:00:00Z', ['instagram']),
      ],
      'UTC'
    )

    expect(cards[0]?.scheduledCount).toBe(1)
    expect(cards[0]?.nextSlotLabel).toBe('Monday 14 September, 07:00')
  })

  it('has no slot when nothing is queued, and skips live connections and unknown platforms', () => {
    const cards = buildRetiredConnectionCards(
      [
        client({
          social_connections: [
            {
              platform: 'instagram',
              account_name: 'live',
              token_expires_at: null,
              retired_at: null,
            },
            {
              platform: 'facebook',
              account_name: 'Page',
              token_expires_at: null,
              retired_at: RETIRED_AT,
            },
            {
              platform: 'canva',
              account_name: 'x',
              token_expires_at: null,
              retired_at: RETIRED_AT,
            },
          ],
        }),
      ],
      [],
      'UTC'
    )

    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      platform: 'facebook',
      networkLabel: 'Facebook',
      scheduledCount: 0,
      nextSlotLabel: null,
    })
  })
})
