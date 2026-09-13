import Link from 'next/link'
import { UsersGroupRoundedIcon } from '@solar-icons/react/line-duotone'
import { Icon } from '@/components/ui/icon'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { getCachedAccountTile } from '@/features/dashboard/queries/followers-tile'
import { analyticsRangeHref } from '@/features/analytics/lib/compute/analytics-href'
import { namePlatforms } from '@/lib/meta/platforms'

interface FollowersStatProps {
  agencyId: string
  clientId: string
  timeZone: string
}

/**
 * The solo dashboard's third stat, in one of two states. With metrics history: the account's
 * followers now, the last seven days' change, and reach (or a Page's engagements) in the footer,
 * linking to My results for the same window and network — the network is passed on purpose, since
 * an absent one opens the Instagram document. Before the first nightly sync, or with nothing
 * connected: how many networks are live and which — the truthful "Platforms connected", counted
 * as networks of this one business rather than as the agency's connected clients, which is the
 * figure the same label used to borrow and which can only ever read 0 or 1 for a solo user.
 */
export async function FollowersStat({ agencyId, clientId, timeZone }: FollowersStatProps) {
  const { liveNetworks, followers } = await getCachedAccountTile(agencyId, clientId, timeZone)
  const icon = <Icon glyph={UsersGroupRoundedIcon} size="lg" />

  if (!followers) {
    return (
      <StatCard
        label="Platforms connected"
        value={liveNetworks.length}
        icon={icon}
        footer={
          liveNetworks.length > 0
            ? `${namePlatforms(liveNetworks)} · followers arrive after the first nightly sync`
            : 'Nothing connected yet'
        }
      />
    )
  }

  return (
    <StatCard
      label="Followers"
      value={followers.value}
      icon={icon}
      pill={followers.pill}
      footer={
        <>
          {followers.footer} ·{' '}
          <Link
            href={analyticsRangeHref(clientId, '7d', followers.network)}
            className="text-forest underline-offset-2 hover:underline"
          >
            My results
          </Link>
        </>
      }
    />
  )
}
