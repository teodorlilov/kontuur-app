import { AnalyticsSection, ChartLegend } from '../document/analytics-section'
import { EmptyFill } from '../document/empty-fill'
import { FollowerFlow } from './follower-flow'
import type { FollowerSummary } from '../../lib/instagram/build-report'

/**
 * "Who followed, who left" — rendered identically by both networks' documents, down to its
 * title, sub, aria label and pin legend.
 *
 * `unknownNote` differs per caller because the two networks withhold the gained/lost split for
 * different reasons: Instagram gates it behind an account size, while Facebook may simply not
 * have captured the days yet.
 */
export function FollowerFlowSection({
  followers,
  hasHistory,
  networkLabel,
  unknownNote,
}: {
  followers: FollowerSummary
  hasHistory: boolean
  networkLabel?: string
  unknownNote: string
}) {
  const flowKnown = followers.gained.now !== null || followers.lost.now !== null
  return (
    <AnalyticsSection
      title="Who followed, who left"
      sub="Gains and losses day by day — hover a day for the posts behind it."
      ariaLabel="Follower flow"
      legend={
        followers.byDay.some((day) => day.posts.length > 0) ? (
          <ChartLegend items={[{ swatch: 'pin', label: 'Post published' }]} />
        ) : undefined
      }
    >
      {!hasHistory ? (
        <EmptyFill className="mt-3.5">Follower flow appears after the first sync</EmptyFill>
      ) : !flowKnown ? (
        <p className="mt-4 text-caption text-text3">{unknownNote}</p>
      ) : (
        <FollowerFlow followers={followers} networkLabel={networkLabel} />
      )}
    </AnalyticsSection>
  )
}
