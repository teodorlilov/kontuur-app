import { isConnectionRetired } from '@/lib/meta/token-expiry'
import type { UpcomingPost } from '@/lib/queries/cache'
import { PLATFORM_NAMES, toPublishingPlatform, type PostPlatform } from '@/lib/validation'
import { formatLongDate, formatLongSlot } from '@/utils/date-helpers'
import type { RosterClientRow } from './roster'

/** Everything the reconnect prompt renders for one dead connection, preformatted server-side. */
export interface RetiredConnectionCard {
  clientId: string
  clientName: string
  platform: PostPlatform
  networkLabel: string
  accountName: string
  /** ISO; part of the prompt's dismissal key, so a later retirement prompts again. */
  retiredAt: string
  retiredOnLabel: string
  scheduledCount: number
  nextSlotLabel: string | null
  reconnectHref: string
}

/**
 * The cards the reconnect prompt shows, from reads the layout already holds. `(client, platform)`
 * is UNIQUE on `social_connections`; `upcoming` arrives in slot order.
 */
export function buildRetiredConnectionCards(
  clients: RosterClientRow[],
  upcoming: UpcomingPost[],
  timezone: string
): RetiredConnectionCard[] {
  return clients.flatMap((client) =>
    (client.social_connections ?? []).flatMap((connection) => {
      const platform = toPublishingPlatform(connection.platform)
      if (!platform || !isConnectionRetired(connection)) return []
      const pending = upcoming.filter(
        (post) => post.client_id === client.id && post.pendingPlatforms.includes(platform)
      )
      const next = pending[0]?.scheduled_at ?? null
      return [
        {
          clientId: client.id,
          clientName: client.name,
          platform,
          networkLabel: PLATFORM_NAMES[platform],
          accountName: connection.account_name.replace(/^@/, ''),
          retiredAt: connection.retired_at,
          retiredOnLabel: formatLongDate(new Date(connection.retired_at), timezone),
          scheduledCount: pending.length,
          nextSlotLabel: next ? formatLongSlot(next, timezone) : null,
          reconnectHref: `/api/meta/connect?platform=${platform}&client_id=${client.id}`,
        },
      ]
    })
  )
}
